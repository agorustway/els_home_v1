import {
  buildTransportHistoryRowsPage,
  normalizeTransportHistoryHeaders,
  normalizeTransportHistoryMonth,
} from './asanTransportHistory.mjs';

const DEFAULT_MAX_ROWS = 50;
const DEFAULT_MAX_MONTHS = 18;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const TRANSPORT_HISTORY_TRIGGER_WORDS = [
  '운송내역', '운송 내역', '운송이력', '운송 이력',
  '수출리스트', '수출 리스트', '출차', '청구금액', '청구 금액',
];

const TRANSPORT_HISTORY_IGNORE_TERMS = new Set([
  '아산', '아산지점', '운송', '운송내역', '운송이력', '내역', '이력',
  '수출', '수출리스트', '리스트', '출차', '청구', '청구금액',
  '데이터', '데이터베이스', 'db', '조회', '검색', '확인', '찾아줘',
  '알려줘', '알려줘요', '정리', '요약', '전체', '모두', '몇건',
  '몇건이야', '몇', '금액', '합계', '상위', '순위',
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

function kstParts(now = new Date()) {
  const date = new Date(new Date(now).getTime() + KST_OFFSET_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function formatDay(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthKeyFromDay(day) {
  return day ? `${day.slice(0, 7)}-01` : '';
}

function formatScopeMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function shiftDay(year, month, day, delta) {
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return formatDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function parseExplicitDay(text, now = new Date()) {
  const current = kstParts(now);
  const value = String(text || '');
  const full = value.match(/(20\d{2})\s*[./년 -]\s*(1[0-2]|0?[1-9])\s*[./월 -]\s*(3[01]|[12]\d|0?[1-9])\s*일?/);
  if (full) return formatDay(Number(full[1]), Number(full[2]), Number(full[3]));

  const md = value.match(/(?:^|[^0-9])(1[0-2]|0?[1-9])\s*(?:[./월])\s*(3[01]|[12]\d|0?[1-9])\s*일?(?:[^0-9]|$)/);
  if (md) return formatDay(current.year, Number(md[1]), Number(md[2]));

  return '';
}

function parseExplicitMonth(text, now = new Date()) {
  const current = kstParts(now);
  const value = String(text || '');
  const full = value.match(/(20\d{2})\s*년?\s*[./년 -]?\s*(1[0-2]|0?[1-9])\s*월?/);
  if (full) return formatScopeMonth(Number(full[1]), Number(full[2]));

  const slash = value.match(/(20\d{2})[./-](1[0-2]|0?[1-9])/);
  if (slash) return formatScopeMonth(Number(slash[1]), Number(slash[2]));

  const monthOnly = value.match(/(?:^|[^0-9])(1[0-2]|0?[1-9])\s*월/);
  if (monthOnly) return formatScopeMonth(current.year, Number(monthOnly[1]));

  return '';
}

function parseTransportHistoryScope(text, now = new Date()) {
  const compact = normalizeCompact(text);
  const current = kstParts(now);

  if (compact.includes('오늘')) {
    const day = formatDay(current.year, current.month, current.day);
    return { mode: 'day', day, month: monthKeyFromDay(day), label: day };
  }
  if (compact.includes('내일')) {
    const day = shiftDay(current.year, current.month, current.day, 1);
    return { mode: 'day', day, month: monthKeyFromDay(day), label: day };
  }
  if (compact.includes('어제')) {
    const day = shiftDay(current.year, current.month, current.day, -1);
    return { mode: 'day', day, month: monthKeyFromDay(day), label: day };
  }

  const explicitDay = parseExplicitDay(text, now);
  if (explicitDay) return { mode: 'day', day: explicitDay, month: monthKeyFromDay(explicitDay), label: explicitDay };

  const explicitMonth = parseExplicitMonth(text, now);
  if (explicitMonth) {
    return {
      mode: 'month',
      month: explicitMonth,
      year: explicitMonth.slice(0, 4),
      label: `${explicitMonth.slice(0, 4)}년 ${Number(explicitMonth.slice(5, 7))}월`,
    };
  }

  if (compact.includes('이번달') || compact.includes('금월') || compact.includes('당월')) {
    return {
      mode: 'month',
      month: formatScopeMonth(current.year, current.month),
      year: String(current.year),
      label: `${current.year}년 ${current.month}월`,
    };
  }

  const yearMatch = String(text || '').match(/(20\d{2})\s*년/);
  if (yearMatch) return { mode: 'year', year: yearMatch[1], label: `${yearMatch[1]}년` };

  if (compact.includes('전체') || compact.includes('모두')) {
    return { mode: 'all', label: '전체' };
  }

  return { mode: 'year', year: String(current.year), label: `${current.year}년` };
}

function extractContainers(text) {
  return Array.from(new Set(
    String(text || '').toUpperCase().match(/[A-Z]{4}\d{7}/g) || [],
  ));
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
    .replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|야|요|죠|지|냐|니|다|달)$/g, '');
}

function isDateLikeTerm(compact) {
  return /^\d{1,2}월\d{0,2}일?$/.test(compact)
    || /^\d{1,2}[./-]\d{1,2}/.test(compact)
    || /^20\d{2}년?$/.test(compact)
    || /^20\d{2}[./-]\d{1,2}/.test(compact);
}

function buildTransportHistorySearchTerms(text, inputTerms = []) {
  const containers = extractContainers(text);
  const terms = [];
  const seen = new Set();
  const addTerm = (raw) => {
    const term = stripParticle(raw);
    const compact = normalizeCompact(term);
    if (!compact || compact.length < 2) return;
    if (TRANSPORT_HISTORY_IGNORE_TERMS.has(compact)) return;
    if (isDateLikeTerm(compact)) return;
    if (/^\d{1,2}$/.test(compact)) return;
    if (seen.has(compact)) return;
    seen.add(compact);
    terms.push(term);
  };

  containers.forEach(addTerm);
  [...tokenize(text), ...(Array.isArray(inputTerms) ? inputTerms : [])].forEach(addTerm);
  return terms.slice(0, 8);
}

function hasTransportTrigger(text) {
  const compact = normalizeCompact(text);
  return TRANSPORT_HISTORY_TRIGGER_WORDS.some((word) => compact.includes(normalizeCompact(word)));
}

export function parseAsanTransportHistoryIntent(userText = '', options = {}) {
  const text = String(userText || '');
  const compact = normalizeCompact(text);
  const containers = extractContainers(text);
  const transportTrigger = hasTransportTrigger(text);
  const hasAsanScope = compact.includes('아산') || compact.includes('운송내역') || compact.includes('수출리스트');
  const searchTerms = buildTransportHistorySearchTerms(text, options.searchTerms || []);

  return {
    shouldQuery: transportTrigger || (containers.length > 0 && hasAsanScope),
    dateScope: parseTransportHistoryScope(text, options.now || new Date()),
    containers,
    searchTerms,
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

function parseAmount(value) {
  const raw = cleanText(value).replace(/[,원\s]/g, '');
  if (!raw) return 0;
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  const abs = Math.abs(amount);
  if (abs >= 100000000) return `${(amount / 100000000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원`;
  if (abs >= 10000) return `${(amount / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원`;
  return `${amount.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`;
}

function addCount(map, key) {
  const label = cleanText(key);
  if (!label) return;
  map.set(label, (map.get(label) || 0) + 1);
}

function topCountText(headers, rows, candidates, limit = 8) {
  const idx = findHeaderIndex(headers, candidates);
  if (idx < 0) return '미탐지';
  const counts = new Map();
  rows.forEach((row) => addCount(counts, row[idx]));
  const entries = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko-KR'))
    .slice(0, limit);
  return entries.length ? entries.map(([key, count]) => `${key}(${count}건)`).join(', ') : '없음';
}

function rowSummary(headers = [], row = []) {
  const cols = {
    date: findHeaderIndex(headers, ['작업일자', '작업일', '날짜', '일자']),
    company: findHeaderIndex(headers, ['업체명', '운송사', '지급처', '하불처']),
    container: findHeaderIndex(headers, ['CONTAINER', '컨테이너', '컨테이너번호']),
    vehicle: findHeaderIndex(headers, ['차량번호', '차번', '차량', '영업넘버']),
    amount: findHeaderIndex(headers, ['청구금액', '출차시간']),
    line: findHeaderIndex(headers, ['선사', 'LINE', '라인']),
    workSite: findHeaderIndex(headers, ['작업지', '상차지', '현장']),
    destination: findHeaderIndex(headers, ['하차지', '선적지', '도착지']),
  };
  return [
    getCell(row, cols.date) ? `작업일 ${getCell(row, cols.date)}` : '',
    getCell(row, cols.company) ? `업체 ${getCell(row, cols.company)}` : '',
    getCell(row, cols.container) ? `컨테이너 ${getCell(row, cols.container)}` : '',
    getCell(row, cols.vehicle) ? `차량 ${getCell(row, cols.vehicle)}` : '',
    getCell(row, cols.amount) ? `청구금액 ${getCell(row, cols.amount)}` : '',
    getCell(row, cols.line) ? `선사 ${getCell(row, cols.line)}` : '',
    getCell(row, cols.workSite) ? `작업지 ${getCell(row, cols.workSite)}` : '',
    getCell(row, cols.destination) ? `도착 ${getCell(row, cols.destination)}` : '',
  ].filter(Boolean).join(' / ');
}

function normalizeRecord(item = {}) {
  return {
    ...item,
    target_month: normalizeTransportHistoryMonth(item.target_month) || item.target_month || '',
    headers: normalizeTransportHistoryHeaders(item.headers || []),
    source_headers: item.source_headers || item.headers || [],
    data: Array.isArray(item.data) ? item.data : [],
  };
}

function recordsSummary(records = []) {
  if (!records.length) return '없음';
  return records.slice(0, 12).map((record) => (
    `${record.target_month || '-'} ${record.sheet_name || '-'} ${Number(record.valid_row_count ?? record.row_count ?? record.data?.length ?? 0).toLocaleString('ko-KR')}건`
  )).join(', ');
}

export function buildAsanTransportHistoryRagText(records = [], intent = {}, options = {}) {
  const maxRows = Math.max(1, Math.min(Number(options.maxRows || DEFAULT_MAX_ROWS), 80));
  const normalizedRecords = records.map(normalizeRecord);
  const page = buildTransportHistoryRowsPage(normalizedRecords, {
    limit: Math.max(maxRows, 80),
    offset: 0,
    search: (intent.searchTerms || []).join(','),
    date: intent.dateScope?.mode === 'day' ? intent.dateScope.day : '',
    dateColumn: options.dateColumn || '',
  });
  const headers = page.headers || [];
  const rows = page.data || [];
  const amountIdx = findHeaderIndex(headers, ['청구금액', '출차시간']);
  const amountValues = amountIdx >= 0
    ? rows.map((row) => cleanText(row[amountIdx])).filter(Boolean)
    : [];
  const amountTotal = amountIdx >= 0
    ? amountValues.reduce((sum, value) => sum + parseAmount(value), 0)
    : 0;
  let amountLabel = '청구금액 컬럼 미탐지';
  if (amountIdx >= 0 && !amountValues.length) {
    amountLabel = '청구금액 값 없음(조건 행의 청구금액 칸 공란)';
  } else if (amountIdx >= 0 && page.total > rows.length) {
    amountLabel = `청구금액 샘플합계(${rows.length}/${page.total}건): ${formatMoney(amountTotal)}`;
  } else if (amountIdx >= 0) {
    amountLabel = `청구금액 합계: ${formatMoney(amountTotal)}`;
  }

  let text = `\n\n## 아산지점 운송내역\n`;
  text += `[시스템: 사내 데이터베이스 branch_transport_history / 조회 범위 ${intent.dateScope?.label || '현재연도'} / 검색 ${(intent.searchTerms || []).join(', ') || '전체'} / 조건 행수 ${page.total}건]\n`;
  text += `- 원장: /아산지점/2026_수출리스트.xlsx 월별 시트 데이터베이스 누적본\n`;
  text += `- 조회 월/시트: ${recordsSummary(normalizedRecords)}\n`;
  text += `- 조건 행수: ${Number(page.total || 0).toLocaleString('ko-KR')}건 / ${amountLabel}\n`;
  text += `- 업체/운송사 상위: ${topCountText(headers, rows, ['업체명', '운송사', '지급처', '하불처'])}\n`;
  text += `- 차량 상위: ${topCountText(headers, rows, ['차량번호', '차번', '차량', '영업넘버'])}\n`;
  text += `- 선사 상위: ${topCountText(headers, rows, ['선사', 'LINE', '라인'])}\n`;
  text += `> [해석 규칙] 운송내역 질문은 이 데이터베이스 행을 기준으로 답한다. NAS 원본 파일을 직접 파싱했다고 말하지 마라. 조건 행수가 0이면 실제 데이터베이스 조회 결과 기준으로 0건이라고 답하라.\n`;

  if (rows.length) {
    text += `### 운송내역 행 샘플\n`;
    rows.slice(0, maxRows).forEach((row, idx) => {
      text += `- 행${idx + 1}: ${rowSummary(headers, row) || row.map(cleanText).filter(Boolean).slice(0, 10).join(' / ')}\n`;
    });
    if (page.total > maxRows) {
      text += `- 행 샘플은 ${maxRows}건까지만 주입됨. 조건에 맞는 전체 행수는 ${page.total}건이다.\n`;
    }
  } else if (normalizedRecords.length) {
    text += `> [조회 완료] 조건에 일치하는 운송내역 행이 없습니다.\n`;
  } else {
    text += `> [데이터베이스 미동기화/데이터 없음] branch_transport_history 원장을 찾지 못했습니다.\n`;
  }

  return {
    text,
    hasMatches: page.total > 0,
    total: page.total,
  };
}

function applyTransportHistoryScope(query, scope = {}, now = new Date()) {
  if (scope.mode === 'day' && scope.month) return query.eq('target_month', scope.month);
  if (scope.mode === 'month' && scope.month) return query.eq('target_month', scope.month);
  if (scope.mode === 'year' && scope.year) {
    return query.gte('target_month', `${scope.year}-01-01`).lt('target_month', `${Number(scope.year) + 1}-01-01`);
  }
  if (scope.mode === 'all') return query;

  const current = kstParts(now);
  return query.gte('target_month', `${current.year}-01-01`).lt('target_month', `${current.year + 1}-01-01`);
}

export async function buildAsanTransportHistoryRagContext({
  supabase,
  userText = '',
  searchTerms = [],
  now = new Date(),
  maxRows = DEFAULT_MAX_ROWS,
} = {}) {
  const intent = parseAsanTransportHistoryIntent(userText, { searchTerms, now });
  if (!intent.shouldQuery) {
    return { shouldQuery: false, success: false, text: '', intent };
  }

  if (!supabase) {
    return {
      shouldQuery: true,
      success: false,
      intent,
      text: '\n\n## 아산지점 운송내역\n> [조회 실패] 사내 데이터베이스 연결이 설정되지 않았습니다.',
    };
  }

  try {
    let query = supabase
      .from('branch_transport_history')
      .select('id,branch_id,target_month,sheet_name,headers,source_headers,data,row_count,valid_row_count,file_modified_at,updated_at,metadata')
      .eq('branch_id', 'asan')
      .order('target_month', { ascending: false })
      .order('sheet_name', { ascending: true })
      .limit(DEFAULT_MAX_MONTHS);

    query = applyTransportHistoryScope(query, intent.dateScope, now);

    const { data, error } = await query;
    if (error) {
      return {
        shouldQuery: true,
        success: false,
        intent,
        error,
        text: `\n\n## 아산지점 운송내역\n> [조회 실패] ${error.message || String(error)}`,
      };
    }

    const rag = buildAsanTransportHistoryRagText(data || [], intent, { maxRows });
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
      text: `\n\n## 아산지점 운송내역\n> [조회 실패] ${error?.message || String(error)}`,
    };
  }
}
