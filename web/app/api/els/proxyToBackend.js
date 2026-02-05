/**
 * ELS_BACKEND_URL 이 설정되어 있으면 요청을 NAS Docker 백엔드로 프록시.
 * Next.js API 라우트 상단에서 호출: if (process.env.ELS_BACKEND_URL) return proxyToBackend(req);
 */
import { NextResponse } from 'next/server';
import https from 'https'; // HTTPS Agent를 사용하기 위해 임포트

const BASE_RAW = process.env.ELS_BACKEND_URL || '';
let BASE_URL_OBJ;

try {
    const trimmedBase = BASE_RAW.trim();
    if (trimmedBase) {
        BASE_URL_OBJ = new URL(trimmedBase);
    }
} catch (e) {
    console.error(`Invalid ELS_BACKEND_URL: "${BASE_RAW}". Please check your .env configuration.`, e);
    BASE_URL_OBJ = null; // 유효하지 않은 URL이면 null로 설정
}

// HTTPS 인증서 검증 무시를 위한 Agent (개발/테스트 환경에서 사용)
const agent = new https.Agent({
    rejectUnauthorized: false, // NAS의 자가 서명 인증서 등으로 인한 오류 무시
});

/**
 * @param {Request} req
 * @param {string|null} pathname
 * @param {object|string|null} overrideBody - 제공 시 req 대신 이 body로 백엔드 요청 (사용자별 creds 치환 후 프록시용)
 */
export async function proxyToBackend(req, pathname = null, overrideBody = null) {
    if (!BASE_URL_OBJ) {
        const errorMsg = `ELS_BACKEND_URL 환경 변수가 유효하지 않거나 설정되지 않았습니다: "${BASE_RAW}"`;
        console.error(errorMsg);
        return NextResponse.json({
            ok: false,
            error: errorMsg,
            log: [errorMsg],
        }, { status: 500 });
    }
    const BASE = BASE_URL_OBJ.origin; // 프로토콜과 호스트(포트 포함)만 사용

    const url = new URL(req.url);
    const path = pathname != null ? pathname : url.pathname;
    const search = url.search;
    
    const backendUrl = BASE + path + search; // URL 정직하게 사용

    const method = req.method;
    const headers = new Headers();
    req.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'host' || key.toLowerCase() === 'connection') return;
        headers.set(key, value);
    });

    let body;
    if (overrideBody != null) {
        body = typeof overrideBody === 'string' ? overrideBody : JSON.stringify(overrideBody);
        headers.set('content-type', 'application/json');
    } else if (method !== 'GET' && method !== 'HEAD') {
        const contentType = req.headers.get('content-type') || '';
        if (contentType.includes('multipart/form-data')) {
            body = await req.arrayBuffer();
            headers.set('content-type', req.headers.get('content-type'));
        } else {
            body = await req.text();
            // POST/PUT 요청이고 body가 있다면, 강제로 application/json 헤더 설정
            if (body && (method === 'POST' || method === 'PUT')) {
                headers.set('content-type', 'application/json');
            } else if (body && contentType.includes('application/json')) { // 원래 contentType이 json이었으면 그대로
                headers.set('content-type', 'application/json');
            }
        }
    }

    const controller = new AbortController();
    const timeoutMs = Number(process.env.ELS_BACKEND_FETCH_TIMEOUT_MS || 120000); // 기본 120초
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
        res = await fetch(backendUrl, {
            method,
            headers,
            body: body ?? undefined,
            signal: controller.signal, // AbortController signal 추가
            agent: BASE_URL_OBJ?.protocol === 'https:' ? agent : undefined, // HTTPS인 경우에만 agent 사용
        });
    } catch (error) {
        clearTimeout(timeoutId);
        let errorMessage = `NAS 백엔드와 통신 중 알 수 없는 오류가 발생했습니다. 요청 URL: ${backendUrl}`; // URL 로깅 강화
        if (error.name === 'AbortError') {
            errorMessage = `NAS 백엔드 응답 타임아웃 (${timeoutMs / 1000}초). 요청 URL: ${backendUrl}. NAS 컨테이너 및 네트워크 상태를 확인하세요.`;
        } else if (error instanceof TypeError && error.message.includes('fetch failed')) {
            errorMessage = `NAS 백엔드에 연결할 수 없습니다. 요청 URL: ${backendUrl}. ELS_BACKEND_URL 환경 변수와 NAS 컨테이너 실행 상태를 확인하세요. (네트워크 오류: ${error.message})`;
            if (error.cause && error.cause.code === 'UND_ERR_SOCKET') {
                errorMessage += ` (소켓 오류: ${error.cause.code} ${error.cause.socket?.remoteAddress}:${error.cause.socket?.remotePort || '알 수 없음'})`;
            } else if (error.message.includes('certificate')) { // 인증서 관련 오류 메시지 추가
                errorMessage += ` (인증서 오류: ${error.message}). ELS_BACKEND_URL의 HTTPS 인증서를 확인하거나, 자가 서명 인증서인 경우 무시 옵션을 확인하세요.`;
            }
        } else if (error.code === 'UND_ERR_SOCKET') {
            errorMessage = `NAS 백엔드와의 소켓 연결 오류: ${error.message}. (코드: ${error.code}, 원격: ${error.socket?.remoteAddress}:${error.socket?.remotePort || '알 수 없음'}). 요청 URL: ${backendUrl}. NAS 컨테이너 및 네트워크 상태를 확인하세요.`;
        } else {
            errorMessage = `NAS 백엔드 통신 오류: ${error.message}. 요청 URL: ${backendUrl}`;
        }
        console.error('proxyToBackend fetch error:', error);
        return NextResponse.json({
            ok: false,
            error: errorMessage,
            log: [errorMessage],
        }, { status: 500 });
    } finally {
        clearTimeout(timeoutId);
    }

    const resHeaders = new Headers();
    res.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower === 'transfer-encoding' || lower === 'connection') return;
        resHeaders.set(key, value);
    });

    if (res.body) {
        const ct = res.headers.get('content-type') || '';
        const isBinary = path.includes('/download') || ct.includes('spreadsheet') || ct.includes('octet-stream');
        if (isBinary) {
            const buffer = await res.arrayBuffer();
            return new NextResponse(buffer, {
                status: res.status,
                statusText: res.statusText,
                headers: resHeaders,
            });
        }
        const isApi = path.startsWith('/api/els');
        const bodyText = await res.text();
        const looksLikeHtml = ct.includes('text/html') || bodyText.trim().startsWith('<!');
        if (isApi && looksLikeHtml) {
            return NextResponse.json({
                ok: false,
                error: `백엔드가 HTML을 반환했습니다. 요청 URL: ${backendUrl}. ELS_BACKEND_URL 또는 NAS 컨테이너 상태를 확인하세요.`, // URL 로깅 강화
                log: [bodyText.slice(0, 300)],
            }, { status: res.status >= 400 ? res.status : 502 });
        }
        return new NextResponse(bodyText, {
            status: res.status,
            statusText: res.statusText,
            headers: resHeaders,
        });
    }
    return new NextResponse(null, { status: res.status, headers: resHeaders });
}