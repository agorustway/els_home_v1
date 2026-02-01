/**
 * ELS_BACKEND_URL 이 설정되어 있으면 요청을 NAS Docker 백엔드로 프록시.
 * Next.js API 라우트 상단에서 호출: if (process.env.ELS_BACKEND_URL) return proxyToBackend(req);
 */
import { NextResponse } from 'next/server';

const BASE = process.env.ELS_BACKEND_URL || '';

/**
 * @param {Request} req
 * @param {string|null} pathname
 * @param {object|string|null} overrideBody - 제공 시 req 대신 이 body로 백엔드 요청 (사용자별 creds 치환 후 프록시용)
 */
export async function proxyToBackend(req, pathname = null, overrideBody = null) {
    if (!BASE) return null;
    const url = new URL(req.url);
    const path = pathname != null ? pathname : url.pathname;
    const search = url.search;
    const backendUrl = BASE.replace(/\/$/, '') + path + search;
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
            if (body && (contentType.includes('application/json') || !contentType)) {
                headers.set('content-type', 'application/json');
            }
        }
    }

    const res = await fetch(backendUrl, {
        method,
        headers,
        body: body ?? undefined,
    });

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
                error: '백엔드가 HTML을 반환했습니다. ELS_BACKEND_URL 또는 NAS 컨테이너 상태를 확인하세요.',
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
