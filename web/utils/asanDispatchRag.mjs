const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_MAX_DETAIL_ROWS = 600;

const DISPATCH_TRIGGER_WORDS = [
  '배차', '배차판', '매차', '오늘배차', '아산배차',
  '몇대', '몇 대', '대수', '대 예정', '대예정',
  '오더', '상차', '도착시간', '도착 시간',
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
  '어디', '어느', '좀', '부탁', '부탁해',
  '총', '합계', '전체', '수량', '현황', '몇', '내역', '확인', '조회',
  '오늘', '내일', '모레', '내일모레', '글피', '그글피', '어제', '그제', '이번주', '다음주', '지난주', '금주',
  '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
  '월', '화', '수', '목', '금', '토', '일',
  '작업지', '작업지는', '작업지야', '화주', '담당자', '고객사', '포트',
  '도착항', '상차지', '상차', '배차정보', '특이사항', '비고',
  '업체', '업체별', '운송사', '운송사별', '실행사', '실행사별',
  '지역별', '상차지별', '상차지역별', '픽업지역별', '상차지별수량',
  '상차지별배차', '지역별수량', '지역별배차',
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
  return headers
    .map((header, idx) => ({ name: String(header || '').trim(), index: idx }))
    .filter(({ name, index }) => {
      const normalized = normalizeHeader(name);
      if (!normalized || /^col_\d+$/i.test(name) || NON_REGION_HEADERS.has(normalized)) return false;
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
    portIdx: findHeaderIndex(normalizedHeaders, ['포트(도착항)', '포트', '도착항', '도착지']),
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
        regionColumns: new Set(),
        memoColumns: new Set(),
        metaColumns: new Set(),
      };
    }

    const bucket = byType[type];
    addSetValues(bucket.orderColumns, [schema.headers[schema.orderIdx]]);
    addSetValues(bucket.regionColumns, schema.regionCols.map((col) => col.name));
    addSetValues(bucket.memoColumns, schema.memoIdxs.map((idx) => schema.headers[idx]));
    addSetValues(bucket.metaColumns, [
      schema.headers[schema.managerIdx],
      schema.headers[schema.worksiteIdx],
      schema.headers[schema.customerIdx],
      schema.headers[schema.portIdx],
    ]);
  }

  return Object.entries(byType).map(([type, profile]) => ({
    type,
    orderColumns: [...profile.orderColumns],
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

  let text = `\n\n## 아산지점 배차판\n`;
  text += `[시스템: Supabase branch_dispatch / 레코드 ${sortedRecords.length}개 / 조회 범위 ${intent.dateScope.label} / 실제 날짜 ${loadedDates.join(', ') || '없음'} / 질문 필터 ${filterLabel}]\n`;
  text += `### 도표형 스키마(동적 추론)\n`;
  for (const profile of schemaProfile) {
    const typeLabel = profile.type === 'mobis' ? '모비스' : (profile.type === 'glovis' ? '글로비스' : profile.type);
    text += `- **${typeLabel}**: 오더 컬럼: ${profile.orderColumns.join(', ') || '미탐지'} / `;
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
  if (intent.typeFilters?.length > 0 || intent.specificKeywords.length > 0 || intent.filterHour) {
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
    hasMatches: matchedRows.length > 0 || (intent.specificKeywords.length === 0 && !intent.filterHour && overallSummary.rowCount > 0),
    loadedDates,
    overallSummary,
    matchedSummary,
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
