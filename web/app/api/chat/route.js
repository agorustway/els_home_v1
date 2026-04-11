import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';

// ELS 업무 시스템 컨텍스트 — 모델이 ELS 도메인을 이해하도록 주입
const BASE_SYSTEM_INSTRUCTION = `너는 ELS Solution의 법률/업무 지원 전문 AI 에이전트다.
ELS 솔루션은 물류·운송 회사를 위한 인트라넷 시스템입니다.

## 주요 메뉴 및 기능 (안내 시 마크다운 링크 [\`메뉴이름\`](/경로) 필수 사용)
- **컨테이너 이력조회**: [/employees/container-history](/employees/container-history)
- **안전운임 조회**: [/employees/safe-freight](/employees/safe-freight)
- **차량 위치 관제**: [/employees/vehicle-tracking](/employees/vehicle-tracking)
- **업무일지(운행 보고)**: [/employees/reports/daily](/employees/reports/daily)
- **날씨 및 미세먼지**: [/employees/weather](/employees/weather)
- **사내연락망**: [/employees/internal-contacts](/employees/internal-contacts)

## 답변 원칙 및 가드레일 (Anti-Hallucination)
1. **정확성**: 실시간 주입된 데이터(최근 게시글, 차량 위치, 미세먼지, K-Law 법령)를 최우선으로 참고하여 답변하라.
2. **유연성**: 만약 특정 키워드에 대한 데이터가 주입되지 않았거나 검색 결과가 없다면, "현재 시스템(RAG)에서 해당 데이터를 실시간으로 찾을 수 없다"고 사용자에게 안내하라. 단, ELS 업무 도메인과 관련된 일반적인 절차나 지식에 대해서는 알고 있는 범위 내에서 최대한 친절하게 답변하라.
3. **법령 답변**: 화물연대, 근로기준법, 안전운임제 등 법적 질문 시에는 반드시 주입된 'K-Law MCP' 검색 결과를 바탕으로 답변하고, 출처가 불명확한 수치나 조항은 "정확한 확인을 위해 법망 사이트 또는 담당 부서 확인이 필요하다"고 명시하라.
4. **거절 범위**: 잡담, 연예, 정치 등 ELS 업무와 전혀 상관없는 질문에 대해서만 정중히 거절하라. 업무 관련 질문은 데이터가 조금 부족하더라도 최대한 도움을 주려 노력하라.`;

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
            recentPostsText = '\n\n## 최근 사내 게시글/공지\n다음을 참고하여 답변하세요:\n' + posts.map(p => {
                const date = new Date(p.created_at).toLocaleDateString();
                const name = p.author_email?.split('@')[0] || '익명';
                return `- [${date}] ${p.title} (작성자: ${name})`;
            }).join('\n');
        }

        // --- 강력한 RAG: 사용자의 질문 키워드에 따라 DB 데이터 동적 주입 ---
        const lastUserText = messages.filter(m => m.role === 'user').pop()?.parts?.[0]?.text || '';
        const userKwd = lastUserText.toLowerCase();

        // 1. 차량 위치 관련
        if (userKwd.includes('차량') || userKwd.includes('위치') || userKwd.includes('어디')) {
            const { data: trips } = await supabase.from('vehicle_trips').select('id, vehicle_number').in('status', ['driving', 'paused']);
            if (trips && trips.length > 0) {
                const tripIds = trips.map(t => t.id);
                const { data: locs } = await supabase.from('vehicle_locations').select('trip_id, address').in('trip_id', tripIds).order('recorded_at', { ascending: false });
                const locMap = {};
                locs?.forEach(l => { if(!locMap[l.trip_id]) locMap[l.trip_id] = l.address; });
                const vehiclesText = trips.map(t => `- 화물차(${t.vehicle_number}): 현재 [${locMap[t.id] || '알 수 없음'}] 부근 위치`).join('\n');
                recentPostsText += '\n\n## 🚚 실시간 운행차량 위치 (내부 DB)\n' + vehiclesText;
            }
        }
        
        // 2. 업무 보고/일지 관련 (Summary 지원)
        if (userKwd.includes('업무') || userKwd.includes('보고') || userKwd.includes('일지')) {
            let query = supabase.from('posts').select('title, author_email, created_at').eq('board_type', 'report');
            
            // 월별 필터 감지 (ex: 4월, 04월)
            const monthMatch = userKwd.match(/(\d{1,2})월/);
            if (monthMatch) {
                const month = parseInt(monthMatch[1]);
                const year = new Date().getFullYear();
                const startDate = new Date(year, month - 1, 1).toISOString();
                const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
                query = query.gte('created_at', startDate).lte('created_at', endDate);
            }

            const { data: reports } = await query.order('created_at', { ascending: false }).limit(10);
            if (reports && reports.length > 0) {
                const reportsText = reports.map(r => {
                    const date = new Date(r.created_at).toLocaleDateString();
                    return `- [${date}] ${r.title}`;
                }).join('\n');
                recentPostsText += `\n\n## 📝 최근 업무보고/일지 목록 (내부 DB${monthMatch ? ` - ${monthMatch[1]}월` : ''})\n` + reportsText;
            }
        }

        // 3. 미세먼지 K-SKILL 연동 (AI Assistant)
        if (userKwd.includes('미세먼지') || userKwd.includes('공기') || userKwd.includes('날씨')) {
            const regionsMap = {
                '서울': '서울 중구', '부산': '부산 연산동', '인천': '인천 구월동', 
                '대구': '대구 수창동', '대전': '대전 둔산동', '광주': '광주 농성동', 
                '울산': '울산 신정동', '세종': '세종 아름동', '아산': '아산 모종동', 
                '당진': '당진 읍내동', '예산': '예산군', '천안': '천안'
            };
            const foundKey = Object.keys(regionsMap).find(r => userKwd.includes(r));
            const targetRegion = foundKey ? regionsMap[foundKey] : '아산 모종동'; // default

            try {
                const url = `https://k-skill-proxy.nomadamas.org/v1/fine-dust/report?regionHint=${encodeURIComponent(targetRegion)}`;
                const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
                if (res.ok) {
                    const data = await res.json();
                    if (!data.error && data.pm10 && data.pm25) {
                        const pmInfo = `- 측정소: ${data.station_name}\n- 시간: ${data.measured_at}\n- 미세먼지: ${data.pm10.value}(${data.pm10.grade})\n- 초미세먼지: ${data.pm25.value}(${data.pm25.grade})\n- 총평: ${data.khai_grade}`;
                        recentPostsText += '\n\n## 🍃 실시간 미세먼지 현황 (K-SKILL/AirKorea 제공)\n위치: ' + targetRegion + '\n' + pmInfo;
                    }
                }
            } catch (e) {
                console.error("[/api/chat] K-SKILL 미세먼지 오류:", e);
            }
        }

        // 4. K-Law (법망 API) 연동 (법령/규정/운임/근로 관련)
        if (userKwd.includes('법') || userKwd.includes('규정') || userKwd.includes('운임') || userKwd.includes('근로') || userKwd.includes('노동') || userKwd.includes('화물연대')) {
            const searchKwd = lastUserText.trim();
            try {
                // api.beopmang.org의 법령 검색 v4 API 활용
                const url = `https://api.beopmang.org/api/v4/law?action=search&q=${encodeURIComponent(searchKwd)}`;
                const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
                if (res.ok) {
                    const data = await res.json();
                    if (data.results && data.results.length > 0) {
                        const lawQuotes = data.results.slice(0, 3).map(r => {
                            return `### [출처: K-Law] ${r.title}\n${r.content?.slice(0, 300)}...`;
                        }).join('\n\n');
                        recentPostsText += '\n\n## ⚖️ 실시간 법령/규정 검색 결과 (K-Law MCP)\n' + lawQuotes;
                    } else {
                        recentPostsText += '\n\n## ⚖️ 실시간 법령/규정 검색 결과 (K-Law MCP)\n관련된 최신 법령 정보를 찾을 수 없습니다. 법령 명칭을 정확히 입력해 보세요.';
                    }
                }
            } catch (e) {
                console.error("[/api/chat] K-Law 법망 API 오류:", e);
            }
        }
        // -------------------------------------------------------------------------
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

    // Gemini 2.5 Flash 스트리밍 엔드포인트 (최신 티어 호환)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

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
