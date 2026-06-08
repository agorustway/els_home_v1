export const DEFAULT_ANNUAL_PERFORMANCE_PATH = '/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx';
export const DEFAULT_ANNUAL_PERFORMANCE_SHEET = '합계';
export const DEFAULT_MONTHLY_PERFORMANCE_BASE_DIR = '/아산지점/B_총무/C_마감';
export const DEFAULT_MONTHLY_PERFORMANCE_EXTRA_MONTHS = 3;
export const FIRST_SHEET_TOKEN = '__first__';

export function buildMonthlyPerformancePeriods(baseYear, extraMonths = DEFAULT_MONTHLY_PERFORMANCE_EXTRA_MONTHS) {
  const parsedYear = Number.parseInt(baseYear, 10);
  const year = Number.isFinite(parsedYear) && parsedYear > 1900 ? parsedYear : new Date().getFullYear();
  const parsedExtra = Number.parseInt(extraMonths, 10);
  const tailMonths = Number.isFinite(parsedExtra) && parsedExtra >= 0 ? Math.min(parsedExtra, 12) : DEFAULT_MONTHLY_PERFORMANCE_EXTRA_MONTHS;
  const periods = [];

  for (let offset = 0; offset < 12 + tailMonths; offset += 1) {
    const date = new Date(Date.UTC(year, offset, 1));
    const periodYear = date.getUTCFullYear();
    const periodMonth = date.getUTCMonth() + 1;
    periods.push({
      year: periodYear,
      month: periodMonth,
      period: `${periodYear}-${String(periodMonth).padStart(2, '0')}`,
      carryover: periodYear > year,
    });
  }

  return periods;
}

export function buildMonthlyPerformancePath({
  year,
  month,
  baseDir = DEFAULT_MONTHLY_PERFORMANCE_BASE_DIR,
  yearFolder = '',
  monthFolder = '',
  fileName = '',
} = {}) {
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);
  const safeYear = Number.isFinite(y) ? y : new Date().getFullYear();
  const safeMonth = Number.isFinite(m) && m >= 1 && m <= 12 ? m : 1;
  const folderYear = String(yearFolder || safeYear);
  const folderMonth = String(monthFolder || `${safeMonth}월`);
  const name = String(fileName || `${safeYear}년_실적-${safeMonth}월 컨테이너 운송 마감자료.xlsx`);
  return normalizePerformancePath(`${baseDir}/${folderYear}/${folderMonth}/${name}`);
}

export function buildMonthlyPerformanceFileSlots(baseYear, options = {}) {
  return buildMonthlyPerformancePeriods(
    baseYear,
    options.extraMonths ?? DEFAULT_MONTHLY_PERFORMANCE_EXTRA_MONTHS,
  ).map(period => ({
    ...period,
    enabled: true,
    path: buildMonthlyPerformancePath({
      ...period,
      baseDir: options.baseDir || DEFAULT_MONTHLY_PERFORMANCE_BASE_DIR,
    }),
    sheetName: FIRST_SHEET_TOKEN,
    headerRow: '',
  }));
}

function parsePerformanceAmountValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = normalizePerformanceFilterValue(value);
  if (!text || text === '₩' || text === '#') return null;
  const negative = /^\s*-\s*/.test(text) || (text.startsWith('(') && text.endsWith(')'));
  const cleaned = text
    .replace(/,/g, '')
    .replace(/원/g, '')
    .replace(/₩/g, '')
    .replace(/#/g, '')
    .replace(/%/g, '')
    .replace(/[()]/g, '')
    .trim();
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0]);
  if (!Number.isFinite(amount)) return null;
  return negative ? -Math.abs(amount) : amount;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function compactCarryoverText(value) {
  return normalizePerformanceFilterValue(value)
    .replace(/\s+/g, '')
    .toLocaleLowerCase('ko-KR');
}

function findCarryoverHeaderIndex(headers = [], candidates = []) {
  const compactCandidates = candidates.map(compactCarryoverText);
  let idx = headers.findIndex(header => compactCandidates.includes(compactCarryoverText(header)));
  if (idx >= 0) return idx;
  idx = headers.findIndex(header => compactCandidates.some(candidate => candidate && compactCarryoverText(header).includes(candidate)));
  return idx >= 0 ? idx : -1;
}

function blankCarryoverMetric(label = '') {
  return {
    label,
    revenue: 0,
    purchase: 0,
    profit: 0,
    rowCount: 0,
  };
}

function addCarryoverMetric(target, revenue, purchase, rowCount = 1) {
  target.revenue += Number(revenue) || 0;
  target.purchase += Number(purchase) || 0;
  target.profit += (Number(revenue) || 0) - (Number(purchase) || 0);
  target.rowCount += rowCount;
}

function addCarryoverParty(map, name, revenue, purchase) {
  const key = normalizePerformanceFilterValue(name) || '미분류';
  if (!map.has(key)) map.set(key, blankCarryoverMetric(key));
  addCarryoverMetric(map.get(key), revenue, purchase);
}

function finalizeCarryoverMetric(metric, extra = {}) {
  const revenue = roundMoney(metric?.revenue || 0);
  const purchase = roundMoney(metric?.purchase || 0);
  const profit = roundMoney(metric?.profit || revenue - purchase);
  return {
    ...extra,
    label: metric?.label || extra.label || '',
    revenue,
    purchase,
    profit,
    rowCount: Number(metric?.rowCount || 0) || 0,
    profitRate: revenue ? Math.round((profit / revenue) * 10000) / 100 : 0,
  };
}

function finalizeCarryoverParties(map, limit = 30) {
  return Array.from(map.values())
    .map(item => finalizeCarryoverMetric(item, { name: item.label }))
    .filter(item => item.revenue || item.purchase || item.profit || item.rowCount)
    .sort((a, b) => Math.abs(b.revenue) - Math.abs(a.revenue))
    .slice(0, limit);
}

function resolveCarryoverTargetPeriod(label, sourcePeriod = '') {
  const text = compactCarryoverText(label);
  const match = text.match(/(1[0-2]|0?[1-9])월이월/);
  if (!match) return '';
  const targetMonth = Number(match[1]);
  const periodMatch = String(sourcePeriod || '').match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  if (!periodMatch) return '';
  const sourceYear = Number(periodMatch[1]);
  const sourceMonth = Number(periodMatch[2]);
  const targetYear = targetMonth <= sourceMonth ? sourceYear + 1 : sourceYear;
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
}

function hasMeaningfulCarryoverMarker(value) {
  const text = compactCarryoverText(value);
  if (!text || text === '-' || text === '없음' || text === '미정') return false;
  return text.includes('이월');
}

export function createMonthlyCarryoverCycleAccumulator(headers = [], options = {}) {
  const sourcePeriod = options.period || options.sourcePeriod || '';
  const categoryIdx = findCarryoverHeaderIndex(headers, ['이월여부']);
  const carryoverTypeIdx = findCarryoverHeaderIndex(headers, ['이월구분']);
  const revenueIdx = findCarryoverHeaderIndex(headers, ['청구']);
  const purchaseIdx = findCarryoverHeaderIndex(headers, ['하불']);
  const carryoverRevenueIdx = findCarryoverHeaderIndex(headers, ['청구_1', '이월청구', '이월청구액']);
  const carryoverPurchaseIdx = findCarryoverHeaderIndex(headers, ['하불_1', '이월하불', '이월매입', '이월하불액']);
  const clientIdx = findCarryoverHeaderIndex(headers, ['청구처', '거래처', '화주']);
  const vendorIdx = findCarryoverHeaderIndex(headers, ['지급처', '운송사(명의)', '운송사']);
  const incoming = blankCarryoverMetric('전월이월 반영분');
  const outgoing = blankCarryoverMetric('익월이월 발생분');
  const incomingClients = new Map();
  const incomingVendors = new Map();
  const outgoingClients = new Map();
  const outgoingVendors = new Map();
  const targets = new Map();

  const valueAt = (row, idx) => (idx >= 0 ? row[idx] : '');
  const amountAt = (row, idx) => parsePerformanceAmountValue(valueAt(row, idx)) || 0;

  function add(row = []) {
    const category = compactCarryoverText(valueAt(row, categoryIdx));
    const carryoverType = normalizePerformanceFilterValue(valueAt(row, carryoverTypeIdx));
    const revenue = amountAt(row, revenueIdx);
    const purchase = amountAt(row, purchaseIdx);
    const nextRevenue = amountAt(row, carryoverRevenueIdx);
    const nextPurchase = amountAt(row, carryoverPurchaseIdx);
    const client = valueAt(row, clientIdx);
    const vendor = valueAt(row, vendorIdx);

    if (category === '이월' && (revenue || purchase)) {
      addCarryoverMetric(incoming, revenue, purchase);
      addCarryoverParty(incomingClients, client, revenue, purchase);
      addCarryoverParty(incomingVendors, vendor, revenue, purchase);
    }

    if (hasMeaningfulCarryoverMarker(carryoverType) || nextRevenue || nextPurchase) {
      addCarryoverMetric(outgoing, nextRevenue, nextPurchase);
      addCarryoverParty(outgoingClients, client, nextRevenue, nextPurchase);
      addCarryoverParty(outgoingVendors, vendor, nextRevenue, nextPurchase);
      const targetPeriod = resolveCarryoverTargetPeriod(carryoverType, sourcePeriod) || '미정';
      if (!targets.has(targetPeriod)) {
        targets.set(targetPeriod, {
          ...blankCarryoverMetric(carryoverType || targetPeriod),
          period: targetPeriod,
          carryoverType,
        });
      }
      addCarryoverMetric(targets.get(targetPeriod), nextRevenue, nextPurchase);
    }
  }

  function finish() {
    const included = finalizeCarryoverMetric(incoming, {
      key: 'incoming',
      description: '전월에서 넘어와 이번 마감월 청구/하불에 반영된 상단 이월분입니다.',
      clientItems: finalizeCarryoverParties(incomingClients),
      vendorItems: finalizeCarryoverParties(incomingVendors),
    });
    const outgoingMetric = finalizeCarryoverMetric(outgoing, {
      key: 'outgoing',
      description: '이번 마감에서 정리되어 다음 마감월로 넘어갈 이월 발생분입니다.',
      clientItems: finalizeCarryoverParties(outgoingClients),
      vendorItems: finalizeCarryoverParties(outgoingVendors),
    });
    const netChange = finalizeCarryoverMetric({
      label: '이월 순증감',
      revenue: outgoingMetric.revenue - included.revenue,
      purchase: outgoingMetric.purchase - included.purchase,
      profit: outgoingMetric.profit - included.profit,
      rowCount: outgoingMetric.rowCount - included.rowCount,
    });
    return {
      sourcePeriod,
      basis: '마감월',
      included,
      incoming: included,
      outgoing: outgoingMetric,
      netChange,
      targetPeriods: Array.from(targets.values())
        .map(item => finalizeCarryoverMetric(item, { period: item.period, carryoverType: item.carryoverType }))
        .sort((a, b) => String(a.period).localeCompare(String(b.period), 'ko-KR')),
    };
  }

  return { add, finish };
}

export function buildMonthlyCarryoverCycle(headers = [], rows = [], options = {}) {
  const accumulator = createMonthlyCarryoverCycleAccumulator(headers, options);
  (rows || []).forEach(row => accumulator.add(row));
  return accumulator.finish();
}

function compactReportText(value) {
  return normalizePerformanceFilterValue(value)
    .replace(/\s+/g, '')
    .toLocaleLowerCase('ko-KR');
}

function reportMetricKey(label) {
  const compact = compactReportText(label);
  if (!compact) return '';
  if (compact.includes('이월') && compact.includes('매출')) return 'carryoverRevenue';
  if (compact.includes('이월') && compact.includes('매입')) return 'carryoverPurchase';
  if (compact.includes('계산서') && compact.includes('매출이익')) return 'invoiceProfit';
  if (compact.includes('계산서') && compact.includes('매출') && !compact.includes('매출이익')) return 'invoiceRevenue';
  if (compact.includes('계산서') && compact.includes('매입')) return 'invoicePurchase';
  if (compact.includes('매출이익') || compact.includes('손익') || compact.includes('이익')) return 'netProfit';
  if (compact.includes('순매출')) return 'netRevenue';
  if (compact.includes('순매입')) return 'netPurchase';
  return '';
}

function isMeaningfulReportHeader(header) {
  const text = normalizePerformanceFilterValue(header);
  if (!text || /^col_\d+$/i.test(text) || text === '₩' || text === '#') return false;
  const compact = compactReportText(text);
  return !['매출', '이월', '단위:원', '단위원'].includes(compact);
}

function isReportTotalHeader(header) {
  const compact = compactReportText(header);
  return compact.includes('매출합계') || compact === '합계' || compact === '총계';
}

function isReportRateHeader(header) {
  const compact = compactReportText(header);
  return compact.includes('이익율') || compact.includes('이익률') || compact.includes('%');
}

function resolveReportGroupName(headers, idx) {
  for (let offset = 0; offset <= 2; offset += 1) {
    const candidate = headers[idx - offset];
    if (isMeaningfulReportHeader(candidate)) return normalizePerformanceFilterValue(candidate);
  }
  return '';
}

function normalizeReportRows(rows = []) {
  return (rows || [])
    .map(row => (Array.isArray(row) ? row : []))
    .map(row => row.map(normalizePerformanceFilterValue))
    .filter(row => row.some(Boolean));
}

function reportHeaderScore(matrix, idx) {
  const row = matrix[idx] || [];
  const nonEmpty = row.map(normalizePerformanceFilterValue).filter(Boolean);
  if (nonEmpty.length < 3) return -1;

  const compactRow = compactReportText(row.join(' '));
  const lookahead = matrix.slice(idx + 1, Math.min(matrix.length, idx + 18));
  const metricHits = lookahead.filter(item => reportMetricKey(item.slice(0, 3).map(normalizePerformanceFilterValue).find(Boolean) || '')).length;
  if (metricHits < 2) return -1;

  const meaningfulHeaders = row.filter(isMeaningfulReportHeader).length;
  const score = (metricHits * 12)
    + (meaningfulHeaders * 3)
    + (compactRow.includes('매출합계') ? 14 : 0)
    + (compactRow.includes('이익율') || compactRow.includes('이익률') ? 8 : 0)
    + (compactRow.includes('년') && compactRow.includes('월') ? 8 : 0)
    - (idx * 0.02);
  return score;
}

function findReportHeaderIndex(matrix = []) {
  let bestIdx = -1;
  let bestScore = -1;
  const scanLimit = Math.min(matrix.length, 80);
  for (let idx = 0; idx < scanLimit; idx += 1) {
    const score = reportHeaderScore(matrix, idx);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }
  return bestScore >= 24 ? bestIdx : -1;
}

function blankMonthlyReportMetric(name = '') {
  return {
    name,
    netRevenue: 0,
    netPurchase: 0,
    netProfit: 0,
    netProfitRate: 0,
    invoiceRevenue: 0,
    invoicePurchase: 0,
    invoiceProfit: 0,
    invoiceProfitRate: 0,
    carryoverRevenue: 0,
    carryoverPurchase: 0,
    carryoverProfit: 0,
  };
}

function buildMonthlyReportCandidate(headers = [], rows = [], options = {}) {
  const groups = new Map();
  const totals = blankMonthlyReportMetric('매출합계');
  const order = [];
  const metricSet = new Set();

  const ensureGroup = (name) => {
    const key = name || '미분류';
    if (!groups.has(key)) {
      groups.set(key, blankMonthlyReportMetric(key));
      order.push(key);
    }
    return groups.get(key);
  };

  const setMetric = (target, metric, value) => {
    if (metric === 'carryoverRevenue') target.carryoverRevenue += value;
    else if (metric === 'carryoverPurchase') target.carryoverPurchase += value;
    else target[metric] += value;
  };

  for (const row of rows || []) {
    const label = row.slice(0, 3).map(normalizePerformanceFilterValue).find(Boolean) || '';
    const metric = reportMetricKey(label);
    if (!metric) continue;
    metricSet.add(metric);

    row.forEach((cell, idx) => {
      if (idx === 0) return;
      const text = normalizePerformanceFilterValue(cell);
      if (!text) return;
      const header = resolveReportGroupName(headers, idx);
      if (isReportRateHeader(header) || text.includes('%')) {
        const rateValue = parsePerformanceAmountValue(text);
        if (rateValue != null && metric === 'netRevenue') totals.netProfitRate = rateValue;
        if (rateValue != null && metric === 'invoiceRevenue') totals.invoiceProfitRate = rateValue;
        return;
      }
      const amount = parsePerformanceAmountValue(text);
      if (amount == null || amount === 0) return;
      if (!header) return;
      if (isReportTotalHeader(header)) {
        setMetric(totals, metric, amount);
      } else {
        setMetric(ensureGroup(header), metric, amount);
      }
    });
  }

  const finalize = item => {
    const next = { ...item };
    if (!next.netProfit && (next.netRevenue || next.netPurchase)) next.netProfit = next.netRevenue - next.netPurchase;
    if (!next.invoiceProfit && (next.invoiceRevenue || next.invoicePurchase)) next.invoiceProfit = next.invoiceRevenue - next.invoicePurchase;
    next.carryoverProfit = next.carryoverRevenue - next.carryoverPurchase;
    next.netProfitRate = next.netProfitRate || (next.netRevenue ? (next.netProfit / next.netRevenue) * 100 : 0);
    next.invoiceProfitRate = next.invoiceProfitRate || (next.invoiceRevenue ? (next.invoiceProfit / next.invoiceRevenue) * 100 : 0);
    for (const key of Object.keys(next)) {
      if (typeof next[key] === 'number') next[key] = roundMoney(next[key]);
    }
    return next;
  };

  const finalizedGroups = order
    .map(key => finalize(groups.get(key)))
    .filter(item => item.netRevenue || item.netPurchase || item.invoiceRevenue || item.invoicePurchase || item.carryoverRevenue || item.carryoverPurchase);
  const finalizedTotals = finalize(totals);
  const reportMetricKeys = ['netRevenue', 'netPurchase', 'netProfit', 'invoiceRevenue', 'invoicePurchase', 'invoiceProfit', 'carryoverRevenue', 'carryoverPurchase', 'carryoverProfit'];
  const groupSums = finalizedGroups.reduce((sum, item) => {
    for (const key of reportMetricKeys) sum[key] += Number(item[key] || 0) || 0;
    return sum;
  }, blankMonthlyReportMetric('그룹합계'));

  for (const key of reportMetricKeys) {
    if (!finalizedTotals[key] && groupSums[key]) finalizedTotals[key] = roundMoney(groupSums[key]);
  }
  finalizedTotals.netProfitRate = finalizedTotals.netRevenue ? Math.round((finalizedTotals.netProfit / finalizedTotals.netRevenue) * 10000) / 100 : 0;
  finalizedTotals.invoiceProfitRate = finalizedTotals.invoiceRevenue ? Math.round((finalizedTotals.invoiceProfit / finalizedTotals.invoiceRevenue) * 10000) / 100 : 0;

  const carryover = {
    revenue: finalizedTotals.carryoverRevenue || roundMoney(finalizedGroups.reduce((sum, item) => sum + item.carryoverRevenue, 0)),
    purchase: finalizedTotals.carryoverPurchase || roundMoney(finalizedGroups.reduce((sum, item) => sum + item.carryoverPurchase, 0)),
  };
  carryover.profit = roundMoney(carryover.revenue - carryover.purchase);
  const primaryReady = Boolean(finalizedTotals.netRevenue && (finalizedTotals.netPurchase || finalizedTotals.netProfit));
  const displayReady = finalizedGroups.length > 0 || Boolean(finalizedTotals.netRevenue || finalizedTotals.invoiceRevenue || carryover.revenue || carryover.purchase);
  const score = (primaryReady ? 60 : 0)
    + (finalizedGroups.length >= 2 ? 20 : finalizedGroups.length ? 10 : 0)
    + (metricSet.has('invoiceRevenue') || metricSet.has('invoicePurchase') ? 10 : 0)
    + (metricSet.has('carryoverRevenue') || metricSet.has('carryoverPurchase') ? 10 : 0);

  return {
    period: options.period || '',
    title: options.title || '',
    groups: finalizedGroups,
    totals: finalizedTotals,
    carryover,
    hasReportRows: displayReady,
    quality: {
      source: options.source || 'normalized',
      score,
      metricCount: metricSet.size,
      groupCount: finalizedGroups.length,
      primaryReady,
      headerRow: options.headerRow || null,
    },
  };
}

function buildReportFromRawRows(rawRows = [], options = {}) {
  const matrix = normalizeReportRows(rawRows);
  const headerIdx = findReportHeaderIndex(matrix);
  if (headerIdx < 0) return null;
  const headers = matrix[headerIdx];
  const reportRows = matrix
    .slice(headerIdx + 1, Math.min(matrix.length, headerIdx + 40))
    .filter(row => reportMetricKey(row.slice(0, 3).map(normalizePerformanceFilterValue).find(Boolean) || ''));
  if (!reportRows.length) return null;
  return buildMonthlyReportCandidate(headers, reportRows, {
    ...options,
    source: 'raw-preview',
    headerRow: headerIdx + 1,
  });
}

export function buildMonthlyPerformanceReport(headers = [], rows = [], options = {}) {
  const normalizedCandidate = buildMonthlyReportCandidate(headers, rows, {
    ...options,
    source: 'normalized',
  });
  const rawCandidate = buildReportFromRawRows(options.rawRows || [], options);
  if (!rawCandidate) return normalizedCandidate;
  if (!normalizedCandidate?.hasReportRows) return rawCandidate;
  return (rawCandidate.quality?.score || 0) > (normalizedCandidate.quality?.score || 0)
    ? rawCandidate
    : normalizedCandidate;
}

export function normalizePerformancePath(path = DEFAULT_ANNUAL_PERFORMANCE_PATH) {
  let raw = String(path || DEFAULT_ANNUAL_PERFORMANCE_PATH).replace(/\\/g, '/').trim();
  raw = raw.replace(/^\/?volume[12]\//, '/');
  if (raw.startsWith('/B_총무/')) return `/아산지점${raw}`;
  if (raw.startsWith('B_총무/')) return `/아산지점/${raw}`;
  if (!raw.startsWith('/')) return `/${raw}`;
  return raw;
}

export function normalizePerformanceColumnOrder(order = [], currentHeaders = []) {
  const seen = new Set();
  const normalized = [];

  (order || []).forEach((col) => {
    if (!currentHeaders.includes(col) || seen.has(col)) return;
    seen.add(col);
    normalized.push(col);
  });

  currentHeaders.forEach((col) => {
    if (seen.has(col)) return;
    seen.add(col);
    normalized.push(col);
  });

  return normalized;
}

export function reconcilePerformanceLayoutPrefs({
  order = [],
  hiddenCols = [],
  sourceHeaders = [],
  currentHeaders = [],
} = {}) {
  const current = Array.isArray(currentHeaders) ? currentHeaders : [];
  const source = Array.isArray(sourceHeaders) ? sourceHeaders : [];
  const canTreatMissingNameAsRename = source.length === current.length;

  const mapColumn = (name) => {
    if (current.includes(name)) return name;
    if (!canTreatMissingNameAsRename) return null;
    const oldIdx = source.indexOf(name);
    if (oldIdx >= 0 && current[oldIdx]) return current[oldIdx];
    return null;
  };

  const mappedOrder = (order || []).map(mapColumn).filter(Boolean);
  current.forEach((col) => {
    if (!mappedOrder.includes(col)) mappedOrder.push(col);
  });

  const mappedHidden = new Set();
  (hiddenCols || []).forEach((name) => {
    const mapped = mapColumn(name);
    if (mapped) mappedHidden.add(mapped);
  });

  return {
    colOrder: normalizePerformanceColumnOrder(mappedOrder, current),
    hiddenCols: mappedHidden,
  };
}

export function formatPerformanceAmount(value, options = {}) {
  const unit = options.unit || '원';
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (abs >= 100000000) {
    return `${sign}${(abs / 100000000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억${unit}`;
  }
  if (abs >= 10000) {
    return `${sign}${Math.round(abs / 10000).toLocaleString('ko-KR')}만${unit}`;
  }
  return `${num.toLocaleString('ko-KR')}${unit}`;
}

function compactHeader(header) {
  return String(header || '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function excelSerialToDateParts(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 30000 || serial > 80000) return null;
  const date = new Date(Math.round((serial - 25569) * 86400000));
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function parsePerformanceDateParts(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    };
  }

  const text = normalizePerformanceFilterValue(value);
  if (!text) return null;
  if (/^\d{4,5}(?:\.0+)?$/.test(text)) {
    return excelSerialToDateParts(Number(text));
  }

  let match = text.match(/^(\d{4})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  match = text.match(/^(\d{4})(0[1-9]|1[0-2])$/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: 1,
    };
  }

  match = text.match(/^(\d{4})[-/.년\s]+(1[0-2]|0?[1-9])(?:[-/.월\s]+(3[01]|[12]\d|0?[1-9]))?/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: match[3] ? Number(match[3]) : 1,
    };
  }

  return null;
}

export function isPerformanceMonthHeader(header) {
  const compact = compactHeader(header);
  return compact.includes('마감월') || compact.includes('년월') || compact === '마감';
}

export function isPerformanceDateHeader(header) {
  const compact = compactHeader(header);
  return isPerformanceMonthHeader(header)
    || compact.includes('작업일자')
    || compact.includes('일자')
    || compact.includes('날짜')
    || compact.includes('마감일');
}

export function isPerformanceAmountHeader(header) {
  const compact = compactHeader(header);
  if (!compact) return false;
  const includes = ['청구', '하불', '금액', '운임', '매입액', '매출액', '비용', '원가', '손익', '이익'];
  const excludes = ['청구처', '지급처', '거래처', '업체', '번호', '코드', '전화', '영업', 'booking', 'seal', 'type', 'c/tn', 'ctn', '비고'];
  return includes.some(word => compact.includes(word)) && !excludes.some(word => compact.includes(word));
}

export function formatPerformanceCellValue(header, value) {
  if (value == null || value === '') return '';
  if (isPerformanceDateHeader(header)) {
    const parts = parsePerformanceDateParts(value);
    if (parts) {
      const monthText = `${parts.year}-${pad2(parts.month)}`;
      if (isPerformanceMonthHeader(header)) return monthText;
      return `${monthText}-${pad2(parts.day || 1)}`;
    }
  }

  if (isPerformanceAmountHeader(header)) {
    const raw = normalizePerformanceFilterValue(value);
    const numeric = Number(raw.replace(/,/g, ''));
    if (Number.isFinite(numeric) && /^-?\d+(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/.test(raw)) {
      return numeric.toLocaleString('ko-KR', {
        maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
      });
    }
  }

  return normalizePerformanceFilterValue(value);
}

export function normalizeAnnualPerformanceRow(headers = [], row = []) {
  return row.map((value, idx) => formatPerformanceCellValue(headers[idx], value));
}

export function getPerformanceChartMax(items = [], keys = ['revenue', 'purchase', 'profit']) {
  return Math.max(
    1,
    ...items.flatMap((item) => keys.map((key) => Math.abs(Number(item?.[key]) || 0))),
  );
}

export function getPerformanceYearLabel(item = {}) {
  const year = item.year ?? item.period ?? '';
  return String(year || '미지정');
}

export function normalizePerformanceFilterValue(value) {
  if (value == null) return '';
  return String(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

export function comparePerformanceFilterValues(a, b, direction = 'asc') {
  const dir = direction === 'desc' ? -1 : 1;
  const valueA = normalizePerformanceFilterValue(a);
  const valueB = normalizePerformanceFilterValue(b);
  const blankA = valueA === '';
  const blankB = valueB === '';

  if (blankA || blankB) {
    if (blankA && blankB) return 0;
    return blankA ? -1 * dir : 1 * dir;
  }

  return valueA.localeCompare(valueB, 'ko-KR', {
    numeric: true,
    sensitivity: 'base',
  }) * dir;
}
