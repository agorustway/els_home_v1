import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { execSync, spawn } from 'child_process';
import crypto from 'crypto';
import { ensureDaemon, getDaemonUrl } from '../daemon';
import { proxyToBackend } from '../proxyToBackend';
import { getUserElsCreds } from '../getUserElsCreds';

const ELSBOT_DIR = path.join(process.cwd(), '..', 'elsbot');
const RUNNER = path.join(ELSBOT_DIR, 'els_web_runner.py');

const fileStore = globalThis.elsFileStore || (globalThis.elsFileStore = new Map());

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

function runViaDaemon(body, controller, encoder) {
    const baseUrl = getDaemonUrl();
    fetch(`${baseUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).then(async (res) => {
        if (!res.ok || !res.body) {
            controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({
                sheet1: [], sheet2: [], downloadToken: null,
                error: '데몬 조회 실패 (status ' + res.status + ')',
            }) + '\n'));
            controller.close();
            return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let resultSent = false;
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('LOG:')) {
                        controller.enqueue(encoder.encode(line.trimEnd() + '\n'));
                    } else if (trimmed.startsWith('RESULT_PARTIAL:')) {
                        // 부분 결과 그대로 프론트로 전달
                        controller.enqueue(encoder.encode(line.trimEnd() + '\n'));
                    } else if (trimmed.startsWith('RESULT:')) {
                        try {
                            const data = JSON.parse(trimmed.slice(7));
                            let downloadToken = null;
                            if (data.output_path && fs.existsSync(data.output_path)) {
                                const buf = fs.readFileSync(data.output_path);
                                try { fs.unlinkSync(data.output_path); } catch (_) { }
                                downloadToken = crypto.randomBytes(16).toString('hex');
                                fileStore.set(downloadToken, buf);
                                setTimeout(() => fileStore.delete(downloadToken), 60 * 60 * 1000);
                            }
                            controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({
                                sheet1: data.sheet1 || [],
                                sheet2: data.sheet2 || [],
                                downloadToken,
                                error: data.error,
                            }) + '\n'));
                            resultSent = true;
                        } catch (_) {
                            controller.enqueue(encoder.encode(line + '\n'));
                        }
                    }
                }
            }
            if (buffer.trim()) {
                if (buffer.trim().startsWith('RESULT:')) {
                    try {
                        const data = JSON.parse(buffer.trim().slice(7));
                        let downloadToken = null;
                        if (data.output_path && fs.existsSync(data.output_path)) {
                            const buf = fs.readFileSync(data.output_path);
                            try { fs.unlinkSync(data.output_path); } catch (_) { }
                            downloadToken = crypto.randomBytes(16).toString('hex');
                            fileStore.set(downloadToken, buf);
                            setTimeout(() => fileStore.delete(downloadToken), 60 * 60 * 1000);
                        }
                        controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({
                            sheet1: data.sheet1 || [],
                            sheet2: data.sheet2 || [],
                            downloadToken,
                            error: data.error,
                        }) + '\n'));
                        resultSent = true;
                    } catch (_) { }
                }
            }
            if (!resultSent) {
                controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({
                    sheet1: [], sheet2: [], downloadToken: null,
                    error: '데몬 응답에 RESULT가 없습니다.',
                }) + '\n'));
            }
        } catch (err) {
            if (!resultSent) {
                controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({
                    sheet1: [], sheet2: [], downloadToken: null,
                    error: String(err.message),
                }) + '\n'));
            }
        } finally {
            controller.close();
        }
    }).catch((err) => {
        controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({
            sheet1: [], sheet2: [], downloadToken: null,
            error: String(err.message || '데몬 연결 실패'),
        }) + '\n'));
        controller.close();
    });
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
        const { containers, useSavedCreds, userId, userPw } = body || {};
        if (!Array.isArray(containers) || containers.length === 0) {
            return NextResponse.json({ error: 'containers 배열이 필요합니다.' }, { status: 400 });
        }
        const python = getPythonCommand();
        if (!python) {
            const msg = '이 기능은 Vercel 등 서버리스 배포 환경(nollae.com)에서는 사용할 수 없습니다. 로컬 또는 Python·Chrome이 설치된 서버에서만 이용 가능합니다.';
            return NextResponse.json({
                error: msg,
                log: [msg],
            }, { status: 503 });
        }

        const useDaemon = await ensureDaemon();
        if (useDaemon) {
            const stream = new ReadableStream({
                start(controller) {
                    const encoder = new TextEncoder();
                    runViaDaemon(body, controller, encoder);
                },
            });
            return new NextResponse(stream, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Transfer-Encoding': 'chunked',
                },
            });
        }

        const containersJson = JSON.stringify(containers);
        const args = [RUNNER, 'run', '--containers', containersJson];
        if (!useSavedCreds && userId) args.push('--user-id', String(userId));
        if (!useSavedCreds && userPw) args.push('--user-pw', String(userPw));

        const stream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                let buffer = '';
                let resultSent = false;
                const proc = spawn(python, args, {
                    cwd: ELSBOT_DIR,
                    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
                    windowsHide: true,
                });

                function sendLog(line) {
                    if (line.trim()) controller.enqueue(encoder.encode('LOG:' + line + '\n'));
                }

                proc.stdout.setEncoding('utf8');
                proc.stdout.on('data', (chunk) => {
                    buffer += chunk;
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('{')) {
                            try {
                                const data = JSON.parse(trimmed);
                                let downloadToken = null;
                                if (data.output_path && fs.existsSync(data.output_path)) {
                                    const buf = fs.readFileSync(data.output_path);
                                    try { fs.unlinkSync(data.output_path); } catch (_) { }
                                    downloadToken = crypto.randomBytes(16).toString('hex');
                                    fileStore.set(downloadToken, buf);
                                    setTimeout(() => fileStore.delete(downloadToken), 60 * 60 * 1000);
                                }
                                controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({
                                    sheet1: data.sheet1 || [],
                                    sheet2: data.sheet2 || [],
                                    downloadToken,
                                    error: data.error,
                                }) + '\n'));
                                resultSent = true;
                            } catch (_) {
                                sendLog(line);
                            }
                        } else {
                            sendLog(line);
                        }
                    }
                });

                proc.stderr.setEncoding('utf8');
                proc.stderr.on('data', (chunk) => {
                    sendLog(chunk.trim());
                });

                proc.on('error', (err) => {
                    sendLog('[서버 오류] ' + err.message);
                    if (!resultSent) {
                        controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({
                            sheet1: [], sheet2: [], downloadToken: null,
                            error: String(err.message),
                        }) + '\n'));
                    }
                    controller.close();
                });

                proc.on('close', (code) => {
                    if (!resultSent && buffer.trim()) {
                        if (buffer.trim().startsWith('{')) {
                            try {
                                const data = JSON.parse(buffer.trim());
                                let downloadToken = null;
                                if (data.output_path && fs.existsSync(data.output_path)) {
                                    const buf = fs.readFileSync(data.output_path);
                                    try { fs.unlinkSync(data.output_path); } catch (_) { }
                                    downloadToken = crypto.randomBytes(16).toString('hex');
                                    fileStore.set(downloadToken, buf);
                                    setTimeout(() => fileStore.delete(downloadToken), 60 * 60 * 1000);
                                }
                                controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({
                                    sheet1: data.sheet1 || [],
                                    sheet2: data.sheet2 || [],
                                    downloadToken,
                                    error: data.error,
                                }) + '\n'));
                                resultSent = true;
                            } catch (_) {
                                sendLog(buffer);
                            }
                        } else {
                            sendLog(buffer);
                        }
                    }
                    if (!resultSent && code !== 0) {
                        controller.enqueue(encoder.encode('RESULT:' + JSON.stringify({
                            sheet1: [], sheet2: [], downloadToken: null,
                            error: '프로세스가 비정상 종료했습니다. (code ' + code + ')',
                        }) + '\n'));
                    }
                    controller.close();
                });
            },
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            },
        });
    } catch (e) {
        const log = [e.stderr || e.stdout || e.message || '조회 중 오류'].flat().filter(Boolean);
        return NextResponse.json({
            error: String(e.message || '조회 실패'),
            log: Array.isArray(log) ? log : [String(log)],
        }, { status: 500 });
    }
}
