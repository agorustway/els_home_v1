import { NextResponse } from 'next/server';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { ensureDaemon, getDaemonUrl } from '../daemon';
import { proxyToBackend } from '../proxyToBackend';
import { getUserElsCreds } from '../getUserElsCreds';

const ELSBOT_DIR = path.join(process.cwd(), '..', 'elsbot');
const RUNNER = path.join(ELSBOT_DIR, 'els_web_runner.py');

function getPythonCommand() {
    try {
        execSync('python --version', { stdio: 'pipe' });
        return 'python';
    } catch {
        try {
            execSync('python3 --version', { stdio: 'pipe' });
            return 'python3';
        } catch {
            return null;
        }
    }
}

export async function POST(req) {
    let body;
    if (process.env.ELS_BACKEND_URL) {
        body = await req.json().catch(() => ({}));
        if (body?.useSavedCreds) {
            const creds = await getUserElsCreds();
            if (creds) body = { ...body, useSavedCreds: false, userId: creds.userId, userPw: creds.userPw };
        }
        const proxied = await proxyToBackend(req, null, body);
        if (proxied) return proxied;
    } else {
        const proxied = await proxyToBackend(req);
        if (proxied) return proxied;
    }
    try {
        if (!body) body = await req.json();
        // 저장된 계정 사용 시 Supabase에서 아이디·비밀번호 조회 (로컬/daemon 경로에서도 동일 적용)
        if (body?.useSavedCreds) {
            const creds = await getUserElsCreds();
            if (creds) {
                body = { ...body, useSavedCreds: false, userId: creds.userId, userPw: creds.userPw };
            } else {
                return NextResponse.json({
                    ok: false,
                    error: '저장된 계정이 없습니다. 아이디·비밀번호를 입력한 뒤 "저장된 계정 사용" 체크 후 저장하세요.',
                    log: ['저장된 계정이 없습니다.'],
                }, { status: 400 });
            }
        }
        const useSavedCreds = body?.useSavedCreds;
        const userId = body?.userId ? String(body.userId).trim() : '';
        const userPw = body?.userPw ? String(body.userPw).trim() : '';
        const python = getPythonCommand();
        if (!python) {
            const msg = '이 기능은 Vercel 등 서버리스 배포 환경(nollae.com)에서는 사용할 수 없습니다. 로컬 또는 Python·Chrome이 설치된 서버에서만 이용 가능합니다.';
            return NextResponse.json({
                ok: false,
                error: msg,
                log: [msg],
            }, { status: 503 });
        }

        const useDaemon = await ensureDaemon();
        if (useDaemon) {
            const stream = new ReadableStream({
                start(controller) {
                    const encoder = new TextEncoder();
                    const baseUrl = getDaemonUrl();
                    // 프론트에서 "아예 시작도 안 됨"처럼 보이는 상황 방지: 즉시 한 줄 출력
                    controller.enqueue(encoder.encode('LOG:[네트워크] 데몬 접속 시도: ' + baseUrl + '\n'));

                    const abort = new AbortController();
                    const timeoutMs = Number(process.env.ELS_DAEMON_CONNECT_TIMEOUT_MS || 15000);
                    const t = setTimeout(() => abort.abort(), timeoutMs);

                    fetch(`${baseUrl}/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ useSavedCreds, userId, userPw }),
                        signal: abort.signal,
                    }).then(async (res) => {
                        clearTimeout(t);
                        if (!res.ok || !res.body) {
                            controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({ ok: false, error: '데몬 연결 실패 (status ' + res.status + ')', log: [] }) + '\n'));
                            controller.close();
                            return;
                        }
                        const reader = res.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = '';
                        let resultSent = false;
                        try {
                            controller.enqueue(encoder.encode('LOG:[네트워크] 데몬 연결 성공. 스트리밍 수신 시작\n'));
                            while (true) {
                                const { value, done } = await reader.read();
                                if (done) break;
                                buffer += decoder.decode(value, { stream: true });
                                const lines = buffer.split('\n');
                                buffer = lines.pop() || '';
                                for (const line of lines) {
                                    const trimmed = line.trim();
                                    if (trimmed.startsWith('LOG:')) {
                                        controller.enqueue(encoder.encode(trimmed + '\n'));
                                    } else if (trimmed.startsWith('RESULT:')) {
                                        try {
                                            const data = JSON.parse(trimmed.slice(7));
                                            controller.enqueue(encoder.encode('RESULT:' + JSON.stringify(data) + '\n'));
                                            resultSent = true;
                                        } catch (_) { }
                                    }
                                }
                            }
                            if (buffer.trim().startsWith('RESULT:')) {
                                try {
                                    const data = JSON.parse(buffer.trim().slice(7));
                                    controller.enqueue(encoder.encode('RESULT:' + JSON.stringify(data) + '\n'));
                                    resultSent = true;
                                } catch (_) { }
                            }
                            if (!resultSent) {
                                controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({ ok: false, error: '데몬 응답 없음', log: [] }) + '\n'));
                            }
                        } catch (err) {
                            if (!resultSent) {
                                controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({ ok: false, error: String(err.message), log: [] }) + '\n'));
                            }
                        } finally {
                            controller.close();
                        }
                    }).catch((err) => {
                        clearTimeout(t);
                        const msg = err?.name === 'AbortError'
                            ? `데몬 접속 타임아웃 (${timeoutMs}ms)`
                            : String(err.message || err);
                        controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({ ok: false, error: msg, log: [] }) + '\n'));
                        controller.close();
                    });
                }
            });
            return new NextResponse(stream, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    // NAS/Nginx에서 버퍼링/변환 방지
                    'X-Accel-Buffering': 'no',
                    'Cache-Control': 'no-cache, no-transform',
                },
            });
        }

        const args = [RUNNER, 'login'];
        if (!useSavedCreds && userId) args.push('--user-id', String(userId));
        if (!useSavedCreds && userPw) args.push('--user-pw', String(userPw));
        const result = spawnSync(python, args, {
            cwd: ELSBOT_DIR,
            encoding: 'utf8',
            maxBuffer: 5 * 1024 * 1024,
            timeout: 120000,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
            windowsHide: true,
        });
        let out = (result.stdout || '').trim();
        if (result.status !== 0) {
            const err = (result.stderr || result.error?.message || out || 'Unknown error').toString();
            return NextResponse.json({
                ok: false,
                error: err.slice(0, 500),
                log: [err],
            }, { status: 500 });
        }
        let data;
        try {
            const start = out.indexOf('{');
            const end = out.lastIndexOf('}');
            if (start !== -1 && end !== -1 && end >= start) {
                data = JSON.parse(out.slice(start, end + 1));
            } else {
                data = JSON.parse(out);
            }
        } catch (parseErr) {
            return NextResponse.json({
                ok: false,
                error: '응답 파싱 실패. stdout가 JSON이 아닙니다.',
                log: [out.slice(0, 300), String(parseErr.message)],
            }, { status: 500 });
        }
        return NextResponse.json({
            ok: data.ok === true,
            log: data.log || [],
            error: data.error || undefined,
        });
    } catch (e) {
        return NextResponse.json({
            ok: false,
            error: String(e.message),
            log: [String(e.message)],
        }, { status: 500 });
    }
}
