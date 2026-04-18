/**
 * ELS Omni-Agent Phase 2: 안전운임 데이터 벡터화 스크립트
 * 
 * 실행: node scripts/vectorize-safe-freight.js
 * 환경: web/.env.local 에서 Supabase + Gemini 키 로드
 * 
 * 역할:
 * 1. safe-freight.json의 52,801개 구간을 의미 있는 텍스트 청크로 변환
 * 2. safe-freight-docs.json의 고시 전문을 1000자 단위로 분할
 * 3. Gemini text-embedding-004로 벡터화
 * 4. Supabase document_chunks 테이블에 upsert
 */

const fs = require('fs');
const path = require('path');

// .env.local 수동 로딩
const envPath = path.join(__dirname, '..', 'web', '.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
                const key = trimmed.slice(0, eqIdx).trim();
                const val = trimmed.slice(eqIdx + 1).trim();
                if (!process.env[key]) process.env[key] = val;
            }
        }
    });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY) {
    console.error('❌ 환경변수 미설정: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY 필요');
    process.exit(1);
}

// ─── Gemini Embedding API ─────────────────────────────────────────────
async function getEmbeddings(texts) {
    // Batch embedding (최대 100개씩)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2-preview:batchEmbedContents?key=${GEMINI_KEY}`;
    const requests = texts.map(text => ({
        model: 'models/gemini-embedding-2-preview',
        content: { parts: [{ text }] },
        outputDimensionality: 768,
    }));

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini Embedding API 오류: ${res.status} ${err}`);
    }

    const data = await res.json();
    return data.embeddings.map(e => e.values);
}

// ─── Supabase REST API ────────────────────────────────────────────────
async function supabaseUpsert(table, rows) {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(rows),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase upsert 오류 (${table}): ${res.status} ${err}`);
    }
}

// ─── 안전운임 구간 데이터 청크 생성 ──────────────────────────────────
function buildFareChunks(sfData) {
    const chunks = [];
    const faresLatest = sfData.faresLatest || {};
    const fares = sfData.fares || {};
    const keys = Object.keys(faresLatest);

    console.log(`📊 안전운임 구간 수: ${keys.length}`);

    // 지역별로 그룹핑하여 청크 효율 극대화
    const regionMap = {};
    for (const key of keys) {
        const parts = key.split('|');
        const regionKey = parts.slice(0, 3).join('|'); // [왕복] 부산신항|충남|아산시
        if (!regionMap[regionKey]) regionMap[regionKey] = [];
        regionMap[regionKey].push(key);
    }

    let chunkIdx = 0;
    for (const [regionKey, fareKeys] of Object.entries(regionMap)) {
        // 한 지역의 모든 읍면동을 하나의 청크로 묶기
        let text = `[안전운임 구간] ${regionKey}\n`;
        for (const fk of fareKeys.slice(0, 20)) { // 읍면동이 너무 많으면 20개로 제한
            const v = faresLatest[fk];
            const dong = fk.split('|').pop();
            text += `- ${dong}: ${v.km}km, 20ft ${(v.fare20 / 10000).toFixed(1)}만원, 40ft ${(v.fare40 / 10000).toFixed(1)}만원\n`;

            // 이력 요약 (최신 2개만)
            const history = fares[fk];
            if (Array.isArray(history) && history.length > 1) {
                const curr = history[0];
                const prev = history[1];
                const f40curr = curr.f40안전 || curr.fare40 || 0;
                const f40prev = prev.f40안전 || prev.fare40 || 0;
                if (f40prev > 0) {
                    const delta = ((f40curr - f40prev) / f40prev * 100).toFixed(1);
                    text += `  (이전 ${prev.period}: ${(f40prev / 10000).toFixed(1)}만원 → 현재: ${delta}% 변동)\n`;
                }
            }
        }

        chunks.push({
            source_type: 'safe_freight_fare',
            source_id: regionKey,
            source_version: sfData.meta?.period || '26.02월',
            chunk_index: chunkIdx++,
            content: text.slice(0, 2000),
            metadata: {
                region: regionKey,
                dong_count: fareKeys.length,
                period: sfData.meta?.period,
            },
        });
    }

    // 할증 정보 청크
    if (sfData.surcharges?.length > 0) {
        let surText = '[안전운임 할증(Surcharge) 정보]\n';
        for (const s of sfData.surcharges) {
            surText += `- ${s.label}: +${s.pct}% (ID: ${s.id})\n`;
        }
        surText += '\n할증은 기본 안전운임에 백분율을 곱하여 가산. 복수 할증 시 각각 기본운임 기준으로 계산 후 합산.\n';
        surText += '왕복 운임이 원칙이고, 편도는 의왕ICD 반납 수도권만 해당.\n';
        chunks.push({
            source_type: 'safe_freight_fare',
            source_id: 'surcharges',
            source_version: sfData.meta?.period || '26.02월',
            chunk_index: chunkIdx++,
            content: surText,
            metadata: { type: 'surcharge_rules' },
        });
    }

    return chunks;
}

// ─── 고시 전문 텍스트 청크 생성 ──────────────────────────────────────
function buildDocsChunks(sfDocs) {
    const chunks = [];
    if (!sfDocs || sfDocs.length === 0) return chunks;

    for (const doc of sfDocs) {
        const text = doc.text || '';
        const version = doc.versionDir || '최신';
        const chunkSize = 800;
        const overlap = 100;

        for (let i = 0, idx = 0; i < text.length; i += chunkSize - overlap, idx++) {
            const chunk = text.slice(i, i + chunkSize);
            if (chunk.trim().length < 50) continue; // 너무 짧은 청크 스킵

            chunks.push({
                source_type: 'safe_freight_doc',
                source_id: version,
                source_version: version,
                chunk_index: idx,
                content: chunk,
                metadata: {
                    version_dir: version,
                    char_offset: i,
                },
            });
        }
    }
    return chunks;
}

// ─── 메인 실행 ────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 ELS Omni-Agent Phase 2: 안전운임 벡터화 시작...\n');

    // 1. 데이터 로드
    const sfPath = path.join(__dirname, '..', 'web', 'data', 'safe-freight.json');
    const docsPath = path.join(__dirname, '..', 'web', 'data', 'safe-freight-docs.json');

    const sfData = JSON.parse(fs.readFileSync(sfPath, 'utf8'));
    const sfDocs = fs.existsSync(docsPath) ? JSON.parse(fs.readFileSync(docsPath, 'utf8')) : [];

    // 2. 청크 생성
    const fareChunks = buildFareChunks(sfData);
    const docChunks = buildDocsChunks(sfDocs);
    const allChunks = [...fareChunks, ...docChunks];

    console.log(`📦 총 청크 수: ${allChunks.length} (구간: ${fareChunks.length}, 고시전문: ${docChunks.length})\n`);

    // 3. 배치 임베딩 + Supabase 저장
    const BATCH_SIZE = 50; // Gemini API 배치 제한
    let processed = 0;

    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
        const batch = allChunks.slice(i, i + BATCH_SIZE);
        const texts = batch.map(c => c.content);

        try {
            console.log(`  [${i + 1}~${i + batch.length}/${allChunks.length}] 임베딩 요청 중...`);
            const embeddings = await getEmbeddings(texts);

            const rows = batch.map((chunk, j) => ({
                source_type: chunk.source_type,
                source_id: chunk.source_id,
                source_version: chunk.source_version,
                chunk_index: chunk.chunk_index,
                content: chunk.content,
                metadata: chunk.metadata,
                embedding: `[${embeddings[j].join(',')}]`,
            }));

            await supabaseUpsert('document_chunks', rows);
            processed += batch.length;
            console.log(`  ✅ ${processed}/${allChunks.length} 저장 완료`);

            // Rate limiting (Gemini 무료 계정 고려)
            if (i + BATCH_SIZE < allChunks.length) {
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (err) {
            console.error(`  ❌ 배치 [${i + 1}~${i + batch.length}] 실패:`, err.message);
            // 실패한 배치 건너뛰고 계속 진행
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log(`\n🎉 벡터화 완료! 총 ${processed}/${allChunks.length} 청크 저장됨.`);
    console.log(`📌 Supabase에서 확인: SELECT count(*), source_type FROM document_chunks GROUP BY source_type;`);
}

main().catch(err => {
    console.error('💥 치명적 오류:', err);
    process.exit(1);
});
