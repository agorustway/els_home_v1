const DEFAULT_MAX_ROWS = 80;

const SHIPPING_TRIGGER_WORDS = [
  '선적관리', '선적 관리', '선적', '미선적', '선적완료',
  '반입', '적하', '컨테이너', '컨테이너번호', '컨테이너 번호',
];

const SHIPPING_IGNORE_TERMS = new Set([
  '아산', '아산지점', '선적', '선적관리', '선적완료', '미선적',
  '관리', '컨테이너', '컨테이너번호', '번호', '조회', '확인',
  '알려줘', '알려줘요', '어디야', '어디', '몇', '몇건', '몇건이야',
  '전체', '모두', '상세배차', '상세', '배차',
]);

function normalizeCompact(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function cleanText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value) {
  return cleanText(value).replace(/\s+/g, '').toUpperCase();
}

function tokenize(text) {
  return Array.from(new Set(
    String(text || '')
      .normalize('NFKC')
      .match(/[가-힣A-Za-z0-9_()./-]+/g) || [],
  ));
}

function stripParticle(term) {
  return String(term || '')
    .replace(/[?!.:,;]+$/g, '')
    .replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|야|요|죠|지|냐|니|다)$/g, '');
}

function extractContainers(text) {
  return Array.from(new Set(
    String(text || '').toUpperCase().match(/[A-Z]{4}\d{7}/g) || [],
  ));
}

function buildShippingSearchTerms(text, inputTerms = []) {
  const containers = extractContainers(text);
  if (containers.length) return containers;

  const terms = [];
  const seen = new Set();
  for (const raw of [...tokenize(text), ...(Array.isArray(inputTerms) ? inputTerms : [])]) {
    const term = stripParticle(raw);
    const compact = normalizeCompact(term);
    if (!compact || compact.length < 2) continue;
    if (SHIPPING_IGNORE_TERMS.has(compact)) continue;
    if (/^\d{1,2}월\d{0,2}일?$/.test(compact) || /^\d{1,2}[./-]\d{1,2}/.test(compact)) continue;
    if (seen.has(compact)) continue;
    seen.add(compact);
    terms.push(term);
  }
  return terms.slice(0, 6);
}

export function parseAsanShippingIntent(userText = '', options = {}) {
  const text = String(userText || '');
  const compact = normalizeCompact(text);
  const hasTrigger = SHIPPING_TRIGGER_WORDS.some((word) => compact.includes(normalizeCompact(word)));
  const containers = extractContainers(text);
  const hasAsanScope = compact.includes('아산') || compact.includes('선적관리') || containers.length > 0;
  const searchTerms = buildShippingSearchTerms(text, options.searchTerms || []);

  return {
    shouldQuery: hasTrigger && hasAsanScope,
    searchTerms,
    containers,
  };
}

function findHeaderIndex(headers = [], candidates = []) {
  const normalized = headers.map(normalizeHeader);
  const targets = candidates.map(normalizeHeader);
  for (const target of targets) {
    const idx = normalized.findIndex((header) => header === target);
    if (idx >= 0) return idx;
  }
  for (const target of targets) {
    const idx = normalized.findIndex((header) => header && header.includes(target));
    if (idx >= 0) return idx;
  }
  return -1;
}

function getCell(row, idx) {
  return idx >= 0 ? cleanText(row?.[idx]) : '';
}

function rowSummary(headers = [], row = []) {
  const cols = {
    container: findHeaderIndex(headers, ['CONTAINER', '컨테이너', '컨테이너번호']),
    status: findHeaderIndex(headers, ['이력 구분', '이력구분', '상태']),
    moveTime: findHeaderIndex(headers, ['이력 MOVE TIME', 'MOVE TIME', '이력시간']),
    region: findHeaderIndex(headers, ['지역', '상차지']),
    inboundDate: findHeaderIndex(headers, ['반입일', '작업일', '입고일']),
    vessel: findHeaderIndex(headers, ['VESSEL', '선박', '모선']),
    booking: findHeaderIndex(headers, ['BKG', 'BOOKING', '부킹']),
  };
  return [
    getCell(row, cols.container) ? `컨테이너 ${getCell(row, cols.container)}` : '',
    getCell(row, cols.status) ? `이력 ${getCell(row, cols.status)}` : '',
    getCell(row, cols.moveTime) ? `시간 ${getCell(row, cols.moveTime)}` : '',
    getCell(row, cols.region) ? `지역 ${getCell(row, cols.region)}` : '',
    getCell(row, cols.inboundDate) ? `반입/작업일 ${getCell(row, cols.inboundDate)}` : '',
    getCell(row, cols.vessel) ? `선박 ${getCell(row, cols.vessel)}` : '',
    getCell(row, cols.booking) ? `BKG ${getCell(row, cols.booking)}` : '',
  ].filter(Boolean).join(' / ');
}

export function buildAsanShippingRagText(data = {}, intent = {}, options = {}) {
  const maxRows = options.maxRows || DEFAULT_MAX_ROWS;
  const headers = Array.isArray(data.headers) ? data.headers : [];
  const rows = Array.isArray(data.data) ? data.data : [];
  const terms = (intent.searchTerms || []).join(', ') || '전체';

  let text = `\n\n## 아산지점 선적관리\n`;
  text += `[시스템: Supabase branch_shipping_files/branch_shipping_rows / 조회 조건 ${terms} / 표시 ${rows.length}건 / 전체 ${data.total ?? rows.length}건 / 소스 ${data.source || 'unknown'}]\n`;
  text += `- 헤더: ${headers.join(', ') || '미탐지'}\n`;
  text += `> [해석 규칙] 선적관리 질문은 이 DB 행을 기준으로 답한다. 주입되지 않은 NAS 원본 파일이나 이미지 내용을 추정하지 마라.\n`;

  if (rows.length > 0) {
    text += `### 선적관리 행 샘플\n`;
    rows.slice(0, maxRows).forEach((row, idx) => {
      text += `- 행${idx + 1}: ${rowSummary(headers, row) || row.map(cleanText).filter(Boolean).slice(0, 8).join(' / ')}\n`;
    });
    if (rows.length > maxRows) {
      text += `- 행 샘플은 ${maxRows}건까지만 주입됨. 조회 결과는 ${rows.length}건이다.\n`;
    }
  } else {
    text += `> [조회 완료] 조건에 일치하는 선적관리 행이 없습니다. 실제 DB 조회 결과 기준으로 0건이라고 답하라.\n`;
  }

  return {
    text,
    hasMatches: rows.length > 0,
    total: data.total ?? rows.length,
  };
}

export async function buildAsanShippingRagContext({
  userText = '',
  searchTerms = [],
  maxRows = DEFAULT_MAX_ROWS,
} = {}) {
  const intent = parseAsanShippingIntent(userText, { searchTerms });
  if (!intent.shouldQuery) {
    return { shouldQuery: false, success: false, text: '', intent };
  }

  const params = new URLSearchParams();
  params.set('page', '1');
  params.set('page_size', String(maxRows));
  if (intent.searchTerms.length > 0) {
    params.set('search', intent.searchTerms.join(','));
    params.set('search_mode', intent.containers.length > 0 ? 'or' : 'and');
  }

  try {
    const { queryAsanShippingFromSupabase } = await import('../lib/asan-branch-db.js');
    const data = await queryAsanShippingFromSupabase(params);
    if (!data) {
      return {
        shouldQuery: true,
        success: false,
        intent,
        text: `\n\n## 아산지점 선적관리\n> [DB 미동기화/데이터 없음] branch_shipping_files 기준 선적관리 원장을 찾지 못했습니다.`,
      };
    }
    const rag = buildAsanShippingRagText(data, intent, { maxRows });
    return {
      shouldQuery: true,
      success: true,
      intent,
      ...rag,
    };
  } catch (error) {
    return {
      shouldQuery: true,
      success: false,
      intent,
      error,
      text: `\n\n## 아산지점 선적관리\n> [조회 실패] ${error?.message || String(error)}`,
    };
  }
}
