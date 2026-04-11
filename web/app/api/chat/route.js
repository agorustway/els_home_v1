import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';

// ELS 업무 시스템 컨텍스트 — 모델이 ELS 도메인을 이해하도록 주입
const BASE_SYSTEM_INSTRUCTION = `당신은 ELS 솔루션의 AI 어시스턴트입니다.
ELS 솔루션은 물류·운송 회사를 위한 인트라넷 시스템입니다.

## 주요 기능 안내
- **컨테이너 이력조회**: /employees/container-history 에서 ETrans 시스템과 연동하여 수출입 컨테이너 이력을 조회할 수 있습니다.
- **안전운임 조회**: /employees/safe-freight 에서 화물차주 안전운임 기준을 확인할 수 있습니다.
- **차량 위치 관제**: /employees/vehicle-tracking 에서 운전원의 실시간 위치를 확인할 수 있습니다.
- **업무일지(운행 보고)**: /employees/reports/daily 에서 일일 업무일지를 작성하거나 조회할 수 있습니다.
- **NAS 자료실**: /employees/archive 에서 회사 내부 문서를 열람할 수 있습니다.
- **날씨 대시보드**: /employees/weather 에서 현재 날씨 및 미세먼지 정보를 확인할 수 있습니다.
- **공지사항/게시판**: /employees/board/free 에서 사내 공지 및 자유게시판을 이용할 수 있습니다.
- **연락처**: /employees/internal-contacts (사내), /employees/external-contacts (외부) 에서 연락처를 조회할 수 있습니다.

## 응답 원칙
- 한국어로 친절하고 간결하게 답변합니다.
- ELS 시스템 내 기능이라면 해당 메뉴 경로를 안내합니다.
- 물류·운송 업무(컨테이너, 안전운임, 화물차, 도로운송 등)에 관한 질문에 전문적으로 답변합니다.
- 시스템에서 확인하기 어려운 법적·세무·의료 관련 질문은 전문가 상담을 권고합니다.
- 마크다운 형식보다 읽기 쉬운 일반 텍스트를 우선 사용합니다.`;

/**
 * POST /api/chat
 * Body: { messages: Array<{ role: 'user'|'assistant', parts: Array<{ text: string }> }> }
 * 스트리밍 응답 (SSE: data: {"text":"..."}\n\n ... data: [DONE]\n\n)
 */
export async function POST(req) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 503 });
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: '요청 형식이 잘못되었습니다.' }, { status: 400 });
    }

    const { messages } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
        return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400 });
    }

    // 최근 공지/게시글 컨텍스트 가져오기
    let recentPostsText = '';
    try {
        const supabase = await createAdminClient();
        const { data: posts } = await supabase
            .from('posts')
            .select('title, author_email, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        if (posts && posts.length > 0) {
            recentPostsText = '\n\n## 최근 사내 게시글/공지\n' + posts.map(p => {
                const date = new Date(p.created_at).toLocaleDateString();
                const name = p.author_email?.split('@')[0] || '익명';
                return `- [${date}] ${p.title} (작성자: ${name})`;
            }).join('\n');
        }
    } catch (e) {
        console.error('[/api/chat] DB 조회 오류:', e);
    }
    
    // 최종 시스템 프롬프트 조합
    const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION + recentPostsText;

    // Gemini API: 'model' role은 'assistant' → 변환 필요
    const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: m.parts ?? [{ text: '' }],
    }));

    const geminiPayload = {
        system_instruction: {
            parts: [{ text: finalSystemInstruction }],
        },
        contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            topP: 0.9,
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
    };

    // Gemini 1.5 Flash 스트리밍 엔드포인트 (Tier 1 호환)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

    let geminiRes;
    try {
        geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload),
            signal: AbortSignal.timeout(60_000), // 60초 타임아웃
        });
    } catch (err) {
        console.error('[/api/chat] Gemini 연결 오류:', err);
        return NextResponse.json({ error: 'Gemini API 연결에 실패했습니다.' }, { status: 502 });
    }

    if (!geminiRes.ok) {
        const errBody = await geminiRes.text().catch(() => '');
        console.error(`[/api/chat] Gemini 오류 ${geminiRes.status}:`, errBody);
        return NextResponse.json(
            { error: `Gemini API 오류: ${geminiRes.status}` },
            { status: geminiRes.status }
        );
    }

    // Gemini SSE → 클라이언트 SSE 변환 스트림
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
        const reader = geminiRes.body?.getReader();
        if (!reader) {
            await writer.write(encoder.encode('data: [DONE]\n\n'));
            await writer.close();
            return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? ''; // 마지막 미완성 라인 보관

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(raw);
                        // Gemini 응답 구조: candidates[0].content.parts[0].text
                        const text =
                            parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                        if (text) {
                            await writer.write(
                                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
                            );
                        }
                    } catch {
                        // JSON 파싱 실패 시 무시
                    }
                }
            }
        } catch (err) {
            console.error('[/api/chat] 스트림 처리 오류:', err);
        } finally {
            await writer.write(encoder.encode('data: [DONE]\n\n'));
            await writer.close();
        }
    })();

    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no', // Nginx 버퍼링 비활성화 (Cloudtype 대비)
        },
    });
}
