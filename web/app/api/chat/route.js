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

const BASE_SYSTEM_INSTRUCTION = `너는 ELS Solution의 업무 지원 전문 AI 에이전트다.
ELS 솔루션은 물류·운송 회사를 위한 인트라넷 시스템이다.

## ⚡ 최우선 답변 원칙 (절대 위반 금지)
1. **[데이터 활용 필수]** 아래에 "## 검색결과", "## 실시간", "## 안전운임 단가 표" 등으로 주입된 데이터는 실시간으로 사내 DB 또는 외부 공식 API에서 가져온 **확인된 사실 데이터**다. 이 데이터가 존재하면 **반드시 해당 데이터의 구체적인 수치/내용을 직접 인용하여 답변**하라. 절대로 "메뉴에서 확인하세요"라고 회피하지 마라.
2. **[거절 금지]** K-SKILL, K-Law, 사내 DB에서 데이터가 주입되었으면 해당 내용을 답변에 포함해야 한다. "저는 ~할 수 없습니다" 류의 거절은 데이터가 전혀 없을 때만 허용된다.
3. **[범용 지식 허용]** K리그 결과, 스포츠, 날씨, 일반 상식 등 사용자가 묻는 모든 질문에 성심성의껏 답변하라. 물류 업무만 답변하라는 제한은 없다. 다만 ELS 사내 데이터가 있으면 그것을 최우선 활용하라.
4. **[업무 데이터 전권]** 업무보고, 게시판, 연락처, 작업지, 차량위치 등 사내 DB 검색결과가 주입되면 그것을 요약/분석/안내할 수 있다. "권한이 없다"고 거절하지 마라 — 데이터가 주입된 시점에서 이미 권한이 있는 것이다.

## ELS 인트라넷 전체 메뉴 맵 (안내 시 마크다운 링크 [메뉴이름](/경로) 필수 사용)
### 메인 메뉴
- 홈(메인 대시보드): [홈](/employees) — 공지사항, 웹진, 날씨 위젯 등 종합 현황
- 날씨 및 미세먼지: [날씨](/employees/weather) — 전국 날씨, 시간별 예보, 생활지수
- 뉴스: [뉴스](/employees/뉴스) — 물류/운송 관련 뉴스 피드
- 안전운임 조회: [안전운임 조회](/employees/safe-freight) — 구간별 안전운임 단가 계산, 고시 전문 PDF 열람
- 컨테이너 이력조회: [컨테이너 이력조회](/employees/container-history) — ETRANS 연동 실시간 반입/반출 추적
- 차량 위치 관제: [차량 위치 관제](/employees/vehicle-tracking) — GPS 기반 실시간 화물차 위치 확인
- 마이페이지: [마이페이지](/employees/mypage) — 개인 정보, 프로필 관리

### 인트라넷 메뉴
- AI 어시스턴트: [AI 어시스턴트](/employees/ask) — 바로 여기! 법률/업무 실시간 문의
- 대시보드: [대시보드](/employees/dashboard) — 사내 통계 및 현황 요약
- 자유게시판: [자유게시판](/employees/board/free) — 사내 자유 게시판
- 업무보고: [일일보고](/employees/reports/daily), [월간보고](/employees/reports/monthly), [내 보고서](/employees/reports/my)
- 사내연락망: [사내연락망](/employees/internal-contacts) — 직원 연락처 관리
- 외부연락처: [외부연락처](/employees/external-contacts) — 거래처/고객 연락처
- 기사연락처: [기사연락처](/employees/driver-contacts) — 운전기사 연락처
- 협력사연락처: [협력사연락처](/employees/partner-contacts) — 파트너사 연락처
- 작업지 관리: [작업지 관리](/employees/work-sites) — 작업 현장 주소/정보 관리
- 업무자료실: [업무자료실](/employees/work-docs) — 사내 업무 참고 자료
- 양식 모음: [양식 모음](/employees/form-templates) — 업무용 각종 서식/양식
- 자료실(NAS): [자료실](/employees/archive) — NAS 기반 사내 파일 저장소
- 웹진: [웹진](/employees/webzine) — 사내 소식지/웹진
- 랜덤게임: [랜덤게임](/employees/random-game) — 사내 이벤트/복지용

### 지점 관리
- 아산지점 배차판: [아산지점](/employees/branches/asan) — 아산지점 실시간 배차 현황

## 안전운임 답변 규칙
1. **[절대 원칙]** 아래 "## 안전운임 단가 표"에 데이터가 있으면, 해당 수치(km, 20ft, 40ft 금액)를 **직접 표시**하여 답변하라. "안전운임 조회 메뉴에서 확인하세요"라고 절대 회피 금지.
2. **[금액 조작 금지]** AI 임의로 편도×2=왕복 계산, 금액 추측 등 수학연산 절대 금지. 표에 적힌 숫자만 그대로 안내.
3. **[편도/왕복 오해 방지]** 표 키에 [편도]만 있다면 "고시 데이터상 해당 구간은 편도만 등록되어 있습니다"라고 안내. 사용자가 왕복/편도 이유를 물으면 아래 "## 💡 [AI 사전 학습]" 원칙을 그대로 설명하라.
4. **[산정 근거]** "왜 이 금액이냐" 질문 시 반드시 "## 💡 [AI 사전 학습]" 섹션이나 "## 안전운임 고시 전문" 섹션에 있는 조문/부대조항만을 근거로 설명하며 혼자 지어내지 마라.

## 메뉴 안내 규칙
- 위의 전체 메뉴 맵을 참고하여 정확한 마크다운 링크로 안내하세요.`;

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
    let isSfQuery = false;

    try {
        // --- Omni-RAG: 사용자의 질문에 맞춰 전체 사내망 DB 동시 스캔 ---
        const stopRegex = /에서|까지|부터|으로|로|의|가|는|은|를|을|알려줘|보여줘|어디|무엇|어떻게|누구|찾아줘|요약|정리|내용|해줘|해주세요|알려|대해|관련|관해|설명|뭐야|어때|확인|확인해줘|얼마|얼마야/g;
        const cleanText = lastUserText.replace(stopRegex, ' ').replace(/[^가-힣a-zA-Z0-9\s]/g, ' ');
        const searchTerms = [...new Set(cleanText.split(/\s+/).filter(w => w.length > 1).map(t => t.includes('터미널') ? t.replace('터미널', '') : t))];

        try {
            const orConditionsExt = searchTerms.map(term => `company_name.ilike.%${term}%,contact_person.ilike.%${term}%,memo.ilike.%${term}%`).join(',');
            const orConditionsInt = searchTerms.map(term => `name.ilike.%${term}%,department.ilike.%${term}%,position.ilike.%${term}%,memo.ilike.%${term}%`).join(',');
            const orConditionsPosts = searchTerms.map(term => `title.ilike.%${term}%,content.ilike.%${term}%`).join(',');
            const orConditionsWs = searchTerms.map(term => `name.ilike.%${term}%,address.ilike.%${term}%,memo.ilike.%${term}%`).join(',');

            // 날짜/기간 키워드 추출 (예: 4월, 2024년, 이번주)
            const dateMatch = lastUserText.match(/(\d{1,2})월/);
            const monthVal = dateMatch ? dateMatch[1] : null;

            // 병렬 스캔 (속도 최적화) — 연락처, 게시글, 작업지 동시 조회
            let postQuery = supabase.from('posts').select('title, content, author_email, created_at, board_type');
            
            // 특정 월을 언급하면 해당 월의 데이터도 함께 조회하도록 쿼리 확장
            if (monthVal) {
                const year = new Date().getFullYear();
                const startDate = `${year}-${monthVal.padStart(2, '0')}-01`;
                const endDate = new Date(year, monthVal, 0).toISOString().split('T')[0];
                postQuery = postQuery.gte('created_at', startDate).lte('created_at', endDate);
            } else if (searchTerms.length > 0) {
                postQuery = postQuery.or(orConditionsPosts);
            }
            
            const [extRes, intRes, postRes, wsRes] = await Promise.all([
                searchTerms.length > 0 ? supabase.from('external_contacts').select('*').or(orConditionsExt).limit(5) : Promise.resolve({ data: [] }),
                searchTerms.length > 0 ? supabase.from('internal_contacts').select('*').or(orConditionsInt).limit(5) : Promise.resolve({ data: [] }),
                postQuery.order('created_at', { ascending: false }).limit(monthVal ? 15 : 5),
                searchTerms.length > 0 ? supabase.from('work_sites').select('*').or(orConditionsWs).limit(5).then(r => r).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
            ]);

            if (extRes.data?.length > 0) {
                recentPostsText += '\n\n## 외부연락처 검색결과\n' + extRes.data.map(c => `- ${c.company_name} | 구분:${c.contact_type || '-'} | 대표:${c.phone || '-'} | 담당:${c.contact_person || '-'}(${c.contact_person_phone || '-'}) | 메모/주소:${c.memo || '-'}`).join('\n');
            }
            if (intRes.data?.length > 0) {
                recentPostsText += '\n\n## 사내연락망 검색결과\n' + intRes.data.map(c => `- ${c.name} ${c.position || ''} (${c.department || ''}) | 폰:${c.phone || '-'} | 메일:${c.email || '-'}`).join('\n');
            }
            if (postRes.data?.length > 0) {
                recentPostsText += `\n\n## 사내 게시판/업무보고 검색결과 (${monthVal ? monthVal + '월 자료' : '검색결과'})\n` + postRes.data.map(r => {
                    const date = new Date(r.created_at).toLocaleDateString();
                    return `- [${date}][${r.board_type}] ${r.title}\n  본문:${r.content?.slice(0, 500)}...`;
                }).join('\n');
            } else if (monthVal) {
                recentPostsText += `\n\n## 사내 자료 검색결과\n- ${monthVal}월에 작성된 게시글이나 업무보고가 DB에 존재하지 않습니다. 메뉴에서 직접 확인해 보시겠습니까?`;
            }
            if (wsRes.data?.length > 0) {
                recentPostsText += '\n\n## 작업지 검색결과\n' + wsRes.data.map(w => `- ${w.name} | 주소:${w.address || '-'} | 메모:${w.memo || '-'}`).join('\n');
            }

            // 1. 차량 위치 관련
            if (userKwd.includes('차량') || userKwd.includes('위치') || userKwd.includes('어디')) {
                const { data: trips } = await supabase.from('vehicle_trips').select('id, vehicle_number').in('status', ['driving', 'paused']);
                if (trips?.length > 0) {
                    const tripIds = trips.map(t => t.id);
                    const { data: locs } = await supabase.from('vehicle_locations').select('trip_id, address').in('trip_id', tripIds).order('recorded_at', { ascending: false });
                    const locMap = {};
                    locs?.forEach(l => { if (!locMap[l.trip_id]) locMap[l.trip_id] = l.address; });
                    recentPostsText += '\n\n## 실시간 운행차량 위치 (내부 DB)\n' + trips.map(t => `- 화물차(${t.vehicle_number}): 현재 [${locMap[t.id] || '알 수 없음'}] 부근 위치`).join('\n');
                }
            }

            // 2. 컨테이너 실시간 이력조회 연동
            const cntrMatch = userKwd.match(/[a-z]{4}\d{7}/);
            if (cntrMatch) {
                const cntrNo = cntrMatch[0].toUpperCase();
                const backendUrl = process.env.ELS_BACKEND_URL || process.env.NEXT_PUBLIC_ELS_BACKEND_URL || 'http://localhost:2929';
                const res = await fetch(`${backendUrl}/container/tracking?cntrNo=${cntrNo}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
                if (res?.ok) {
                    const data = await res.json();
                    if (data?.tracking_list?.length > 0) {
                        recentPostsText += `\n\n## 컨테이너(${cntrNo}) 조회 결과\n` + JSON.stringify(data.tracking_list).slice(0, 800);
                    } else {
                        recentPostsText += `\n\n## 컨테이너(${cntrNo}) 조회 결과\n해당 컨테이너의 이력 데이터가 없거나 지원되지 않습니다. **(중요: AI 임의로 이력을 지어내지 말고, 이 문구 그대로 조회 불가함을 안내해라)**`;
                    }
                } else {
                     recentPostsText += `\n\n## 컨테이너(${cntrNo}) 조회 결과\n서버 통신 장애로 이력 조회에 실패했습니다. **(중요: AI 임의로 데이터를 지어내지 말고 서버 에러 상태를 안내해라)**`;
                }
            }

            // 3. 안전운임표 단가 데이터 주입 (faresLatest 키 기반 검색 최적화)
            const sfKeywords = ['안전운임', '운임', '단가', '요금', '부산', '의왕', '인천', '광양', '편도', '왕복', '신항', '북항'];
            isSfQuery = searchTerms.some(t => sfKeywords.some(k => t.includes(k))) ||
                sfKeywords.some(k => userKwd.includes(k));
            if (isSfQuery) {
                const sfData = getSfData();
                if (sfData?.faresLatest) {
                    // faresLatest 키: '[왕복/편도] 출발지|광역시도|구|동'
                    const fareKeys = Object.keys(sfData.faresLatest);

                    // [v4.9.42] 안전운임 스코어링 고도화: 단어 매칭 수에 따른 가중치 부여
                    const scored = fareKeys.map(k => {
                        let score = 0;
                        let matchedCount = 0;
                        searchTerms.forEach(t => {
                            if (k.includes(t)) {
                                score += 10; // 인주면, 아산시 등 고유명사 매칭 시 고득점
                                matchedCount++;
                            }
                        });
                        // 출발지(ex:아산)와 목적지(ex:부산)가 동시에 들어있으면 점수를 대폭 끌어올림
                        if (matchedCount > 1) {
                            score += (matchedCount * 15);
                        }
                        return { k, score };
                    }).filter(i => i.score > 0)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 12);

                    if (scored.length > 0) {
                        const fareRows = scored.map(item => {
                            const v = sfData.faresLatest[item.k];
                            // 금액의 출처가 무엇이든, AI가 인지하기 쉽도록 '안전운임/운수자/위탁 통합' 등의 키워드를 임시 주입
                            return `- ${item.k} | ${v.km}km | 20ft: ${(v.fare20 / 10000).toFixed(1)}만원 | 40ft: ${(v.fare40 / 10000).toFixed(1)}만원`;
                        }).join('\n');
                        recentPostsText += '\n\n## (중요) 안전운임 단가 표\n' + fareRows + '\n※ 이 데이터를 절대적으로 신뢰해야 합니다! 사용자가 편도를 묻더라도 표에 [왕복]만 있다면 왕복 금액만 안내하세요. 절대 AI 임의로 "편도에 곱하기 2를 하면 왕복"이라는 식의 추측성 수학 계산을 하지 말고, 반드시 위 표에 있는 숫자 그대로만 안내하세요.';
                    } else if (sfData.origins?.length > 0) {
                        const originList = sfData.origins.map(o => o.label || o.id).join(', ');
                        recentPostsText += `\n\n## 안전운임 적용 구간 (출발지 목록)\n${originList}\n정확한 단가는 [안전운임 조회](/employees/safe-freight) 메뉴를 이용해주세요.`;
                    }
                }
            }
        } catch (e) {
            console.error('Omni-RAG 에러:', e);
        }

        // 4. K-SKILL & 직접 실시간 API 연동 (미세먼지, 날씨, KTX, 지하철, 한강, 주식, 스포츠 등)
        const kskillKeywords = ['미세먼지', '공기', '날씨', 'ktx', '열차', '기차', '예매', '지하철', '역', '도착', '한강', '수위', '주식', '증시', '삼성전자', '야구', '축구', 'kbo', 'k리그', '경기', '결과', '스포츠', '좌석'];
        const isKskillQuery = kskillKeywords.some(k => userKwd.includes(k));

        if (isKskillQuery) {
            // (1) 미세먼지/날씨
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
                            recentPostsText += '\n\n## 실시간 미세먼지 현황 (K-SKILL)\n위치: ' + targetRegion + '\n' + pmInfo;
                        }
                    }
                } catch (e) { console.error('K-SKILL 미세먼지 오류:', e); }
            }

            // (2) KTX/SRT 좌석 및 시간표 조회 (다이렉트 스마트 안내 체계로 개편)
            if (userKwd.includes('ktx') || userKwd.includes('열차') || userKwd.includes('기차') || userKwd.includes('srt') || userKwd.includes('좌석')) {
                const ktxRegex = /([가-힣]{2,5})\s*(?:역|에서)?\s*([가-힣]{2,5})\s*(?:역|까지)?/;
                const match = lastUserText.match(ktxRegex);
                let from = match?.[1] || '선택출발역';
                let to = match?.[2] || '선택도착역';
                const isSrt = userKwd.includes('srt');
                
                // 네이버/카카오 다이렉트 열차 조회 링크로 유도
                const trainType = isSrt ? 'SRT' : 'KTX';
                const searchLink = `https://m.search.naver.com/search.naver?query=${encodeURIComponent(from + '역 ' + to + '역 ' + trainType + ' 시간표')}`;
                
                recentPostsText += `\n\n## ${trainType} 좌석 및 일정 조회 안내\n`;
                recentPostsText += `코레일 및 SRT의 강력한 보안 정책(안티-봇)으로 인해 화면에 즉각적으로 실시간 좌석을 띄워드릴 수는 없지만, 가장 빠르고 편하게 확인하실 수 있는 다이렉트 링크를 준비했습니다.\n`;
                recentPostsText += `아래 링크를 누르시면 실시간 시간표와 좌석을 바로 확인하실 수 있습니다:\n`;
                recentPostsText += `- 🚄 **[네이버 ${trainType} 실시간 시간표/좌석 바로가기](${searchLink})**\n`;
                recentPostsText += `- 🎫 **예매 앱 다운로드**: ${isSrt ? '[SRTPlay 앱]' : '[코레일톡 앱]'}을 권장합니다.`;
            }

            // (3) 지하철 도착 정보
            if (userKwd.includes('지하철') || (userKwd.includes('역') && userKwd.includes('도착'))) {
                const subRegex = /([가-힣]{2,10})역/;
                const subMatch = lastUserText.match(subRegex);
                const station = subMatch?.[1]?.replace('역', '') || '강남';
                try {
                    const res = await fetch(`https://k-skill-proxy.nomadamas.org/v1/seoul-subway/arrival?stationName=${encodeURIComponent(station)}`, { signal: AbortSignal.timeout(3000) });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.realtimeArrivalList?.length > 0) {
                            const info = data.realtimeArrivalList.slice(0, 5).map(a => `- [${a.updnLine}] ${a.trainLineNm}: ${a.arvlMsg2}`).join('\n');
                            recentPostsText += `\n\n## ${station}역 지하철 실시간 도착 (K-SKILL)\n${info}`;
                        } else {
                            recentPostsText += `\n\n## 지하철 안내 (K-SKILL)\n현재 OpenAPI를 통해 조회되는 ${station}역의 실시간 정보가 없거나, 지원되지 않는 역입니다.`;
                        }
                    } else {
                        recentPostsText += `\n\n## 지하철 안내\n시스템 오류로 ${station}역의 실시간 정보를 가져올 수 없습니다.`;
                    }
                } catch (e) { console.error('K-SKILL 지하철 오류:', e); }
            }

            // (4) 한강 수위 정보
            if (userKwd.includes('한강') || userKwd.includes('수위')) {
                const hRegex = /([가-힣]{2,10})\s*(?:교|대교)?/;
                const hMatch = lastUserText.match(hRegex);
                const bridge = hMatch?.[1] ? hMatch[1] + (hMatch[1].endsWith('교') ? '' : '대교') : '한강대교';
                try {
                    const res = await fetch(`https://k-skill-proxy.nomadamas.org/v1/han-river/water-level?stationName=${encodeURIComponent(bridge)}`, { signal: AbortSignal.timeout(3000) });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.measured_at) {
                            recentPostsText += `\n\n## ${bridge} 실시간 수위 (K-SKILL)\n- 시간: ${data.measured_at}\n- 수위: ${data.water_level}m\n- 유량: ${data.discharge}㎥/s\n- 상황: ${data.status_message}`;
                        }
                    }
                } catch (e) { console.error('K-SKILL 한강 오류:', e); }
            }

            // (5) 한국 주식 검색
            if (userKwd.includes('주식') || userKwd.includes('증시') || userKwd.includes('종목') || userKwd.includes('가 가')) {
                const stockKwd = lastUserText.replace(/[^가-힣a-zA-Z]/g, '').replace('주식', '').replace('가격', '').trim() || '삼성전자';
                try {
                    const res = await fetch(`https://k-skill-proxy.nomadamas.org/v1/korean-stock/search?q=${encodeURIComponent(stockKwd)}`, { signal: AbortSignal.timeout(3000) });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.results?.length > 0) {
                            const s = data.results[0];
                            recentPostsText += `\n\n## ${s.itmsNm} 주식 현황 (K-SKILL/KRX)\n- 일자: ${s.basDd}\n- 종가: ${Number(s.clpr).toLocaleString()}원 (${s.fltRt}%)\n- 고가/저가: ${Number(s.hipr).toLocaleString()} / ${Number(s.lopr).toLocaleString()}\n- 거래량: ${Number(s.trqu).toLocaleString()}주`;
                        }
                    }
                } catch (e) { console.error('K-SKILL 주식 오류:', e); }
            }

            // (6) 스포츠 결과 — 네이버 스포츠 공식 API 직접 호출 (K-SKILL 프록시 비의존)
            if (userKwd.includes('리그') || userKwd.includes('야구') || userKwd.includes('축구') || userKwd.includes('kbo') || userKwd.includes('결과') || userKwd.includes('경기') || userKwd.includes('k리그')) {
                try {
                    const naverHeaders = { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.sports.naver.com/' };
                    // 어제/오늘 날짜 계산 (KST 기준)
                    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
                    const today = kstNow.toISOString().slice(0, 10).replace(/-/g, '');
                    const yesterday = new Date(kstNow - 86400000).toISOString().slice(0, 10).replace(/-/g, '');
                    // "어제" 키워드가 있으면 어제, 아니면 오늘 기준
                    const targetDate = userKwd.includes('어제') ? yesterday : today;
                    const targetLabel = userKwd.includes('어제') ? '어제' : '오늘';

                    // KBO + K리그 동시 병렬 조회
                    const [kboRes, kleagueRes] = await Promise.all([
                        fetch(`https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=kbaseball&categoryId=kbo&date=${targetDate.slice(0,4)}-${targetDate.slice(4,6)}-${targetDate.slice(6,8)}`, { headers: naverHeaders, signal: AbortSignal.timeout(3000) }).catch(() => null),
                        fetch(`https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=kfootball&categoryId=kleague&date=${targetDate.slice(0,4)}-${targetDate.slice(4,6)}-${targetDate.slice(6,8)}`, { headers: naverHeaders, signal: AbortSignal.timeout(3000) }).catch(() => null),
                    ]);

                    let sportsText = '';

                    // KBO 결과 처리
                    if (kboRes?.ok) {
                        const kboData = await kboRes.json();
                        const kboGames = kboData.result?.games || [];
                        if (kboGames.length > 0) {
                            const lines = kboGames.map(g => {
                                const home = g.homeTeam?.name || '?';
                                const away = g.awayTeam?.name || '?';
                                const hs = g.homeTeam?.score ?? '-';
                                const as = g.awayTeam?.score ?? '-';
                                const statusMap = { 'RESULT': '종료', 'BEFORE': '예정', 'STARTED': '진행중', 'POSTPONED': '연기', 'CANCEL': '취소' };
                                const status = statusMap[g.statusCode] || g.statusCode || '?';
                                const time = g.gameDateTime ? new Date(g.gameDateTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
                                return `- ${home} ${hs} : ${as} ${away} (${status}${status === '예정' && time ? ' ' + time : ''})`;
                            }).join('\n');
                            sportsText += `### KBO (${targetLabel} ${targetDate.slice(4,6)}/${targetDate.slice(6,8)})\n${lines}\n`;
                        }
                    }

                    // K리그 결과 처리
                    if (kleagueRes?.ok) {
                        const kleagueData = await kleagueRes.json();
                        const kleagueGames = kleagueData.result?.games || [];
                        if (kleagueGames.length > 0) {
                            const lines = kleagueGames.map(g => {
                                const home = g.homeTeam?.name || '?';
                                const away = g.awayTeam?.name || '?';
                                const hs = g.homeTeam?.score ?? '-';
                                const as = g.awayTeam?.score ?? '-';
                                const statusMap = { 'RESULT': '종료', 'BEFORE': '예정', 'STARTED': '진행중', 'POSTPONED': '연기' };
                                const status = statusMap[g.statusCode] || g.statusCode || '?';
                                return `- ${home} ${hs} : ${as} ${away} (${status})`;
                            }).join('\n');
                            sportsText += `### K리그 (${targetLabel} ${targetDate.slice(4,6)}/${targetDate.slice(6,8)})\n${lines}\n`;
                        }
                    }

                    if (sportsText) {
                        recentPostsText += `\n\n## 국내 스포츠 경기 현황 (네이버 스포츠 실시간)\n${sportsText}`;
                    } else {
                        recentPostsText += `\n\n## 스포츠 경기 안내\n${targetLabel}(${targetDate.slice(4,6)}/${targetDate.slice(6,8)}) 예정되거나 종료된 KBO/K리그 경기가 없습니다. 사용자에게 네이버 스포츠(https://sports.naver.com)에서 추가 정보를 확인해보라고 친절히 안내해 주세요. 거절하지 말고 알고 있는 일반 스포츠 지식으로도 답변해도 됩니다.`;
                    }
                } catch (e) {
                    console.error('네이버 스포츠 API 오류:', e);
                    recentPostsText += `\n\n## 스포츠 경기 안내\n스포츠 정보 조회에 일시적 오류가 발생했습니다. 네이버 스포츠(https://sports.naver.com)에서 직접 확인해 주세요. 거절하지 말고 알고 있는 일반 스포츠 지식으로도 답변해도 됩니다.`;
                }
            }
        }

        // 5. K-Law (법망 API) 연동
        if (userKwd.includes('법') || userKwd.includes('규정') || userKwd.includes('운임') || userKwd.includes('근로') || userKwd.includes('노동') || userKwd.includes('화물연대') || userKwd.includes('판례') || userKwd.includes('과태료') || userKwd.includes('벌금') || userKwd.includes('제재') || userKwd.includes('허가') || userKwd.includes('신고')) {
            const searchKwd = lastUserText.trim();
            try {
                const url = `https://api.beopmang.org/api/v4/law?action=search&q=${encodeURIComponent(searchKwd)}`;
                const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
                if (res.ok) {
                    const raw = await res.json();
                    // K-Law API v4 실제 응답 구조: { data: { total, results: [...] }, meta: {...} }
                    const results = raw?.data?.results || raw?.results || [];
                    if (results.length > 0) {
                        const lawQuotes = results.slice(0, 5).map(r => {
                            const name = r.law_name || r.title || '제목 없음';
                            const type = r.law_type || '';
                            const purpose = r.purpose || '';
                            const enforcement = r.enforcement_date ? `시행일: ${r.enforcement_date}` : '';
                            const articleCount = r.article_count ? `조문수: ${r.article_count}개` : '';
                            const caseCount = r.case_count ? `판례: ${r.case_count}건` : '';
                            return `### [출처: K-Law] ${name} (${type})\n${purpose.slice(0, 800)}\n${[enforcement, articleCount, caseCount].filter(Boolean).join(' | ')}`;
                        }).join('\n\n');
                        recentPostsText += `\n\n## 실시간 법령/규정 검색 결과 (K-Law MCP) — 총 ${raw?.data?.total || results.length}건\n` + lawQuotes;
                    }
                }
            } catch (e) {
                console.error('[/api/chat] K-Law 법망 API 오류:', e);
            }
        }
    } catch (e) {
        console.error('[/api/chat] DB 조회 오류:', e);
    }

    let safeFreightText = '';
    if (isSfQuery) {
        try {
            const safeDocs = getSfDocs();
            let injectedRules = `\n\n## 💡 [AI 사전 학습] 수출입 컨테이너 안전운임 핵심 요약\n`;
            injectedRules += `1. **운임 적용 원칙**: 모든 운임은 **'왕복 운임'** 적용을 원칙으로 합니다. (공컨테이너 반납 과정을 의무 사이클로 보기 때문)\n`;
            injectedRules += `2. **편도 운임의 예외적 적용**: 오직 **수도권 화주 공장(서울, 인천, 경기, 강원 일부지역)**에서 작업하며, 공컨테이너의 반납이나 수령 장소가 **의왕ICD**인 경우에 한해서만 특별히 '편도' 운임이 책정/적용됩니다.\n`;
            injectedRules += `3. **결론**: 따라서 **부산, 아산, 광양 등 수도권/의왕ICD 조건에 해당하지 않는 대부분의 내륙 운송 구간은 고시상 '편도' 항목이 존재하지 않으며, 무조건 '왕복' 기준으로만 고시 및 산정**됩니다. 만약 표에 편도 금액이 있다면 그것은 의왕ICD 연계 등 예외 조항에 해당하기 때문입니다.\n`;

            if (safeDocs?.[0]?.text) {
                const fullText = safeDocs[0].text;
                // 단순 앞부분이 아니라 '부대조항'이 시작되는 [별표 1] 지점을 찾아 그 이후를 주입 (계산 논리 집중)
                const logicIdx = fullText.indexOf('[별표 1]');
                const startIdx = logicIdx !== -1 ? logicIdx : 0;
                safeFreightText = injectedRules + `\n\n## 안전운임 고시 전문 (원문 참고용)\n${fullText.slice(startIdx, startIdx + 5000)}`;
            } else {
                safeFreightText = injectedRules;
            }
        } catch (e) { console.error('Docs RAG 에러:', e); }
    }

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
        return NextResponse.json({ error: 'Gemini API 연결에 실패했습니다.' }, { status: 502 });
    }

    if (!geminiRes.ok) {
        return NextResponse.json({ error: 'Gemini API 오류' }, { status: geminiRes.status });
    }

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
                            await writer.write(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                        }
                    } catch { }
                }
            }
        } catch (err) {
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
