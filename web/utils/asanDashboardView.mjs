export const ASAN_DASHBOARD_CHART_MODES = {
  customer: ['작업지', '고객사', '라인/선사'],
  dispatcher: ['업체명', '고객사', '작업지', '라인/선사'],
};

const PLANNED_DISPATCH_REGION = '배차예정';
const DISPATCH_REGIONS = [PLANNED_DISPATCH_REGION, '기타/철송', '기타', '아산', '부산', '신항', '광양', '평택', '중부', '부곡', '인천'];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const LUNAR_HOLIDAYS = {
  2025: ['2025-01-28', '2025-01-29', '2025-01-30', '2025-05-05', '2025-10-05', '2025-10-06', '2025-10-07'],
  2026: ['2026-02-16', '2026-02-17', '2026-02-18', '2026-05-24', '2026-09-24', '2026-09-25', '2026-09-26'],
  2027: ['2027-02-05', '2027-02-06', '2027-02-07', '2027-05-13', '2027-09-14', '2027-09-15', '2027-09-16'],
  2028: ['2028-01-26', '2028-01-27', '2028-01-28', '2028-05-02', '2028-10-02', '2028-10-03', '2028-10-04'],
  2029: ['2029-02-12', '2029-02-13', '2029-02-14', '2029-05-20', '2029-09-21', '2029-09-22', '2029-09-23'],
  2030: ['2030-02-02', '2030-02-03', '2030-02-04', '2030-05-09', '2030-09-11', '2030-09-12', '2030-09-13'],
};

export function parseDashboardQty(value) {
  const match = String(value ?? '').replace(/,/g, '').trim().match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) || 0 : 0;
}

function parseDashboardOrderQty(value) {
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return 0;
  return Number(text) || 0;
}

export function findDashboardCol(headers = [], ...names) {
  for (const name of names.flat()) {
    const idx = headers.findIndex((header) => String(header || '').trim() === name);
    if (idx >= 0) return idx;
  }
  return -1;
}

function normalizeLabel(value, fallback = '미분류') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function createScope() {
  return {
    total: 0,
    rowCount: 0,
    orderTotal: 0,
    sheetDispatchTotal: 0,
    mismatchTotal: 0,
    dispatchCount: 0,
    feuTotal: 0,
    pieAggs: {
      shipper: {},
      direction: {},
      container: {},
      region: {},
    },
    chartAggs: {
      작업지: {},
      '라인/선사': {},
      고객사: {},
      업체명: {},
    },
  };
}

function addMap(map, key, amount) {
  if (!key || amount <= 0) return;
  map[key] = (map[key] || 0) + amount;
}

function addChart(chartAggs, mode, key, amount, breakdownKey) {
  if (!key || amount <= 0) return;
  if (!chartAggs[mode]) chartAggs[mode] = {};
  if (!chartAggs[mode][key]) chartAggs[mode][key] = { total: 0, breakdown: {} };
  chartAggs[mode][key].total += amount;
  if (breakdownKey) addMap(chartAggs[mode][key].breakdown, breakdownKey, amount);
}

function getCols(headers = []) {
  return {
    shipper: findDashboardCol(headers, '화주'),
    workplace: findDashboardCol(headers, '작업지'),
    line: findDashboardCol(headers, '라인(선사명)', '라인', '선사명', '선사'),
    container: findDashboardCol(headers, 'TYPE', 'T'),
    direction: findDashboardCol(headers, '구분'),
    customer: findDashboardCol(headers, '고객사(국가)', '고객사'),
    country: findDashboardCol(headers, '국가명', '국가'),
    order: findDashboardCol(headers, '오더(계)', '오더'),
    qty: findDashboardCol(headers, '오더(계)', '계', '수량'),
    dispatch: findDashboardCol(headers, '배차'),
  };
}

function resolveCustomerLabel(row = [], cols = {}, viewType = 'integrated') {
  const customer = normalizeLabel(row[cols.customer], '');
  const country = normalizeLabel(row[cols.country], '');
  if (viewType === 'mobis') return country || customer || '미분류';
  return customer || country || '미분류';
}

function getRowMeta(row = [], cols = {}, viewType = 'integrated') {
  return {
    shipper: normalizeLabel(row[cols.shipper]),
    workplace: normalizeLabel(row[cols.workplace]),
    line: normalizeLabel(row[cols.line]),
    customer: resolveCustomerLabel(row, cols, viewType),
    direction: normalizeLabel(row[cols.direction]),
    container: normalizeLabel(row[cols.container]),
  };
}

function getCustomerWeight(row = [], cols = {}, viewType = 'integrated') {
  if (viewType === 'mobis') return parseDashboardOrderQty(row[cols.qty]);
  const order = parseDashboardOrderQty(row[cols.order]);
  return order > 0 ? order : parseDashboardOrderQty(row[cols.qty]);
}

function addPieAggs(scope, meta, amount) {
  addMap(scope.pieAggs.shipper, meta.shipper, amount);
  addMap(scope.pieAggs.direction, meta.direction, amount);
  addMap(scope.pieAggs.container, meta.container, amount);
}

function getFeuMultiplier(container = '') {
  const text = String(container || '').toUpperCase().replace(/\s+/g, '');
  if (text.includes('45')) return 2.25;
  if (text.includes('40') || text.includes('4O')) return 2;
  if (text.includes('20') || text.includes('2O')) return 1;
  return 1;
}

function addFeu(scope, container, amount) {
  if (amount <= 0) return;
  scope.feuTotal += amount * getFeuMultiplier(container);
}

function addBaseRowMetrics(scope, row, headers, cols, viewType) {
  const order = getCustomerWeight(row, cols, viewType);
  if (order <= 0) return;
  const dispatch = getActualDispatchQty(row, headers, row[cols.dispatch]);
  scope.rowCount += 1;
  scope.orderTotal += order;
  scope.sheetDispatchTotal += dispatch;
  scope.mismatchTotal = scope.orderTotal - scope.sheetDispatchTotal;
}

function addRegionAggs(scope, records = []) {
  records.forEach((record) => addMap(scope.pieAggs.region, record.region, record.count));
}

function sumDispatchRecords(records = []) {
  return records.reduce((sum, record) => sum + record.count, 0);
}

function addCustomerRow(scope, row, headers, cols, viewType) {
  const amount = getCustomerWeight(row, cols, viewType);
  if (amount <= 0) return;

  const meta = getRowMeta(row, cols, viewType);
  scope.total += amount;
  addPieAggs(scope, meta, amount);
  addRegionAggs(scope, parseDispatchRecords(row, headers));
  addFeu(scope, meta.container, amount);

  addChart(scope.chartAggs, '작업지', meta.workplace, amount, meta.line);
  addChart(scope.chartAggs, '라인/선사', meta.line, amount, meta.workplace);
  addChart(scope.chartAggs, '고객사', meta.customer, amount, meta.workplace);
}

function parseDispatchCell(text = '') {
  const records = [];
  const normalized = String(text || '')
    .replace(/[，、]/g, ',')
    .replace(/(\d)\.(?=[^\d\s])/g, '$1,');
  const matches = normalized.matchAll(/([^,\s/]+?)\s*(-?\d+(?:\.\d+)?)(?=$|[,/\s])/g);
  for (const match of matches) {
    const company = normalizeLabel(match[1]);
    const count = parseDashboardQty(match[2]);
    if (company && count > 0) records.push({ company, count });
  }
  return records;
}

export function parseDispatchRecords(row = [], headers = [], { includePlanned = false } = {}) {
  const regions = DISPATCH_REGIONS
    .map((name) => ({ name, idx: findDashboardCol(headers, name) }))
    .filter((region) => region.idx >= 0 && (includePlanned || region.name !== PLANNED_DISPATCH_REGION));

  const records = [];
  regions.forEach((region) => {
    const text = row[region.idx];
    if (!text) return;

    parseDispatchCell(text).forEach((record) => {
      records.push({ ...record, region: region.name, row });
    });
  });
  return records;
}

export function getDispatchAssignedQty(row = [], headers = []) {
  return sumDispatchRecords(parseDispatchRecords(row, headers));
}

export function getDispatchPlannedQty(row = [], headers = []) {
  const idx = findDashboardCol(headers, PLANNED_DISPATCH_REGION);
  if (idx < 0) return 0;
  return sumDispatchRecords(parseDispatchCell(row[idx]));
}

export function getActualDispatchQty(row = [], headers = [], sheetDispatchValue = '') {
  const sheetDispatch = parseDashboardQty(sheetDispatchValue);
  if (sheetDispatch <= 0) return getDispatchAssignedQty(row, headers);

  const planned = getDispatchPlannedQty(row, headers);
  if (planned <= 0) return sheetDispatch;

  const adjustedSheetDispatch = Math.max(sheetDispatch - planned, 0);
  return Math.max(adjustedSheetDispatch, getDispatchAssignedQty(row, headers));
}

function addDispatcherRow(scope, row, headers, cols, viewType) {
  const amount = getCustomerWeight(row, cols, viewType);
  if (amount <= 0) return;

  const meta = getRowMeta(row, cols, viewType);
  const records = parseDispatchRecords(row, headers);
  addRegionAggs(scope, records);
  records.forEach((record) => {
    scope.total += record.count;
    scope.dispatchCount += 1;
    addPieAggs(scope, meta, record.count);
    addFeu(scope, meta.container, record.count);

    addChart(scope.chartAggs, '업체명', record.company, record.count, meta.workplace);
    addChart(scope.chartAggs, '작업지', meta.workplace, record.count, record.company);
    addChart(scope.chartAggs, '라인/선사', meta.line, record.count, record.company);
    addChart(scope.chartAggs, '고객사', meta.customer, record.count, record.company);
  });
}

function accumulateRows(scope, rows = [], headers = [], viewType = 'integrated', viewMode = 'customer') {
  const cols = getCols(headers);
  (rows || []).forEach((row) => {
    addBaseRowMetrics(scope, row, headers, cols, viewType);
    if (viewMode === 'dispatcher') {
      addDispatcherRow(scope, row, headers, cols, viewType);
    } else {
      addCustomerRow(scope, row, headers, cols, viewType);
    }
  });
  return scope;
}

function buildScopeFromItems(items = [], viewType = 'integrated', viewMode = 'customer') {
  const scope = createScope();
  (items || []).forEach((item) => {
    accumulateRows(scope, item?.data || [], item?.headers || [], viewType, viewMode);
  });
  return scope;
}

export function buildAsanDashboardScope({
  rows = [],
  headers = [],
  viewType = 'integrated',
  viewMode = 'customer',
} = {}) {
  return accumulateRows(createScope(), rows, headers, viewType, viewMode);
}

function formatDateLabel(dateStr = '') {
  if (!dateStr) return '선택일';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

function getKoreaTodayKey(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getDashboardHolidays(year) {
  const holidays = new Set(['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'].map((day) => `${year}-${day}`));
  const lunarHolidays = LUNAR_HOLIDAYS[year] || [];
  const lunarHolidaySet = new Set(lunarHolidays);
  const substituteStaticDays = new Set(['03-01', '05-05', '08-15', '10-03', '10-09']);
  lunarHolidays.forEach((day) => holidays.add(day));

  Array.from(holidays).forEach((holiday) => {
    if (!substituteStaticDays.has(holiday.slice(5)) && !lunarHolidaySet.has(holiday)) return;
    const date = new Date(`${holiday}T00:00:00`);
    if (date.getDay() !== 0 && date.getDay() !== 6) return;

    const next = new Date(date);
    while (true) {
      next.setDate(next.getDate() + 1);
      const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
      if (next.getDay() !== 0 && next.getDay() !== 6 && !holidays.has(nextKey)) {
        holidays.add(nextKey);
        break;
      }
    }
  });

  return holidays;
}

const DASHBOARD_HOLIDAY_CACHE = {};
function isDashboardBusinessDay(dateStr = '') {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getDay();
  if (day === 0 || day === 6) return false;

  const year = date.getFullYear();
  if (!DASHBOARD_HOLIDAY_CACHE[year]) DASHBOARD_HOLIDAY_CACHE[year] = getDashboardHolidays(year);
  return !DASHBOARD_HOLIDAY_CACHE[year].has(dateStr);
}

function formatMonthLabel(monthKey = '') {
  if (!monthKey) return '해당월';
  const [, month] = monthKey.includes('-') ? monthKey.split('-') : ['', monthKey];
  return `${Number(month)}월`;
}

function getWeekRange(dateStr = '') {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const toKey = (value) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${dayOfMonth}`;
  };

  const weekLabel = getWeekOfMonthLabel(toKey(sunday));
  const label = `${monday.getMonth() + 1}/${monday.getDate()}(${WEEKDAYS[monday.getDay()]})~${sunday.getMonth() + 1}/${sunday.getDate()}(${WEEKDAYS[sunday.getDay()]})`;

  return {
    start: toKey(monday),
    end: toKey(sunday),
    label,
    weekLabel,
    fullLabel: `${label} (${weekLabel})`,
  };
}

function getWeekOfMonthLabel(dateStr = '') {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';

  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstDay = first.getDay();
  const firstMondayOffset = firstDay === 0 ? -6 : 1 - firstDay;
  const firstWeekMonday = new Date(first);
  firstWeekMonday.setDate(first.getDate() + firstMondayOffset);

  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekMonday = new Date(date);
  weekMonday.setDate(date.getDate() + mondayOffset);

  const diffDays = Math.round((weekMonday - firstWeekMonday) / 86400000);
  const weekNo = Math.floor(diffDays / 7) + 1;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${month}월 ${weekNo}주차`;
}

function normalizeSourceItems(sourceItems = []) {
  return (sourceItems || [])
    .filter((item) => item?.target_date && Array.isArray(item?.headers) && Array.isArray(item?.data))
    .sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));
}

function pickDailyItem(items = [], activeDate = '', selectedMonth = '') {
  if (activeDate) {
    const exact = items.find((item) => item.target_date === activeDate);
    if (exact) return exact;
  }

  const candidates = selectedMonth
    ? items.filter((item) => item.target_date.slice(5, 7) === selectedMonth)
    : items;
  return candidates[candidates.length - 1] || items[items.length - 1] || null;
}

export function buildAsanDashboardPeriods({
  sourceItems = [],
  fallbackRows = [],
  fallbackHeaders = [],
  viewType = 'integrated',
  viewMode = 'customer',
  activeDate = '',
  selectedMonth = '',
} = {}) {
  const items = normalizeSourceItems(sourceItems);

  if (items.length === 0) {
    const scope = buildAsanDashboardScope({
      rows: fallbackRows,
      headers: fallbackHeaders,
      viewType,
      viewMode,
    });
    return [
      { key: 'daily', label: '선택일', title: '선택 범위', scope },
      { key: 'weekly', label: '주간', title: '선택 범위', scope },
      { key: 'monthly', label: '월별', title: '선택 범위', scope },
      { key: 'total', label: '전체', title: '선택 범위', scope },
    ];
  }

  const dailyItem = pickDailyItem(items, activeDate, selectedMonth);
  const monthKey = activeDate
    ? activeDate.slice(0, 7)
    : selectedMonth
      ? selectedMonth
      : dailyItem?.target_date?.slice(0, 7);

  const monthItems = monthKey?.includes('-')
    ? items.filter((item) => item.target_date.startsWith(monthKey))
    : items.filter((item) => item.target_date.slice(5, 7) === monthKey);
  const weekRange = getWeekRange(dailyItem?.target_date);
  const weekItems = weekRange
    ? items.filter((item) => item.target_date >= weekRange.start && item.target_date <= weekRange.end)
    : [];

  return [
    {
      key: 'daily',
      label: '선택일',
      title: formatDateLabel(dailyItem?.target_date),
      scope: buildScopeFromItems(dailyItem ? [dailyItem] : [], viewType, viewMode),
    },
    {
      key: 'weekly',
      label: '주간',
      title: weekRange?.fullLabel || '해당주',
      scope: buildScopeFromItems(weekItems, viewType, viewMode),
    },
    {
      key: 'monthly',
      label: '월별',
      title: formatMonthLabel(monthKey),
      scope: buildScopeFromItems(monthItems, viewType, viewMode),
    },
    {
      key: 'total',
      label: '전체',
      title: `${items.length}일`,
      scope: buildScopeFromItems(items, viewType, viewMode),
    },
  ];
}

const FORECAST_FALLBACK_PICKUPS = ['부곡', '부곡(의왕)', '의왕', '의왕ICD', '의왕아이씨디'];

function normalizeForecastText(value = '') {
  let text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()[\]{}·_\-./\\,]/g, '');
  const aliases = [
    ['부곡의왕', '의왕'],
    ['부곡', '의왕'],
    ['의왕icd', '의왕'],
    ['의왕아이씨디', '의왕'],
    ['군포복합물류', '의왕'],
    ['부산신항', '신항'],
    ['부산항', '부산'],
    ['글로비스kd센터', '글로비스kd'],
    ['글로비스kd', '글로비스'],
    ['글로비스as', '글로비스'],
    ['모비스as', '모비스'],
    ['현대글로비스', '글로비스'],
  ];
  aliases.forEach(([from, to]) => {
    text = text.replaceAll(from, to);
  });
  return text;
}

function normalizeForecastType(value = '') {
  const text = String(value || '').toUpperCase().replace(/\s+/g, '');
  if (text.includes('20')) return '20';
  if (text.includes('40') || text.includes('4O')) return '40';
  if (text.includes('45')) return '45';
  return normalizeForecastText(value);
}

function forecastFieldMatches(left = '', right = '') {
  const a = normalizeForecastText(left);
  const b = normalizeForecastText(right);
  if (!a || !b || a === '-' || b === '-') return false;
  if (a === b) return true;
  return (a.length >= 2 && b.includes(a)) || (b.length >= 2 && a.includes(b));
}

function forecastAnyMatch(leftValues = [], rightValues = []) {
  return leftValues.some((left) => rightValues.some((right) => forecastFieldMatches(left, right)));
}

function amountNumber(value) {
  const num = Number(String(value ?? '').replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function getForecastCols(headers = []) {
  return {
    ...getCols(headers),
    shipment: findDashboardCol(headers, '선적', '포트(DIST)', '포트(도착항)', '포트', '도착항'),
    billingPickup: findDashboardCol(headers, '상차지(청구)', '청구상차지', '청구 픽업'),
  };
}

function forecastRowValue(row = [], idx = -1) {
  return idx >= 0 ? normalizeLabel(row[idx], '') : '';
}

function routeUnitGroups(routeUnitPrice = null) {
  if (Array.isArray(routeUnitPrice?.groups)) return routeUnitPrice.groups;
  if (Array.isArray(routeUnitPrice?.routeUnitPrice?.groups)) return routeUnitPrice.routeUnitPrice.groups;
  return [];
}

function routeUnitSourceLabel(routeUnitPrice = null) {
  const price = routeUnitPrice?.routeUnitPrice || routeUnitPrice || {};
  const summary = price.summary || {};
  const scope = price.scope || {};
  return summary.periodEnd || scope.month || scope.label || price.datasetBasis || '최신 구간단가';
}

function buildRouteUnitMatchData(routeUnitPrice = null) {
  const groups = routeUnitGroups(routeUnitPrice)
    .map((group) => {
      const unitRevenue = amountNumber(group.unitRevenue ?? group.revenueAmount);
      const unitPurchase = amountNumber(group.unitPurchase ?? group.purchaseAmount);
      return {
        ...group,
        unitRevenue,
        unitPurchase,
        unitProfit: unitRevenue - unitPurchase,
        match: {
          type: normalizeForecastType(group.type),
          category: normalizeForecastText(group.category || group.salesItem),
          workSite: normalizeForecastText(group.workSite),
          pickup: normalizeForecastText(group.pickup),
          billingPickup: normalizeForecastText(group.billingPickup),
          shipment: normalizeForecastText(group.shipment),
          carrier: normalizeForecastText(group.carrier),
          billTo: normalizeForecastText(group.billTo || group.salesItem),
          payTo: normalizeForecastText(group.payTo || group.carrier),
          salesItem: normalizeForecastText(group.salesItem),
          region: normalizeForecastText(group.region),
        },
      };
    })
    .filter((group) => group.unitRevenue || group.unitPurchase);
  const averages = new Map();
  groups.forEach((group) => {
    const keys = [
      `${group.match.type}|${group.match.category}`,
      `${group.match.type}|`,
      `|${group.match.category}`,
      '|',
    ];
    keys.forEach((key) => {
      if (!averages.has(key)) averages.set(key, { revenue: 0, purchase: 0, count: 0 });
      const bucket = averages.get(key);
      bucket.revenue += group.unitRevenue;
      bucket.purchase += group.unitPurchase;
      bucket.count += 1;
    });
  });
  return { groups, averages };
}

function averageRouteUnit(matchData, segment = {}) {
  const keys = [
    `${normalizeForecastType(segment.type)}|${normalizeForecastText(segment.direction)}`,
    `${normalizeForecastType(segment.type)}|`,
    `|${normalizeForecastText(segment.direction)}`,
    '|',
  ];
  for (const key of keys) {
    const bucket = matchData.averages.get(key);
    if (bucket?.count > 0) {
      return {
        unitRevenue: bucket.revenue / bucket.count,
        unitPurchase: bucket.purchase / bucket.count,
        unitBasis: 'average',
      };
    }
  }
  return null;
}

function segmentCandidates(segment = {}, fallbackPickup = false) {
  const pickupValues = fallbackPickup
    ? [...FORECAST_FALLBACK_PICKUPS, segment.pickup, segment.billingPickup]
    : [segment.pickup, segment.billingPickup];
  return {
    type: [segment.type],
    category: [segment.direction, segment.salesItem],
    workSite: [segment.workSite],
    pickup: pickupValues,
    shipment: [segment.shipment, segment.port],
    carrier: [segment.carrier, segment.payTo],
    billTo: [segment.billTo, segment.customer, segment.shipper],
    payTo: [segment.payTo, segment.carrier],
    salesItem: [segment.salesItem, segment.shipper],
  };
}

function scoreRouteUnitGroup(segment = {}, group = {}, fallbackPickup = false) {
  const values = segmentCandidates(segment, fallbackPickup);
  let score = 0;
  let strong = 0;
  const typeKey = normalizeForecastType(values.type[0]);
  if (typeKey && group.match.type) {
    if (typeKey === group.match.type) score += 20;
    else return -1;
  }
  if (forecastAnyMatch(values.category, [group.category, group.salesItem])) {
    score += 12;
    strong += 1;
  } else if (group.match.category && normalizeForecastText(segment.direction)) {
    score -= 5;
  }
  if (forecastAnyMatch(values.workSite, [group.workSite])) {
    score += 16;
    strong += 1;
  } else if (normalizeForecastText(segment.workSite) && group.match.workSite) {
    return -1;
  }
  const segmentHasPickup = normalizeForecastText(segment.pickup || segment.billingPickup);
  const groupHasPickup = group.match.pickup || group.match.billingPickup || group.match.region;
  if (forecastAnyMatch(values.pickup, [group.pickup, group.billingPickup, group.region])) {
    score += fallbackPickup ? 9 : 17;
    strong += 1;
  } else if (segmentHasPickup && groupHasPickup && !fallbackPickup) {
    return -1;
  }
  if (forecastAnyMatch(values.shipment, [group.shipment])) {
    score += 9;
    strong += 1;
  }
  if (forecastAnyMatch(values.carrier, [group.carrier, group.payTo])) score += 6;
  if (forecastAnyMatch(values.billTo, [group.billTo, group.salesItem])) score += 5;
  if (forecastAnyMatch(values.salesItem, [group.salesItem, group.billTo])) score += 5;
  if (strong === 0) return -1;
  return score;
}

function findRouteUnitMatch(matchData, segment = {}) {
  const pickBest = (fallbackPickup = false) => {
    let best = null;
    for (const group of matchData.groups) {
      const score = scoreRouteUnitGroup(segment, group, fallbackPickup);
      if (score < 0) continue;
      if (!best || score > best.score) best = { group, score, fallbackPickup };
    }
    return best && best.score >= (fallbackPickup ? 24 : 30) ? best : null;
  };
  const exact = pickBest(false);
  if (exact) return exact;
  return pickBest(true);
}

function buildFinancialSegments(row = [], headers = [], item = {}, viewType = 'integrated') {
  const cols = getForecastCols(headers);
  const orderQty = getCustomerWeight(row, cols, viewType);
  if (orderQty <= 0) return [];
  const meta = getRowMeta(row, cols, viewType);
  const base = {
    date: item.target_date || '',
    direction: meta.direction,
    salesItem: meta.shipper,
    shipper: meta.shipper,
    workSite: meta.workplace,
    customer: meta.customer,
    billTo: meta.customer,
    line: meta.line,
    type: meta.container,
    shipment: forecastRowValue(row, cols.shipment),
    port: forecastRowValue(row, cols.shipment),
    billingPickup: forecastRowValue(row, cols.billingPickup),
  };
  const records = parseDispatchRecords(row, headers);
  const assignedQty = records.reduce((sum, record) => sum + record.count, 0);
  const segments = records.map((record) => ({
    ...base,
    qty: record.count,
    pickup: record.region,
    carrier: record.company,
    payTo: record.company,
    pickupFallback: false,
  }));
  const remainder = Math.max(orderQty - assignedQty, 0);
  if (!segments.length || remainder > 0.001) {
    segments.push({
      ...base,
      qty: segments.length ? remainder : orderQty,
      pickup: base.billingPickup || '',
      carrier: '',
      payTo: '',
      pickupFallback: true,
    });
  }
  return segments.filter((segment) => segment.qty > 0);
}

function createFinancialEmptyPeriod(key, label, title, sourcePeriod = '') {
  return {
    key,
    label,
    title,
    sourcePeriod,
    qty: 0,
    revenue: 0,
    purchase: 0,
    profit: 0,
    profitRate: 0,
    matchedQty: 0,
    fallbackPickupQty: 0,
    averageFallbackQty: 0,
    unmatchedQty: 0,
    issueCount: 0,
    topIssues: [],
    available: false,
  };
}

function finalizeFinancialPeriod(period) {
  const revenue = Math.round(period.revenue);
  const purchase = Math.round(period.purchase);
  const profit = revenue - purchase;
  return {
    ...period,
    revenue,
    purchase,
    profit,
    profitRate: revenue ? Math.round((profit / revenue) * 10000) / 100 : 0,
    matchedQty: Math.round(period.matchedQty * 10) / 10,
    fallbackPickupQty: Math.round(period.fallbackPickupQty * 10) / 10,
    averageFallbackQty: Math.round(period.averageFallbackQty * 10) / 10,
    unmatchedQty: Math.round(period.unmatchedQty * 10) / 10,
    qty: Math.round(period.qty * 10) / 10,
    issueCount: period.topIssues.length,
    topIssues: period.topIssues.slice(0, 12),
    available: period.qty > 0,
  };
}

function addFinancialSegment(period, segment, matchData) {
  const match = findRouteUnitMatch(matchData, segment);
  const average = match ? null : averageRouteUnit(matchData, segment);
  const unit = match?.group || average;
  period.qty += segment.qty;
  if (!unit) {
    period.unmatchedQty += segment.qty;
    period.topIssues.push({
      type: 'unmatched',
      label: `${segment.date || '-'} · ${segment.workSite || '작업지 미분류'} · ${segment.type || '-'} · ${segment.pickup || '상차지 미확인'} · ${segment.carrier || segment.payTo || '운송사 미확인'}`,
      reason: '의왕상차/평균단가 후보 없음',
      qty: segment.qty,
    });
    return;
  }
  period.revenue += unit.unitRevenue * segment.qty;
  period.purchase += unit.unitPurchase * segment.qty;
  if (match) {
    period.matchedQty += segment.qty;
    if (match.fallbackPickup || segment.pickupFallback) {
      period.fallbackPickupQty += segment.qty;
      period.topIssues.push({
        type: 'fallback-pickup',
        label: `${segment.date || '-'} · ${segment.workSite || '작업지 미분류'} · ${segment.type || '-'} · ${segment.pickup || '상차지 미확인'} · ${segment.carrier || segment.payTo || '운송사 미확인'}`,
        reason: '실제 픽업지 단가 없음: 의왕상차 청구/하불금액 적용',
        qty: segment.qty,
      });
    }
    return;
  }
  period.averageFallbackQty += segment.qty;
  period.topIssues.push({
    type: 'average',
    label: `${segment.date || '-'} · ${segment.workSite || '작업지 미분류'} · ${segment.type || '-'} · ${segment.pickup || '상차지 미확인'} · ${segment.carrier || segment.payTo || '운송사 미확인'}`,
    reason: '의왕상차 후보 없음: 동일 TYPE/구분 평균단가',
    qty: segment.qty,
  });
}

function computeFinancialPeriod({ key, label, title, items = [], viewType, matchData, sourcePeriod }) {
  const period = createFinancialEmptyPeriod(key, label, title, sourcePeriod);
  items.forEach((item) => {
    (item.data || []).forEach((row) => {
      buildFinancialSegments(row, item.headers || [], item, viewType).forEach((segment) => {
        addFinancialSegment(period, segment, matchData);
      });
    });
  });
  return finalizeFinancialPeriod(period);
}

export function buildAsanDashboardFinancialForecast({
  sourceItems = [],
  fallbackRows = [],
  fallbackHeaders = [],
  viewType = 'integrated',
  routeUnitPrice = null,
  selectedDay = '',
  selectedWeek = '',
  selectedMonth = '',
  activePeriod = 'daily',
} = {}) {
  const matchData = buildRouteUnitMatchData(routeUnitPrice);
  const sourcePeriod = routeUnitSourceLabel(routeUnitPrice);
  if (!matchData.groups.length) {
    return {
      available: false,
      sourcePeriod,
      activeKey: normalizeDashboardPeriodKey(activePeriod),
      active: null,
      periods: ['daily', 'weekly', 'monthly'].map((key) => createFinancialEmptyPeriod(key, key, '구간단가 없음', sourcePeriod)),
      reason: '구간단가 자료 없음',
    };
  }

  const items = normalizeSourceItems(sourceItems);
  const workingItems = items.length
    ? items
    : [{ target_date: selectedDay || '', headers: fallbackHeaders, data: fallbackRows }];
  const options = buildAsanDashboardPeriodOptions(workingItems);
  const latestDate = options.dates[options.dates.length - 1]?.key || selectedDay || '';
  const dayKey = resolveOptionKey(options.dates, selectedDay, latestDate);
  const dayItem = workingItems.find((item) => item.target_date === dayKey) || null;
  const currentWeekKey = findWeekOptionForDate(options.weeks, dayKey)?.key || options.weeks[options.weeks.length - 1]?.key || '';
  const weekKey = resolveOptionKey(options.weeks, selectedWeek, currentWeekKey);
  const weekOption = options.weeks.find((option) => option.key === weekKey);
  const currentMonthKey = dayKey ? dayKey.slice(0, 7) : options.months[options.months.length - 1]?.key || '';
  const monthKey = resolveOptionKey(options.months, selectedMonth, currentMonthKey);
  const monthOption = options.months.find((option) => option.key === monthKey);
  const weekItems = weekOption
    ? workingItems.filter((item) => item.target_date >= weekOption.start && item.target_date <= weekOption.end)
    : [];
  const monthItems = monthKey
    ? workingItems.filter((item) => item.target_date.startsWith(monthKey))
    : [];
  const periods = [
    computeFinancialPeriod({
      key: 'daily',
      label: '일별',
      title: options.dates.find((option) => option.key === dayKey)?.label || '선택일',
      items: dayItem ? [dayItem] : [],
      viewType,
      matchData,
      sourcePeriod,
    }),
    computeFinancialPeriod({
      key: 'weekly',
      label: '주별',
      title: weekOption?.label || '해당주',
      items: weekItems,
      viewType,
      matchData,
      sourcePeriod,
    }),
    computeFinancialPeriod({
      key: 'monthly',
      label: '월별',
      title: monthOption?.label || formatMonthLabel(monthKey),
      items: monthItems,
      viewType,
      matchData,
      sourcePeriod,
    }),
    computeFinancialPeriod({
      key: 'total',
      label: '전체',
      title: `${workingItems.length}일`,
      items: workingItems,
      viewType,
      matchData,
      sourcePeriod,
    }),
  ];
  const activeKey = normalizeDashboardPeriodKey(activePeriod);
  return {
    available: periods.some((period) => period.available),
    sourcePeriod,
    activeKey,
    active: periods.find((period) => period.key === activeKey) || periods[0] || null,
    periods,
  };
}

function buildFinancialDashboardCache(items = [], options = {}, viewType = 'integrated', routeUnitPrice = null) {
  const matchData = buildRouteUnitMatchData(routeUnitPrice);
  const sourcePeriod = routeUnitSourceLabel(routeUnitPrice);
  const empty = {
    available: false,
    sourcePeriod,
    daily: {},
    weekly: {},
    monthly: {},
    total: createFinancialEmptyPeriod('total', '전체', `${items.length}일`, sourcePeriod),
  };
  if (!matchData.groups.length) return empty;

  const daily = {};
  const weekly = {};
  const monthly = {};
  (options.dates || []).forEach((option) => {
    daily[option.key] = computeFinancialPeriod({
      key: 'daily',
      label: '일별',
      title: option.label || formatDateLabel(option.key),
      items: items.filter((item) => item.target_date === option.key),
      viewType,
      matchData,
      sourcePeriod,
    });
  });
  (options.weeks || []).forEach((option) => {
    weekly[option.key] = computeFinancialPeriod({
      key: 'weekly',
      label: '주별',
      title: option.label || option.fullLabel || '해당주',
      items: items.filter((item) => item.target_date >= option.start && item.target_date <= option.end),
      viewType,
      matchData,
      sourcePeriod,
    });
  });
  (options.months || []).forEach((option) => {
    monthly[option.key] = computeFinancialPeriod({
      key: 'monthly',
      label: '월별',
      title: option.label || formatMonthLabel(option.key),
      items: items.filter((item) => item.target_date.startsWith(option.key)),
      viewType,
      matchData,
      sourcePeriod,
    });
  });
  const total = computeFinancialPeriod({
    key: 'total',
    label: '전체',
    title: `${items.length}일`,
    items,
    viewType,
    matchData,
    sourcePeriod,
  });
  return {
    available: [total, ...Object.values(daily), ...Object.values(weekly), ...Object.values(monthly)].some((period) => period.available),
    sourcePeriod,
    daily,
    weekly,
    monthly,
    total,
  };
}

function selectFinancialForecastFromCache(financial = null, { dayKey = '', weekKey = '', monthKey = '', activePeriodKey = 'daily' } = {}) {
  if (!financial) return null;
  const sourcePeriod = financial.sourcePeriod || '최신 구간단가';
  const periods = [
    financial.daily?.[dayKey] || createFinancialEmptyPeriod('daily', '일별', '선택일', sourcePeriod),
    financial.weekly?.[weekKey] || createFinancialEmptyPeriod('weekly', '주별', '해당주', sourcePeriod),
    financial.monthly?.[monthKey] || createFinancialEmptyPeriod('monthly', '월별', '해당월', sourcePeriod),
    financial.total || createFinancialEmptyPeriod('total', '전체', '전체', sourcePeriod),
  ];
  return {
    available: periods.some((period) => period.available),
    sourcePeriod,
    activeKey: activePeriodKey,
    active: periods.find((period) => period.key === activePeriodKey) || periods[0] || null,
    periods,
  };
}

function resolveOptionKey(options = [], requested = '', fallback = '') {
  if (!requested) return fallback;
  if (options.some((option) => option.key === requested)) return requested;

  const monthLike = String(requested).padStart(2, '0');
  const monthMatch = options.filter((option) => option.key.endsWith(`-${monthLike}`));
  return monthMatch[monthMatch.length - 1]?.key || fallback;
}

function normalizeDashboardPeriodKey(value = 'daily') {
  return ['daily', 'weekly', 'monthly', 'total'].includes(value) ? value : 'daily';
}

function findWeekOptionForDate(weeks = [], dateKey = '') {
  return weeks.find((week) => dateKey >= week.start && dateKey <= week.end) || null;
}

function pickPreviousOptionKey(options = [], currentKey = '') {
  const currentIndex = options.findIndex((option) => option.key === currentKey);
  if (currentIndex > 0) return options[currentIndex - 1].key;
  return currentKey || options[options.length - 1]?.key || '';
}

export function buildAsanDashboardPeriodOptions(sourceItems = []) {
  const items = normalizeSourceItems(sourceItems);
  const weekMap = new Map();
  const monthMap = new Map();

  items.forEach((item) => {
    const weekRange = getWeekRange(item.target_date);
    if (weekRange) {
      const key = `${weekRange.start}_${weekRange.end}`;
      if (!weekMap.has(key)) {
        weekMap.set(key, {
          key,
          label: weekRange.fullLabel,
          shortLabel: weekRange.label,
          weekLabel: weekRange.weekLabel,
          start: weekRange.start,
          end: weekRange.end,
        });
      }
    }

    const monthKey = item.target_date.slice(0, 7);
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        key: monthKey,
        label: formatMonthLabel(monthKey),
      });
    }
  });

  return {
    dates: items.map((item) => ({
      key: item.target_date,
      label: formatDateLabel(item.target_date),
    })),
    weeks: [...weekMap.values()],
    months: [...monthMap.values()],
  };
}

export function buildSelectableAsanDashboardPeriods({
  sourceItems = [],
  fallbackRows = [],
  fallbackHeaders = [],
  viewType = 'integrated',
  viewMode = 'customer',
  selectedDay = '',
  selectedWeek = '',
  selectedMonth = '',
} = {}) {
  const items = normalizeSourceItems(sourceItems);
  const options = buildAsanDashboardPeriodOptions(items);

  if (items.length === 0) {
    const scope = buildAsanDashboardScope({
      rows: fallbackRows,
      headers: fallbackHeaders,
      viewType,
      viewMode,
    });
    const emptyOptions = { dates: [], weeks: [], months: [] };
    return {
      options: emptyOptions,
      periods: [
        { key: 'daily', label: '일별', title: '선택 범위', selectedKey: '', options: [], scope, previousScope: null },
        { key: 'weekly', label: '주별', title: '선택 범위', selectedKey: '', options: [], scope, previousScope: null },
        { key: 'monthly', label: '월별', title: '선택 범위', selectedKey: '', options: [], scope, previousScope: null },
        { key: 'total', label: '전체', title: '전체', selectedKey: 'all', options: [], scope, previousScope: null },
      ],
    };
  }

  const latestDate = options.dates[options.dates.length - 1]?.key || '';
  const dayKey = resolveOptionKey(options.dates, selectedDay, latestDate);
  const dayItem = items.find((item) => item.target_date === dayKey);
  const dayIndex = options.dates.findIndex((option) => option.key === dayKey);

  const currentWeekKey = findWeekOptionForDate(options.weeks, dayKey)?.key || options.weeks[options.weeks.length - 1]?.key || '';
  const defaultWeekKey = pickPreviousOptionKey(options.weeks, currentWeekKey);
  const weekKey = resolveOptionKey(options.weeks, selectedWeek, defaultWeekKey);
  const weekOption = options.weeks.find((option) => option.key === weekKey);
  const weekIndex = options.weeks.findIndex((option) => option.key === weekKey);

  const currentMonthKey = dayKey ? dayKey.slice(0, 7) : options.months[options.months.length - 1]?.key || '';
  const currentMonthOptionKey = resolveOptionKey(options.months, currentMonthKey, options.months[options.months.length - 1]?.key || '');
  const defaultMonthKey = pickPreviousOptionKey(options.months, currentMonthOptionKey);
  const monthKey = resolveOptionKey(options.months, selectedMonth, defaultMonthKey);
  const monthOption = options.months.find((option) => option.key === monthKey);
  const monthIndex = options.months.findIndex((option) => option.key === monthKey);

  const weekItems = weekOption
    ? items.filter((item) => item.target_date >= weekOption.start && item.target_date <= weekOption.end)
    : [];
  const monthItems = monthKey
    ? items.filter((item) => item.target_date.startsWith(monthKey))
    : [];

  const previousDay = dayIndex > 0 ? items.find((item) => item.target_date === options.dates[dayIndex - 1].key) : null;
  const previousWeekOption = weekIndex > 0 ? options.weeks[weekIndex - 1] : null;
  const previousWeekItems = previousWeekOption
    ? items.filter((item) => item.target_date >= previousWeekOption.start && item.target_date <= previousWeekOption.end)
    : [];
  const previousMonthOption = monthIndex > 0 ? options.months[monthIndex - 1] : null;
  const previousMonthItems = previousMonthOption
    ? items.filter((item) => item.target_date.startsWith(previousMonthOption.key))
    : [];

  return {
    options,
    periods: [
      {
        key: 'daily',
        label: '일별',
        title: options.dates.find((option) => option.key === dayKey)?.label || '선택일',
        selectedKey: dayKey,
        options: options.dates,
        scope: buildScopeFromItems(dayItem ? [dayItem] : [], viewType, viewMode),
        previousScope: previousDay ? buildScopeFromItems([previousDay], viewType, viewMode) : null,
      },
      {
        key: 'weekly',
        label: '주별',
        title: weekOption?.label || '해당주',
        selectedKey: weekKey,
        options: options.weeks,
        scope: buildScopeFromItems(weekItems, viewType, viewMode),
        previousScope: previousWeekItems.length > 0 ? buildScopeFromItems(previousWeekItems, viewType, viewMode) : null,
      },
      {
        key: 'monthly',
        label: '월별',
        title: monthOption?.label || '해당월',
        selectedKey: monthKey,
        options: options.months,
        scope: buildScopeFromItems(monthItems, viewType, viewMode),
        previousScope: previousMonthItems.length > 0 ? buildScopeFromItems(previousMonthItems, viewType, viewMode) : null,
      },
      {
        key: 'total',
        label: '전체',
        title: `${items.length}일`,
        selectedKey: 'all',
        options: [],
        scope: buildScopeFromItems(items, viewType, viewMode),
        previousScope: null,
      },
    ],
  };
}

export function buildAsanDashboardTimeline({
  sourceItems = [],
  viewType = 'integrated',
  viewMode = 'customer',
  todayKey = getKoreaTodayKey(),
} = {}) {
  const items = normalizeSourceItems(sourceItems)
    .filter((item) => item.target_date <= todayKey)
    .filter((item) => isDashboardBusinessDay(item.target_date));
  let prevTotal = null;

  return items.map((item) => {
    const scope = buildScopeFromItems([item], viewType, viewMode);
    const delta = prevTotal == null ? 0 : scope.total - prevTotal;
    const deltaPct = prevTotal ? Math.round((delta / prevTotal) * 100) : 0;
    prevTotal = scope.total;

    return {
      date: item.target_date,
      label: formatDateLabel(item.target_date),
      total: scope.total,
      orderTotal: scope.orderTotal,
      dispatchTotal: scope.sheetDispatchTotal || scope.total,
      mismatchTotal: scope.mismatchTotal,
      delta,
      deltaPct,
    };
  });
}

function parseWeekKey(weekKey = '') {
  const [start, end] = String(weekKey || '').split('_');
  return start && end ? { start, end } : null;
}

function inWeekRange(item, weekKey = '') {
  const range = parseWeekKey(weekKey);
  return range ? item.target_date >= range.start && item.target_date <= range.end : false;
}

function classifyBasisDiff(customerTotal, dispatcherTotal, records = []) {
  if (dispatcherTotal <= 0 && customerTotal > 0) return '지역 배차칸 수량 없음';
  if (customerTotal <= 0 && dispatcherTotal > 0) return '오더 수량 없음';
  if (records.length === 0) return '실행사 지역칸 미기입';
  return '오더와 지역칸 합계 차이';
}

function buildBasisDiffIssues(items = [], viewType = 'integrated', limit = 4) {
  const issues = [];
  normalizeSourceItems(items).forEach((item) => {
    const cols = getCols(item.headers || []);
    (item.data || []).forEach((row, rowIndex) => {
      const customerTotal = getCustomerWeight(row, cols, viewType);
      if (customerTotal <= 0) return;
      const records = parseDispatchRecords(row, item.headers || []);
      const dispatcherTotal = sumDispatchRecords(records);
      const diff = dispatcherTotal - customerTotal;
      if (Math.abs(diff) < 0.01) return;

      const meta = getRowMeta(row, cols, viewType);
      const regionSummary = records
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((record) => `${record.region}:${record.company} ${record.count}`)
        .join(' / ');

      issues.push({
        id: `${item.target_date}_${rowIndex}`,
        date: item.target_date,
        dateLabel: formatDateLabel(item.target_date),
        rowIndex: rowIndex + 1,
        title: meta.workplace || meta.customer || meta.shipper,
        subtitle: [meta.shipper, meta.customer, meta.line].filter((value) => value && value !== '미분류').join(' · '),
        search: meta.workplace || meta.customer || meta.shipper || '',
        customerTotal,
        dispatcherTotal,
        diff,
        reason: classifyBasisDiff(customerTotal, dispatcherTotal, records),
        regionSummary,
      });
    });
  });

  return issues
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, limit);
}

export function buildAsanDashboardBasisDiffSummary({
  sourceItems = [],
  fallbackRows = [],
  fallbackHeaders = [],
  viewType = 'integrated',
  selectedDay = '',
  selectedWeek = '',
  selectedMonth = '',
} = {}) {
  const customerPeriods = buildSelectableAsanDashboardPeriods({
    sourceItems,
    fallbackRows,
    fallbackHeaders,
    viewType,
    viewMode: 'customer',
    selectedDay,
    selectedWeek,
    selectedMonth,
  });
  const dispatcherPeriods = buildSelectableAsanDashboardPeriods({
    sourceItems,
    fallbackRows,
    fallbackHeaders,
    viewType,
    viewMode: 'dispatcher',
    selectedDay,
    selectedWeek,
    selectedMonth,
  });

  const periodKeys = ['daily', 'weekly', 'monthly'];
  const periods = periodKeys.map((key) => {
    const customer = customerPeriods.periods.find((period) => period.key === key);
    const dispatcher = dispatcherPeriods.periods.find((period) => period.key === key);
    const customerTotal = customer?.scope?.total || 0;
    const dispatcherTotal = dispatcher?.scope?.total || 0;
    return {
      key,
      label: customer?.label || dispatcher?.label || key,
      title: customer?.title || dispatcher?.title || '',
      selectedKey: customer?.selectedKey || dispatcher?.selectedKey || '',
      customerTotal,
      dispatcherTotal,
      diff: dispatcherTotal - customerTotal,
    };
  });

  const weeklyKey = periods.find((period) => period.key === 'weekly')?.selectedKey || '';
  const monthlyKey = periods.find((period) => period.key === 'monthly')?.selectedKey || '';
  const dailyKey = periods.find((period) => period.key === 'daily')?.selectedKey || selectedDay;
  const items = normalizeSourceItems(sourceItems);
  const fallbackItem = { target_date: selectedDay || dailyKey || '', headers: fallbackHeaders, data: fallbackRows };
  const issueSources = {
    daily: items.filter((item) => item.target_date === dailyKey),
    weekly: weeklyKey ? items.filter((item) => inWeekRange(item, weeklyKey)) : [],
    monthly: monthlyKey ? items.filter((item) => item.target_date.startsWith(monthlyKey)) : [],
  };
  issueSources.daily = issueSources.daily.length > 0 ? issueSources.daily : [fallbackItem];
  issueSources.weekly = issueSources.weekly.length > 0 ? issueSources.weekly : issueSources.daily;
  issueSources.monthly = issueSources.monthly.length > 0 ? issueSources.monthly : issueSources.weekly;
  const issueGroups = Object.fromEntries(
    Object.entries(issueSources).map(([key, source]) => [key, buildBasisDiffIssues(source, viewType, 4)]),
  );

  return {
    periods,
    issueGroups,
    issues: issueGroups.daily,
  };
}

function createWeekdayBuckets() {
  return [1, 2, 3, 4, 5].map((dayIndex) => ({
    dayIndex,
    label: WEEKDAYS[dayIndex],
    total: 0,
    count: 0,
    average: 0,
    breakdown: {},
  }));
}

function summarizeWeekdayItems(items = [], viewType = 'integrated') {
  const buckets = createWeekdayBuckets();
  const bucketMap = new Map(buckets.map((bucket) => [bucket.dayIndex, bucket]));

  items.forEach((item) => {
    if (!isDashboardBusinessDay(item.target_date)) return;
    const date = new Date(`${item.target_date}T00:00:00`);
    const bucket = bucketMap.get(date.getDay());
    if (!bucket) return;
    const scope = buildScopeFromItems([item], viewType, 'customer');
    bucket.total += scope.total;
    bucket.count += 1;
    toSortedChartEntries(scope.chartAggs['작업지']).forEach((entry) => {
      bucket.breakdown[entry.name] = (bucket.breakdown[entry.name] || 0) + entry.total;
    });
  });

  buckets.forEach((bucket) => {
    bucket.average = bucket.count > 0 ? bucket.total / bucket.count : 0;
  });

  return buckets;
}

export function buildAsanDashboardWeekdayComparison({
  sourceItems = [],
  viewType = 'integrated',
  weekKey = '',
  monthKey = '',
} = {}) {
  const items = normalizeSourceItems(sourceItems);
  const weekRange = parseWeekKey(weekKey);
  const weekItems = weekRange
    ? items.filter((item) => item.target_date >= weekRange.start && item.target_date <= weekRange.end)
    : [];
  const monthItems = monthKey
    ? items.filter((item) => item.target_date.startsWith(monthKey))
    : [];

  return {
    week: {
      key: weekKey,
      label: weekRange ? `${formatDateLabel(weekRange.start)}~${formatDateLabel(weekRange.end)}` : '선택 주',
      weekLabel: weekRange ? getWeekOfMonthLabel(weekRange.end) : '',
      fullLabel: weekRange ? `${formatDateLabel(weekRange.start)}~${formatDateLabel(weekRange.end)} (${getWeekOfMonthLabel(weekRange.end)})` : '선택 주',
      buckets: summarizeWeekdayItems(weekItems, viewType),
    },
    month: {
      key: monthKey,
      label: formatMonthLabel(monthKey),
      buckets: summarizeWeekdayItems(monthItems, viewType),
    },
  };
}

function getScopeMapForOptions(items = [], options = [], viewType = 'integrated', viewMode = 'customer', filterItems) {
  const map = {};
  options.forEach((option) => {
    map[option.key] = buildScopeFromItems(filterItems(option), viewType, viewMode);
  });
  return map;
}

function getCachedPreviousScope(scopeMap = {}, options = [], key = '') {
  const index = options.findIndex((option) => option.key === key);
  if (index <= 0) return null;
  return scopeMap[options[index - 1].key] || null;
}

function getEmptyWeekdayComparison(weekKey = '', monthKey = '') {
  return {
    week: { key: weekKey, label: '선택 주', weekLabel: '', fullLabel: '선택 주', buckets: createWeekdayBuckets() },
    month: { key: monthKey, label: formatMonthLabel(monthKey), buckets: createWeekdayBuckets() },
  };
}

function buildModeDashboardCache(items = [], options = {}, viewType = 'integrated', viewMode = 'customer') {
  const daily = getScopeMapForOptions(items, options.dates || [], viewType, viewMode, (option) => (
    items.filter((item) => item.target_date === option.key)
  ));
  const weekly = getScopeMapForOptions(items, options.weeks || [], viewType, viewMode, (option) => (
    items.filter((item) => item.target_date >= option.start && item.target_date <= option.end)
  ));
  const monthly = getScopeMapForOptions(items, options.months || [], viewType, viewMode, (option) => (
    items.filter((item) => item.target_date.startsWith(option.key))
  ));
  const weekdayWeeks = {};
  const weekdayMonths = {};

  (options.weeks || []).forEach((option) => {
    const weekItems = items.filter((item) => item.target_date >= option.start && item.target_date <= option.end);
    weekdayWeeks[option.key] = {
      key: option.key,
      label: `${formatDateLabel(option.start)}~${formatDateLabel(option.end)}`,
      weekLabel: getWeekOfMonthLabel(option.end),
      fullLabel: option.label,
      buckets: summarizeWeekdayItems(weekItems, viewType),
    };
  });

  (options.months || []).forEach((option) => {
    const monthItems = items.filter((item) => item.target_date.startsWith(option.key));
    weekdayMonths[option.key] = {
      key: option.key,
      label: option.label,
      buckets: summarizeWeekdayItems(monthItems, viewType),
    };
  });

  return {
    daily,
    weekly,
    monthly,
    total: buildScopeFromItems(items, viewType, viewMode),
    timeline: buildAsanDashboardTimeline({ sourceItems: items, viewType, viewMode }),
    weekday: {
      weeks: weekdayWeeks,
      months: weekdayMonths,
    },
  };
}

function buildBasisDiffCache(items = [], options = {}, viewType = 'integrated', modes = {}) {
  const makeEntry = (kind, option, sourceItems) => {
    const customerTotal = modes.customer?.[kind]?.[option.key]?.total || 0;
    const dispatcherTotal = modes.dispatcher?.[kind]?.[option.key]?.total || 0;
    return {
      key: kind,
      label: kind === 'daily' ? '일별' : (kind === 'weekly' ? '주별' : '월별'),
      title: option.label || option.fullLabel || '',
      selectedKey: option.key,
      customerTotal,
      dispatcherTotal,
      diff: dispatcherTotal - customerTotal,
      issues: buildBasisDiffIssues(sourceItems, viewType, 4),
    };
  };

  const daily = {};
  const weekly = {};
  const monthly = {};
  (options.dates || []).forEach((option) => {
    daily[option.key] = makeEntry('daily', option, items.filter((item) => item.target_date === option.key));
  });
  (options.weeks || []).forEach((option) => {
    weekly[option.key] = makeEntry('weekly', option, items.filter((item) => item.target_date >= option.start && item.target_date <= option.end));
  });
  (options.months || []).forEach((option) => {
    monthly[option.key] = makeEntry('monthly', option, items.filter((item) => item.target_date.startsWith(option.key)));
  });
  return { daily, weekly, monthly };
}

export function buildAsanDashboardCachePayload({
  sourceItems = [],
  viewType = 'integrated',
  routeUnitPrice = null,
} = {}) {
  const items = normalizeSourceItems(sourceItems);
  const options = buildAsanDashboardPeriodOptions(items);
  const modes = {
    customer: buildModeDashboardCache(items, options, viewType, 'customer'),
    dispatcher: buildModeDashboardCache(items, options, viewType, 'dispatcher'),
  };

  return {
    version: 1,
    viewType,
    generatedAt: new Date().toISOString(),
    options,
    modes,
    financial: buildFinancialDashboardCache(items, options, viewType, routeUnitPrice),
    basisDiff: buildBasisDiffCache(items, options, viewType, modes),
  };
}

export function buildAsanDashboardDataFromCache({
  cachePayload = null,
  fallbackRows = [],
  fallbackHeaders = [],
  viewType = 'integrated',
  viewMode = 'customer',
  activeDate = '',
  selectedDay = '',
  selectedWeek = '',
  selectedMonth = '',
  activePeriod = 'daily',
  routeUnitPrice = null,
} = {}) {
  if (!cachePayload || cachePayload.version !== 1) return null;
  const options = cachePayload.options || {};
  const modeCache = cachePayload.modes?.[viewMode];
  if (!modeCache) return null;

  const latestDate = options.dates?.[options.dates.length - 1]?.key || '';
  const dayKey = resolveOptionKey(options.dates || [], selectedDay || activeDate, activeDate || latestDate);
  const currentWeekKey = findWeekOptionForDate(options.weeks || [], dayKey)?.key || options.weeks?.[options.weeks.length - 1]?.key || '';
  const defaultWeekKey = pickPreviousOptionKey(options.weeks || [], currentWeekKey);
  const weekKey = resolveOptionKey(options.weeks || [], selectedWeek, defaultWeekKey);
  const currentMonthKey = dayKey ? dayKey.slice(0, 7) : options.months?.[options.months.length - 1]?.key || '';
  const currentMonthOptionKey = resolveOptionKey(options.months || [], currentMonthKey, options.months?.[options.months.length - 1]?.key || '');
  const defaultMonthKey = pickPreviousOptionKey(options.months || [], currentMonthOptionKey);
  const monthKey = resolveOptionKey(options.months || [], selectedMonth, defaultMonthKey);
  const fallbackScope = buildAsanDashboardScope({
    rows: fallbackRows,
    headers: fallbackHeaders,
    viewType,
    viewMode,
  });
  const dailyScope = modeCache.daily?.[dayKey] || fallbackScope;
  const weekScope = modeCache.weekly?.[weekKey] || createScope();
  const monthScope = modeCache.monthly?.[monthKey] || createScope();
  const totalScope = modeCache.total || createScope();
  const dayOption = (options.dates || []).find((option) => option.key === dayKey);
  const weekOption = (options.weeks || []).find((option) => option.key === weekKey);
  const monthOption = (options.months || []).find((option) => option.key === monthKey);
  const basisDaily = cachePayload.basisDiff?.daily?.[dayKey] || null;
  const basisWeekly = cachePayload.basisDiff?.weekly?.[weekKey] || null;
  const basisMonthly = cachePayload.basisDiff?.monthly?.[monthKey] || null;

  const periods = [
      {
        key: 'daily',
        label: '일별',
        title: dayOption?.label || '선택일',
        selectedKey: dayKey,
        options: options.dates || [],
        scope: dailyScope,
        previousScope: getCachedPreviousScope(modeCache.daily, options.dates || [], dayKey),
      },
      {
        key: 'weekly',
        label: '주별',
        title: weekOption?.label || '해당주',
        selectedKey: weekKey,
        options: options.weeks || [],
        scope: weekScope,
        previousScope: getCachedPreviousScope(modeCache.weekly, options.weeks || [], weekKey),
      },
      {
        key: 'monthly',
        label: '월별',
        title: monthOption?.label || '해당월',
        selectedKey: monthKey,
        options: options.months || [],
        scope: monthScope,
        previousScope: getCachedPreviousScope(modeCache.monthly, options.months || [], monthKey),
      },
      {
        key: 'total',
        label: '전체',
        title: `${options.dates?.length || 0}일`,
        selectedKey: 'all',
        options: [],
        scope: totalScope,
        previousScope: null,
      },
  ];
  const activePeriodKey = normalizeDashboardPeriodKey(activePeriod);
  const financialForecast = selectFinancialForecastFromCache(
    cachePayload.financial,
    { dayKey, weekKey, monthKey, activePeriodKey },
  ) || buildAsanDashboardFinancialForecast({
    fallbackRows,
    fallbackHeaders,
    viewType,
    routeUnitPrice,
    selectedDay: dayKey,
    selectedWeek: weekKey,
    selectedMonth: monthKey,
    activePeriod: activePeriodKey,
  });

  return {
    activeScope: periods.find((period) => period.key === activePeriodKey)?.scope || dailyScope,
    periods,
    periodOptions: options,
    financialForecast,
    timeline: modeCache.timeline || [],
    weekdayComparison: {
      week: modeCache.weekday?.weeks?.[weekKey] || getEmptyWeekdayComparison(weekKey, monthKey).week,
      month: modeCache.weekday?.months?.[monthKey] || getEmptyWeekdayComparison(weekKey, monthKey).month,
    },
    basisDiff: {
      periods: [
        basisDaily || { key: 'daily', label: '일별', title: dayOption?.label || '', selectedKey: dayKey, customerTotal: 0, dispatcherTotal: 0, diff: 0 },
        basisWeekly || { key: 'weekly', label: '주별', title: weekOption?.label || '', selectedKey: weekKey, customerTotal: 0, dispatcherTotal: 0, diff: 0 },
        basisMonthly || { key: 'monthly', label: '월별', title: monthOption?.label || '', selectedKey: monthKey, customerTotal: 0, dispatcherTotal: 0, diff: 0 },
      ],
      issueGroups: {
        daily: basisDaily?.issues || [],
        weekly: basisWeekly?.issues || [],
        monthly: basisMonthly?.issues || [],
      },
      issues: basisDaily?.issues || [],
    },
  };
}

function compactViewerDashboardData(dashboardData = {}) {
  const compactPeriods = (dashboardData.periods || []).map((period) => ({
    ...period,
    options: (period.options || []).filter((option) => option.key === period.selectedKey),
  }));
  const compactOptions = {
    dates: compactPeriods.find((period) => period.key === 'daily')?.options || [],
    weeks: compactPeriods.find((period) => period.key === 'weekly')?.options || [],
    months: compactPeriods.find((period) => period.key === 'monthly')?.options || [],
  };

  return {
    ...dashboardData,
    periods: compactPeriods,
    periodOptions: compactOptions,
  };
}

export function buildAsanDashboardViewerPayload({
  cachePayload = null,
  viewType = 'integrated',
  activeDate = '',
  viewerPolicyVersion = '',
} = {}) {
  if (!cachePayload || cachePayload.version !== 1) return null;
  const options = cachePayload.options || {};
  const dates = options.dates || [];
  const todayKey = getKoreaTodayKey();
  const latestDate = dates[dates.length - 1]?.key || '';
  const todayOrNext = dates.find((option) => option.key >= todayKey)?.key || '';
  const selectedDay = resolveOptionKey(dates, activeDate, activeDate || todayOrNext || latestDate);
  const modes = {};

  ['customer', 'dispatcher'].forEach((viewMode) => {
    const dashboardData = buildAsanDashboardDataFromCache({
      cachePayload,
      viewType,
      viewMode,
      activeDate: selectedDay,
      selectedDay,
      activePeriod: 'daily',
    });
    if (dashboardData) modes[viewMode] = compactViewerDashboardData(dashboardData);
  });

  if (!modes.customer && !modes.dispatcher) return null;
  const periods = modes.customer?.periods || modes.dispatcher?.periods || [];

  return {
    version: 1,
    payloadKind: 'dashboard-viewer',
    viewerPolicyVersion,
    viewType,
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: cachePayload.generatedAt || '',
    selection: {
      activePeriod: 'daily',
      day: selectedDay,
      week: periods.find((period) => period.key === 'weekly')?.selectedKey || '',
      month: periods.find((period) => period.key === 'monthly')?.selectedKey || '',
    },
    modes,
  };
}

export function toSortedChartEntries(chartAgg = {}, limit = 0) {
  const entries = Object.entries(chartAgg || {})
    .map(([name, item]) => ({
      name,
      total: item?.total || 0,
      breakdown: item?.breakdown || {},
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
  return limit > 0 ? entries.slice(0, limit) : entries;
}

export function toSortedMapEntries(map = {}, limit = 0) {
  const entries = Object.entries(map || {})
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
  return limit > 0 ? entries.slice(0, limit) : entries;
}
