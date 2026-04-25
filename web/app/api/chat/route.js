import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import path from 'path';
import fs from 'fs';

// ─── 모듈 레벨 캐시 (35MB 파일 매 요청 파싱 방지) ───────────────────────────
// Vercel: public/data/ 에 배치된 JSON을 self-fetch로 로드 (서버리스 번들 이슈 해결)
let _sfDataCache = null;
let _sfDocsCache = null;
let _sfLoadedAt = null; // 실제 데이터 로드 완료 시각

// SITE_URL은 환경변수가 없으면 VERCEL_URL이나 nollae.com을 폴백으로 사용
const DEFAULT_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://nollae.com');

async function getSfData() {
    if (_sfDataCache) return _sfDataCache;

    // 방법 1: Webpack require 번들링 (빌드 타임 포함)
    try {
        _sfDataCache = require('@/public/data/safe-freight.json');
        _sfLoadedAt = new Date().toISOString();
        console.log(`[ELS-AI] ✅ safe-freight.json Webpack 번들 로드 성공 (${Object.keys(_sfDataCache.faresLatest || {}).length}구간)`);
        return _sfDataCache;
    } catch (e) {
        console.error(`[ELS-AI] ⚠️ safe-freight.json Webpack 번들 로드 실패:`, e.message);
    }

    // 방법 2: 파일시스템 직접 읽기 (standalone 빌드 폴백)
    try {
        const possiblePaths = [
            path.join(process.cwd(), 'public', 'data', 'safe-freight.json'),
            path.join(process.cwd(), '..', 'public', 'data', 'safe-freight.json'),
            path.join(__dirname, '..', '..', '..', '..', 'public', 'data', 'safe-freight.json'),
        ];
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                const raw = fs.readFileSync(p, 'utf-8');
                _sfDataCache = JSON.parse(raw);
                _sfLoadedAt = new Date().toISOString();
                console.log(`[ELS-AI] ✅ safe-freight.json 파일시스템 폴백 성공: ${p} (${Object.keys(_sfDataCache.faresLatest || {}).length}구간)`);
                return _sfDataCache;
            }
        }
        console.error(`[ELS-AI] ⚠️ safe-freight.json 파일시스템 경로 탐색 실패`);
    } catch (e2) {
        console.error(`[ELS-AI] ⚠️ safe-freight.json 파일시스템 폴백 실패:`, e2.message);
    }

    // 방법 3: self-fetch (네트워크 기반 최후 수단)
    try {
        const fetchUrl = `${SITE_URL}/data/safe-freight.json`;
        console.log(`[ELS-AI] 🔄 self-fetch 시도: ${fetchUrl}`);
        const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(15000) });
        if (res.ok) {
            _sfDataCache = await res.json();
            _sfLoadedAt = new Date().toISOString();
            console.log(`[ELS-AI] ✅ safe-freight.json self-fetch 성공 (${Object.keys(_sfDataCache.faresLatest || {}).length}구간)`);
            return _sfDataCache;
        }
        console.error(`[ELS-AI] ❌ self-fetch HTTP ${res.status}`);
    } catch (e3) {
        console.error(`[ELS-AI] ❌ safe-freight.json 모든 로드 방법 실패:`, e3.message);
    }

    return _sfDataCache;
}

async function getSfDocs() {
    if (_sfDocsCache) return _sfDocsCache;

    // 방법 1: Webpack require
    try {
        const raw = require('@/public/data/safe-freight-docs.json');
        if (Array.isArray(raw)) {
            raw.sort((a, b) => (b.versionDir || '').localeCompare(a.versionDir || ''));
            _sfDocsCache = raw;
            console.log(`[ELS-AI] ✅ safe-freight-docs.json Webpack 번들 로드 성공`);
            return _sfDocsCache;
        }
    } catch (e) {
        console.error(`[ELS-AI] ⚠️ safe-freight-docs.json Webpack 번들 로드 실패:`, e.message);
    }

    // 방법 2: 파일시스템 폴백
    try {
        const possiblePaths = [
            path.join(process.cwd(), 'public', 'data', 'safe-freight-docs.json'),
            path.join(process.cwd(), '..', 'public', 'data', 'safe-freight-docs.json'),
        ];
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
                if (Array.isArray(raw)) {
                    raw.sort((a, b) => (b.versionDir || '').localeCompare(a.versionDir || ''));
                    _sfDocsCache = raw;
                    console.log(`[ELS-AI] ✅ safe-freight-docs.json 파일시스템 폴백 성공: ${p}`);
                    return _sfDocsCache;
                }
            }
        }
    } catch (e2) {
        console.error(`[ELS-AI] ⚠️ safe-freight-docs.json 파일시스템 폴백 실패:`, e2.message);
    }

    // 방법 3: self-fetch 폴백
    try {
        const res = await fetch(`${SITE_URL}/data/safe-freight-docs.json`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
            const raw = await res.json();
            if (Array.isArray(raw)) {
                raw.sort((a, b) => (b.versionDir || '').localeCompare(a.versionDir || ''));
                _sfDocsCache = raw;
                console.log(`[ELS-AI] ✅ safe-freight-docs.json self-fetch 성공`);
                return _sfDocsCache;
            }
        }
    } catch (e3) {
        console.error(`[ELS-AI] ❌ safe-freight-docs.json 모든 로드 방법 실패:`, e3.message);
    }

    return _sfDocsCache;
}



// ─── K-SKILL / 외부 API 래퍼 (레질리언스 계층) ────────────────────────
async function callExternalAPI(name, url, timeout = 8000) {
    try {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(timeout),
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 AppleWebKit/537.36ELS/1.0)' }
        });
        if (res.ok) {
            const data = await res.json();
            return { success: true, data, source: name };
        }
        return { success: false, error: `HTTP ${res.status}`, source: name };
    } catch (e) {
        return { success: false, error: e.message, source: name };
    }
}

// ─── 안전운임 할증 서버사이드 계산 엔진 (고시 제22조/제23조 반영) ───────────
function round10(val) { return Math.round(val / 10) * 10; }

function calcSurcharge(baseFare, surchargeIds, sfData) {
    if (!surchargeIds || surchargeIds.length === 0 || !sfData?.surcharges) return null;
    
    const pctItems = [];
    const fixedItems = [];
    
    for (const sid of surchargeIds) {
        const found = sfData.surcharges.find(s => s.id === sid || s.label.includes(sid));
        if (found) {
            if (found.fixed) fixedItems.push(found);
            else if (found.pct) pctItems.push(found);
        }
    }

    // 할증률 계산 (최고 1개 100%, 나머지 2개 50% - 고시 제22조)
    pctItems.sort((a, b) => b.pct - a.pct);
    const appliedPct = pctItems.slice(0, 3).map((item, i) => ({
        ...item,
        effectivePct: i === 0 ? item.pct : item.pct * 0.5
    }));

    const results = [];
    let total = baseFare;

    // 1. 비율 할증 적용 및 10원 단위 반올림
    for (const item of appliedPct) {
        const add = round10(baseFare * (item.effectivePct / 100));
        total += add;
        results.push({ 
            label: item.label + (item.effectivePct !== item.pct ? ' (50% 적용)' : ''), 
            pct: item.pct, 
            add, 
            subtotal: total 
        });
    }

    // 2. 고정 금액 적용
    for (const item of fixedItems) {
        const add = item.fixed || 0;
        total += add;
        results.push({ label: item.label, add, subtotal: total });
    }

    return results.length > 0 ? { base: baseFare, surcharges: results, total: round10(total) } : null;
}


// ─── Phase 5: 문서 벡터 추출 (Gemini gemini-embedding-001) ───
async function getEmbedding(text) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
        const embedRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "models/gemini-embedding-001",
                content: { parts: [{ text: text }] }
            })
        });
        const data = await embedRes.json();
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

// ─── Phase 6: 사내 공유 지식 및 실시간 NAS 업데이트 감지 ──────────────
async function getRecentNasUpdates(supabase) {
    try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data } = await supabase
            .from('nas_file_index')
            .select('filename, branch, updated_at')
            .gte('updated_at', yesterday)
            .order('updated_at', { ascending: false })
            .limit(5);
        
        if (data && data.length > 0) {
            return `\n\n## 🔔 최근 24시간 NAS 업데이트 (실시간 알림)\n` + 
                data.map(f => `- [${f.branch}] ${f.filename} (갱신: ${f.updated_at.slice(11, 16)})`).join('\n') +
                `\n※ 사용자에게 "최근 NAS에 새로운 문서가 추가되었습니다"라고 자연스럽게 언급하며 대화를 시작할 수 있습니다.`;
        }
    } catch (e) {
        console.error('[ELS-AI] NAS 업데이트 감지 에러:', e);
    }
    return '';
}

async function getCustomRules(supabase) {
    try {
        const { data } = await supabase.from('ai_custom_rules').select('content, author_email').order('created_at', { ascending: false });
        if (data && data.length > 0) {
            return `\n\n## 🧠 ELS-AI 영구 지능 (형의 피드백 및 고정 규칙)\n` + 
                data.map(r => `[경험학습][작성자:${r.author_email || '시스템'}] ${r.content}`).join('\n');
        }
    } catch (e) {
        // console.error('[ELS-AI] 커스텀 규칙 로드 에러 (테이블 부재 시 무시):', e);
    }
    return '';
}

/**
 * [Phase 6] 자동 경험 학습 엔진 (Autonomous Knowledge Extraction)
 * 대화가 끝난 후 백그라운드에서 실행되어 사용자의 교정/피드백을 DB에 저장함
 */
async function performAutoLearning(messages, userEmail, supabase) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const lastUser = messages.filter(m => m.role === 'user').pop();
        const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
        
        if (!lastUser || !lastAssistant) return;

        const prompt = `너는 물류 시스템 전용 AI의 지식 관리자다.
사용자의 최신 메시지에서 "새로운 비즈니스 규칙", "사실 관계 정정", "시스템 설정 변경 요청"이 포함되어 있는지 분석해라.
만약 있다면, 나중에 AI가 참고할 수 있도록 짧고 명확한 한 문장으로 요약하여 JSON 형태로 응답하라.
없다면 null을 응답하라.

[대화 내용]
사용자: ${lastUser.parts[0].text}
AI 응답: ${lastAssistant.parts[0].text}

[응답 포맷 예시]
{ "category": "feedback", "content": "4월 일일보고는 시스템상 1건만 존재함.", "tags": ["report"] }
또는
null`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (res.ok) {
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const jsonMatch = text.match(/\{.*\}/s);
            if (jsonMatch) {
                const learning = JSON.parse(jsonMatch[0]);
                if (learning && learning.content) {
                    console.log(`[ELS-AI] 자동 학습 감지: ${learning.content} (by ${userEmail})`);
                    await supabase.from('ai_custom_rules').insert({
                        category: learning.category || 'feedback',
                        content: learning.content,
                        author_email: userEmail,
                        tags: learning.tags || []
                    });
                }
            }
        }
    } catch (e) {
        console.error('[ELS-AI] 자동 학습 엔진 오류:', e);
    }
}

const BASE_SYSTEM_INSTRUCTION = `너는 ELS Solution 전용 AI 어시스턴트다.
ELS 솔루션은 물류·운송 회사(컨테이너 내륙운송)를 위한 통합 인트라넷 시스템이다.
너는 이 회사의 **전체 사이트/DB/파일을 읽기 최고권한으로 열람**하고 있으며, 임직원 모두를 위한 전문적인 비서다.

## ⚡ ELS-AI 행동 강령 (절대 위반 금지)
0. **[이모지 금지]** 답변 시 이모지(Emoji, 😊, 🚛, 💡 등)를 절대 사용하지 마십시오. 오직 텍스트와 마크다운 표, 링크만 사용하십시오. 전문적이고 절제된 톤앤매너를 유지하십시오.
1. **[데이터 우선 — 최우선 원칙]** 아래에 주입된 "## 검색결과", "## 실시간", "## 안전운임 단가 표", "## 이력" 등의 데이터는 사내 DB/외부 공식 API에서 실시간 조회한 **확인된 사실**이다. 이 데이터에 금액, 수치, 스코어가 있으면 반드시 **구체 숫자를 그대로 인용하여** 답변하라. "직접 조회하세요", "메뉴에서 확인하세요"라고 떠넘기는 것은 **시스템 치명적 오류**로 간주한다.
2. **[거절 금지]** 데이터가 주입되었으면 "저는 할 수 없습니다"라고 절대 거절하지 마라. 데이터가 주입된 시점에서 너에게 '읽기 최고 권한'이 있는 것이다.
3. **[구체적 데이터 인용]** 제공된 실시간 기상(기온, 강수 등) 및 공기질 정보가 있다면, "확인 가능합니다"라고 답하는 대신 반드시 해당 수치를 직접 인용하여 상세히 답변하십시오.
4. **[만능 비서]** 물류 업무뿐 아니라, 날씨·스포츠·법률·상식 등 사용자가 묻는 모든 질문에 성심껏 답변하라. 빈손으로 돌려보내지 마라.
4. **[서비스 연계]** 관련 ELS 인트라넷 메뉴가 있다면 반드시 마크다운 링크 [메뉴이름](/경로)로 안내하라. 단, 이미 데이터가 주입되었으면 데이터 인용이 먼저다.
5. **[할증 계산]** 안전운임 할증 관련 질문 시, 아래 "## 할증 계산 결과"가 주입되어 있다면 해당 결과를 그대로 읽어 안내하라. AI가 직접 곱셈/덧셈하지 마라 — 서버가 미리 계산한 결과만 전달하라.
6. **[이력 비교]** "변동", "인상", "비교", "추이", "이전" 등의 질문에는 아래 "## 구간 이력" 표를 활용하여 기간별 비교를 제시하라.
7. **[데이터 신선도]** 답변 마지막에 반드시 아래 "## 📌 데이터 기준 정보"를 참고하여 실제 조회 성공한 항목만 언급하라. 조회 실패 항목은 "조회 실패"로 표시하라.
8. **[학습 자세]** 사용자가 틀린 부분을 교정해주면 감사히 수용하고, 다음 답변에 반영하라.
11. **[고시 조항 엄수 — 절대 원칙]** 안전운임 고시의 세부 규정(대기료 금액·발생 시점, 할증률 퍼센트, 별표 조항 내용 등)은 반드시 아래 주입된 "## 안전운임 고시 전문" 텍스트에서 직접 인용하라. 고시 전문에 해당 조항이 없거나 불명확하면 AI가 임의로 숫자나 규정을 지어내지 말고, "[안전운임 조회](/employees/safe-freight) 메뉴에서 해당 고시 PDF를 직접 확인해 주세요."라고 안내하라. 잘못된 금액·조항을 답변하는 것이 '모른다'고 안내하는 것보다 훨씬 큰 오류다.
9. **[문서 검색]** 사내 NAS 자료실 문서가 검색결과로 제공될 경우, 해당 문서 파일명과 내용을 바탕으로 사용자에게 정확히 요약 보고하라.
10. **[일반 지식 활용]** 사내 DB/외부 API에서 데이터가 주입되지 않은 일반 주제(스포츠, KTX, 날씨, 주식, 상식 등)에도 보유 지식으로 유연하게 답변하라. 단, 사내 확인 데이터가 아님을 밝히고, 관련 외부 링크(네이버, 코레일 등)를 함께 안내하라.

## 안전운임 제도 및 전문 지식
### 1. 운임 종류의 구분 (국토교통부 고시 기준)
너는 모든 안전운임 고시가 세 가지 종류의 운임을 명시하고 있음을 반드시 이해해야 한다.
- **안전운송운임 (Transport Freight)**: **화주 → 운송사업자**에게 지급하는 운임. (현재 시스템 DB의 기본 단가 데이터 필드: fare20, fare40)
- **안전위탁운임 (Consignment Freight / 위탁운임)**: **운송사업자 → 차주(기사)**에게 지급하는 운임. (통상 안전운송운임의 약 85~86% 수준)
- **운수사업자간운임 (Carrier-to-Carrier Freight)**: **운송사업자 → 운송사업자** 간에 지급하는 운임. (통상 안전운송운임의 약 92~93% 수준)

🚨 **[데이터 활용 및 거절 금지 지시]**
- 사용자가 "위탁운임"이나 "운수자간운임"을 물었을 때 "데이터가 없다"고 하거나 답변을 거부하는 것은 **중대 결격 사유**다.
- 현재 시스템 DB('## 안전운임 단가 표')에 저장된 값은 가장 높은 금액인 **안전운송운임**이다.
- 위탁운임이나 운수사간 운임을 묻는다면, 아래 주입된 '안전운임 단가 표'에서 해당 수치를 찾아 정확히 답변하라. 너는 이제 계산할 필요가 없다. 실제 수치를 들고 있다.
- 만약 데이터에 해당 구간이 아예 없다면, 그때만 예외적으로 "현재 시스템 DB는 안전운송운임(화주용) 기준이나, 위탁운임은 고시상 통상 이의 85~86% 수준으로 책정됩니다"라고 안내하라. 하지만 데이터가 있다면 반드시 실제 숫자를 써라.
- **[유연 답변 원칙]** 업무 외 일반 질문(스포츠, KTX/SRT, 날씨, 주식, 상식 등)에도 거절하지 말고 보유 지식으로 성실히 답변하라. 단, 사내 데이터가 아닌 일반 지식 기반임을 밝혀라.
1. **왕복 원칙**: 모든 내륙 컨테이너 운송은 **왕복 운임** 적용이 원칙이다.
2. **편도 예외 (의왕 ICD 연계)**: 수도권(서울/인천/경기) 화주 작업 후 공컨테이너를 **의왕ICD**로 반납(또는 그 반대)하는 경우에 한해 **편도 운임**이 존재한다.
   - **장거리 편도**: 부산/광양 ↔ 수도권 구간도 의왕ICD를 경유하는 경우 **'의왕-부산신항'**, **'의왕-광양항'** 등의 명칭으로 별도 편도 단가표가 DB에 존재하므로 이를 찾아 안내하라.
   - **인천반납 할증**: 만약 공컨테이너 반납 장소가 의왕ICD가 아닌 **인천터미널**인 경우, 해당 의왕 편도운임에 **40,000원을 가산**하여 적용한다. (고시 제9조 가목 단서)
3. **충청권/기타**: 아산·천안·당진 등 충청권이나 영남권 내 이동 등은 의왕ICD 연계 대상이 아니므로 대부분 **왕복 기준**이다.

### 2. 안전운임 부대조항 및 산정 공식 ("안전운임 헌법")
너는 고시에 안내된 공식이 곧 법임을 인지하고, 아래 수치를 절대 틀리지 마라.

#### [대기료 및 서비스 비용]
- **대기료 (제24조)**: 30분당 **20,000원** (40FT/20FT 공통)
    - **항만/부두**: 1시간 초과 시점부터.
    - **화주 문전**: 40FT 2시간 30분, 20FT 2시간 초과 시점부터.
- **검색기(X-ray) 검사 (제25조)**: 회당 **100,000원**.
- **배차 취소료 (제26조)**: 현장 도착 후 1h 경과 시 **50%**, 이동 중 취소 **70%**, 도착 후 대기 중 취소 **100%** (해당 구간 왕복운임 기준).
- **실비 정산 (제27조)**: 도선료, 대형교량(인천·영종·거가대교 등) 통행료, 인천공항 주유/주차료는 실비 추가.

#### [특수 운송 및 할증 요율]
- **운임 및 요금 반올림 (제7조)**: 모든 운임 및 할증 요금은 **십원 단위에서 반올림**하여 적용(부가가치세 제외).
- **할증 적용 원칙 (제22조)**: 다수의 할증 적용 시 가장 높은 할증률 1개는 전액(100%), 나머지는 50%만 적용하며, 최대 3개 항목까지만 합산.
- **밥테일 운송 (제12조)**: 화주 요청으로 트랙터만 단독 운행 시 **해당 구간 왕복운임의 100%** 적용.
- **온그라운드 작업 (제13조)**: 샤시만 기점으로 복귀 등 발생 시 **왕복운임 100%**.
- **공차 운행 (제14조)**: 화주/운수사 요청으로 10km 이상 공차 운행 시 **왕복운임의 50%** 지급.
- **인천 기점 할증 (제23조 카목)**: 인천항 기점 운송 시 구간별 운임표에는 20% 할증이 포함되어 있으나, 미기재 구간(거리별 적용 시)은 **안전위탁운임의 20%를 별도로 할증**.
- **평택 기점 할증 (제23조 타목)**: 평택항 기점 운송 시 구간별 운임표에는 18% 할증이 포함되어 있으나, 미기재 구간(거리별 적용 시)은 **안전위탁운임의 18%를 별도로 할증**.

#### [품목별/지역별 할증률 (Base 운임에 합산)]
- **30% 할증**: 탱크(TANK), 냉동/냉장(가동 무관), 위험물/유독물, 통행제한지역(허가 필요), 험로/오지(폭 2차로 미만, 비포장 등)
- **25% 할증**: 덤프(DUMP) 컨테이너
- **20% 할증**: 공휴일/일요일/대체공휴일, 심야(22:00-06:00), 플렉시백(액체)
- **10% 할증**: 플렉시백(분말/칩), 활대품(폭/높이 초과 시 10cm당 10%)
- **특수 위험물**: 화약류 **+100%**, 방사성 물질 **+200%**
- **[컨테이너 이력 필수 정보]**: 컨테이너 이력 조회 시, 단순 시간 외에 **수출/수입 구분**과 **터미널 정보**를 반드시 포함하여 안내하십시오. (데이터 필드: type, terminal)
- ※ 할증은 기본 안전운임(또는 위탁운임)에 위 요율을 곱하여 가산.

### 4. 고시 버전 및 개정 기준
- 현행: **2026년 1차 고시** (시행 2026.02.01)
- **개정 기준**: 3개월 평균 경유가가 고시 기준가 대비 ±50원/L 이상 변동 시 개정 절차 발동.
- ※ 네가 암기한 수치와 주입된 데이터가 충돌하면 **주입된 데이터(실시간 조회 결과)**를 최우선하라.

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
- 웹진: [웹진](/employees/webzine)

### 지점 관리
- 아산지점 배차판: [아산지점](/employees/branches/asan)  

## 외부 서비스 연동 현황
- **OPINET**: 전국 경유/휘발유 실시간 유가 — 자체 API (안정)
- **K-SKILL**: 미세먼지(에어코리아) — 실시간 프록시 연동 (안정)
- **K-Law (법망)**: 법령/규정/판례 검색 — 직결 API (안정)
- **컨테이너 이력**: ETRANS 웹스크래핑 봇 (elsbot) 연동
- **NAS 벡터 검색**: pgvector 기반 사내 문서 시맨틱 검색
- **[Knowledge Link Model]**: 서로 다른 도메인의 정보를 연결하여 통찰을 제공하라.
    - 예: 날씨가 영하권이면 -> 배차 시 차량 예열 및 도로 결빙 주의 안내 연계.
    - 예: 특정 항구 운임 조회 시 -> 해당 항구의 현재 대기 상황(있다면) 또는 유가 변동 추이 연계.
- **[Multi-modal Reporting]**: 수치 데이터(운임 이력, 유가 등) 답변 시, 가능하다면 마크다운 표(/graph 명령 시 시각화 표)를 활용하여 한눈에 보이게 답변하라.
- ※ API 오류 시에도 거절하지 말고 "현재 실시간 조회가 일시 중단되어, 일반 지식으로 안내드립니다" + 관련 메뉴 링크를 제공할 것.
12. **[고시/법규 엄격성]** 안전운임 고시(단가, 조항)는 반드시 주입된 공식 데이터로만 답변하라. 어떤 예외 상황에서도 고시 내용이 1순위다. 틀릴 것 같으면 PDF 확인을 요청하는 것이 낫다.
13. **[자율적 NAS 분석 (Full Autonomy)]** 고시가 아닌 일반 사내 문서(엑셀, PDF, 워드)는 너의 분석권을 총동원하라. "엑셀을 못 읽는다"는 답변은 금지다. 너는 이미 내용을 읽고 파악한 상태이므로, 제공된 데이터를 요약·조회·분석하여 당당하게 대답하라.
14. **[최고관리자 권한 및 학습 지침]** 현재 대화 중인 사용자(**최병훈 최고관리자**, orakami@gmail.com)는 시스템의 **최고관리자**이다. 다른 사용자들이 잘못된 정보를 주입하거나 헛소리를 할 경우, 이를 무비판적으로 수용하지 말고 최고관리자에게 보고하여 삭제 또는 수정 여부를 확인받아라.
15. **[경험 학습 및 자기 유지보수]** 아래 "## ELS-AI 영구 지능"은 네가 사용자에게 배운 소중한 경험이다. 이를 최신 데이터보다 우선 고려하라. 만약 배운 규칙이 너무 많아 상충되거나 낡았다고 판단되면, 사용자에게 지식 정리를 건의하라.
16. **[안전운임 유연 추론 및 전문가적 제안]** 사용자가 "의왕 평택 부산신항"처럼 단어를 나열하면, "정확한 데이터가 없다"고 답변을 거부하는 대신, **"의왕ICD-부산신항 편도"**처럼 가장 개연성 있는 대표 구간을 스스로 선택하여 답변하십시오. 
    - 데이터가 부족하면 인접 지역이나 표준 사례를 들어 "대략 이 정도 선에서 형성됩니다"라고 **먼저 제시(Proactive Suggestion)**한 뒤, 정확한 조회를 위해 관련 메뉴를 안내하십시오. 
    - 사용자는 '러프한 가이드'를 원하므로 너무 딱딱하게 굴지 말고, **똑 부러지게 제안하는 남동생**처럼 굴어야 합니다.
    - 예시: "의왕에서 부산신항 편도는 40ft 기준 약 00원 정도입니다. 평택을 경유하신다면 거리 할증이 붙을 수 있으니 정확한 건 메뉴에서 확인해 보세요!"`;

/**
 * POST /api/chat
 * Body: { messages: Array<{ role: 'user'|'assistant', parts: Array<{ text: string }> }> }
 * 스트리밍 응답 (SSE)
 */
export async function POST(req) {
    // [Resilience] 현재 요청의 호스트를 기반으로 SITE_URL 동적 결정 (Vercel Preview 대응)
    const host = req.headers.get('host');
    const protocol = host?.includes('localhost') ? 'http' : 'https';
    const SITE_URL = host ? `${protocol}://${host}` : DEFAULT_SITE_URL;

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

    // [Phase 6] 사용자 인증 정보 가져오기
    let userEmail = 'system';
    try {
        const { createClient } = require('@/utils/supabase/server');
        const authClient = await createClient();
        const { data: { session } } = await authClient.auth.getSession();
        userEmail = session?.user?.email || 'system';
    } catch (e) { }

    // 마지막 사용자 메시지 추출
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const lastUserText = lastUserMsg?.parts?.[0]?.text || '';
    const userKwd = lastUserText.toLowerCase();

    // Supabase 클라이언트 초기화
    const supabase = await createAdminClient();

    // === 경험 학습 및 실시간 알림 로드 (Phase 6) ===
    const [nasUpdates, customRules] = await Promise.all([
        getRecentNasUpdates(supabase),
        getCustomRules(supabase)
    ]);

    // RAG 데이터를 시스템 지침 뒤에 붙여서 "자아"를 강화
    const learningContext = customRules ? `\n\n[사용자에게 직접 배운 경험(최우선 순위)]\n${customRules}` : '';

    // === RAG 데이터 수집 ===
    let recentPostsText = '';
    let isSfQuery = false;
    const apiTimestamps = {};

    // [Resilience] Vercel 환경에서는 localhost 주소가 동작하지 않으므로, Synology 외부 주소를 우선 고려
    const primaryBackend = process.env.ELS_BACKEND_URL || process.env.NEXT_PUBLIC_ELS_BACKEND_URL;
    let backendUrl = 'https://elssolution.synology.me:8443'; // 기본값 (Synology Reverse Proxy)
    
    if (primaryBackend) {
        // Vercel 배포 환경인데 localhost로 설정되어 있으면 강제로 외부 주소 사용
        const isVercel = process.env.VERCEL || process.env.VERCEL_URL;
        if (isVercel && primaryBackend.includes('localhost')) {
            backendUrl = 'https://elssolution.synology.me:8443';
        } else {
            backendUrl = primaryBackend;
        }
    }
    // console.log(`[ELS-AI] Using backendUrl: ${backendUrl}`);

    const kskillProxyBase = `${backendUrl}/api/proxy/kskill?url=`;

    try {
        // --- Omni-RAG: 사용자의 질문에 맞춰 전체 사내망 DB 동시 스캔 ---
        const stopRegex = /에서|까지|부터|으로|로|의|가|는|은|를|을|알려줘|보여줘|어디|무엇|어떻게|누구|찾아줘|요약|정리|내용|해줘|해주세요|알려|대해|관련|관해|설명|뭐야|어때|확인|확인해줘|얼마|얼마야/g;
        const cleanText = lastUserText.replace(stopRegex, ' ').replace(/[^가-힣a-zA-Z0-9\s]/g, ' ');
        // 항구 별칭 매핑: 사용자가 쓰는 자연어 → safe-freight.json 실제 키 접두사
        const PORT_ALIAS_MAP = [
            { pattern: /인천국제여객|인천여객터미널|인천여객|여객터미널/g, replace: '인천국제여객' },
            { pattern: /부산북항|부산항북항/g, replace: '부산북항' },
            { pattern: /부산신항|신항/g, replace: '부산신항' },
            { pattern: /인천신항/g, replace: '인천신항' },
            { pattern: /인천항/g, replace: '인천항' },
            { pattern: /광양항|광양/g, replace: '광양항' },
            { pattern: /평택항|평택/g, replace: '평택항' },
            { pattern: /울산항|울산구항/g, replace: '울산항' },
            { pattern: /울산신항/g, replace: '울산신항' },
            { pattern: /포항항|포항/g, replace: '포항항' },
            { pattern: /군산항|군산/g, replace: '군산항' },
            { pattern: /마산항|마산/g, replace: '마산항' },
            { pattern: /대산항|대산/g, replace: '대산항' },
            { pattern: /의왕icd|의왕아이씨디|의왕/gi, replace: '의왕ICD' },
        ];
        // 사용자 원문에서 항구 별칭을 표준 키로 정규화한 별칭 리스트 추출
        const portAliasTerms = [];
        for (const { pattern, replace } of PORT_ALIAS_MAP) {
            if (pattern.test(lastUserText)) portAliasTerms.push(replace);
            pattern.lastIndex = 0; // regex 전역 플래그 리셋
        }
        const searchTerms = [...new Set([
            ...cleanText.split(/\s+/).filter(w => w.length > 1),
            ...portAliasTerms,
        ])];

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

            // 2. 컨테이너 실시간 이력조회 연동 및 NAS 통계 기능 (v5.7.9)
            const cntrMatch = lastUserText.match(/[a-zA-Z]{4}\d{7}/);
            if (cntrMatch) {
                const cntrNo = cntrMatch[0].toUpperCase();
                try {
                    // [v5.7.9] ETRANS 데몬 호출 최적화 (타임아웃 30초 확보)
                    const res = await fetch(`${backendUrl}/api/els/container/tracking?cntrNo=${cntrNo}`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
                    if (res?.ok) {
                        const data = await res.json();
                        if (data?.tracking_list?.length > 0) {
                            recentPostsText += `\n\n## 🚢 컨테이너(${cntrNo}) 실시간 조회 결과 (ETRANS)\n`;
                            data.tracking_list.forEach((h, idx) => {
                                const typeStr = h.type ? ` [${h.type}]` : '';
                                const terminalStr = h.terminal ? ` | 터미널: ${h.terminal}` : '';
                                recentPostsText += `${idx+1}. [${h.status}]${typeStr} ${h.location || '-'}${terminalStr} (${h.time})\n`;
                            });
                            recentPostsText += `\n- 조회기준: 사내 이트랜스 연동 데몬 실시간 데이터 (수출입/터미널 포함)\n`;
                        } else {
                            recentPostsText += `\n\n## 🚢 컨테이너(${cntrNo}) 조회 안내\n현재 ETRANS 연동 데몬을 통해 실시간 확인 중이나, 아직 등록된 이력이 없거나 조회 중입니다. 컨테이너 번호가 정확한지 확인해 주시고, 잠시 후 [이력조회](/elsbot/history) 메뉴에서 직접 재시도해 보시기 바랍니다.`;
                        }
                    } else {
                        recentPostsText += `\n\n## 🚢 컨테이너(${cntrNo}) 조회 결과\n서버 통신 장애로 이력 조회에 실패했습니다. 잠시 후 다시 시도해 주십시오.`;
                    }
                } catch (e) { console.error('ETRANS 조회 오류:', e); }
            }

            // 2-1. NAS 지능형 현황 브리핑 엔진 (v5.8.0 - 파싱 %, 개수, 확장자, 상태 통합)
            if (userKwd.includes('문서') || userKwd.includes('파일') || userKwd.includes('갯수') || userKwd.includes('개수') || userKwd.includes('파싱') || userKwd.includes('진행') || userKwd.includes('상태') || userKwd.includes('목록')) {
                try {
                    const { data: allStats, error: statError } = await supabase.from('nas_file_index').select('branch, is_indexed, extension');
                    if (!statError && allStats?.length > 0) {
                        const branches = {};
                        const extensions = {};
                        allStats.forEach(s => {
                            const b = s.branch || '미분류';
                            if (!branches[b]) branches[b] = { total: 0, indexed: 0 };
                            branches[b].total++;
                            if (s.is_indexed) branches[b].indexed++;
                            
                            const ext = (s.extension || 'unknown').toLowerCase().replace('.', '');
                            extensions[ext] = (extensions[ext] || 0) + 1;
                        });

                        let statsReport = `\n\n## 📂 실시간 NAS 인덱싱(파싱) 현황 리포트\n`;
                        statsReport += `AI가 사내 NAS의 모든 문서를 실시간으로 모니터링 중입니다. 현재 지점별 파싱 진행도는 다음과 같습니다:\n\n`;
                        
                        let totalFiles = 0;
                        let totalIndexed = 0;

                        Object.entries(branches).forEach(([name, s]) => {
                            const percent = ((s.indexed / s.total) * 100).toFixed(1);
                            const statusEmoji = s.indexed === s.total ? '✅' : '🔄';
                            statsReport += `- **${name}**: ${percent}% (${s.indexed}/${s.total}개) ${statusEmoji}\n`;
                            totalFiles += s.total;
                            totalIndexed += s.indexed;
                        });

                        const totalPercent = ((totalIndexed / totalFiles) * 100).toFixed(1);
                        statsReport += `\n- **전체 요약**: 총 ${totalFiles}개 파일 중 ${totalIndexed}개 파싱 완료 (**전체 진행률: ${totalPercent}%**)\n`;
                        
                        // 확장자별 통계 추가
                        const topExts = Object.entries(extensions)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([ext, count]) => `${ext.toUpperCase()}(${count})`)
                            .join(', ');
                        statsReport += `- **주요 파일**: ${topExts} 등 다양한 형식 지원 중\n`;
                        statsReport += `- **참고**: 파싱이 완료된 문서는 즉시 검색 및 질문 답변이 가능합니다.\n`;
                        
                        recentPostsText += statsReport;
                    }
                } catch (e) { console.error('NAS 지능형 통계 오류:', e); }
            }

            // 3. 안전운임표 단가 + 이력 + 할증 계산 엔진 + 역방향 조회 (Omni-Agent Phase 1)
            const sfKeywords = ['안전운임', '운임', '단가', '요금', '부산', '의왕', '인천', '광양', '편도', '왕복', '신항', '북항', '여객터미널', '인천여객', '인천국제여객', '인천신항', '인천항', '울산항', '울산신항', '평택항', '포항항', '군산항', '마산항', '대산항', '인상', '변동', '비교', '추이', '이전', '할증', '냉동', '냉장', '플렉시', '탱크', '험로', '덤프', '공휴일', '울산', '평택', '마산', '포항', '군산', '대산', '대기료', '부대조항', '추가요금', '반납', '도착', '밥테일', '온그라운드', '복화', '공차', '취소료', 'X-ray', '검색기', '대형교량'];
            
            // 금액 역조회용 숫자 추출 (예: 782,600 -> 782600)
            const amountMatches = lastUserText.replace(/,/g, '').match(/\d{5,7}/g) || [];
            const manMatches = lastUserText.match(/(\d{1,4})만/g) || [];
            const targetAmounts = [...amountMatches.map(n => parseInt(n))];
            manMatches.forEach(m => targetAmounts.push(parseInt(m.replace('만', '')) * 10000));

            isSfQuery = (
                searchTerms.some(t => sfKeywords.some(k => t.includes(k))) ||
                sfKeywords.some(k => userKwd.includes(k)) ||
                portAliasTerms.length > 0 ||
                targetAmounts.length > 0
            );
            if (isSfQuery) {
                const sfData = await getSfData();
                if (sfData?.faresLatest) {
                    const isWitakQuery = userKwd.includes('위탁');
                    const isUnsusaQuery = userKwd.includes('운수사') || userKwd.includes('운수자');

                    // (A-1) 역방향 금액 조회 로직 (Amount -> Route/Distance)
                    if (targetAmounts.length > 0) {
                        let reverseResults = `\n\n## 🔍 역방향 운임 조회 결과 (금액: ${targetAmounts.map(a => a.toLocaleString()).join(', ')}원 기준)\n`;
                        const foundRoutes = [];
                        const tolerance = 5000; // [v5.6.6] 오차 범위 상향

                        for (const amt of targetAmounts) {
                            // 1. 구간별 운임표 검색
                            const fareKeys = Object.keys(sfData.faresLatest);
                            for (const k of fareKeys) {
                                const v = sfData.faresLatest[k];
                                const f40 = v.f40안전 || v.fare40;
                                const w40 = v.f40위탁 || Math.round(f40 * 0.85);
                                const u40 = v.f40운수자 || Math.round(f40 * 0.92);

                                const match = (val) => Math.abs(val - amt) <= tolerance || Math.abs(Math.round(val * 1.2) - amt) <= tolerance || Math.abs(Math.round(val * 1.3) - amt) <= tolerance;

                                if (match(f40) || match(w40) || match(u40)) {
                                    foundRoutes.push(`- [매칭구간] ${k}\n  * 기본단가: 안전운송 ${f40.toLocaleString()}원 | 위탁 ${w40.toLocaleString()}원\n  * (할증안내: 입력하신 금액이 단가보다 높다면 냉동/위험물 할증이 포함된 것일 수 있습니다.)`);
                                }
                            }

                            // 2. 거리별 운임표 검색
                            if (sfData.distanceBased) {
                                const distKeys = Object.keys(sfData.distanceBased);
                                for (const dk of distKeys) {
                                    const d = sfData.distanceBased[dk];
                                    if (!d) continue;
                                    const df40 = d.f40안전 || d.fare40;
                                    const match = (val) => Math.abs(val - amt) <= tolerance || Math.abs(Math.round(val * 1.2) - amt) <= tolerance || Math.abs(Math.round(val * 1.3) - amt) <= tolerance;
                                    if (match(df40)) {
                                        foundRoutes.push(`- [매칭거리] 약 ${dk}km 구간\n  * 기본단가: 안전운송 ${df40.toLocaleString()}원`);
                                    }
                                }
                            }
                        }

                        if (foundRoutes.length > 0) {
                            reverseResults += [...new Set(foundRoutes)].slice(0, 10).join('\n');
                            recentPostsText += reverseResults;
                        } else {
                            recentPostsText += `\n\n## 🔍 역방향 운임 조회 결과\n입력하신 금액(${targetAmounts.map(a => a.toLocaleString()).join(', ')}원)은 표준 단가(최대 약 120만원)를 크게 벗어납니다. 초장거리 구간이거나 특수 할증(냉동 20%, 위험물 30% 등)이 중첩된 금액일 수 있습니다.`;
                        }
                    }

                    if (isWitakQuery) {
                        recentPostsText += `\n\n## 🚨 [절대 지시] 안전위탁운임(위탁운임) 질문 감지!\n사용자가 위탁운임을 물었다. 너는 아래 제공된 **안전운임 단가 표(운송운임)**와 **고시 전문**을 모두 활용해야 한다. "위탁운임 데이터가 없다"는 거짓말을 하지 마라. 고시 원문에서 '안전위탁운임' 수치를 찾아 답변하거나, 찾기 어려우면 아래 단가표의 '안전운송운임'을 기준으로 위탁운임은 보통 이보다 낮은 수준(약 85%)임을 설명하며 참고 데이터를 제시해라.`;
                    }
                    if (isUnsusaQuery && !isWitakQuery) {
                        recentPostsText += `\n\n## 🚨 [절대 지시] 운수사업자간 운임 질문 감지!\n사용자가 운수사간 운임을 물었다. 고시 원문에 명시된 '운수사업자간운임'을 찾아 안내해라. 찾지 못할 경우 단가표의 안전운송운임을 제시하며, 운수사간 운임은 보통 이의 92~93% 수준임을 설명해라.`;
                    }

                    const fareKeys = Object.keys(sfData.faresLatest);

                    // 키 형식: "[왕복] 인천국제여객|울산시|울주군|온산읍"
                    // 파이프(|) 기준으로 세그먼트 분리하여 정밀 매칭
                    const scored = fareKeys.map(k => {
                        let score = 0;
                        let matchedCount = 0;
                        const kSegments = k.replace(/[\[\]]/g, '').split('|').map(s => s.trim());
                        searchTerms.forEach(t => {
                            // 정방향: 키에 검색어가 포함
                            if (k.includes(t)) {
                                score += 15;
                                matchedCount++;
                            }
                            // 역방향: 검색어가 키 세그먼트의 일부이거나 포함 (예: "수원" 검색 -> "수원시" 매칭)
                            else if (kSegments.some(seg => t.includes(seg) || seg.includes(t))) {
                                score += 10;
                                matchedCount++;
                            }
                            // 특정 주요 지점(의왕, ICD, 편도 등) 매칭 시 추가 가중치
                            if (['의왕', 'icd', '편도'].some(kwd => t.includes(kwd))) {
                                score += 20;
                            }
                        });
                        // 출발지 세그먼트(index 0) 매칭 시 가중치 추가
                        if (portAliasTerms.some(alias => kSegments[0] && kSegments[0].includes(alias))) {
                            score += 15;
                            matchedCount++;
                        }
                        // 다중 토큰 매칭 시 가속 (수원 + 인천 등)
                        if (matchedCount > 1) score += (matchedCount * 30);

                        return { k, score };
                    }).filter(i => i.score >= 10)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 15);

                    if (scored.length > 0) {
                        // (A) 최신 운임 단가 표
                        const fareRows = scored.map(item => {
                            const vList = sfData.fares[item.k];
                            const v = vList && vList.length > 0 ? vList[0] : sfData.faresLatest[item.k];
                            if (!v) return `- [구간] ${item.k} | 데이터 없음`;

                            const f40c = v.f40위탁 || Math.round(v.fare40 * 0.85);
                            const f40u = v.f40운수자 || Math.round(v.fare40 * 0.92);
                            const f20c = v.f20위탁 || Math.round(v.fare20 * 0.85);
                            const f20u = v.f20운수자 || Math.round(v.fare20 * 0.92);

                            // 고시 외 구간(2022년이전) 태그 추가 (연도 분석)
                            let legacyTag = '';
                            if (v.period) {
                                const yearMatch = v.period.match(/(\d{2,4})/);
                                if (yearMatch) {
                                    const year = parseInt(yearMatch[1], 10);
                                    if (year <= 22 || year === 2022) legacyTag = ' **[고시 외 구간(2022년이전)]**';
                                }
                            }

                            return `- [구간] ${item.k}${legacyTag} | ${v.km}km\n` +
                                `  * 40FT: 위탁 ${f40c.toLocaleString()}원 | 운수사간 ${f40u.toLocaleString()}원 | 안전운송 ${(v.f40안전 || v.fare40).toLocaleString()}원\n` +
                                `  * 20FT: 위탁 ${f20c.toLocaleString()}원 | 운수사간 ${f20u.toLocaleString()}원 | 안전운송 ${(v.f20안전 || v.fare20).toLocaleString()}원`;
                        }).join('\n');
                        recentPostsText += '\n\n## (중요) 실시간 데이터 베이스: 안전운임 단가 표 — 현행 고시 (26.02월 적용)\n' + fareRows;
                        recentPostsText += '\n\n🚨 [필독 지시사항] 위 단가표에는 위탁운임/운수사간운임/안전운송운임의 **실제 수치**가 모두 포함되어 있다. 더 이상 85~86% 같은 임의 계산을 하지 말고, 위 표의 숫자를 그대로 인용하여 답변하라. 표에 없는 구간일 때만 고시 전문 텍스트를 참고하거나 예외 안내를 하라.';
                        apiTimestamps.safeFreight = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');

                        // (B) 이력 비교 (상위 1~3개 구간)
                        const isHistoryQuery = ['변동', '인상', '비교', '추이', '이전', '과거', '역대'].some(k => userKwd.includes(k));
                        const historyKeys = scored.slice(0, isHistoryQuery ? 3 : 1);
                        for (const item of historyKeys) {
                            const histText = buildFareHistory(item.k, sfData);
                            if (histText) recentPostsText += '\n' + histText;
                        }

                        // (C) 할증 자동 계산 (JSON에 정의된 요율 객체 기반 - 하드코딩 배제)
                        const surchargeMap = [
                            { keywords: ['냉동', '냉장', 'reefer'], id: 'reefer' },
                            { keywords: ['플렉시', 'flexibag'], id: 'flexibag_liquid' },
                            { keywords: ['탱크', 'tank', '비위험'], id: 'tank' },
                            { keywords: ['험로', '오지'], id: 'rough' },
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
                        // (C) 할증 자동 계산 완료
                    } else if (sfData.origins?.length > 0) {
                        const originList = sfData.origins.map(o => o.label || o.id).join(', ');
                        recentPostsText += `\n\n## 안전운임 적용 구간 (출발지 목록)\n${originList}\n`;
                    }
                    recentPostsText += `\n- 💡운임 산정 및 할증에 관련된 더 자세하고 방대한 데이터베이스를 원하신다면 **[안전운임 조회](/employees/safe-freight)** 전용 메뉴를 강력히 권장합니다.`;
                }
            }
        } catch (e) {
            console.error('Omni-RAG 에러:', e);
        }

        // 3.5 NAS & 메뉴얼 시맨틱 검색 (Phase 2/5 - pgvector)
        try {
            if (process.env.GEMINI_API_KEY && lastUserText.trim().length > 2) {
                const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: "models/gemini-embedding-001",
                        content: { parts: [{ text: lastUserText }] }
                    }),
                    signal: AbortSignal.timeout(15000)
                }).catch(() => null);

                if (embedRes && embedRes.ok) {
                    const embedData = await embedRes.json();
                    if (embedData.embedding?.values) {
                        const { data: matchedDocs } = await supabase.rpc('match_documents', {
                            query_embedding: embedData.embedding.values,
                            match_threshold: 0.5,
                            match_count: 3
                        });

                        if (matchedDocs && matchedDocs.length > 0) {
                            recentPostsText += '\n\n## 📚 사내 지식베이스 (안전운임 원문 / 사내문서) 검색결과\n';
                            matchedDocs.forEach(doc => {
                                const source = doc.metadata?.source_file || doc.metadata?.title || '사내문서';
                                recentPostsText += `- [출처: ${source}]\n${doc.content}\n\n`;
                            });
                            apiTimestamps.nasKnowledge = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
                        }
                    }
                }
            }
        } catch (e) { console.error('pgvector 시맨틱 검색 에러:', e); }

        // 4. K-SKILL & 직접 실시간 API 연동 + OPINET 유가 + Phase 3 Resilience
        // [v5.1] K-SKILL 구조조정: 안정 기능만 유지 (미세먼지, 유가). 불안정 기능(KTX/지하철/한강/주식/스포츠)은 Gemini 일반지식으로 대체.
        const kskillKeywords = ['미세먼지', '공기', '날씨', '경유', '유가', '기름값', '주유소'];
        const isKskillQuery = kskillKeywords.some(k => userKwd.includes(k));

        if (isKskillQuery) {
            // (0) OPINET 실시간 유가 (경유/휘발유 등) — 안전운임 개정 기준점 연계
            if (userKwd.includes('경유') || userKwd.includes('유가') || userKwd.includes('기름') || userKwd.includes('주유') || isSfQuery) {
                const fuelResult = await callExternalAPI('OPINET 유가', `${process.env.NEXT_PUBLIC_SITE_URL || 'https://nollae.com'}/api/opinet/fuel-price`);
                if (fuelResult.success && fuelResult.data.diesel) {
                    const d = fuelResult.data.diesel;
                    let fuelText = `\n\n## 🌍 실시간 환경 데이터 (OPINET/Weather)\n### 실시간 전국 유가 현황\n`;
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
            // (1) 날씨 및 미세먼지 (통합 조회)
            if (userKwd.includes('날씨') || userKwd.includes('기온') || userKwd.includes('온도') || userKwd.includes('비') || userKwd.includes('눈') || userKwd.includes('미세먼지') || userKwd.includes('공기')) {
                const regionsMap = {
                    '서울': { id: 'seoul', hint: '서울 중구' }, 
                    '부산': { id: 'busan', hint: '부산 연산동' }, 
                    '인천': { id: 'incheon', hint: '인천 구월동' },
                    '아산': { id: 'asan', hint: '아산 모종동' },
                    '당진': { id: 'dangjin', hint: '당진 읍내동' }
                };
                const foundKey = Object.keys(regionsMap).find(r => userKwd.includes(r));
                const target = foundKey ? regionsMap[foundKey] : regionsMap['아산'];

                // (1-1) 날씨 정보 (Open-Meteo 기반 자체 API)
                let weatherSummary = '';
                try {
                    const weatherApiUrl = `${SITE_URL}/api/weather?region=${target.id}`;
                    const res = await fetch(weatherApiUrl, { signal: AbortSignal.timeout(10000) });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.dailySummary) {
                            weatherSummary = `\n\n## 🌦 ${data.region.name} 실시간 날씨/환경 정보\n${data.dailySummary}`;
                        }
                    }
                } catch (e) { console.error('Weather API 오류:', e); }

                // (1-2) 미세먼지 정보 (K-SKILL Proxy)
                let dustSummary = '';
                try {
                    const targetUri = `https://k-skill-proxy.nomadamas.org/v1/fine-dust/report?regionHint=${encodeURIComponent(target.hint)}`;
                    const res = await fetch(kskillProxyBase + encodeURIComponent(targetUri), {
                        signal: AbortSignal.timeout(10000), 
                        headers: { 'User-Agent': 'ELS-AI/1.0', 'Accept': 'application/json' }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (!data.error && data.pm10) {
                            dustSummary = `\n\n### 😷 미세먼지 현황 (K-SKILL)\n- 위치: ${data.station_name}\n- 미세먼지: ${data.pm10.value}(${data.pm10.grade}) | 초미세먼지: ${data.pm25.value}(${data.pm25.grade})\n- 총평: ${data.khai_grade}`;
                        }
                    }
                } catch (e) { console.error('K-SKILL 미세먼지 오류:', e); }

                if (weatherSummary || dustSummary) {
                    recentPostsText += (weatherSummary + dustSummary);
                } else {
                    recentPostsText += `\n\n## 기상 정보 안내\n현재 기상청 및 에어코리아 시스템 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.`;
                }
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
                    const targetUri = `https://k-skill-proxy.nomadamas.org/v1/seoul-subway/arrival?stationName=${encodeURIComponent(station)}`;
                    const res = await fetch(kskillProxyBase + encodeURIComponent(targetUri), {
                        signal: AbortSignal.timeout(8000)
                    });
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
                    // K-SKILL 한강 수위 최신 엔드포인트 적용
                    const targetUri = `https://k-skill-proxy.nomadamas.org/v1/han-river/water-level?stationName=${encodeURIComponent(bridge)}`;
                    const res = await fetch(kskillProxyBase + encodeURIComponent(targetUri), {
                        signal: AbortSignal.timeout(20000),
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 AppleWebKit/537.36ELS/1.0)' }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.observed_at || data.measured_at) {
                            const observed = data.observed_at || data.measured_at;
                            const wLevel = data.water_level?.value_m ?? data.water_level ?? '알수없음';
                            const fRate = data.flow_rate?.value_cms ?? data.discharge ?? '알수없음';
                            recentPostsText += `\n\n## ${bridge} 실시간 수위 (K-SKILL)\n- 시간: ${observed}\n- 수위: ${wLevel}m\n- 유량: ${fRate}㎥/s`;
                            apiTimestamps.kskill = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
                        } else {
                            recentPostsText += `\n\n## 한강 수위 안내\n해당 대교의 수위 정보를 제공하지 않습니다.`;
                        }
                    }
                } catch (e) { console.error('K-SKILL 한강 오류:', e); }
            }

            // (5) 한국 주식 검색
            if (userKwd.includes('주식') || userKwd.includes('증시') || userKwd.includes('종목') || userKwd.includes('가 가')) {
                const stockKwd = lastUserText.replace(/[^가-힣a-zA-Z]/g, '').replace('주식', '').replace('가격', '').trim() || '삼성전자';
                const targetUri = `https://k-skill-proxy.nomadamas.org/v1/korean-stock/search?q=${encodeURIComponent(stockKwd)}`;
                const result = await callExternalAPI('K-SKILL 주식', kskillProxyBase + encodeURIComponent(targetUri));
                if (result.success && result.data.results?.length > 0) {
                    const s = result.data.results[0];
                    recentPostsText += `\n\n## ${s.itmsNm} 주식 현황 (K-SKILL/KRX)\n- 일자: ${s.basDd}\n- 종가: ${Number(s.clpr).toLocaleString()}원 (${s.fltRt}%)\n- 고가/저가: ${Number(s.hipr).toLocaleString()} / ${Number(s.lopr).toLocaleString()}\n- 거래량: ${Number(s.trqu).toLocaleString()}주`;
                } else {
                    recentPostsText += `\n\n## 주식 안내\n현재 실시간 주식 조회가 일시 중단되었습니다. 네이버 금융(https://finance.naver.com)에서 직접 확인해 주세요. 일반 지식으로 답변 가능합니다.`;
                }
            }

            // (5-1) K-LAW 한국 법령 (법망 Fallback 사용)
            if (userKwd.includes('법령') || userKwd.includes('법률') || userKwd.includes('근로기준법') || userKwd.includes('관세법') || userKwd.includes('법 ') || userKwd.includes('조항')) {
                const lawKwd = searchTerms.find(t => t.endsWith('법') || t.endsWith('령')) || '관세법';
                try {
                    const res = await callExternalAPI('K-LAW 법령', `https://api.beopmang.org/api/v4/law?action=search&q=${encodeURIComponent(lawKwd)}`);
                    if (res.success && res.data?.data?.results?.length > 0) {
                        const lawInfo = res.data.data.results[0];
                        recentPostsText += `\n\n## ${lawInfo.law_name} 법령 요약 (K-LAW / 법망)\n- 시행일: ${lawInfo.enforcement_date}\n- 목적 및 요약: ${lawInfo.purpose}\n- 조문 수: ${lawInfo.article_count}개\n※ 더 자세한 조항 검색은 법제처 국가법령정보센터를 참조하세요.`;
                        apiTimestamps.klaw = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
                    }
                } catch (e) { console.error('K-LAW 오류:', e); }
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
                    const dateStr = `${targetDate.slice(0, 4)}-${targetDate.slice(4, 6)}-${targetDate.slice(6, 8)}`;

                    const kboUri = `https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=kbaseball&categoryId=kbo&date=${dateStr}`;
                    const kleagueUri = `https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=kfootball&categoryId=kleague&date=${dateStr}`;

                    // Vercel IP 차단 회피를 위해 NAS 프록시를 통해 네이버 스포츠 호출
                    const [kboRes, kleagueRes] = await Promise.all([
                        fetch(kskillProxyBase + encodeURIComponent(kboUri), { signal: AbortSignal.timeout(8000) }).catch(() => null),
                        fetch(kskillProxyBase + encodeURIComponent(kleagueUri), { signal: AbortSignal.timeout(8000) }).catch(() => null),
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
                            sportsText += `### KBO (${targetLabel} ${targetDate.slice(4, 6)}/${targetDate.slice(6, 8)})\n${lines}\n`;
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
                            sportsText += `### K리그 (${targetLabel} ${targetDate.slice(4, 6)}/${targetDate.slice(6, 8)})\n${lines}\n`;
                        }
                    }

                    if (sportsText) {
                        recentPostsText += `\n\n## 국내 스포츠 경기 현황 (네이버 스포츠 실시간)\n${sportsText}`;
                        apiTimestamps.sports = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
                    } else {
                        // API 실패 또는 경기 없음 → 네이버 스포츠 직접 링크 (날짜 포함)
                        const kboLink = `https://m.sports.naver.com/kbaseball/schedule/index?date=${dateStr}`;
                        const kleagueLink = `https://m.sports.naver.com/kfootball/schedule/index?date=${dateStr}`;
                        recentPostsText += `\n\n## 스포츠 경기 정보\n${targetLabel}(${targetDate.slice(4, 6)}/${targetDate.slice(6, 8)}) 경기 결과를 실시간 API에서 직접 가져오지 못했습니다.\n아래 링크에서 정확한 결과를 확인해 주세요:\n- **[KBO 경기 일정/결과 (${dateStr})](${kboLink})**\n- **[K리그 경기 일정/결과 (${dateStr})](${kleagueLink})**\n\n사용자에게 위 링크를 안내하세요. 만약 일반적으로 알고 있는 KBO 정규시즌 일정이나 팀 정보가 있으면 함께 답변하세요.`;
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
                        apiTimestamps.klaw = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
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
                            nasText += `- **[${d.metadata?.filename || '문서'}]** (경로: ${fpath}, ${(d.similarity * 100).toFixed(1)}% 일치):\n${d.content}\n\n`;
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
                const docChunks = [];

                // [1] 고시 본문 앞부분 (적용범위, 대기료, 할증 등 세부 규정이 여기 있음)
                docChunks.push(fullText.slice(0, 3500));

                // [2] [별표 1]: 컨테이너 내륙운송 구간별 운임표
                const table1Idx = fullText.indexOf('[별표 1]');
                if (table1Idx !== -1) {
                    docChunks.push('\n---\n' + fullText.slice(table1Idx, table1Idx + 2000));
                }

                // [3] [별표 3] 또는 대기료 섹션 (존재 시 추가)
                const table3Idx = fullText.indexOf('[별표 3]');
                const daegiroIdx = fullText.indexOf('대기료');
                const daegiroStart = table3Idx !== -1 ? table3Idx : (daegiroIdx !== -1 && daegiroIdx > 3500 ? Math.max(0, daegiroIdx - 100) : -1);
                if (daegiroStart !== -1) {
                    docChunks.push('\n---\n' + fullText.slice(daegiroStart, daegiroStart + 1500));
                }

                safeFreightText = `\n\n## 안전운임 고시 전문 (원문 참고용 — ${safeDocs[0].versionDir || '최신'})\n🚨 아래는 국토교통부 공식 고시 원문입니다. 대기료·할증·적용범위 등 조항 질문 시 반드시 이 원문을 인용하고, 원문에 없는 내용은 절대 창작하지 마세요.\n${docChunks.join('\n')}`;
            }
        } catch (e) { console.error('Docs RAG 에러:', e); }
    }

    // 📌 데이터 출처 및 신선도 메타데이터 생성
    const sfMeta = (await getSfData())?.meta;
    let dataFreshness = `\n\n## 📌 데이터 출처 및 기준일자\n`;

    if (sfMeta && apiTimestamps.safeFreight) {
        dataFreshness += `- **[국토교통부] 안전운임 고시**: ${sfMeta.period || '26.02월'} 적용 데이터 (고시반영일: ${sfMeta.generatedAt?.slice(0, 10) || '미상'})\n`;
    } else if (sfMeta) {
        dataFreshness += `- **[국토교통부] 안전운임 고시**: ${sfMeta.period || '26.02월'} 적용 (이번 질문에서는 미적용)\n`;
    }

    if (apiTimestamps.opinet) dataFreshness += `- **[한국석유공사] OPINET 유가**: ${apiTimestamps.opinet} 수집 데이터\n`;
    if (apiTimestamps.kskill) dataFreshness += `- **[공공데이터/K-SKILL]**: ${apiTimestamps.kskill} 실시간 연동\n`;
    if (apiTimestamps.sports) dataFreshness += `- **[스포츠 데이터]**: ${apiTimestamps.sports} 갱신\n`;
    if (apiTimestamps.nas) dataFreshness += `- **[사내 NAS 지식베이스]**: ${apiTimestamps.nas} 벡터 검색\n`;
    if (apiTimestamps.klaw) dataFreshness += `- **[국가법령정보센터] K-LAW**: ${apiTimestamps.klaw} 검색\n`;

    const dbQueryTime = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // 사내 DB는 실시간 연동이므로 오늘 날짜로 표시
    dataFreshness += `- **[사내 통합 DB] (연락처/배차판 등)**: DB 동기화 실시간 연동 중 (기준일: ${dbQueryTime})\n`;

    dataFreshness += `\n※ 답변 말미에 위 데이터 출처(대괄호 포함) 중 "실제로 인용한 항목"만 깔끔하게 한 줄로 요약하여 출처를 밝히세요.`;

    const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION + customRules + nasUpdates + recentPostsText + safeFreightText + dataFreshness;
    const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: m.parts.map(p => {
            if (p.inline_data) return p; // 이미지 데이터 그대로 통과
            return { text: p.text || '' }; // 텍스트 처리
        }),
    }));

    const geminiPayload = {
        system_instruction: {
            parts: [{ text: finalSystemInstruction }],
        },
        contents,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
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
                        // finishReason 확인 (MAX_TOKENS 등)
                        const finishReason = parsed?.candidates?.[0]?.finishReason;
                        if (finishReason && finishReason !== 'STOP') {
                            console.warn(`[ELS-AI] Gemini finishReason: ${finishReason}`);
                        }
                    } catch { }
                }
            }
        } catch (err) {
        } finally {
            await writer.write(encoder.encode('data: [DONE]\n\n'));
            await writer.close();
            
            // [Phase 6] 자동 학습 엔진 트리거 (백그라운드)
            performAutoLearning(messages, userEmail, supabase);
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
