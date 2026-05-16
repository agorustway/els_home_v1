import { NextResponse } from 'next/server';
import { getUserElsCreds } from '../../../../els/getUserElsCreds';
import { normalizeContainers, normalizePath, saveContainerLookupRows } from '../container-results/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

function getRunUrl(req) {
    const backendUrl = String(process.env.ELS_BACKEND_URL || '').trim().replace(/\/+$/, '');
    if (backendUrl) return `${backendUrl}/api/els/run`;
    return new URL('/api/els/run', req.url).toString();
}

async function saveRowsSafely({ filePath, rows, containers, lookupSource, replaceExisting = true }) {
    if ((!Array.isArray(rows) || rows.length === 0) && !replaceExisting) return { count: 0, data: {} };
    try {
        return await saveContainerLookupRows({
            filePath,
            rows,
            containers,
            lookupSource,
            replaceExisting,
        });
    } catch (error) {
        return { count: 0, data: {}, error: error?.message || '컨테이너 조회 결과 저장 실패' };
    }
}

export async function POST(req) {
    const body = await req.json().catch(() => ({}));
    const containers = normalizeContainers(body.containers);
    const filePath = normalizePath(body.path || body.file_path);

    if (!containers.length) {
        return NextResponse.json({ error: 'containers 배열이 필요합니다.' }, { status: 400 });
    }

    let runBody = {
        ...body,
        containers,
        reserveSingle: body.reserveSingle === undefined ? false : body.reserveSingle,
    };

    if (runBody.useSavedCreds) {
        const creds = await getUserElsCreds();
        if (creds) {
            runBody = {
                ...runBody,
                useSavedCreds: false,
                userId: creds.userId,
                userPw: creds.userPw,
            };
        }
    }

    const runRes = await fetch(getRunUrl(req), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runBody),
    });

    if (!runRes.ok || !runRes.body) {
        const text = await runRes.text().catch(() => '');
        return NextResponse.json({
            error: text || `컨테이너 조회 요청 실패 (${runRes.status})`,
        }, { status: runRes.status || 500 });
    }

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            const decoder = new TextDecoder();
            const reader = runRes.body.getReader();
            let buffer = '';

            const send = (line) => {
                try {
                    controller.enqueue(encoder.encode(line));
                } catch (_) {
                    // 페이지를 벗어나도 서버 측 조회/저장은 계속 진행한다.
                }
            };

            const processLine = async (line) => {
                if (!line) return;
                if (line.startsWith('RESULT_PARTIAL:')) {
                    try {
                        const payload = JSON.parse(line.substring(15));
                        const rows = Array.isArray(payload.result) ? payload.result : [];
                        const saved = await saveRowsSafely({
                            filePath,
                            rows,
                            containers,
                            lookupSource: 'asan_shipping_partial',
                            replaceExisting: false,
                        });
                        if (saved.error) send(`LOG:컨테이너 조회 결과 일부 저장 실패: ${saved.error}\n`);
                        send(`RESULT_PARTIAL:${JSON.stringify({ ...payload, saved_count: saved.count, saved_data: saved.data })}\n`);
                    } catch (error) {
                        send(`LOG:컨테이너 부분 결과 저장 처리 실패: ${error?.message || error}\n`);
                        send(`${line}\n`);
                    }
                    return;
                }

                if (line.startsWith('RESULT:')) {
                    try {
                        const payload = JSON.parse(line.substring(7));
                        if (!payload.ok) {
                            send(`${line}\n`);
                            return;
                        }
                        const rows = payload.ok && Array.isArray(payload.result) ? payload.result : [];
                        const saved = await saveRowsSafely({
                            filePath,
                            rows,
                            containers,
                            lookupSource: 'asan_shipping',
                            replaceExisting: true,
                        });
                        if (saved.error) send(`LOG:컨테이너 조회 결과 저장 실패: ${saved.error}\n`);
                        send(`RESULT:${JSON.stringify({
                            ...payload,
                            saved_count: saved.count,
                            saved_data: saved.data,
                            saved_error: saved.error || null,
                        })}\n`);
                    } catch (error) {
                        send(`LOG:컨테이너 최종 결과 저장 처리 실패: ${error?.message || error}\n`);
                        send(`${line}\n`);
                    }
                    return;
                }

                send(`${line}\n`);
            };

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines.filter(Boolean)) {
                        await processLine(line.trim());
                    }
                }
                if (buffer.trim()) await processLine(buffer.trim());
            } catch (error) {
                send(`RESULT:${JSON.stringify({ ok: false, result: [], error: error?.message || '컨테이너 조회 실패' })}\n`);
            } finally {
                try {
                    controller.close();
                } catch (_) {
                    // Already closed by the runtime.
                }
            }
        },
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
        },
    });
}
