import {
  buildDispatchDetailLines,
  summarizeDispatchDetailLines,
} from './asanDispatchDetailLines.mjs';
import {
  buildGlapsDispatchRouteFingerprints,
  buildGlapsRouteFingerprint,
  normalizeGlapsKey,
} from './glapsMasterData.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_MAX_DETAIL_ROWS = 600;

const DISPATCH_TRIGGER_WORDS = [
  '배차', '배차판', '매차', '오늘배차', '아산배차',
  '상세배차', '상세 배차', '상세라인', '상세 라인',
  '몇대', '몇 대', '대수', '대 예정', '대예정',
  '오더', '상차', '도착시간', '도착 시간',
];

const DETAIL_TRIGGER_WORDS = [
  '상세배차', '상세 배차', '상세라인', '상세 라인',
  'bkg', '부킹', 'glaps', '운송경로코드', '운송경로', '경로확인', '상세현황',
];

const STRUCTURE_TRIGGER_WORDS = [
  '작업지', '화주', '담당자', '고객사', '국가', '포트', '도착항',
  '선사', '라인', '배차정보', '특이사항', '비고', '상차지',
];

const REGION_WORDS = [
  '기타', '기타/철송', '아산', '부산', '신항', '인천', '광양',
  '평택', '중부', '부곡', '울산', '당진', '천안',
];

const CARRIER_HINT_WORDS = [
  '이지', '신승', '대신', '자차', 'css', '동원', '보송', '오성',
  '천지', '명진', '한진', '동방', '로컬',
];

const TYPE_ALIASES = {
  mobis: ['모비스', '모비스as', 'mobis', 'mobisas'],
  glovis: ['글로비스', '글로비스kd', '글로비스kd외', 'glovis', 'kd외'],
};

const NON_REGION_HEADERS = new Set([
  '순번', '담당자', '당당자', '운송사', '화주', '작업지', '운송지', '보관소',
  '포트', '도착지', '도착항', '국가', '국가명', '오더', '오더(계)', '계',
  '수량', '배차정보', '비고', '특이사항', 't', 'type', '규격', '유형',
  '구분', '작업', '고객사', '선적', '라인', '선사', '선사명', '배차예정',
  '배차', '검증', 'bkg1', 'bkg2', 'bkg3', 'targetvessel', 'target vessel',
  '차량번호', '고객사(국가)', '포트(도착항)', '특이사항(nomi,구간)',
  'code', 'nomi,구간', 'nomi구간', 'bookingno/invoiceno', 'bookingno',
  'invoiceno', '추가', '툭이사항', '함축', 'a', 'b',
]);

const REGION_BLOCK_TERMINATORS = new Set([
  '배차', '검증', '비고', '특이사항', '툭이사항', '함축',
]);

const NON_CARRIER_WORDS = [
  '캔슬', '완료', '미정', '착', '가이드', '추천', '메모', '문자수신',
  '차량번호', '미배차', '확인', 'nan', 'none', '수출', '수입', '로컬',
  '포장', '분해', '작업지', '오더', '합계', '소계',
];

const IGNORE_TERMS = new Set([
  '아산지점', '아산배차', '배차', '배차판', '매차', '도착', '도착시간',
  '시간', '몇시', '몇대', '대수', '총대수', '주차별', '오더', '개수',
  '건수', '알려줘', '알려줘요', '어디야', '어디지', '어디냐', '정보',
  '어디', '어느', '좀', '부탁', '부탁해', '확인해줘', '확인해',
  '총', '합계', '전체', '수량', '현황', '몇', '내역', '확인', '조회',
  '오늘', '내일', '모레', '내일모레', '글피', '그글피', '어제', '그제', '이번주', '다음주', '지난주', '금주',
  '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
  '월', '화', '수', '목', '금', '토', '일',
  '작업', '작업지', '작업지는', '작업지야', '화주', '담당자', '고객사', '포트',
  '도착항', '상차지', '상차', '배차정보', '특이사항', '비고',
  '업체', '업체별', '운송사', '운송사별', '실행사', '실행사별',
  '지역별', '상차지별', '상차지역별', '픽업지역별', '상차지별수량',
  '상차지별배차', '지역별수량', '지역별배차',
  '상세배차', '상세라인', '상세현황', 'glaps', 'glaps코드', '코드',
  '운송경로코드', '최종코드', '부킹', 'bkg',
  '경로', '운송경로', '경로확인', '안되는', '안됨', '안돼', '안되',
  '누락', '미도출', '미확인', '조정필요',
]);

const WEEKDAYS = [
  ['일요일', 0],
  ['월요일', 1],
  ['화요일', 2],
  ['수요일', 3],
  ['목요일', 4],
  ['금요일', 5],
  ['토요일', 6],
];

function normalizeCompact(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function normalizeHeader(value) {
  return normalizeCompact(value).replace(/[()]/g, '');
}

function toKstDate(now = new Date()) {
  const base = now instanceof Date ? now : new Date(now);
  return new Date(base.getTime() + KST_OFFSET_MS);
}

function formatYmd(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysYmd(ymd, days) {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(date);
}

function monthBounds(year, month) {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

function weekBounds(todayYmd, offsetWeeks = 0) {
  const date = new Date(`${todayYmd}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const mondayDiff = (day === 0 ? -6 : 1 - day) + (offsetWeeks * 7);
  const start = addDaysYmd(todayYmd, mondayDiff);
  return { start, end: addDaysYmd(start, 6) };
}

function validDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function parseDateScope(text, now) {
  const normalized = String(text || '').normalize('NFKC');
  const compact = normalizeCompact(normalized);
  const kstNow = toKstDate(now);
  const today = formatYmd(kstNow);
  const currentYear = kstNow.getUTCFullYear();

  const dateMatch = normalized.match(/(?:(20\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?/)
    || normalized.match(/(?:(20\d{2})\s*[./\-\s])?(\d{1,2})\s*[./-]\s*(\d{1,2})(?!\d)/);

  if (dateMatch) {
    const year = dateMatch[1] || currentYear;
    const month = dateMatch[2];
    const day = dateMatch[3];
    if (validDateParts(year, month, day)) {
      const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        mode: 'day',
        explicit: true,
        targetDates: [ymd],
        start: ymd,
        end: ymd,
        label: `${String(month).padStart(2, '0')}월 ${String(day).padStart(2, '0')}일`,
      };
    }
  }

  if (compact.includes('모레') || compact.includes('내일모레')) {
    const ymd = addDaysYmd(today, 2);
    return { mode: 'day', explicit: true, targetDates: [ymd], start: ymd, end: ymd, label: `모레(${ymd})` };
  }

  if (compact.includes('그글피')) {
    const ymd = addDaysYmd(today, 4);
    return { mode: 'day', explicit: true, targetDates: [ymd], start: ymd, end: ymd, label: `그글피(${ymd})` };
  }

  if (compact.includes('글피')) {
    const ymd = addDaysYmd(today, 3);
    return { mode: 'day', explicit: true, targetDates: [ymd], start: ymd, end: ymd, label: `글피(${ymd})` };
  }

  if (compact.includes('내일')) {
    const ymd = addDaysYmd(today, 1);
    return { mode: 'day', explicit: true, targetDates: [ymd], start: ymd, end: ymd, label: `내일(${ymd})` };
  }

  if (compact.includes('어제')) {
    const ymd = addDaysYmd(today, -1);
    return { mode: 'day', explicit: true, targetDates: [ymd], start: ymd, end: ymd, label: `어제(${ymd})` };
  }

  if (compact.includes('오늘')) {
    return { mode: 'day', explicit: true, targetDates: [today], start: today, end: today, label: `오늘(${today})` };
  }

  if (compact.includes('다음주')) {
    const range = weekBounds(today, 1);
    return { mode: 'range', explicit: true, targetDates: [], ...range, label: `다음주(${range.start}~${range.end})` };
  }

  if (compact.includes('지난주') || compact.includes('전주')) {
    const range = weekBounds(today, -1);
    return { mode: 'range', explicit: true, targetDates: [], ...range, label: `지난주(${range.start}~${range.end})` };
  }

  if (compact.includes('이번주') || compact.includes('금주')) {
    const range = weekBounds(today, 0);
    return { mode: 'range', explicit: true, targetDates: [], ...range, label: `이번주(${range.start}~${range.end})` };
  }

  for (const [name, dayNo] of WEEKDAYS) {
    if (!compact.includes(name)) continue;
    const currentDay = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const diff = dayNo - currentDay;
    const ymd = addDaysYmd(today, diff);
    return { mode: 'day', explicit: true, targetDates: [ymd], start: ymd, end: ymd, label: `${name}(${ymd})` };
  }

  const monthMatch = normalized.match(/(?:(20\d{2})\s*년\s*)?(\d{1,2})\s*월(?!\s*\d{1,2}\s*일)/);
  if (monthMatch) {
    const year = monthMatch[1] || currentYear;
    const month = Number(monthMatch[2]);
    if (month >= 1 && month <= 12) {
      const range = monthBounds(year, month);
      return {
        mode: 'month',
        explicit: true,
        targetDates: [],
        ...range,
        year: Number(year),
        month,
        label: `${String(month).padStart(2, '0')}월 전체`,
      };
    }
  }

  const start = addDaysYmd(today, -3);
  const end = addDaysYmd(today, 3);
  return { mode: 'range', explicit: false, targetDates: [], start, end, label: `오늘 기준 ±3일(${start}~${end})` };
}

function extractFilterHour(text) {
  const match = String(text || '').normalize('NFKC').match(/(?:^|[^\d])([01]?\d|2[0-3])\s*(?:시|:)/);
  return match ? String(Number(match[1])).padStart(2, '0') : null;
}

function tokenize(text) {
  return Array.from(new Set(
    String(text || '')
      .normalize('NFKC')
      .match(/[가-힣A-Za-z0-9_()./-]+/g) || [],
  ));
}

function stripKoreanParticle(term) {
  return String(term || '')
    .replace(/[?!.:,;]+$/g, '')
    .replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|야|요|죠|지|냐|니|다)$/g, '');
}

function isDateLikeTerm(term) {
  const compact = normalizeCompact(term);
  return /^\d{1,2}월\d{0,2}일?$/.test(compact)
    || /^\d{1,2}[./-]\d{1,2}일?$/.test(compact)
    || /^\d{1,2}[월일]$/.test(compact)
    || /^\d{1,2}시/.test(compact)
    || /^\d{1,2}:\d{1,2}/.test(compact)
    || /^20\d{2}년?$/.test(compact)
    || /^\d+대$/.test(compact);
}

function isDispatchCompoundTerm(compact, hints = []) {
  if (!compact || !/(배차판|배차|매차)$/.test(compact)) return false;
  const withoutTrigger = compact.replace(/(배차판|배차|매차)$/g, '');
  if (!withoutTrigger || IGNORE_TERMS.has(withoutTrigger)) return true;
  return hints.some((hint) => withoutTrigger === normalizeCompact(hint));
}

function detectTypeFilters(text) {
  const compact = normalizeCompact(text);
  return Object.entries(TYPE_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => compact.includes(normalizeCompact(alias))))
    .map(([type]) => type);
}

function detectQuantityMetric(text) {
  const compact = normalizeCompact(text);
  const asksOrder = compact.includes('오더') || compact.includes('주문');
  const asksDispatch = compact.includes('배차') || compact.includes('매차') || compact.includes('상차');
  if (asksOrder && asksDispatch) return 'both';
  if (asksOrder) return 'order';
  return 'dispatch';
}

function detectGroupBy(text) {
  const compact = normalizeCompact(text);
  const groups = [];
  if (/(상차지|상차지역|픽업지역|지역)별/.test(compact)) groups.push('region');
  if (/(업체|운송사|실행사)별/.test(compact)) groups.push('carrier');
  return groups;
}

function detectDetailIssueFilters(text) {
  const compact = normalizeCompact(text);
  const hasMissingIntent = /(안되|안돼|안됨|안잡|안나|누락|미도출|미확인|조정필요|없는|없음|안되는)/.test(compact);
  const filters = [];
  if ((compact.includes('운송경로') || compact.includes('경로확인') || compact.includes('경로')) && hasMissingIntent) {
    filters.push('route');
  }
  if (compact.includes('상차지') && hasMissingIntent) filters.push('start');
  if ((compact.includes('포트') || compact.includes('도착항')) && hasMissingIntent) filters.push('port');
  if ((compact.includes('선사') || compact.includes('라인')) && hasMissingIntent) filters.push('line');
  if ((compact.includes('타입') || compact.includes('규격')) && hasMissingIntent) filters.push('type');
  if ((compact.includes('운송사') || compact.includes('업체')) && hasMissingIntent) filters.push('carrier');
  if ((compact.includes('컨샤이니') || compact.includes('consignee')) && hasMissingIntent) filters.push('consignee');
  if ((compact.includes('화주사') || compact.includes('화주')) && hasMissingIntent) filters.push('shipper');
  if ((compact.includes('오더구분') || compact.includes('수출입')) && hasMissingIntent) filters.push('orderType');
  if (compact.includes('glaps') && hasMissingIntent && filters.length === 0) {
    filters.push('route', 'port', 'line', 'type', 'carrier', 'consignee', 'shipper', 'orderType');
  }
  return [...new Set(filters)];
}

function isTypeTerm(compact) {
  return Object.values(TYPE_ALIASES)
    .flat()
    .some((alias) => compact === normalizeCompact(alias));
}

function isAggregationTerm(compact) {
  if (!compact) return false;
  if (IGNORE_TERMS.has(compact)) return true;
  return /(상차지|상차지역|픽업지역|지역|업체|운송사|실행사|작업지|시간대|선사|라인)(별|별수량|별배차|별현황)$/.test(compact)
    || /(별)(수량|배차|현황)?$/.test(compact) && /(상차|지역|업체|운송사|실행사|작업지|시간대|선사|라인)/.test(compact);
}

function isPureOperationalNumber(term) {
  const compact = normalizeCompact(term);
  if (!/^\d+$/.test(compact)) return false;
  const n = Number(compact);
  return compact.length <= 4 || (n >= 2020 && n <= 2035);
}

function buildSpecificKeywords(text, inputTerms = []) {
  const rawTerms = [
    ...tokenize(text),
    ...(Array.isArray(inputTerms) ? inputTerms : []),
  ];
  const hints = [...REGION_WORDS, ...CARRIER_HINT_WORDS];
  for (const hint of hints) {
    if (normalizeCompact(text).includes(normalizeCompact(hint))) rawTerms.push(hint);
  }

  const hasGroupingAxis = /(상차지|상차지역|픽업지역|지역|업체|운송사|실행사|작업지|시간대|선사|라인)\s*별/.test(String(text || ''));
  const keepAsanRegion = !hasGroupingAxis && /아산\s*(칸|상차|지역)|아산칸/.test(String(text || ''));
  const keywords = [];
  const seen = new Set();

  for (const raw of rawTerms) {
    const stripped = stripKoreanParticle(raw);
    const compact = normalizeCompact(stripped);
    if (!compact || compact.length < 2) continue;
    if (IGNORE_TERMS.has(compact)) continue;
    if (isAggregationTerm(compact)) continue;
    if (isTypeTerm(compact)) continue;
    if (isDispatchCompoundTerm(compact, hints)) continue;
    if (compact.startsWith('작업지') || compact.startsWith('배차')) continue;
    if (compact === '아산' && !keepAsanRegion) continue;
    if (isDateLikeTerm(compact) || isPureOperationalNumber(compact)) continue;
    if (seen.has(compact)) continue;
    seen.add(compact);
    keywords.push(stripped);
  }

  return keywords;
}

function hasAnyWord(compactText, words) {
  return words.some((word) => compactText.includes(normalizeCompact(word)));
}

function hasStandaloneWorkNumber(text) {
  return (String(text || '').match(/\b\d{3,4}\b/g) || [])
    .some((num) => {
      const n = Number(num);
      return n >= 100 && !(n >= 2020 && n <= 2035);
    });
}

export function parseAsanDispatchIntent(userText = '', options = {}) {
  const text = String(userText || '');
  const userKwd = options.userKwd || text;
  const compact = normalizeCompact(userKwd);
  const dateScope = parseDateScope(text, options.now || new Date());
  const filterHour = extractFilterHour(text);
  const typeFilters = detectTypeFilters(text);
  const quantityMetric = detectQuantityMetric(text);
  const groupBy = detectGroupBy(text);
  const detailIssueFilters = detectDetailIssueFilters(text);
  const specificKeywords = buildSpecificKeywords(text, options.searchTerms || []);
  const hasDispatchTrigger = hasAnyWord(compact, DISPATCH_TRIGGER_WORDS);
  const hasStructureTrigger = hasAnyWord(compact, STRUCTURE_TRIGGER_WORDS);
  const hasRegionOrCarrier = hasAnyWord(compact, REGION_WORDS) || hasAnyWord(compact, CARRIER_HINT_WORDS);
  const hasCountIntent = /몇\s*(대|건)|몇대|몇건|총|합계|대수|건수|수량|현황|어디|어느|작업지/.test(text);
  const hasNumberHint = hasStandaloneWorkNumber(text);
  const hasAsanBranch = compact.includes('아산');

  const shouldQuery = hasDispatchTrigger
    || ((hasStructureTrigger || hasRegionOrCarrier) && (dateScope.explicit || filterHour || hasCountIntent || hasNumberHint || hasAsanBranch))
    || (dateScope.explicit && filterHour && hasCountIntent)
    || (dateScope.explicit && hasNumberHint && hasCountIntent);

  return {
    shouldQuery,
    dateScope,
    filterHour,
    typeFilters,
    quantityMetric,
    groupBy,
    detailIssueFilters,
    specificKeywords,
    hasDispatchTrigger,
    hasStructureTrigger,
    hasRegionOrCarrier,
  };
}

export function findHeaderIndex(headers = [], candidates = [], { partial = true } = {}) {
  const normalizedCandidates = candidates.map(normalizeHeader);

  for (const target of normalizedCandidates) {
    const idx = headers.findIndex((header) => normalizeHeader(header) === target);
    if (idx >= 0) return idx;
  }

  if (!partial) return -1;

  for (const target of normalizedCandidates) {
    const idx = headers.findIndex((header) => {
      const normalized = normalizeHeader(header);
      return normalized && normalized.includes(target);
    });
    if (idx >= 0) return idx;
  }

  return -1;
}

function normalizeHeaders(headers = [], type = '') {
  return headers.map((header) => {
    if (type === 'glovis' && (header === 'col_12' || header === 'T')) return 'TYPE';
    if (type === 'mobis' && header === 'col_15') return 'TYPE';
    return header;
  });
}

function shouldTreatAsKnownRegionHeader(header) {
  const normalized = normalizeHeader(header);
  if (!normalized || /^col_\d+$/i.test(String(header || ''))) return false;
  if (NON_REGION_HEADERS.has(normalized)) return false;
  return REGION_WORDS.some((region) => normalized.includes(normalizeHeader(region)));
}

function isRegionBlockTerminator(header) {
  const normalized = normalizeHeader(header);
  return REGION_BLOCK_TERMINATORS.has(normalized);
}

function findRegionColumnBlock(headers = []) {
  const startAnchor = headers.findIndex((header) => normalizeHeader(header) === '배차예정');
  if (startAnchor < 0) return null;

  let end = headers.length;
  for (let idx = startAnchor + 1; idx < headers.length; idx += 1) {
    const raw = String(headers[idx] || '').trim();
    if (/^col_\d+$/i.test(raw) || isRegionBlockTerminator(raw)) {
      end = idx;
      break;
    }
  }

  return { start: startAnchor + 1, end };
}

function looksLikeCarrierCell(cell) {
  const value = String(cell || '').trim();
  if (!value || ['0', 'nan', 'none', '-'].includes(value.toLowerCase())) return false;
  if (NON_CARRIER_WORDS.some((word) => normalizeCompact(value).includes(normalizeCompact(word)))) return false;
  if (parseCarrierCell(value).length === 0) return false;
  return /\d/.test(value)
    || /[,/;；|·]/.test(value)
    || CARRIER_HINT_WORDS.some((word) => normalizeCompact(value).includes(normalizeCompact(word)));
}

function inferRegionColumns(headers, rows = []) {
  const regionBlock = findRegionColumnBlock(headers);
  return headers
    .map((header, idx) => ({ name: String(header || '').trim(), index: idx }))
    .filter(({ name, index }) => {
      const normalized = normalizeHeader(name);
      if (!normalized || /^col_\d+$/i.test(name) || NON_REGION_HEADERS.has(normalized) || isRegionBlockTerminator(name)) {
        return false;
      }
      if (regionBlock && (index < regionBlock.start || index >= regionBlock.end)) return false;
      if (shouldTreatAsKnownRegionHeader(name)) return true;

      let carrierLikeCells = 0;
      for (const row of rows.slice(0, 80)) {
        if (looksLikeCarrierCell(row?.[index])) carrierLikeCells += 1;
        if (carrierLikeCells >= 1) return true;
      }
      return false;
    });
}

function buildSchema(headers, type, rows = []) {
  const normalizedHeaders = normalizeHeaders(headers, type);
  const orderIdx = type === 'mobis'
    ? findHeaderIndex(normalizedHeaders, ['계', '오더(계)', '수량', '오더'])
    : findHeaderIndex(normalizedHeaders, ['오더', '오더(계)', '계', '수량']);

  return {
    headers: normalizedHeaders,
    orderIdx,
    managerIdx: findHeaderIndex(normalizedHeaders, ['담당자', '당당자', '운송사', '화주']),
    worksiteIdx: findHeaderIndex(normalizedHeaders, ['작업지', '운송지', '보관소']),
    customerIdx: findHeaderIndex(normalizedHeaders, ['고객사(국가)', '고객사', '국가명', '국가']),
    portIdx: findHeaderIndex(normalizedHeaders, ['포트(CODE)', 'CODE', '포트(도착항)', '포트', '도착항', '도착지']),
    memoIdxs: normalizedHeaders
      .map((header, idx) => ({ header, idx }))
      .filter(({ header }) => /배차정보|비고|특이사항|도착|가이드/.test(String(header || '')))
      .map(({ idx }) => idx),
    regionCols: inferRegionColumns(normalizedHeaders, rows),
  };
}

function parseNumber(value) {
  const match = String(value || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) || 0 : 0;
}

function isNoiseCarrier(part) {
  const compact = normalizeCompact(part);
  return NON_CARRIER_WORDS.some((word) => compact.includes(normalizeCompact(word)));
}

export function parseCarrierCell(cell) {
  const value = String(cell || '').trim();
  if (!value || ['0', 'nan', 'none', '-'].includes(value.toLowerCase()) || value.includes('캔슬')) return [];

  return value
    .replace(/[;；|·]/g, ',')
    .split(/[,/]+|\.(?=[가-힣A-Za-z])|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      if (isNoiseCarrier(part)) return [];
      const count = parseNumber(part) || 1;
      const carrier = part
        .replace(/\d+(?:\.\d+)?/g, '')
        .replace(/[():：\s]/g, '')
        .replace(/대$/g, '')
        .trim();
      if (!carrier || isNoiseCarrier(carrier)) return [];
      return [{ carrier, count }];
    });
}

function getRowComments(comments = {}, rowIndex) {
  return Object.entries(comments || {})
    .filter(([key]) => key.startsWith(`${rowIndex}:`))
    .map(([, value]) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function rowCell(row, idx) {
  return idx >= 0 ? String(row[idx] || '').trim() : '';
}

function formatCount(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function hasHour(text, hour) {
  const target = Number(hour);
  if (!Number.isInteger(target)) return false;
  for (const match of String(text || '').normalize('NFKC').matchAll(/(?:^|[^\d])([01]?\d|2[0-3])(?=\s*(?:시|:|,|\/|\)|\]|$)|\s+)/g)) {
    if (Number(match[1]) === target) return true;
  }
  return false;
}

function buildRowInfo(record, row, rowIndex, schema) {
  const comments = getRowComments(record.comments, rowIndex);
  const orderRaw = rowCell(row, schema.orderIdx);
  if (/캔슬|cancel/i.test(orderRaw)) return null;

  const orderCount = parseNumber(orderRaw);
  const carrierItems = [];

  for (const col of schema.regionCols) {
    const carriers = parseCarrierCell(row[col.index]);
    for (const item of carriers) {
      carrierItems.push({ ...item, region: col.name });
    }
  }

  const dispatchCount = carrierItems.reduce((sum, item) => sum + item.count, 0);
  if (orderCount <= 0 && dispatchCount <= 0) return null;

  const meta = {
    manager: rowCell(row, schema.managerIdx),
    worksite: rowCell(row, schema.worksiteIdx),
    customer: rowCell(row, schema.customerIdx),
    port: rowCell(row, schema.portIdx),
  };

  if (/문자수신|차량번호/.test(meta.manager)) return null;

  const hasMetaIndex = [schema.managerIdx, schema.worksiteIdx, schema.customerIdx, schema.portIdx].some((idx) => idx >= 0);
  const hasMetaValue = Object.values(meta).some((value) => value && value.toLowerCase() !== 'nan');
  if (hasMetaIndex && !hasMetaValue) return null;

  const nonEmptyCells = schema.headers
    .map((header, idx) => {
      const value = rowCell(row, idx);
      if (!value || ['0', 'nan', 'none'].includes(value.toLowerCase())) return null;
      const hName = String(header || '').trim();
      const isJunk = (/^col_\d+$/i.test(hName) || ['A', 'B', '함축'].includes(hName))
        && !/BKG|TARGET/i.test(hName);
      if (isJunk) return null;
      const comment = record.comments?.[`${rowIndex}:${idx}`]
        ? ` (메모: ${String(record.comments[`${rowIndex}:${idx}`]).replace(/\s+/g, ' ')})`
        : '';
      return `[${hName}] ${value}${comment}`;
    })
    .filter(Boolean);

  const memoTexts = [
    ...schema.memoIdxs.map((idx) => rowCell(row, idx)).filter(Boolean),
    ...comments,
  ];

  return {
    targetDate: record.target_date,
    type: record.type,
    rowIndex,
    orderCount,
    dispatchCount,
    carrierItems,
    meta,
    memoTexts,
    rowText: [
      record.target_date,
      record.type,
      ...nonEmptyCells,
      ...carrierItems.map((item) => `${item.region} ${item.carrier} ${formatCount(item.count)}대`),
      ...comments.map((comment) => `메모 ${comment}`),
    ].join(' | '),
  };
}

function addMapCount(map, key, value) {
  if (!key || value <= 0) return;
  map[key] = (map[key] || 0) + value;
}

function ensureDateSummary(summary, date) {
  if (!summary.byDate[date]) {
    summary.byDate[date] = {
      rowCount: 0,
      orderCount: 0,
      dispatchCount: 0,
      byTypeOrders: {},
      byTypeDispatches: {},
      byCarrier: {},
      byRegion: {},
      timeLogs: [],
    };
  }
  return summary.byDate[date];
}

function createSummary() {
  return {
    rowCount: 0,
    orderCount: 0,
    dispatchCount: 0,
    byDate: {},
    byCarrier: {},
    byRegion: {},
  };
}

function addRowToSummary(summary, rowInfo) {
  summary.rowCount += 1;
  summary.orderCount += rowInfo.orderCount;
  summary.dispatchCount += rowInfo.dispatchCount;

  const dateSummary = ensureDateSummary(summary, rowInfo.targetDate);
  dateSummary.rowCount += 1;
  dateSummary.orderCount += rowInfo.orderCount;
  dateSummary.dispatchCount += rowInfo.dispatchCount;
  addMapCount(dateSummary.byTypeOrders, rowInfo.type, rowInfo.orderCount);
  addMapCount(dateSummary.byTypeDispatches, rowInfo.type, rowInfo.dispatchCount);

  for (const item of rowInfo.carrierItems) {
    addMapCount(summary.byCarrier, item.carrier, item.count);
    addMapCount(summary.byRegion, item.region, item.count);
    addMapCount(dateSummary.byCarrier, item.carrier, item.count);
    addMapCount(dateSummary.byRegion, item.region, item.count);
  }

  if (rowInfo.dispatchCount > 0 && rowInfo.carrierItems.length > 0 && rowInfo.memoTexts.some((text) => /\d/.test(text))) {
    const brief = rowInfo.carrierItems
      .map((item) => `${item.region} ${item.carrier} ${formatCount(item.count)}대`)
      .join(', ');
    const place = rowInfo.meta.worksite || rowInfo.meta.customer || rowInfo.meta.port || rowInfo.type;
    dateSummary.timeLogs.push(`${place}: ${brief} / 메모 ${rowInfo.memoTexts.join(' ')}`);
  }
}

function topMapText(map, limit = 10) {
  const entries = Object.entries(map || {}).sort((a, b) => b[1] - a[1]).slice(0, limit);
  return entries.length ? entries.map(([key, value]) => `${key}(${formatCount(value)}대)`).join(', ') : '없음';
}

function addSetValues(set, values = []) {
  values.forEach((value) => {
    if (value) set.add(value);
  });
}

function buildSchemaProfile(records = []) {
  const byType = {};

  for (const record of records) {
    const type = record.type || 'unknown';
    const schema = buildSchema(record.headers || [], type, record.data || []);
    if (!byType[type]) {
      byType[type] = {
        orderColumns: new Set(),
        portColumns: new Set(),
        regionColumns: new Set(),
        memoColumns: new Set(),
        metaColumns: new Set(),
      };
    }

    const bucket = byType[type];
    addSetValues(bucket.orderColumns, [schema.headers[schema.orderIdx]]);
    addSetValues(bucket.portColumns, [schema.headers[schema.portIdx]]);
    addSetValues(bucket.regionColumns, schema.regionCols.map((col) => col.name));
    addSetValues(bucket.memoColumns, schema.memoIdxs.map((idx) => schema.headers[idx]));
    addSetValues(bucket.metaColumns, [
      schema.headers[schema.managerIdx],
      schema.headers[schema.worksiteIdx],
      schema.headers[schema.customerIdx],
    ]);
  }

  return Object.entries(byType).map(([type, profile]) => ({
    type,
    orderColumns: [...profile.orderColumns],
    portColumns: [...profile.portColumns],
    regionColumns: [...profile.regionColumns],
    memoColumns: [...profile.memoColumns],
    metaColumns: [...profile.metaColumns],
  }));
}

function rowMatchesIntent(rowInfo, intent) {
  const lowerText = rowInfo.rowText.toLowerCase();
  const typeMatch = !intent.typeFilters?.length
    || intent.typeFilters.includes(String(rowInfo.type || '').toLowerCase());
  const keywordMatch = intent.specificKeywords.length === 0
    || intent.specificKeywords.every((kwd) => lowerText.includes(String(kwd).toLowerCase()));
  const hourMatch = !intent.filterHour
    || rowInfo.memoTexts.some((text) => hasHour(text, intent.filterHour));
  return typeMatch && keywordMatch && hourMatch;
}

function hasActiveIntentFilters(intent = {}) {
  return Boolean(intent.filterHour)
    || Boolean(intent.typeFilters?.length)
    || Boolean(intent.specificKeywords?.length)
    || Boolean(intent.detailIssueFilters?.length);
}

function buildAnswerSummaryText(summary, intent = {}, scopeLabel = '조회 범위 전체') {
  const metric = intent.quantityMetric || 'dispatch';
  const order = formatCount(summary.orderCount);
  const dispatch = formatCount(summary.dispatchCount);
  let text = `### 질문 즉답용 집계\n`;
  text += `- 기준: ${scopeLabel}\n`;

  if (metric === 'order') {
    text += `- 정답 후보: 오더 ${order}대 (실제 배차 ${dispatch}대)\n`;
  } else if (metric === 'both') {
    text += `- 정답 후보: 실제 배차 ${dispatch}대 / 오더 ${order}대\n`;
  } else {
    text += `- 정답 후보: 실제 배차 ${dispatch}대 (오더 ${order}대)\n`;
  }

  text += `- 지시: "총 몇 대 배차" 또는 "배차 몇 대" 질문은 실제 배차 ${dispatch}대를 첫 문장으로 답하라. 오더와 배차를 더하거나 섞지 마라.\n`;

  if (intent.groupBy?.includes('region')) {
    text += `- 상차지별 답변 자료: ${topMapText(summary.byRegion)}\n`;
  }
  if (intent.groupBy?.includes('carrier')) {
    text += `- 운송사별 답변 자료: ${topMapText(summary.byCarrier)}\n`;
  }

  return text;
}

function queryBuilderForIntent(supabase, intent) {
  let query = supabase
    .from('branch_dispatch')
    .select('target_date, type, headers, data, comments')
    .eq('branch_id', 'asan')
    .order('target_date', { ascending: false })
    .limit(5000);

  const scope = intent.dateScope;
  if (scope.mode === 'month') {
    query = query.like('target_date', `${scope.year}-${String(scope.month).padStart(2, '0')}-%`);
  } else if (scope.mode === 'day' && scope.targetDates.length === 1) {
    query = query.eq('target_date', scope.targetDates[0]);
  } else if (scope.targetDates.length > 1) {
    query = query.in('target_date', scope.targetDates);
  } else {
    query = query.gte('target_date', scope.start).lte('target_date', scope.end);
  }

  return query;
}

function buildNoDataText(intent, detail) {
  return `\n\n## 아산지점 배차판 (${intent.dateScope.label})\n`
    + `> [DB 미동기화/데이터 없음] ${detail}\n`
    + `> Supabase branch_dispatch 기준으로 조회했지만 해당 범위의 배차 데이터가 없습니다. 상세 내역은 [아산 배차판](/employees/branches/asan)에서 확인해 주세요.`;
}

export function buildAsanDispatchRagText(records = [], intent, options = {}) {
  const maxDetailRows = options.maxDetailRows || DEFAULT_MAX_DETAIL_ROWS;
  const sortedRecords = [...(records || [])].sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));
  const schemaProfile = buildSchemaProfile(sortedRecords);
  const overallSummary = createSummary();
  const matchedSummary = createSummary();
  const matchedRows = [];

  for (const record of sortedRecords) {
    const schema = buildSchema(record.headers || [], record.type || '', record.data || []);
    for (const [rowIndex, row] of (record.data || []).entries()) {
      const rowInfo = buildRowInfo(record, row, rowIndex, schema);
      if (!rowInfo) continue;
      addRowToSummary(overallSummary, rowInfo);
      if (rowMatchesIntent(rowInfo, intent)) {
        addRowToSummary(matchedSummary, rowInfo);
        if (matchedRows.length < maxDetailRows) {
          matchedRows.push(rowInfo);
        }
      }
    }
  }

  const loadedDates = [...new Set(sortedRecords.map((record) => record.target_date))].sort();
  const filterLabel = [
    ...(intent.typeFilters || []).map((type) => (type === 'mobis' ? '모비스' : (type === 'glovis' ? '글로비스' : type))),
    intent.filterHour ? `${intent.filterHour}시` : '',
    ...intent.specificKeywords,
  ].filter(Boolean).join(', ') || '전체';
  const hasActiveFilters = hasActiveIntentFilters(intent);
  const answerSummary = hasActiveFilters ? matchedSummary : overallSummary;
  const answerScopeLabel = hasActiveFilters ? `질문 조건(${filterLabel}) 매칭` : '조회 범위 전체';

  let text = `\n\n## 아산지점 배차판\n`;
  text += `[시스템: Supabase branch_dispatch / 레코드 ${sortedRecords.length}개 / 조회 범위 ${intent.dateScope.label} / 실제 날짜 ${loadedDates.join(', ') || '없음'} / 질문 필터 ${filterLabel}]\n`;
  text += buildAnswerSummaryText(answerSummary, intent, answerScopeLabel);
  text += `### 도표형 스키마(동적 추론)\n`;
  for (const profile of schemaProfile) {
    const typeLabel = profile.type === 'mobis' ? '모비스' : (profile.type === 'glovis' ? '글로비스' : profile.type);
    text += `- **${typeLabel}**: 오더 컬럼: ${profile.orderColumns.join(', ') || '미탐지'} / `;
    text += `포트(DIST) 컬럼: ${profile.portColumns.join(', ') || '미탐지'} / `;
    text += `픽업지역/상차지 컬럼: ${profile.regionColumns.join(', ') || '미탐지'} / `;
    text += `메모/시간 컬럼: ${profile.memoColumns.join(', ') || '미탐지'} / `;
    text += `기본정보 컬럼: ${profile.metaColumns.join(', ') || '미탐지'}\n`;
  }
  text += `### 날짜별 전체 현황\n`;

  for (const date of loadedDates) {
    const ds = overallSummary.byDate[date];
    if (!ds) continue;
    text += `- **${date}**: 오더 ${formatCount(ds.orderCount)}대 / 실제 배차 ${formatCount(ds.dispatchCount)}대`;
    text += ` (글로비스 오더 ${formatCount(ds.byTypeOrders.glovis || 0)}대, 모비스 오더 ${formatCount(ds.byTypeOrders.mobis || 0)}대`;
    text += ` / 글로비스 배차 ${formatCount(ds.byTypeDispatches.glovis || 0)}대, 모비스 배차 ${formatCount(ds.byTypeDispatches.mobis || 0)}대)\n`;
    const carriers = topMapText(ds.byCarrier, 8);
    if (carriers !== '없음') text += `  - 운송사별: ${carriers}\n`;
  }

  text += `- **조회 범위 전체**: 오더 ${formatCount(overallSummary.orderCount)}대 / 실제 배차 ${formatCount(overallSummary.dispatchCount)}대\n`;
  text += `- **운송사별 전체**: ${topMapText(overallSummary.byCarrier)}\n`;
  text += `- **상차지별 전체**: ${topMapText(overallSummary.byRegion)}\n`;

  text += `### 질문 조건 매칭 현황\n`;
  if (hasActiveFilters) {
    text += `- 조건: ${filterLabel}\n`;
    text += `- 매칭 행: ${matchedSummary.rowCount}건 / 오더 ${formatCount(matchedSummary.orderCount)}대 / 실제 배차 ${formatCount(matchedSummary.dispatchCount)}대\n`;
    text += `- 매칭 운송사: ${topMapText(matchedSummary.byCarrier)}\n`;
    text += `- 매칭 상차지: ${topMapText(matchedSummary.byRegion)}\n`;
  } else {
    text += `- 별도 필터 없음. 전체 현황과 상세 행을 기준으로 답변하라.\n`;
  }

  text += `\n> [해석 규칙] 오더(계)는 화주 요청량이고, 지역/상차지 컬럼의 업체명+숫자가 실제 배차 수량이다. 업체명 뒤 숫자는 차량 대수다.\n`;
  text += `> [해석 규칙] 셀 메모와 배차정보의 시간은 배차 시간 판단에 우선 사용한다. 데이터에 없는 운송사/지역/시간은 만들지 마라.\n`;
  text += `> [안내] 조회 범위를 벗어난 질문은 [아산지점 배차판](/employees/branches/asan) 직접 확인을 안내하라.\n`;

  if (matchedRows.length > 0) {
    text += `\n### 조건 매칭 상세 행\n`;
    for (const rowInfo of matchedRows) {
      const typeLabel = rowInfo.type === 'mobis' ? '모비스' : (rowInfo.type === 'glovis' ? '글로비스' : rowInfo.type);
      const carriers = rowInfo.carrierItems
        .map((item) => `${item.region} ${item.carrier} ${formatCount(item.count)}대`)
        .join(', ') || '배차 없음';
      const meta = [
        rowInfo.meta.manager ? `담당/화주 ${rowInfo.meta.manager}` : '',
        rowInfo.meta.worksite ? `작업지 ${rowInfo.meta.worksite}` : '',
        rowInfo.meta.customer ? `고객/국가 ${rowInfo.meta.customer}` : '',
        rowInfo.meta.port ? `포트 ${rowInfo.meta.port}` : '',
      ].filter(Boolean).join(' / ');
      const memo = rowInfo.memoTexts.length ? ` / 메모 ${rowInfo.memoTexts.join(' ')}` : '';
      text += `- [${rowInfo.targetDate} ${typeLabel} 행${rowInfo.rowIndex}] 오더 ${formatCount(rowInfo.orderCount)}대 / 배차 ${formatCount(rowInfo.dispatchCount)}대 / ${meta || '기본정보 없음'} / ${carriers}${memo}\n`;
    }
    if (matchedSummary.rowCount > matchedRows.length) {
      text += `- 상세 행은 ${matchedRows.length}건까지만 주입됨. 실제 매칭은 ${matchedSummary.rowCount}건이다.\n`;
    }
  } else if (overallSummary.rowCount > 0) {
    text += `\n> [조회 완료] ${filterLabel} 조건에 일치하는 배차 행이나 메모가 없습니다. 실제 DB 조회 결과 기준으로 0건이라고 답하라.\n`;
  }

  return {
    text,
    hasMatches: matchedRows.length > 0 || (!hasActiveFilters && overallSummary.rowCount > 0),
    loadedDates,
    overallSummary,
    matchedSummary,
  };
}

function shouldQueryDispatchDetail(userText = '') {
  const compact = normalizeCompact(userText);
  return DETAIL_TRIGGER_WORDS.some((word) => compact.includes(normalizeCompact(word)));
}

function detailLineSearchText(line = {}) {
  return [
    line.targetDate,
    line.type,
    line.workDate,
    line.direction,
    line.shipper,
    line.startLocation,
    line.startRegion,
    line.workplace,
    line.destination,
    line.customer,
    line.port,
    line.line,
    line.containerType,
    line.company,
    line.bkg1,
    line.bkg2,
    line.bkg3,
    line.targetVessel,
    line.note,
  ].filter(Boolean).join(' ').toLowerCase();
}

function detailLineMatchesIntent(line, intent) {
  const typeMatch = !intent.typeFilters?.length
    || intent.typeFilters.includes(String(line.type || '').toLowerCase());
  const haystack = detailLineSearchText(line);
  const keywordMatch = intent.specificKeywords.length === 0
    || intent.specificKeywords.every((kwd) => haystack.includes(String(kwd).toLowerCase()));
  return typeMatch && keywordMatch;
}

function detailLineMatchesIssueFilters(line, filters = []) {
  if (!filters?.length) return true;
  return filters.some((filterKey) => {
    if (filterKey === 'start') return Boolean(line.needsStartLocationSelection);
    if (filterKey === 'route') return Boolean(line.needsRouteCodeMapping);
    if (filterKey === 'orderType') return Boolean(line.needsOrderTypeCodeMapping);
    if (filterKey === 'shipper') return Boolean(line.needsShipperCodeMapping);
    if (filterKey === 'routePart') return Boolean(line.needsRoutePartCodeMapping);
    if (filterKey === 'port') return Boolean(line.needsPortCodeMapping);
    if (filterKey === 'line') return Boolean(line.needsLineCodeMapping);
    if (filterKey === 'type') return Boolean(line.needsTypeCodeMapping);
    if (filterKey === 'carrier') return Boolean(line.needsCarrierCodeMapping);
    if (filterKey === 'consignee') return Boolean(line.needsConsigneeCodeMapping);
    return false;
  });
}

function buildCodeMap(entries = [], pickValues) {
  const map = new Map();
  for (const entry of entries || []) {
    const code = String(entry?.glaps_code || entry?.glapsCode || '').trim();
    if (!code) continue;
    for (const value of pickValues(entry)) {
      const key = normalizeGlapsKey(value);
      if (key && !map.has(key)) map.set(key, code);
    }
  }
  return map;
}

function getCode(map, value) {
  return map?.get(normalizeGlapsKey(value)) || '';
}

function buildRouteMap(routes = []) {
  const map = new Map();
  for (const route of routes || []) {
    const keys = [
      route.route_fingerprint || route.routeFingerprint || '',
      buildGlapsRouteFingerprint({
        startLocationName: route.start_location_name || route.startLocationName || '',
        waypointElsName: route.waypoint_els_name || route.waypointElsName || '',
        waypointName: route.waypoint_name || route.waypointName || '',
        destinationName: route.destination_name || route.destinationName || '',
      }),
      ...buildGlapsDispatchRouteFingerprints({
        startLocationName: route.start_location_name || route.startLocationName || '',
        waypointElsName: route.waypoint_els_name || route.waypointElsName || '',
        waypointName: route.waypoint_name || route.waypointName || '',
        destinationName: route.destination_name || route.destinationName || '',
      }),
    ];
    keys.filter(Boolean).forEach((key) => {
      if (!map.has(key)) map.set(key, route);
    });
  }
  return map;
}

function getRoutePayload(route = {}, candidates = []) {
  const payload = route?.raw_payload || route?.rawPayload || {};
  for (const candidate of candidates) {
    const direct = payload[candidate];
    if (direct) return String(direct).trim();
    const found = Object.entries(payload).find(([key]) => normalizeGlapsKey(key) === normalizeGlapsKey(candidate));
    if (found?.[1]) return String(found[1]).trim();
  }
  return '';
}

function enrichDetailLinesWithGlaps(lines = [], glapsLookup = null) {
  if (!glapsLookup?.routes?.length && !glapsLookup?.aliases?.length) return lines;

  const routeMap = buildRouteMap(glapsLookup.routes || []);
  const aliases = glapsLookup.aliases || [];
  const codeMap = (aliasType) => buildCodeMap(
    aliases.filter((alias) => alias?.alias_type === aliasType),
    (alias) => [alias.source_name, alias.els_name, alias.glaps_name, alias.glaps_code],
  );
  const maps = {
    port: codeMap('port'),
    line: codeMap('line'),
    type: codeMap('container_type'),
    carrier: codeMap('carrier'),
    consignee: codeMap('consignee'),
  };

  return lines.map((line) => {
    const routeKeys = buildGlapsDispatchRouteFingerprints({
      startLocationName: line.startLocation || '',
      waypointElsName: line.workplace || '',
      destinationName: line.destination || '',
    });
    const glapsRoute = routeKeys.map((key) => routeMap.get(key)).find(Boolean) || null;
    const carrierCode = getCode(maps.carrier, 'ELS');
    const glapsPortCode = getCode(maps.port, line.port);
    const glapsLineCode = getCode(maps.line, line.line);
    const glapsTypeCode = getCode(maps.type, line.containerType);
    const glapsConsigneeCode = getCode(maps.consignee, line.customer);
    const glapsShipperCode = getRoutePayload(glapsRoute, ['화주사코드', '화주사']);
    const glapsWorkplaceCode = getRoutePayload(glapsRoute, ['경유지코드']);
    const glapsStartLocationCode = getRoutePayload(glapsRoute, ['반출지코드', '출발지코드', '상차지코드'])
      || glapsRoute?.start_location_code
      || glapsRoute?.startLocationCode
      || glapsRoute?.start_location_name
      || glapsRoute?.startLocationName
      || '';
    const glapsDestinationCode = getRoutePayload(glapsRoute, ['반입지코드', '도착지코드', '하차지코드'])
      || glapsRoute?.destination_code
      || glapsRoute?.destinationCode
      || glapsRoute?.destination_name
      || glapsRoute?.destinationName
      || '';
    const glapsRouteCode = glapsRoute?.route_code || glapsRoute?.routeCode || '';
    return {
      ...line,
      glapsRouteName: glapsRoute?.route_name || glapsRoute?.routeName || '',
      glapsRouteCode,
      glapsPortCode,
      glapsLineCode,
      glapsTypeCode,
      glapsCarrierBpCode: carrierCode,
      glapsConsigneeCode,
      glapsShipperCode,
      glapsStartLocationCode,
      glapsWorkplaceCode,
      glapsDestinationCode,
      needsRouteCodeMapping: !glapsRouteCode,
      needsRoutePartCodeMapping: Boolean(glapsRouteCode)
        && (!glapsStartLocationCode || !glapsWorkplaceCode || !glapsDestinationCode),
      needsPortCodeMapping: Boolean(line.port) && !glapsPortCode,
      needsLineCodeMapping: Boolean(line.line) && !glapsLineCode,
      needsTypeCodeMapping: Boolean(line.containerType) && !glapsTypeCode,
      needsCarrierCodeMapping: !carrierCode,
      needsConsigneeCodeMapping: Boolean(line.customer) && !glapsConsigneeCode,
      needsShipperCodeMapping: Boolean(line.shipper) && !glapsShipperCode,
    };
  });
}

function formatIssueFilters(filters = []) {
  const labels = {
    start: '상차지 미선택',
    route: '운송경로 미도출',
    orderType: '오더구분 코드 누락',
    shipper: '화주사 코드 누락',
    routePart: '경로부품 코드 누락',
    port: '포트 코드 누락',
    line: '선사 코드 누락',
    type: '타입 코드 누락',
    carrier: '운송사 코드 누락',
    consignee: '컨샤이니 코드 누락',
  };
  return filters.map((filter) => labels[filter] || filter).join(', ');
}

function buildWorkplaceIssueSummary(lines = []) {
  const byWorkplace = {};
  for (const line of lines) {
    const key = line.workplace || '작업지미상';
    if (!byWorkplace[key]) {
      byWorkplace[key] = {
        count: 0,
        starts: new Set(),
        destinations: new Set(),
        shippers: new Set(),
        companies: new Set(),
      };
    }
    const bucket = byWorkplace[key];
    bucket.count += 1;
    if (line.startLocation || line.startRegion) bucket.starts.add(line.startLocation || line.startRegion);
    if (line.destination) bucket.destinations.add(line.destination);
    if (line.shipper) bucket.shippers.add(line.shipper);
    if (line.company) bucket.companies.add(line.company);
  }
  return Object.entries(byWorkplace)
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], 'ko-KR'))
    .map(([workplace, bucket]) => ({
      workplace,
      count: bucket.count,
      starts: [...bucket.starts],
      destinations: [...bucket.destinations],
      shippers: [...bucket.shippers],
      companies: [...bucket.companies],
    }));
}

export function buildAsanDispatchDetailRagText(records = [], intent, options = {}) {
  const maxDetailRows = options.maxDetailRows || 120;
  const sortedRecords = [...(records || [])].sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));
  const allLines = [];

  for (const record of sortedRecords) {
    const lines = buildDispatchDetailLines({
      headers: normalizeHeaders(record.headers || [], record.type || ''),
      rows: record.data || [],
      workDate: record.target_date || '',
    });
    for (const line of lines) {
      allLines.push({
        ...line,
        targetDate: record.target_date,
        type: record.type || '',
      });
    }
  }

  const enrichedLines = enrichDetailLinesWithGlaps(allLines, options.glapsLookup);
  const matchedLines = enrichedLines.filter((line) => detailLineMatchesIntent(line, intent));
  const issueMatchedLines = matchedLines.filter((line) => detailLineMatchesIssueFilters(line, intent.detailIssueFilters || []));
  const targetLines = intent.detailIssueFilters?.length
    ? issueMatchedLines
    : (hasActiveIntentFilters(intent) ? matchedLines : enrichedLines);
  const summary = summarizeDispatchDetailLines(targetLines);
  const byCompany = {};
  const byStart = {};
  const byDestination = {};
  const issueWorkplaces = buildWorkplaceIssueSummary(targetLines);

  targetLines.forEach((line) => {
    addMapCount(byCompany, line.company || '업체미상', 1);
    addMapCount(byStart, line.startLocation || line.startRegion || '상차지미정', 1);
    addMapCount(byDestination, line.destination || '선적미상', 1);
  });

  const loadedDates = [...new Set(sortedRecords.map((record) => record.target_date))].sort();
  const filterLabel = [
    ...(intent.typeFilters || []).map((type) => (type === 'mobis' ? '모비스' : (type === 'glovis' ? '글로비스' : type))),
    ...intent.specificKeywords,
  ].filter(Boolean).join(', ') || '전체';

  let text = `\n\n## 아산지점 상세배차\n`;
  text += `[시스템: Supabase branch_dispatch 원장 -> 상세배차 라인 변환 / 레코드 ${sortedRecords.length}개 / 조회 범위 ${intent.dateScope.label} / 실제 날짜 ${loadedDates.join(', ') || '없음'} / 질문 필터 ${filterLabel}]\n`;
  text += `- 상세배차 라인 총 ${formatCount(targetLines.length)}대`;
  if (hasActiveIntentFilters(intent)) text += ` (전체 ${formatCount(allLines.length)}대 중 조건 매칭)`;
  text += `\n`;
  text += `- 상차지별: ${topMapText(byStart)}\n`;
  text += `- 업체별: ${topMapText(byCompany)}\n`;
  text += `- 하차지(선적)별: ${topMapText(byDestination)}\n`;
  text += `- 보정 필요 요약: 상차지수동 ${formatCount(summary.manualStartLocationCount)}건 / 운송경로 ${formatCount(summary.routeMissingCount)}건 / 포트 ${formatCount(summary.portMissingCount)}건 / 선사 ${formatCount(summary.lineMissingCount)}건 / 타입 ${formatCount(summary.typeMissingCount)}건\n`;
  if (intent.detailIssueFilters?.length) {
    text += `- 누락 조건: ${formatIssueFilters(intent.detailIssueFilters)}\n`;
  }
  text += `> [해석 규칙] 상세배차는 배차판 지역 셀의 업체+수량을 1대 단위 라인으로 펼친 자료다. CODE/Nomi/함축 같은 설명 컬럼을 배차 수량으로 계산하지 마라.\n`;
  text += `> [해석 규칙] "GLAPS 경로확인 안됨/안되는/미도출"은 상세배차의 운송경로코드 미도출(needsRouteCodeMapping) 조건이다. 단순 키워드 검색으로 0건 처리하지 마라.\n`;

  if (targetLines.length > 0) {
    if (intent.detailIssueFilters?.includes('route')) {
      text += `### GLAPS 경로 미도출 작업지\n`;
      issueWorkplaces.slice(0, 30).forEach((item) => {
        text += `- ${item.workplace}: ${formatCount(item.count)}대 / 상차 ${item.starts.join(', ') || '-'} / 선적 ${item.destinations.join(', ') || '-'} / 업체 ${item.companies.join(', ') || '-'}\n`;
      });
    }
    text += `### 상세배차 라인 샘플\n`;
    targetLines.slice(0, maxDetailRows).forEach((line) => {
      const typeLabel = line.type === 'mobis' ? '모비스' : (line.type === 'glovis' ? '글로비스' : line.type);
      const route = line.glapsRouteCode ? ` / 운송경로 ${line.glapsRouteCode}` : ' / 운송경로 미도출';
      text += `- [${line.targetDate} ${typeLabel} #${line.lineNo}] ${line.shipper || '-'} / ${line.startLocation || line.startRegion || '상차지미정'} -> ${line.workplace || '-'} -> ${line.destination || '-'} / ${line.company || '업체미상'} / ${line.containerType || '-'} / BKG ${line.bkg1 || '-'} ${line.bkg2 || ''} ${line.bkg3 || ''}${route}\n`;
    });
    if (targetLines.length > maxDetailRows) {
      text += `- 상세 라인은 ${maxDetailRows}건까지만 주입됨. 실제 매칭은 ${targetLines.length}건이다.\n`;
    }
  } else {
    text += `> [조회 완료] ${filterLabel} 조건에 일치하는 상세배차 라인이 없습니다. 실제 DB 조회 결과 기준으로 0건이라고 답하라.\n`;
  }

  return {
    text,
    hasMatches: targetLines.length > 0,
    loadedDates,
    total: targetLines.length,
    allTotal: enrichedLines.length,
    summary,
  };
}

async function fetchGlapsDetailLookup(supabase) {
  const { data: versions, error: versionError } = await supabase
    .from('glaps_master_versions')
    .select('id,source_name,imported_at')
    .eq('branch_id', 'asan')
    .eq('active', true)
    .order('imported_at', { ascending: false })
    .limit(1);
  if (versionError || !versions?.length) {
    return { version: null, routes: [], aliases: [], error: versionError || null };
  }

  const version = versions[0];
  const [routesRes, aliasesRes] = await Promise.all([
    supabase
      .from('glaps_transport_routes')
      .select('route_code,route_name,start_location_name,waypoint_name,waypoint_els_name,destination_name,route_fingerprint,raw_payload')
      .eq('version_id', version.id)
      .eq('active', true)
      .limit(5000),
    supabase
      .from('glaps_master_aliases')
      .select('alias_type,source_name,els_name,glaps_name,glaps_code')
      .eq('version_id', version.id)
      .eq('active', true)
      .limit(5000),
  ]);

  return {
    version,
    routes: routesRes.data || [],
    aliases: aliasesRes.data || [],
    error: routesRes.error || aliasesRes.error || null,
  };
}

export async function buildAsanDispatchRagContext({
  supabase,
  userText = '',
  userKwd = '',
  searchTerms = [],
  now = new Date(),
  maxDetailRows = DEFAULT_MAX_DETAIL_ROWS,
} = {}) {
  const intent = parseAsanDispatchIntent(userText, { userKwd, searchTerms, now });
  if (!intent.shouldQuery) {
    return { shouldQuery: false, success: false, text: '', intent };
  }

  const { data, error } = await queryBuilderForIntent(supabase, intent);
  if (error || !data || data.length === 0) {
    const detail = error ? `(에러: ${error.code || 'unknown'} - ${error.message})` : '(조회 레코드 0개)';
    return {
      shouldQuery: true,
      success: false,
      text: buildNoDataText(intent, detail),
      intent,
      error,
    };
  }

  const rag = buildAsanDispatchRagText(data, intent, { maxDetailRows });
  return {
    shouldQuery: true,
    success: true,
    intent,
    ...rag,
  };
}

export async function buildAsanDispatchDetailRagContext({
  supabase,
  userText = '',
  userKwd = '',
  searchTerms = [],
  now = new Date(),
  maxDetailRows = 120,
} = {}) {
  const intent = parseAsanDispatchIntent(userText, { userKwd, searchTerms, now });
  if (!shouldQueryDispatchDetail(userText)) {
    return { shouldQuery: false, success: false, text: '', intent };
  }

  const { data, error } = await queryBuilderForIntent(supabase, intent);
  if (error || !data || data.length === 0) {
    const detail = error ? `(에러: ${error.code || 'unknown'} - ${error.message})` : '(조회 레코드 0개)';
    return {
      shouldQuery: true,
      success: false,
      text: `\n\n## 아산지점 상세배차 (${intent.dateScope.label})\n> [DB 미동기화/데이터 없음] ${detail}\n> 상세배차는 branch_dispatch 원장 기반으로 생성되지만 해당 범위 데이터가 없습니다.`,
      intent,
      error,
    };
  }

  const glapsLookup = await fetchGlapsDetailLookup(supabase);
  const rag = buildAsanDispatchDetailRagText(data, intent, { maxDetailRows, glapsLookup });
  return {
    shouldQuery: true,
    success: true,
    intent,
    ...rag,
  };
}
