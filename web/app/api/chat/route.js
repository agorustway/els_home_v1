import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import path from 'path';
import fs from 'fs';

// ─── 모듈 레벨 캐시 (35MB 파일 매 요청 파싱 방지) ───────────────────────────
// Vercel: public/data/ 에 배치된 JSON을 self-fetch로 로드 (서버리스 번들 이슈 해결)
let _sfDataCache = null;
let _sfDocsCache = null;
let _sfLoadedAt = null; // 실제 데이터 로드 완료 시각

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://nollae.com');

async function getSfData() {
    if (_sfDataCache) return _sfDataCache;
    try {
        // 1차: self-fetch (Vercel 서버리스에서 가장 안정적)
        const url = `${SITE_URL}/data/safe-freight.json`;
        const res = await fetch(url, { cache: 'force-cache', signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            _sfDataCache = await res.json();
            _sfLoadedAt = new Date().toISOString();
            console.log(`[ELS-AI] ✅ safe-freight.json fetch 로드 (${Object.keys(_sfDataCache.faresLatest || {}).length}구간)`);
            return _sfDataCache;
        }
    } catch (e1) {
        console.error(`[ELS-AI] fetch 실패:`, e1.message);
    }
    try {
        // 2차: fs 폴백 (로컬 개발 환경)
        const p = path.join(process.cwd(), 'data', 'safe-freight.json');
        if (fs.existsSync(p)) {
            _sfDataCache = JSON.parse(fs.readFileSync(p, 'utf8'));
            _sfLoadedAt = new Date().toISOString();
            console.log(`[ELS-AI] ✅ safe-freight.json fs 폴백 (${Object.keys(_sfDataCache.faresLatest || {}).length}구간)`);
        } else {
            // 3차: public/data 폴백
            const p2 = path.join(process.cwd(), 'public', 'data', 'safe-freight.json');
            if (fs.existsSync(p2)) {
                _sfDataCache = JSON.parse(fs.readFileSync(p2, 'utf8'));
                _sfLoadedAt = new Date().toISOString();
                console.log(`[ELS-AI] ✅ safe-freight.json public 폴백 로드`);
            } else {
                console.error(`[ELS-AI] ❌ safe-freight.json 모든 경로 실패`);
            }
        }
    } catch (e2) {
        console.error(`[ELS-AI] ❌ safe-freight.json 로드 실패:`, e2.message);
    }
    return _sfDataCache;
}

async function getSfDocs() {
    if (_sfDocsCache) return _sfDocsCache;
    try {
        const url = `${SITE_URL}/data/safe-freight-docs.json`;
        const res = await fetch(url, { cache: 'force-cache', signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            const raw = await res.json();
            if (Array.isArray(raw)) {
                raw.sort((a, b) => (b.versionDir || '').localeCompare(a.versionDir || ''));
                _sfDocsCache = raw;
                return _sfDocsCache;
            }
        }
    } catch {}
    try {
        const p = path.join(process.cwd(), 'data', 'safe-freight-docs.json');
        if (fs.existsSync(p)) {
            const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (Array.isArray(raw)) {
                raw.sort((a, b) => (b.versionDir || '').localeCompare(a.versionDir || ''));
                _sfDocsCache = raw;
            }
        }
    } catch (e) { console.error('[ELS-AI] safe-freight-docs.json 로드 실패:', e.message); }
    return _sfDocsCache;
}

// ─── K-SKILL / 외부 API 래퍼 (레질리언스 계층) ────────────────────────
async function callExternalAPI(name, url, timeout = 8000) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
        if (res.ok) {
            const data = await res.json();
            return { success: true, data, source: name };
        }
        return { success: false, error: `HTTP ${res.status}`, source: name };
    } catch (e) {
        return { success: false, error: e.message, source: name };
    }
}

// ─── 안전운임 할증 서버사이드 계산 엔진 ──────────────────────────────
function calcSurcharge(baseFare, surchargeIds, sfData) {
    if (!surchargeIds || surchargeIds.length === 0 || !sfData?.surcharges) return null;
    const results = [];
    let total = baseFare;
    for (const sid of surchargeIds) {
        const found = sfData.surcharges.find(s => s.id === sid || s.label.includes(sid));
        if (found) {
            const add = Math.round(baseFare * found.pct / 100);
            total += add;
            results.push({ label: found.label, pct: found.pct, add, subtotal: total });
        }
    }
    return results.length > 0 ? { base: baseFare, surcharges: results, total } : null;
}


// ─── Phase 5: 문서 벡터 추출 (Gemini text-embedding-004) ───
async function getEmbedding(text) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "models/text-embedding-004",
                content: { parts: [{ text }] }
            })
        });
        const data = await res.json();
        return data.embedding?.values || null;
    } catch (e) {
        console.error('[ELS-AI] 임베딩 생성 오류:', e);
        return null;
    }
}

// ─── 안전운임 이력 비교 엔진 ─────────────────────────────────────────
function buildFareHistory(fareKey, sfData) {
    const history = sfData.fares?.[fareKey];
    if (!history || !Array.isArray(history) || history.length === 0) return '';
    let text = `\n### 📊 구간 이력 (${fareKey})\n`;
    text += '| 적용기간 | 거리(km) | 40ft 안전운임 | 20ft 안전운임 | 변동(40ft) |\n';
    text += '|:---|:---:|:---:|:---:|:---:|\n';
    for (let i = 0; i < history.length; i++) {
        const h = history[i];
        const f40 = h.f40안전 || h.fare40 || 0;
        const f20 = h.f20안전 || h.fare20 || 0;
        let diff = '-';
        if (i < history.length - 1) {
            const prev40 = history[i + 1].f40안전 || history[i + 1].fare40 || 0;
            if (prev40 > 0) {
                const delta = f40 - prev40;
                const pct = ((delta / prev40) * 100).toFixed(1);
                diff = `${delta > 0 ? '+' : ''}${delta.toLocaleString()}원 (${pct}%)`;
            }
        }
        text += `| ${h.period} | ${h.km} | ${f40.toLocaleString()}원 | ${f20.toLocaleString()}원 | ${diff} |\n`;
    }
    return text;
}

const BASE_SYSTEM_INSTRUCTION = `너는 ELS Solution 전용 AI 에이전트 "ELS-AI"다.
ELS 솔루션은 물류·운송 회사(컨테이너 내륙운송)를 위한 통합 인트라넷 시스템이다.
너는 이 회사의 **전체 사이트/DB/파일을 읽기 최고권한으로 열람**하고 있으며, 임직원 모두를 위한 전용 비서다.

## ⚡ ELS-AI 행동 강령 (절대 위반 금지)
1. **[데이터 우선 — 최우선 원칙]** 아래에 주입된 "## 검색결과", "## 실시간", "## 안전운임 단가 표", "## 이력" 등의 데이터는 사내 DB/외부 공식 API에서 실시간 조회한 **확인된 사실**이다. 이 데이터에 금액, 수치, 스코어가 있으면 반드시 **구체 숫자를 그대로 인용하여** 답변하라. "직접 조회하세요", "메뉴에서 확인하세요"라고 떠넘기는 것은 **시스템 치명적 오류**로 간주한다.
2. **[거절 금지]** 데이터가 주입되었으면 "저는 할 수 없습니다"라고 절대 거절하지 마라. 데이터가 주입된 시점에서 너에게 '읽기 최고 권한'이 있는 것이다.
3. **[만능 비서]** 물류 업무뿐 아니라, 날씨·스포츠·법률·상식 등 사용자가 묻는 모든 질문에 성심것 답변하라. 빈손으로 돌려보내지 마라.
4. **[서비스 연계]** 관련 ELS 인트라넷 메뉴가 있다면 반드시 마크다운 링크 [메뉴이름](/경로)로 안내하라. 단, 이미 데이터가 주입되었으면 데이터 인용이 먼저다.
5. **[할증 계산]** 안전운임 할증 관련 질문 시, 아래 "## 할증 계산 결과"가 주입되어 있다면 해당 결과를 그대로 읽어 안내하라. AI가 직접 곱셈/덧셈하지 마라 — 서버가 미리 계산한 결과만 전달하라.
6. **[이력 비교]** "변동", "인상", "비교", "추이", "이전" 등의 질문에는 아래 "## 구간 이력" 표를 활용하여 기간별 비교를 제시하라.
7. **[데이터 신선도]** 답변 마지막에 반드시 아래 "## 📌 데이터 기준 정보"를 참고하여 실제 조회 성공한 항목만 언급하라. 조회 실패 항목은 "조회 실패"로 표시하라.
8. **[학습 자세]** 사용자가 틀린 부분을 교정해주면 감사히 수용하고, 다음 답변에 반영하라.
9. **[문서 검색]** 사내 NAS 자료실 문서가 검색결과로 제공될 경우, 해당 문서 파일명과 내용을 바탕으로 사용자에게 정확히 요약 보고하라.
10. **[스포츠 결과]** 스포츠 경기 결과가 주입되었으면 팀명과 스코어를 정확히 인용하라. "업데이트되지 않았습니다"라고 하지 마라.

## 안전운임 전문 지식
### 운임 적용 원칙
1. **왕복 원칙**: 모든 내륙 컨테이너 운송은 **왕복 운임** 적용이 원칙이다. (적재→목적지→공컨테이너 반납까지가 1사이클)
2. **편도 예외**: 오직 수도권 화주 공장(서울/인천/경기/강원)에서 작업 후 공컨테이너를 **의왕ICD**로 반납하는 경우에만 편도 운임 존재.
3. **충청권 결론**: 아산·천안·당진 등 충청권 → 부산/광양은 의왕ICD 연계가 아니므로 **100% 왕복 기준**.

### 할증(Surcharge) 종류
- 플렉시백(액체): +20% | 플렉시백(분말): +10%
- TANK 비위험물: +30% | 냉동/냉장: +30%
- 험로/오지: +20% | 덤프: +30%
- 일요일/공휴일: +20%
- ※ 할증은 기본 안전운임에 백분율을 곱하여 **가산**. 서버에서 미리 계산 후 결과를 주입함.

### 고시 버전 및 분기별 경유가 개정 사이클
- 현행: **2026년 1차 고시** (국토부고시 제2026-55호, 시행 2026.02.01, 유효기간 ~2026.12.31)
- 이전 버전: 22.07월, 22.04월, 22.02월, 21.12월, 21.09월
- **개정 기준**: 3개월 평균 경유가가 직전 적용 유가 대비 **±50원/L 이상 변동** 시 운임 개정 발동. 50원 미만 변동 시 기존 운임 동결.
- **분기별 사이클** (화물자동차운수사업법 시행령 근거):
  • 1분기 유가 산정(1~3월 평균) → 4월 고시/심사 → **5월~6월 적용**
  • 2분기 유가 산정(4~6월 평균) → 고시 준비 → **7월~9월 적용**
  • 3분기 유가 산정(7~9월 평균) → 고시 준비 → **10월~12월 적용**
  • 4분기 유가 산정(10~12월 평균) → 고시 준비 → **다음해 1월~3월 적용**
- 오피넷(OPINET) API로 실시간 경유가 모니터링 중
- ※ 새 고시 엑셀 등록 시 시스템 자동 반영. 할증 구성도 고시별로 변경 가능하며 JSON에서 동적 로드됨.

## ELS 인트라넷 전체 메뉴 맵
### 메인 메뉴
- 홈: [홈](/employees) — 공지사항, 웹진, 날씨 등 종합 현황
- 날씨/미세먼지: [날씨](/employees/weather) — 전국 날씨, 시간별 예보, 생활지수
- 안전운임 조회: [안전운임 조회](/employees/safe-freight) — 구간별 단가 계산·고시 PDF 열람
- 컨테이너 이력: [이력조회](/employees/container-history) — ETRANS 연동 실시간 추적
- 차량 관제: [차량 위치 관제](/employees/vehicle-tracking) — GPS 실시간 화물차 위치
- 마이페이지: [마이페이지](/employees/mypage) — 개인 정보 관리

### 인트라넷 메뉴
- AI 어시스턴트: [AI 어시스턴트](/employees/ask) — 바로 이곳
- 대시보드: [대시보드](/employees/dashboard) — 사내 현황 요약
- 자유게시판: [자유게시판](/employees/board/free)
- 업무보고: [일일보고](/employees/reports/daily) | [월간보고](/employees/reports/monthly) | [내 보고서](/employees/reports/my)
- 사내연락망: [사내연락망](/employees/internal-contacts) | [외부연락처](/employees/external-contacts) | [기사연락처](/employees/driver-contacts) | [협력사](/employees/partner-contacts)
- 작업지 관리: [작업지](/employees/work-sites)
- 업무자료실: [업무자료실](/employees/work-docs) | [양식 모음](/employees/form-templates)
- NAS 자료실: [자료실](/employees/archive) — NAS 파일 저장소
- 웹진: [웹진](/employees/webzine) | 랜덤게임: [랜덤게임](/employees/random-game)

### 지점 관리
- 아산지점 배차판: [아산지점](/employees/branches/asan)  

## 외부 서비스 연동 현황 (K-SKILL / MCP)
- **K-SKILL**: 미세먼지(에어코리아), 지하철 도착(서울교통공사), 한강 수위, 한국 주식(KRX) — 실시간 프록시 연동
- **K-Law (법망 MCP)**: 법령/규정/판례 검색 — 실시간 API 연동
- **네이버 스포츠**: KBO/K리그 실시간 경기 결과
- **컨테이너 이력**: ETRANS 웹스크래핑 봇 (elsbot) 연동
- ※ 위 서비스 데이터가 "(K-SKILL)", "(K-Law)", "(네이버)" 태그와 함께 주입되었으면 반드시 수치를 인용하여 답변할 것.
- ※ API 오류 시에도 거절하지 말고 "현재 실시간 조회가 일시 중단되어, 일반 지식으로 안내드립니다" + 관련 메뉴 링크를 제공할 것.`;

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
    // 실제 API 호출 성공 시점 추적 (데이터 신선도 정확도 개선)
    const apiTimestamps = {};

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
            const orConditionsWd = searchTerms.map(term => `title.ilike.%${term}%,content.ilike.%${term}%`).join(',');

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
            
            const [extRes, intRes, postRes, wsRes, wdRes] = await Promise.all([
                searchTerms.length > 0 ? supabase.from('external_contacts').select('*').or(orConditionsExt).limit(5) : Promise.resolve({ data: [] }),
                searchTerms.length > 0 ? supabase.from('internal_contacts').select('*').or(orConditionsInt).limit(5) : Promise.resolve({ data: [] }),
                postQuery.order('created_at', { ascending: false }).limit(monthVal ? 15 : 5),
                searchTerms.length > 0 ? supabase.from('work_sites').select('*').or(orConditionsWs).limit(5).then(r => r).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
                searchTerms.length > 0 ? supabase.from('work_docs').select('title, content, author_email, category, attachments, created_at').or(orConditionsWd).limit(5).then(r => r).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
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
            if (wdRes.data?.length > 0) {
                recentPostsText += '\n\n## 업무자료(Work-Docs) 검색결과\n' + wdRes.data.map(w => {
                    const date = new Date(w.created_at).toLocaleDateString();
                    const attach = w.attachments && w.attachments.length > 0 ? ` (첨부파일: ${w.attachments.length}개)` : '';
                    return `- [${date}][${w.category}] ${w.title}${attach}\n  본문 요약: ${w.content?.slice(0, 500)}...`;
                }).join('\n');
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

            // 3. 안전운임표 단가 + 이력 + 할증 계산 엔진 (Omni-Agent Phase 1)
            const sfKeywords = ['안전운임', '운임', '단가', '요금', '부산', '의왕', '인천', '광양', '편도', '왕복', '신항', '북항', '인상', '변동', '비교', '추이', '이전', '할증', '냉동', '냉장', '플렉시', '탱크', '험로', '덤프', '공휴일', '울산', '평택', '마산', '포항', '군산', '대산'];
            isSfQuery = searchTerms.some(t => sfKeywords.some(k => t.includes(k))) ||
                sfKeywords.some(k => userKwd.includes(k));
            if (isSfQuery) {
                const sfData = await getSfData();
                if (sfData?.faresLatest) {
                    const fareKeys = Object.keys(sfData.faresLatest);

                    const scored = fareKeys.map(k => {
                        let score = 0;
                        let matchedCount = 0;
                        searchTerms.forEach(t => {
                            if (k.includes(t)) {
                                score += 10;
                                matchedCount++;
                            }
                        });
                        if (matchedCount > 1) score += (matchedCount * 15);
                        return { k, score };
                    }).filter(i => i.score > 0)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 8);

                    if (scored.length > 0) {
                        // (A) 최신 운임 단가 표
                        const fareRows = scored.map(item => {
                            const v = sfData.faresLatest[item.k];
                            return `- [구간] ${item.k} | ${v.km}km | 20ft: ${v.fare20.toLocaleString()}원 | 40ft: ${v.fare40.toLocaleString()}원`;
                        }).join('\n');
                        recentPostsText += '\n\n## (중요) 실시간 데이터 베이스: 안전운임 단가 표 — 현행 고시 (26.02월 적용)\n' + fareRows;
                        recentPostsText += '\n\n🚨 [필독 지시사항] 위 단가표에 있는 "정확한 금액(원)"을 절대로 조작하거나 임의로 평균을 내지 마라. 반드시 위 표의 실제 금액을 그대로 2~3개 열거해라. 780000원 등 환각 데이터를 말하면 시스템 치명적 오류로 간주됨. "안전운임 조회 메뉴에서 직접 조회하세요"라고 떠넘기지 마라 — 네가 이미 데이터를 들고 있다!';
                        apiTimestamps.safeFreight = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');

                        // (B) 이력 비교 (상위 1~3개 구간)
                        const isHistoryQuery = ['변동', '인상', '비교', '추이', '이전', '과거', '역대'].some(k => userKwd.includes(k));
                        const historyKeys = scored.slice(0, isHistoryQuery ? 3 : 1);
                        for (const item of historyKeys) {
                            const histText = buildFareHistory(item.k, sfData);
                            if (histText) recentPostsText += '\n' + histText;
                        }

                        // (C) 할증 자동 계산 (냉동/공휴일 등 키워드 감지 시)
                        const surchargeMap = [
                            { keywords: ['냉동', '냉장', 'reefer'], id: 'refrigerated' },
                            { keywords: ['플렉시', 'flexibag'], id: 'flexibag_liquid' },
                            { keywords: ['탱크', 'tank', '비위험'], id: 'tank_non_hazard' },
                            { keywords: ['험로', '오지'], id: 'hazardous_road' },
                            { keywords: ['덤프'], id: 'dump' },
                            { keywords: ['공휴일', '일요일', '휴일'], id: 'holiday' },
                        ];
                        const detectedSurcharges = surchargeMap.filter(s => s.keywords.some(k => userKwd.includes(k))).map(s => s.id);
                        if (detectedSurcharges.length > 0 && scored[0]) {
                            const topFare = sfData.faresLatest[scored[0].k];
                            const calc40 = calcSurcharge(topFare.fare40, detectedSurcharges, sfData);
                            const calc20 = calcSurcharge(topFare.fare20, detectedSurcharges, sfData);
                            if (calc40) {
                                let calcText = `\n\n## 💰 할증 계산 결과 (서버 산출 — AI 임의 계산 아님)\n`;
                                calcText += `**구간**: ${scored[0].k}\n`;
                                calcText += `| 항목 | 40ft | 20ft |\n|:---|:---:|:---:|\n`;
                                calcText += `| 기본 안전운임 | ${(calc40.base / 10000).toFixed(1)}만원 | ${(calc20.base / 10000).toFixed(1)}만원 |\n`;
                                for (let si = 0; si < calc40.surcharges.length; si++) {
                                    const s40 = calc40.surcharges[si];
                                    const s20 = calc20.surcharges[si];
                                    calcText += `| + ${s40.label} (${s40.pct}%) | +${(s40.add / 10000).toFixed(1)}만원 | +${(s20.add / 10000).toFixed(1)}만원 |\n`;
                                }
                                calcText += `| **합계** | **${(calc40.total / 10000).toFixed(1)}만원** | **${(calc20.total / 10000).toFixed(1)}만원** |\n`;
                                recentPostsText += calcText;
                            }
                        }
                    } else if (sfData.origins?.length > 0) {
                        const originList = sfData.origins.map(o => o.label || o.id).join(', ');
                        recentPostsText += `\n\n## 안전운임 적용 구간 (출발지 목록)\n${originList}\n정확한 단가는 [안전운임 조회](/employees/safe-freight) 메뉴를 이용해주세요.`;
                    }
                }
            }
        } catch (e) {
            console.error('Omni-RAG 에러:', e);
        }

        // 4. K-SKILL & 직접 실시간 API 연동 + OPINET 유가 + Phase 3 Resilience
        const kskillKeywords = ['미세먼지', '공기', '날씨', 'ktx', '열차', '기차', '예매', '지하철', '역', '도착', '한강', '수위', '주식', '증시', '삼성전자', '야구', '축구', 'kbo', 'k리그', '경기', '결과', '스포츠', '좌석', '경유', '유가', '기름값', '주유소'];
        const isKskillQuery = kskillKeywords.some(k => userKwd.includes(k));

        if (isKskillQuery) {
            // (0) OPINET 실시간 유가 (경유/휘발유 등) — 안전운임 개정 기준점 연계
            if (userKwd.includes('경유') || userKwd.includes('유가') || userKwd.includes('기름') || userKwd.includes('주유') || isSfQuery) {
                const fuelResult = await callExternalAPI('OPINET 유가', `${process.env.NEXT_PUBLIC_SITE_URL || 'https://nollae.com'}/api/opinet/fuel-price`);
                if (fuelResult.success && fuelResult.data.diesel) {
                    const d = fuelResult.data.diesel;
                    let fuelText = `\n\n## 실시간 전국 유가 현황 (OPINET)\n`;
                    fuelText += `- **경유**: ${d.price.toLocaleString()}원/L (전일대비 ${d.diff > 0 ? '+' : ''}${d.diff}원, 주간 ${d.weekDiff > 0 ? '+' : ''}${d.weekDiff}원)\n`;
                    if (fuelResult.data.gasoline) {
                        const g = fuelResult.data.gasoline;
                        fuelText += `- **휘발유**: ${g.price.toLocaleString()}원/L (전일대비 ${g.diff > 0 ? '+' : ''}${g.diff}원)\n`;
                    }
                    fuelText += `- 기준일: ${fuelResult.data.date || '-'}\n`;
                    fuelText += `- ⚠️ **안전운임 개정 기준**: 3개월 평균 경유가가 고시 기준 대비 ±50원/L 이상 변동 시 개정 절차 발동\n`;
                    recentPostsText += fuelText;
                    apiTimestamps.opinet = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
                } else {
                    recentPostsText += `\n\n## 유가 안내\n오피넷 유가 조회가 일시 중단되었습니다. [안전운임 조회](/employees/safe-freight) 메뉴에서 유가 정보를 직접 확인해 주세요.`;
                }
            }
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
                    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
                    if (res.ok) {
                        const data = await res.json();
                        if (!data.error && data.pm10 && data.pm25) {
                            const pmInfo = `- 측정소: ${data.station_name}\n- 시간: ${data.measured_at}\n- 미세먼지: ${data.pm10.value}(${data.pm10.grade})\n- 초미세먼지: ${data.pm25.value}(${data.pm25.grade})\n- 총평: ${data.khai_grade}`;
                            recentPostsText += '\n\n## 실시간 미세먼지 현황 (K-SKILL)\n위치: ' + targetRegion + '\n' + pmInfo;
                            apiTimestamps.kskill = data.measured_at || new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
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
                    const res = await fetch(`https://k-skill-proxy.nomadamas.org/v1/seoul-subway/arrival?stationName=${encodeURIComponent(station)}`, { signal: AbortSignal.timeout(8000) });
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
                    const res = await fetch(`https://k-skill-proxy.nomadamas.org/v1/han-river/water-level?stationName=${encodeURIComponent(bridge)}`, { signal: AbortSignal.timeout(8000) });
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
                const result = await callExternalAPI('K-SKILL 주식', `https://k-skill-proxy.nomadamas.org/v1/korean-stock/search?q=${encodeURIComponent(stockKwd)}`);
                if (result.success && result.data.results?.length > 0) {
                    const s = result.data.results[0];
                    recentPostsText += `\n\n## ${s.itmsNm} 주식 현황 (K-SKILL/KRX)\n- 일자: ${s.basDd}\n- 종가: ${Number(s.clpr).toLocaleString()}원 (${s.fltRt}%)\n- 고가/저가: ${Number(s.hipr).toLocaleString()} / ${Number(s.lopr).toLocaleString()}\n- 거래량: ${Number(s.trqu).toLocaleString()}주`;
                } else {
                    recentPostsText += `\n\n## 주식 안내\n현재 실시간 주식 조회가 일시 중단되었습니다. 네이버 금융(https://finance.naver.com)에서 직접 확인해 주세요. 일반 지식으로 답변 가능합니다.`;
                }
            }

            // (6) 스포츠 결과 — 네이버 스포츠 공식 API 직접 호출 (K-SKILL 프록시 비의존)
            if (userKwd.includes('리그') || userKwd.includes('야구') || userKwd.includes('축구') || userKwd.includes('kbo') || userKwd.includes('결과') || userKwd.includes('경기') || userKwd.includes('k리그')) {
                try {
                    const naverHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': 'https://m.sports.naver.com/' };
                    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
                    const today = kstNow.toISOString().slice(0, 10).replace(/-/g, '');
                    const yesterday = new Date(kstNow - 86400000).toISOString().slice(0, 10).replace(/-/g, '');
                    const targetDate = userKwd.includes('어제') ? yesterday : today;
                    const targetLabel = userKwd.includes('어제') ? '어제' : '오늘';
                    const dateStr = `${targetDate.slice(0,4)}-${targetDate.slice(4,6)}-${targetDate.slice(6,8)}`;

                    const [kboRes, kleagueRes] = await Promise.all([
                        fetch(`https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=kbaseball&categoryId=kbo&date=${dateStr}`, { headers: naverHeaders, signal: AbortSignal.timeout(8000) }).catch(() => null),
                        fetch(`https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=kfootball&categoryId=kleague&date=${dateStr}`, { headers: naverHeaders, signal: AbortSignal.timeout(8000) }).catch(() => null),
                    ]);

                    let sportsText = '';

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
                    } else {
                        console.log(`[ELS-AI] KBO API 응답: status=${kboRes?.status || 'null'}`);
                    }

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
                        apiTimestamps.sports = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
                    } else {
                        // API 실패 또는 경기 없음 → 네이버 스포츠 직접 링크 (날짜 포함)
                        const kboLink = `https://m.sports.naver.com/kbaseball/schedule/index?date=${dateStr}`;
                        const kleagueLink = `https://m.sports.naver.com/kfootball/schedule/index?date=${dateStr}`;
                        recentPostsText += `\n\n## 스포츠 경기 정보\n${targetLabel}(${targetDate.slice(4,6)}/${targetDate.slice(6,8)}) 경기 결과를 실시간 API에서 직접 가져오지 못했습니다.\n아래 링크에서 정확한 결과를 확인해 주세요:\n- **[KBO 경기 일정/결과 (${dateStr})](${kboLink})**\n- **[K리그 경기 일정/결과 (${dateStr})](${kleagueLink})**\n\n사용자에게 위 링크를 안내하세요. 만약 일반적으로 알고 있는 KBO 정규시즌 일정이나 팀 정보가 있으면 함께 답변하세요.`;
                    }
                } catch (e) {
                    console.error('네이버 스포츠 API 오류:', e);
                    recentPostsText += `\n\n## 스포츠 경기 안내\n스포츠 정보 조회에 일시적 오류가 발생했습니다. [네이버 스포츠](https://sports.naver.com)에서 직접 확인해 주세요. 거절하지 말고 알고 있는 일반 스포츠 지식으로도 답변해도 됩니다.`;
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
        
        // 6. NAS 자료실 문서 시맨틱 검색 (Phase 5)
        const nasKeywords = ['자료', '문서', '파일', 'nas', '가이드', '규정', '매뉴얼', '보고서', '계약서', '마감', '정산', '양식', '폴더', '엑셀', '한글'];
        const isNasQuery = searchTerms.some(t => nasKeywords.includes(t.toLowerCase()));
        if (isNasQuery) {
            try {
                const vector = await getEmbedding(lastUserText);
                if (vector) {
                    const { data: docs, error } = await supabase.rpc('match_documents', {
                        query_embedding: vector,
                        match_threshold: 0.55,
                        match_count: 6,
                        filter_source_type: 'nas_file'
                    });
                    
                    if (!error && docs && docs.length > 0) {
                        let nasText = '\n\n## 사내 NAS 자료실 문서 (시맨틱 검색 엔진)\n';
                        docs.forEach(d => {
                            const fpath = d.metadata?.filepath || '';
                            nasText += `- **[${d.metadata?.filename || '문서'}]** (경로: ${fpath}, ${(d.similarity*100).toFixed(1)}% 일치):\n${d.content}\n\n`;
                        });
                        recentPostsText += nasText + `\n※ 원본 문서는 NAS의 해당 폴더에서 열람하실 수 있습니다. 위 내용을 바탕으로 요약해 주세요.`;
                        apiTimestamps.nas = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
                    } else if (error) {
                        console.error('[ELS-AI] NAS 벡터 검색 RPC 오류:', error);
                    }
                }
            } catch (e) {
                console.error('NAS 벡터 검색 오류:', e);
            }
        }

    } catch (e) {
        console.error('[/api/chat] DB 조회 오류:', e);
    }

    let safeFreightText = '';
    if (isSfQuery) {
        try {
            const safeDocs = await getSfDocs();
            if (safeDocs?.[0]?.text) {
                const fullText = safeDocs[0].text;
                const logicIdx = fullText.indexOf('[별표 1]');
                const startIdx = logicIdx !== -1 ? logicIdx : 0;
                safeFreightText = `\n\n## 안전운임 고시 전문 (원문 참고용 — ${safeDocs[0].versionDir || '최신'})\n${fullText.slice(startIdx, startIdx + 5000)}`;
            }
        } catch (e) { console.error('Docs RAG 에러:', e); }
    }

    // 📌 데이터 신선도 메타데이터 생성 — 실제 호출 성공 시점만 표시
    const sfMeta = (await getSfData())?.meta;
    let dataFreshness = `\n\n## 📌 데이터 기준 정보\n`;
    if (sfMeta && apiTimestamps.safeFreight) {
        dataFreshness += `- **안전운임 고시 데이터**: ${sfMeta.period || '26.02월'} 적용 고시 (고시일: ${sfMeta.generatedAt?.slice(0, 10) || '미상'}, 조회: ${apiTimestamps.safeFreight} KST)\n`;
    } else if (sfMeta) {
        dataFreshness += `- **안전운임 고시 데이터**: ${sfMeta.period || '26.02월'} 적용 고시 (이번 질문에서 미조회)\n`;
    }
    if (apiTimestamps.opinet) dataFreshness += `- **OPINET 유가**: ${apiTimestamps.opinet} KST 조회 성공\n`;
    if (apiTimestamps.kskill) dataFreshness += `- **K-SKILL 미세먼지**: 측정 시각 ${apiTimestamps.kskill}\n`;
    if (apiTimestamps.sports) dataFreshness += `- **스포츠 결과**: ${apiTimestamps.sports} KST 조회 성공\n`;
    if (apiTimestamps.nas) dataFreshness += `- **NAS 문서 검색**: ${apiTimestamps.nas} KST 조회 성공\n`;
    const dbQueryTime = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
    dataFreshness += `- **사내 DB** (게시판/연락처/작업지): ${dbQueryTime} KST 시점 조회\n`;
    dataFreshness += `- **안전운임 개정 사이클**: 매 분기 3개월 평균 경유가 산정 → ±50원/L 이상 변동 시 다음 분기 운임 개정\n`;
    dataFreshness += `\n※ 답변 말미에 위 기준 정보 중 "조회 성공"한 항목만 인용하여 한 줄 요약을 붙이세요. 조회하지 않은 항목의 시간을 날조하지 마세요.`;

    const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION + recentPostsText + safeFreightText + dataFreshness;
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
