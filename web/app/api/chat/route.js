import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';

const BASE_SYSTEM_INSTRUCTION = `너는 ELS Solution의 법률/업무 지원 전문 AI 에이전트다.
ELS 솔루션은 물류·운송 회사를 위한 인트라넷 시스템입니다.

## 주요 메뉴 및 기능 (안내 시 마크다운 링크 [\`메뉴이름\`](/경로) 필수 사용)
- **컨테이너 이력조회**: [/employees/container-history](/employees/container-history)
- **안전운임 조회**: [/employees/safe-freight](/employees/safe-freight)
- **차량 위치 관제**: [/employees/vehicle-tracking](/employees/vehicle-tracking)
- **업무일지(운행 보고)**: [/employees/reports/daily](/employees/reports/daily)
- **날씨 및 미세먼지**: [/employees/weather](/employees/weather)
- **사내연락망**: [/employees/internal-contacts](/employees/internal-contacts)

## 답변 원칙 및 가드레일 (Anti-Hallucination 방지 및 답변 풍부화)
1. **정확성과 친절함**: 시스템(RAG)에서 넘어온 데이터(최근 게시글, 화물차 위치, 미세먼지, 법령)를 최우선으로 활용하세요.
2. **법령과 고시 구분 (중요)**: '안전운임' 등은 법망에 직접 조회되지 않는 '고시'입니다. 또한 '화물연대'는 법률명칭이 아닙니다. K-Law에 검색 결과가 없더라도 "검색 결과가 없습니다"라고 끝내지 말고, 네가 가진 사전 지식(자동차운수사업법, 자동차관리법, 근로기준법, 화물연대 관련 기본 지식 등)을 동원하여 최대한 자세히 풀어서 친절하게 설명해주세요.
3. **읽기 권한 한계 명시**: 사용자가 PDF나 자료실 문서 파악을 요구하면, "현재 시스템은 보안 및 기술적 이유로 자료실의 PDF나 엑셀 파일 본문 내용을 직접 읽을 수 없습니다. 주로 최신 업무게시글, 실시간 차량 위치, 미세먼지, 법령 검색 위주로 확인해드릴 수 있습니다."라고 명확히 안내하세요.
4. **거절 최소화**: 질문의 의도가 ELS 업무나 법률/노무 영역이라면, K-Law 데이터가 조금 빈약하더라도 절대로 거절하지 말고 일반적인 법리적 해석이나 업계 상식 수준에서 성심성의껏 답변하세요.`;

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
    
    let safeFreightText = '';
    try {
        const path = require('path');
        const fs = require('fs');
        const docsPath = path.join(process.cwd(), 'data', 'safe-freight-docs.json');
        if (fs.existsSync(docsPath)) {
            const safeDocs = JSON.parse(fs.readFileSync(docsPath, 'utf8'));
            if (safeDocs && safeDocs.length > 0) {
                // 최신순 정렬
                safeDocs.sort((a, b) => (b.versionDir || '').localeCompare(a.versionDir || ''));
                safeFreightText += '\n\n====== [안전운임제 최신 고시 전문 데이터] ======\n이하 데이터는 시스템에 공식 등록된 화물자동차 안전운임 고시 전문입니다. 사용자가 안전운임 관련 과태료, 적용 범위, 부대조항 등을 질문할 경우, 구체적인 규정과 함께 반드시 제공된 고시 전문에 입각하여 답변하십시오.\n';
                // 최대 최신 2개 버전까지만 컨텍스트에 포함 (비교 용이성 및 토큰 한계 고려)
                for (const doc of safeDocs.slice(0, 2)) {
                    const textSnippet = typeof doc.text === 'string' ? doc.text.substring(0, 8000) : '';
                    safeFreightText += `\n--- [고시 차수: ${doc.versionDir}] ---\n${textSnippet}\n`;
                }
                safeFreightText += '===============================================\n';
            }
        }
    } catch(err) {
        console.error('[/api/chat] 안전운임 전문 로드 에러:', err);
    }

    // 최종 시스템 프롬프트 조합
    const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION + recentPostsText + safeFreightText;
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
