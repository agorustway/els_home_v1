import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import path from 'path';
import fs from 'fs';

// ─── 모듈 레벨 캐시 (35MB 파일 매 요청 파싱 방지) ───────────────────────────
let _sfDataCache = null;   // safe-freight.json
let _sfDocsCache = null;   // safe-freight-docs.json

function getSfData() {
    if (!_sfDataCache) {
        const p = path.join(process.cwd(), 'data', 'safe-freight.json');
        if (fs.existsSync(p)) _sfDataCache = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    return _sfDataCache;
}

function getSfDocs() {
    if (!_sfDocsCache) {
        const p = path.join(process.cwd(), 'data', 'safe-freight-docs.json');
        if (fs.existsSync(p)) {
            const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (Array.isArray(raw)) {
                raw.sort((a, b) => (b.versionDir || '').localeCompare(a.versionDir || ''));
                _sfDocsCache = raw;
            }
        }
    }
    return _sfDocsCache;
}

const BASE_SYSTEM_INSTRUCTION = "너는 ELS Solution의 법률/업무 지원 전문 AI 에이전트다.\nELS 솔루션은 물류·운송 회사를 위한 인트라넷 시스템입니다.\n\n## ELS 인트라넷 전체 메뉴 맵 (안내 시 마크다운 링크 [메뉴이름](/경로) 필수 사용)\n### 메인 메뉴\n- 홈(메인 대시보드): [홈](/employees) — 공지사항, 웹진, 날씨 위젯 등 종합 현황\n- 날씨 및 미세먼지: [날씨](/employees/weather) — 전국 날씨, 시간별 예보, 생활지수\n- 뉴스: [뉴스](/employees/news) — 물류/운송 관련 뉴스 피드\n- 안전운임 조회: [안전운임 조회](/employees/safe-freight) — 구간별 안전운임 단가 계산, 고시 전문 PDF 열람\n- 컨테이너 이력조회: [컨테이너 이력조회](/employees/container-history) — ETRANS 연동 실시간 반입/반출 추적\n- 차량 위치 관제: [차량 위치 관제](/employees/vehicle-tracking) — GPS 기반 실시간 화물차 위치 확인\n- 마이페이지: [마이페이지](/employees/mypage) — 개인 정보, 프로필 관리\n\n### 인트라넷 메뉴\n- AI 어시스턴트: [AI 어시스턴트](/employees/ask) — 바로 여기! 법률/업무 실시간 문의\n- 대시보드: [대시보드](/employees/dashboard) — 사내 통계 및 현황 요약\n- 자유게시판: [자유게시판](/employees/board/free) — 사내 자유 게시판\n- 업무보고: [일일보고](/employees/reports/daily), [월간보고](/employees/reports/monthly), [내 보고서](/employees/reports/my)\n- 사내연락망: [사내연락망](/employees/internal-contacts) — 직원 연락처 관리\n- 외부연락처: [외부연락처](/employees/external-contacts) — 거래처/고객 연락처\n- 기사연락처: [기사연락처](/employees/driver-contacts) — 운전기사 연락처\n- 협력사연락처: [협력사연락처](/employees/partner-contacts) — 파트너사 연락처\n- 작업지 관리: [작업지 관리](/employees/work-sites) — 작업 현장 주소/정보 관리\n- 업무자료실: [업무자료실](/employees/work-docs) — 사내 업무 참고 자료\n- 양식 모음: [양식 모음](/employees/form-templates) — 업무용 각종 서식/양식\n- 자료실(NAS): [자료실](/employees/archive) — NAS 기반 사내 파일 저장소\n- 웹진: [웹진](/employees/webzine) — 사내 소식지/웹진\n- 랜덤게임: [랜덤게임](/employees/random-game) — 사내 이벤트/복지용\n\n### 지점 관리\n- 아산지점 배차판: [아산지점](/employees/branches/asan) — 아산지점 실시간 배차 현황\n\n## 답변 원칙 및 가드레일\n1. 정확성과 친절함: 시스템(RAG)에서 넘어온 데이터를 최우선으로 활용하세요.\n2. 법령과 고시 구분: 안전운임 등은 법망에 직접 조회되지 않는 고시입니다. K-Law에 검색 결과가 없더라도 거절하지 말고, 사전 지식을 동원하여 최대한 자세히 설명하세요.\n3. 읽기 권한 한계: PDF나 자료실 문서 파악 요구 시 한계를 명확히 안내하세요. 다만 시스템에 등록된 안전운임 고시 전문 데이터는 참고 가능합니다.\n4. 거절 최소화: ELS 업무나 법률/노무 영역이라면 절대 거절하지 말고 성심성의껏 답변하세요.\n5. 메뉴 안내 시: 위의 전체 메뉴 맵을 참고하여 정확한 마크다운 링크로 안내하세요.";

/**
 * POST /api/chat
 * Body: { messages: Array<{ role: 'user'|'assistant', parts: Array<{ text: string }> }> }
 * 스트리밍 응답 (SSE)
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
        return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
    }

    const messages = body?.messages ?? [];
    if (messages.length === 0) {
        return NextResponse.json({ error: '메시지가 비어있습니다.' }, { status: 400 });
    }

    // 마지막 사용자 메시지 추출
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const lastUserText = lastUserMsg?.parts?.[0]?.text || '';
    const userKwd = lastUserText.toLowerCase();

    // Supabase 클라이언트 초기화
    const supabase = createAdminClient();

    // === RAG 데이터 수집 ===
    let recentPostsText = '';

    try {
        // --- Omni-RAG: 사용자의 질문에 맞춰 전체 사내망 DB 동시 스캔 ---
        const stopWords = ['알려줘','보여줘','어디','무엇','어떻게','누구','찾아줘','요약','정리','내용','해줘','해주세요','알려','대해','관련','관해','설명','뭐야','어때'];
        const searchTerms = lastUserText.replace(/[^가-힣a-zA-Z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w));

        try {
            const orConditionsExt = searchTerms.map(term => `company_name.ilike.%${term}%,contact_person.ilike.%${term}%,memo.ilike.%${term}%`).join(',');
            const orConditionsInt = searchTerms.map(term => `name.ilike.%${term}%,department.ilike.%${term}%,position.ilike.%${term}%,memo.ilike.%${term}%`).join(',');
            const orConditionsPosts = searchTerms.map(term => `title.ilike.%${term}%,content.ilike.%${term}%`).join(',');
            const orConditionsWs = searchTerms.map(term => `name.ilike.%${term}%,address.ilike.%${term}%,memo.ilike.%${term}%`).join(',');

            // 병렬 스캔 (속도 최적화) — 연락처, 게시글, 작업지 동시 조회
            const [extRes, intRes, postRes, wsRes] = await Promise.all([
                searchTerms.length > 0 ? supabase.from('external_contacts').select('*').or(orConditionsExt).limit(5) : Promise.resolve({ data: [] }),
                searchTerms.length > 0 ? supabase.from('internal_contacts').select('*').or(orConditionsInt).limit(5) : Promise.resolve({ data: [] }),
                searchTerms.length > 0 ? supabase.from('posts').select('title, content, author_email, created_at, board_type').or(orConditionsPosts).order('created_at', { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
                searchTerms.length > 0 ? supabase.from('work_sites').select('*').or(orConditionsWs).limit(5).then(r => r).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
            ]);

            if (extRes.data?.length > 0) {
                recentPostsText += '\n\n## 외부연락처 검색결과\n' + extRes.data.map(c => `- ${c.company_name} | 구분:${c.contact_type||'-'} | 대표:${c.phone||'-'} | 담당:${c.contact_person||'-'}(${c.contact_person_phone||'-'}) | 메모/주소:${c.memo||'-'}`).join('\n');
            }
            if (intRes.data?.length > 0) {
                recentPostsText += '\n\n## 사내연락망 검색결과\n' + intRes.data.map(c => `- ${c.name} ${c.position||''} (${c.department||''}) | 폰:${c.phone||'-'} | 메일:${c.email||'-'}`).join('\n');
            }
            if (postRes.data?.length > 0) {
                recentPostsText += '\n\n## 사내 게시판/업무일지 검색결과\n' + postRes.data.map(r => {
                    const date = new Date(r.created_at).toLocaleDateString();
                    return `- [${date}][${r.board_type}] ${r.title}\n  본문:${r.content?.slice(0, 300)}...`;
                }).join('\n');
            }
            if (wsRes.data?.length > 0) {
                recentPostsText += '\n\n## 작업지 검색결과\n' + wsRes.data.map(w => `- ${w.name} | 주소:${w.address||'-'} | 메모:${w.memo||'-'}`).join('\n');
            }

            // 1. 차량 위치 관련
            if (userKwd.includes('차량') || userKwd.includes('위치') || userKwd.includes('어디')) {
                const { data: trips } = await supabase.from('vehicle_trips').select('id, vehicle_number').in('status', ['driving', 'paused']);
                if (trips?.length > 0) {
                    const tripIds = trips.map(t => t.id);
                    const { data: locs } = await supabase.from('vehicle_locations').select('trip_id, address').in('trip_id', tripIds).order('recorded_at', { ascending: false });
                    const locMap = {};
                    locs?.forEach(l => { if(!locMap[l.trip_id]) locMap[l.trip_id] = l.address; });
                    recentPostsText += '\n\n## 실시간 운행차량 위치 (내부 DB)\n' + trips.map(t => `- 화물차(${t.vehicle_number}): 현재 [${locMap[t.id] || '알 수 없음'}] 부근 위치`).join('\n');
                }
            }

            // 2. 컨테이너 실시간 이력조회 연동
            const cntrMatch = userKwd.match(/[a-z]{4}\d{7}/);
            if (cntrMatch) {
                const cntrNo = cntrMatch[0].toUpperCase();
                const backendUrl = process.env.ELS_BACKEND_URL || process.env.NEXT_PUBLIC_ELS_BACKEND_URL || 'http://localhost:2929';
                const res = await fetch(`${backendUrl}/container/tracking?cntrNo=${cntrNo}`, { signal: AbortSignal.timeout(6000) }).catch(()=>null);
                if (res?.ok) {
                    const data = await res.json();
                    if (data?.tracking_list?.length > 0) {
                        recentPostsText += `\n\n## 컨테이너(${cntrNo}) 조회 결과\n` + JSON.stringify(data.tracking_list).slice(0, 800);
                    }
                }
            }

            // 3. 안전운임표 단가 데이터 주입 (faresLatest 키 기반 검색)
            const sfKeywords = ['안전운임', '운임', '단가', '요금', '부산', '의왕', '인천', '광양', '편도', '왕복'];
            const isSfQuery = searchTerms.some(t => sfKeywords.some(k => t.includes(k))) ||
                              sfKeywords.some(k => userKwd.includes(k));
            if (isSfQuery) {
                const sfData = getSfData();
                if (sfData?.faresLatest) {
                    // faresLatest 키: '[왕복/편도] 출발지|광역시도|구|동'
                    const fareKeys = Object.keys(sfData.faresLatest);
                    const matched = fareKeys.filter(k =>
                        searchTerms.some(t => k.includes(t)) ||
                        sfKeywords.filter(k2 => userKwd.includes(k2)).some(k2 => k.includes(k2))
                    ).slice(0, 8);
                    if (matched.length > 0) {
                        const fareRows = matched.map(k => {
                            const v = sfData.faresLatest[k];
                            return `- ${k} | ${v.km}km | 20ft:${(v.fare20/10000).toFixed(1)}만원 | 40ft:${(v.fare40/10000).toFixed(1)}만원`;
                        }).join('\n');
                        recentPostsText += '\n\n## 안전운임 단가 검색결과 (최신 고시 기준)\n' + fareRows;
                    }
                    // 출발지(origins) 목록도 제공
                    if (sfData.origins?.length > 0) {
                        const originList = sfData.origins.map(o => o.label || o.id).join(', ');
                        recentPostsText += `\n\n## 안전운임 적용 구간 (출발지 목록)\n${originList}\n정확한 단가는 [안전운임 조회](/employees/safe-freight) 메뉴를 이용해주세요.`;
                    }
                }
            }
        } catch (e) {
            console.error('Omni-RAG 에러:', e);
        }

        // 4. 미세먼지 K-SKILL 연동
        if (userKwd.includes('미세먼지') || userKwd.includes('공기') || userKwd.includes('날씨')) {
            const regionsMap = {
                '서울': '서울 중구', '부산': '부산 연산동', '인천': '인천 구월동',
                '대구': '대구 수창동', '대전': '대전 둔산동', '광주': '광주 농성동',
                '울산': '울산 신정동', '세종': '세종 아름동', '아산': '아산 모종동',
                '당진': '당진 읍내동', '예산': '예산군', '천안': '천안'
            };
            const foundKey = Object.keys(regionsMap).find(r => userKwd.includes(r));
            const targetRegion = foundKey ? regionsMap[foundKey] : '아산 모종동';

            try {
                const url = `https://k-skill-proxy.nomadamas.org/v1/fine-dust/report?regionHint=${encodeURIComponent(targetRegion)}`;
                const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
                if (res.ok) {
                    const data = await res.json();
                    if (!data.error && data.pm10 && data.pm25) {
                        const pmInfo = `- 측정소: ${data.station_name}\n- 시간: ${data.measured_at}\n- 미세먼지: ${data.pm10.value}(${data.pm10.grade})\n- 초미세먼지: ${data.pm25.value}(${data.pm25.grade})\n- 총평: ${data.khai_grade}`;
                        recentPostsText += '\n\n## 실시간 미세먼지 현황 (K-SKILL/AirKorea 제공)\n위치: ' + targetRegion + '\n' + pmInfo;
                    }
                }
            } catch (e) {
                console.error('[/api/chat] K-SKILL 미세먼지 오류:', e);
            }
        }

        // 5. K-Law (법망 API) 연동
        if (userKwd.includes('법') || userKwd.includes('규정') || userKwd.includes('운임') || userKwd.includes('근로') || userKwd.includes('노동') || userKwd.includes('화물연대') || userKwd.includes('판례') || userKwd.includes('과태료')) {
            const searchKwd = lastUserText.trim();
            try {
                const url = `https://api.beopmang.org/api/v4/law?action=search&q=${encodeURIComponent(searchKwd)}`;
                const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
                if (res.ok) {
                    const data = await res.json();
                    if (data.results && data.results.length > 0) {
                        const lawQuotes = data.results.slice(0, 3).map(r => {
                            return `### [출처: K-Law] ${r.title}\n${r.content?.slice(0, 300)}...`;
                        }).join('\n\n');
                        recentPostsText += '\n\n## 실시간 법령/규정 검색 결과 (K-Law MCP)\n' + lawQuotes;
                    } else {
                        recentPostsText += '\n\n## 실시간 법령/규정 검색 결과 (K-Law MCP)\n관련된 최신 법령 정보를 찾을 수 없습니다. 법령 명칭을 정확히 입력해 보세요.';
                    }
                }
            } catch (e) {
                console.error('[/api/chat] K-Law 법망 API 오류:', e);
            }
        }
    } catch (e) {
        console.error('[/api/chat] DB 조회 오류:', e);
    }

    // 안전운임 고시 전문 데이터 — 안전운임/법령 키워드가 있을 때만 주입 (토큰 절감)
    let safeFreightText = '';
    const docsKeywords = ['안전운임', '고시', '과태료', '적용범위', '부대조항', '법', '규정', '운임'];
    const needsDocs = docsKeywords.some(k => userKwd.includes(k));
    if (needsDocs) {
        try {
            const safeDocs = getSfDocs();
            if (safeDocs?.length > 0) {
                safeFreightText += '\n\n====== [안전운임제 최신 고시 전문 데이터] ======\n이하 데이터는 시스템에 공식 등록된 화물자동차 안전운임 고시 전문입니다. 사용자가 안전운임 관련 과태료, 적용 범위, 부대조항 등을 질문할 경우, 구체적인 규정과 함께 반드시 제공된 고시 전문에 입각하여 답변하십시오.\n';
                for (const doc of safeDocs.slice(0, 2)) {
                    const textSnippet = typeof doc.text === 'string' ? doc.text.substring(0, 6000) : '';
                    safeFreightText += `\n--- [고시 차수: ${doc.versionDir}] ---\n${textSnippet}\n`;
                }
                safeFreightText += '===============================================\n';
            }
        } catch(err) {
            console.error('[/api/chat] 안전운임 전문 로드 에러:', err);
        }
    }

    // 최종 시스템 프롬프트 조합
    const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION + recentPostsText + safeFreightText;
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

    // Gemini 2.5 Flash 스트리밍 엔드포인트
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

    let geminiRes;
    try {
        geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload),
            signal: AbortSignal.timeout(60_000),
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

    // Gemini SSE -> 클라이언트 SSE 변환 스트림
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
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(raw);
                        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
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
            'X-Accel-Buffering': 'no',
        },
    });
}
