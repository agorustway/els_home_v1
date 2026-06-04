import {
  buildTransportHistoryRowsPage,
  normalizeTransportHistoryHeaders,
  normalizeTransportHistoryMonth,
} from './asanTransportHistory.mjs';

const DEFAULT_MAX_ROWS = 50;
const DEFAULT_MAX_MONTHS = 18;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const BILLING_ROUTE_SELECT = [
  'scope_mode',
  'filter_year',
  'filter_month',
  'rank_order',
  'revenue_amount',
  'purchase_amount',
  'unit_profit',
  'sales_item',
  'region',
  'work_site',
  'carrier',
  'category',
  'pickup',
  'billing_pickup',
  'shipment',
  'type',
  'bill_to',
  'pay_to',
  'row_count',
  'revenue',
  'purchase',
  'profit',
  'period_start',
  'period_end',
].join(',');

const TRANSPORT_HISTORY_TRIGGER_WORDS = [
  '운송내역', '운송 내역', '운송이력', '운송 이력',
  '수출리스트', '수출 리스트', '출차', '청구금액', '청구 금액',
];

const BILLING_LOOKUP_TRIGGER_WORDS = [
  '청구', '청구금액', '청구 금액', '금액', '매출', '하불', '매입',
  '손익', '이익', '운임', '마감', '정산', '계산서',
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

function formatWon(value) {
  const amount = Number(String(value ?? '').replace(/[,원\s]/g, ''));
  if (!Number.isFinite(amount) || amount === 0) return '미기록';
  return `${amount.toLocaleString('ko-KR')}원`;
}

function isMeaningfulAmount(value) {
  return Number(String(value ?? '').replace(/[,원\s]/g, '')) > 0;
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

function getDistinctColumnValues(headers = [], rows = [], candidates = [], limit = 8) {
  const indices = Array.from(new Set(
    candidates
      .map((candidate) => findHeaderIndex(headers, [candidate]))
      .filter((idx) => idx >= 0),
  ));
  if (!indices.length) return [];
  const values = [];
  const seen = new Set();
  rows.forEach((row) => {
    indices.forEach((idx) => {
      const value = cleanText(row?.[idx]);
      const compact = normalizeCompact(value);
      if (!compact || seen.has(compact)) return;
      seen.add(compact);
      values.push(value);
    });
  });
  return values.slice(0, limit);
}

function hasBillingLookupIntent(userText = '', intent = {}) {
  const compact = normalizeCompact(userText);
  if (BILLING_LOOKUP_TRIGGER_WORDS.some((word) => compact.includes(normalizeCompact(word)))) return true;
  return (intent.searchTerms || []).some((term) => (
    BILLING_LOOKUP_TRIGGER_WORDS.some((word) => normalizeCompact(term).includes(normalizeCompact(word)))
  ));
}

function sanitizeLikeTerm(value) {
  return cleanText(value)
    .replace(/[%,*()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

function uniqueTerms(values = [], limit = 8) {
  const terms = [];
  const seen = new Set();
  values.forEach((value) => {
    const term = sanitizeLikeTerm(value);
    const compact = normalizeCompact(term);
    if (!compact || compact.length < 2 || seen.has(compact)) return;
    if (isDateLikeTerm(compact)) return;
    seen.add(compact);
    terms.push(term);
  });
  return terms.slice(0, limit);
}

function buildBillingLookupSeed(headers = [], rows = [], intent = {}) {
  const searchTerms = uniqueTerms(intent.searchTerms || [], 8);
  const workSites = uniqueTerms([
    ...getDistinctColumnValues(headers, rows, ['작업지', '현장', '상차지'], 8),
    ...searchTerms.filter((term) => /[가-힣A-Za-z]/.test(term)),
  ], 10);
  const companies = uniqueTerms(getDistinctColumnValues(headers, rows, ['업체명', '운송사', '지급처', '하불처'], 8), 8);
  const pickups = uniqueTerms(getDistinctColumnValues(headers, rows, ['픽업', '청구픽업', '청구 픽업', '하차지', '선적지', '포트', '도착지'], 10), 10);
  const types = uniqueTerms(getDistinctColumnValues(headers, rows, ['TYPE', '타입', '규격'], 5), 5);
  return {
    searchTerms,
    workSites,
    companies,
    pickups,
    types,
  };
}

function compactIncludesAny(value, terms = []) {
  const compactValue = normalizeCompact(value);
  return terms.some((term) => {
    const compactTerm = normalizeCompact(term);
    return compactTerm && compactValue.includes(compactTerm);
  });
}

function rowMatchesAny(row = {}, fields = [], terms = []) {
  return fields.some((field) => compactIncludesAny(row[field], terms));
}

function billingScopeScore(row = {}, target = {}) {
  const year = Number(target.year || 0);
  const month = Number(target.month || 0);
  if (row.scope_mode === 'month' && Number(row.filter_year) === year && Number(row.filter_month) === month) return 36;
  if (row.scope_mode === 'year' && Number(row.filter_year) === year) return 28;
  if (row.scope_mode === 'all') return 24;
  if (row.scope_mode === 'month' && Number(row.filter_year) === year) return 18;
  return 4;
}

function monthIndex(value = '') {
  const match = String(value || '').match(/^(20\d{2})-(\d{1,2})$/);
  if (!match) return 0;
  return Number(match[1]) * 12 + Number(match[2]);
}

function billingRecencyScore(row = {}, target = {}) {
  if (!target.year || !target.month || !row.period_end) return 0;
  const targetIndex = Number(target.year) * 12 + Number(target.month);
  const endIndex = monthIndex(row.period_end);
  if (!endIndex) return 0;
  const diff = targetIndex - endIndex;
  if (diff < 0) return 4;
  if (diff === 0) return 18;
  if (diff === 1) return 16;
  if (diff === 2) return 10;
  if (diff === 3) return 4;
  return -12;
}

function scoreBillingRouteRow(row = {}, seed = {}, target = {}) {
  let score = 0;
  if (rowMatchesAny(row, ['work_site'], seed.workSites)) score += 70;
  if (rowMatchesAny(row, ['carrier', 'pay_to'], seed.companies)) score += 54;
  if (rowMatchesAny(row, ['pickup'], seed.pickups)) score += 34;
  else if (rowMatchesAny(row, ['billing_pickup', 'shipment'], seed.pickups)) score += 12;
  if (rowMatchesAny(row, ['type'], seed.types)) score += 10;
  if (rowMatchesAny(row, ['work_site', 'carrier', 'pay_to', 'bill_to'], seed.searchTerms)) score += 10;
  score += billingScopeScore(row, target);
  score += billingRecencyScore(row, target);
  score += Math.min(Number(row.row_count || 0), 120) / 10;
  if (isMeaningfulAmount(row.revenue_amount)) score += 8;
  if (isMeaningfulAmount(row.purchase_amount)) score += 3;
  return score;
}

function dedupeBillingRoutes(rows = []) {
  const result = [];
  const seen = new Set();
  rows.forEach((row) => {
    const key = [
      row.scope_mode,
      row.filter_year,
      row.filter_month,
      row.revenue_amount,
      row.purchase_amount,
      normalizeCompact(row.work_site),
      normalizeCompact(row.carrier || row.pay_to),
      normalizeCompact(row.pickup),
      normalizeCompact(row.billing_pickup),
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    result.push(row);
  });
  return result;
}

function targetPeriodFromIntent(intent = {}) {
  const scope = intent.dateScope || {};
  if (scope.month) {
    return {
      year: Number(String(scope.month).slice(0, 4)),
      month: Number(String(scope.month).slice(5, 7)),
    };
  }
  if (scope.year) return { year: Number(scope.year), month: 0 };
  return { year: 0, month: 0 };
}

function buildOrFilter(fields = [], terms = []) {
  const parts = [];
  fields.forEach((field) => {
    terms.forEach((term) => {
      const safeTerm = sanitizeLikeTerm(term);
      if (normalizeCompact(safeTerm).length < 2) return;
      parts.push(`${field}.ilike.%${safeTerm}%`);
    });
  });
  return parts.slice(0, 24).join(',');
}

async function fetchBillingRouteRows(supabase, seed = {}, target = {}) {
  const errors = [];
  const attempts = [
    {
      fields: ['work_site'],
      terms: uniqueTerms([...seed.workSites, ...seed.searchTerms], 8),
      limit: 180,
    },
    {
      fields: ['work_site', 'carrier', 'pay_to', 'bill_to', 'pickup', 'billing_pickup', 'shipment'],
      terms: uniqueTerms([...seed.workSites, ...seed.companies, ...seed.pickups, ...seed.searchTerms], 10),
      limit: 220,
    },
  ];
  const rows = [];

  for (const attempt of attempts) {
    const orFilter = buildOrFilter(attempt.fields, attempt.terms);
    if (!orFilter) continue;
    let query = supabase
      .from('branch_performance_monthly_route_unit_amount_cache')
      .select(BILLING_ROUTE_SELECT)
      .eq('branch_id', 'asan')
      .in('scope_mode', ['month', 'year', 'all'])
      .order('row_count', { ascending: false })
      .limit(attempt.limit);
    query = query.or(orFilter);
    const { data, error } = await query;
    if (error) {
      errors.push(error.message || String(error));
      continue;
    }
    rows.push(...(data || []));
    if (rows.length) break;
  }

  const ranked = dedupeBillingRoutes(rows)
    .map((row) => ({ ...row, match_score: scoreBillingRouteRow(row, seed, target) }))
    .filter((row) => row.match_score >= 70)
    .sort((a, b) => b.match_score - a.match_score || Number(b.row_count || 0) - Number(a.row_count || 0))
    .slice(0, 8);

  return { rows: ranked, errors };
}

function pickRowData(rowData = {}, candidates = []) {
  for (const key of candidates) {
    const value = cleanText(rowData?.[key]);
    if (value) return value;
  }
  return '';
}

function normalizeExactBillingRow(row = {}, container = '') {
  const rowData = row.row_data || {};
  return {
    container: container || pickRowData(rowData, ['C/Tn', 'CONTAINER', '컨테이너']),
    work_site: pickRowData(rowData, ['작업지', '상차지', '현장']),
    carrier: pickRowData(rowData, ['운송사(명의)', '지급처', '하불처', '운송사']),
    vehicle: pickRowData(rowData, ['영업넘버', '차량번호', '차번']),
    pickup: pickRowData(rowData, ['픽업', '청구픽업', '하차', '선적']),
    shipment: pickRowData(rowData, ['선적', '선적지']),
    type: pickRowData(rowData, ['TYPE', '타입', '규격']),
    revenue_amount: parseAmount(pickRowData(rowData, ['청구', '청구금액', '청구액', '매출금액'])),
    purchase_amount: parseAmount(pickRowData(rowData, ['하불', '하불금액', '매입금액', '지급금액'])),
    profit_amount: parseAmount(pickRowData(rowData, ['손익', '이익', '마진'])),
    work_date: pickRowData(rowData, ['작업일자', '작업일', '날짜']),
    file_path: row.file_path || '',
    sheet_name: row.sheet_name || '',
    row_index: row.row_index,
    year_value: row.year_value,
    month_value: row.month_value,
  };
}

async function fetchExactBillingRows(supabase, intent = {}) {
  const containers = (intent.containers || []).slice(0, 6);
  if (!containers.length) return { rows: [], errors: [] };
  const errors = [];
  const results = await Promise.all(containers.map(async (container) => {
    let query = supabase
      .from('branch_performance_rows')
      .select('file_path,sheet_name,row_index,year_value,month_value,row_data,search_text')
      .eq('branch_id', 'asan')
      .eq('dataset_type', 'monthly')
      .ilike('search_text', `%${container}%`)
      .limit(8);
    const target = targetPeriodFromIntent(intent);
    if (target.year) query = query.eq('year_value', target.year);
    const { data, error } = await query;
    if (error) {
      errors.push(error.message || String(error));
      return [];
    }
    return (data || []).map((row) => normalizeExactBillingRow(row, container));
  }));
  return {
    rows: results.flat().filter((row) => isMeaningfulAmount(row.revenue_amount) || isMeaningfulAmount(row.purchase_amount)).slice(0, 12),
    errors,
  };
}

export async function fetchAsanTransportHistoryBillingMatches({
  supabase,
  userText = '',
  intent = {},
  headers = [],
  rows = [],
} = {}) {
  if (!supabase || !hasBillingLookupIntent(userText, intent) || !rows.length) {
    return { exactRows: [], routeRows: [], errors: [], lookupSeed: buildBillingLookupSeed(headers, rows, intent) };
  }

  const lookupSeed = buildBillingLookupSeed(headers, rows, intent);
  const target = targetPeriodFromIntent(intent);
  const [exact, route] = await Promise.all([
    fetchExactBillingRows(supabase, intent),
    fetchBillingRouteRows(supabase, lookupSeed, target),
  ]);

  return {
    exactRows: exact.rows,
    routeRows: route.rows,
    errors: [...exact.errors, ...route.errors],
    lookupSeed,
    target,
  };
}

function billingRouteLabel(row = {}) {
  return [
    cleanText(row.work_site),
    cleanText(row.carrier || row.pay_to),
    cleanText(row.pickup || row.billing_pickup),
    cleanText(row.shipment),
    cleanText(row.type),
  ].filter(Boolean).join(' / ');
}

function billingPeriodLabel(row = {}) {
  if (row.scope_mode === 'month') return `${row.filter_year}-${String(row.filter_month).padStart(2, '0')}`;
  if (row.scope_mode === 'year') return `${row.filter_year}년`;
  return `${row.period_start || '-'}~${row.period_end || '-'}`;
}

function buildBillingCrossLookupText(matches = {}) {
  const exactRows = matches.exactRows || [];
  const routeRows = matches.routeRows || [];
  const errors = matches.errors || [];
  if (!exactRows.length && !routeRows.length && !errors.length) return '';

  let text = `### 금액 교차 조회\n`;
  text += `- 운송내역 원장 청구금액 칸이 비어 있어도, 실적관리 행과 월간 구간단가 캐시에서 같은 작업지·운송사·픽업·선적 조건을 추가 조회했다.\n`;
  if (exactRows.length) {
    text += `- 정확 컨테이너 매칭:\n`;
    exactRows.slice(0, 6).forEach((row) => {
      text += `  - ${row.container}: 청구 ${formatWon(row.revenue_amount)} / 하불 ${formatWon(row.purchase_amount)} / 작업지 ${row.work_site || '-'} / 운송사 ${row.carrier || '-'} / 차량 ${row.vehicle || '-'} / 기준 ${row.year_value || '-'}년 ${row.month_value || '-'}월 ${row.sheet_name || ''} ${row.row_index ? `행${row.row_index}` : ''}\n`;
    });
  }
  if (routeRows.length) {
    text += `- 구간단가 후보:\n`;
    routeRows.slice(0, 6).forEach((row, idx) => {
      text += `  - 후보${idx + 1}: ${billingRouteLabel(row) || '-'} / 청구 ${formatWon(row.revenue_amount)} / 하불 ${formatWon(row.purchase_amount)} / 손익 ${formatWon(row.unit_profit)} / ${billingPeriodLabel(row)} / 표본 ${Number(row.row_count || 0).toLocaleString('ko-KR')}건\n`;
    });
  }
  if (errors.length) {
    text += `- 일부 금액 교차 조회 오류: ${errors.slice(0, 2).join(' / ')}\n`;
  }
  text += `> [금액 해석 규칙] 청구금액/매출/운임 질문에서 운송내역 원장 칸이 공란이라도 위 교차 조회 금액이 있으면 "확인 불가"로 끝내지 말고, 해당 후보 금액과 기준 기간을 먼저 답하라. 단, 운송내역 원장 자체의 청구금액 칸은 공란이라는 점도 함께 말하라.\n`;
  return text;
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
  const billingCrossText = buildBillingCrossLookupText(options.billingMatches || {});
  const hasBillingMatches = Boolean((options.billingMatches?.exactRows || []).length || (options.billingMatches?.routeRows || []).length);
  let amountLabel = '청구금액 컬럼 미탐지';
  if (amountIdx >= 0 && !amountValues.length && hasBillingMatches) {
    amountLabel = '청구금액 칸 공란 / 실적관리·구간단가 교차 조회 후보 있음';
  } else if (amountIdx >= 0 && !amountValues.length) {
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
  if (billingCrossText) text += billingCrossText;

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

    const preview = buildTransportHistoryRowsPage((data || []).map(normalizeRecord), {
      limit: Math.max(maxRows, 80),
      offset: 0,
      search: (intent.searchTerms || []).join(','),
      date: intent.dateScope?.mode === 'day' ? intent.dateScope.day : '',
    });
    const billingMatches = await fetchAsanTransportHistoryBillingMatches({
      supabase,
      userText,
      intent,
      headers: preview.headers || [],
      rows: preview.data || [],
    });
    const rag = buildAsanTransportHistoryRagText(data || [], intent, { maxRows, billingMatches });
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
