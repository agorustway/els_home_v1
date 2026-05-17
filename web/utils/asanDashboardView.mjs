export const ASAN_DASHBOARD_CHART_MODES = {
  customer: ['작업지', '고객사', '라인/선사'],
  dispatcher: ['업체명', '고객사', '작업지', '라인/선사'],
};

const DISPATCH_REGIONS = ['배차예정', '기타/철송', '기타', '아산', '부산', '신항', '광양', '평택', '중부', '부곡', '인천'];
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
    customer: findDashboardCol(headers, '고객사(국가)', '고객사', '국가'),
    order: findDashboardCol(headers, '오더(계)', '오더'),
    qty: findDashboardCol(headers, '오더(계)', '계', '수량'),
    dispatch: findDashboardCol(headers, '배차'),
  };
}

function getRowMeta(row = [], cols = {}) {
  return {
    shipper: normalizeLabel(row[cols.shipper]),
    workplace: normalizeLabel(row[cols.workplace]),
    line: normalizeLabel(row[cols.line]),
    customer: normalizeLabel(row[cols.customer]),
    direction: normalizeLabel(row[cols.direction]),
    container: normalizeLabel(row[cols.container]),
  };
}

function getCustomerWeight(row = [], cols = {}, viewType = 'integrated') {
  if (viewType === 'mobis') return parseDashboardQty(row[cols.qty]);
  const order = parseDashboardQty(row[cols.order]);
  return order > 0 ? order : parseDashboardQty(row[cols.qty]);
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

function addBaseRowMetrics(scope, row, cols, viewType) {
  const order = getCustomerWeight(row, cols, viewType);
  const dispatch = parseDashboardQty(row[cols.dispatch]);
  scope.rowCount += 1;
  scope.orderTotal += order;
  scope.sheetDispatchTotal += dispatch;
  scope.mismatchTotal = scope.orderTotal - scope.sheetDispatchTotal;
}

function addRegionAggs(scope, records = []) {
  records.forEach((record) => addMap(scope.pieAggs.region, record.region, record.count));
}

function addCustomerRow(scope, row, headers, cols, viewType) {
  const amount = getCustomerWeight(row, cols, viewType);
  if (amount <= 0) return;

  const meta = getRowMeta(row, cols);
  scope.total += amount;
  addPieAggs(scope, meta, amount);
  addRegionAggs(scope, parseDispatchRecords(row, headers));
  addFeu(scope, meta.container, amount);

  addChart(scope.chartAggs, '작업지', meta.workplace, amount, meta.line);
  addChart(scope.chartAggs, '라인/선사', meta.line, amount, meta.workplace);
  addChart(scope.chartAggs, '고객사', meta.customer, amount, meta.workplace);
}

function parseDispatchRecords(row = [], headers = []) {
  const regions = DISPATCH_REGIONS
    .map((name) => ({ name, idx: findDashboardCol(headers, name) }))
    .filter((region) => region.idx >= 0);

  const records = [];
  regions.forEach((region) => {
    const text = row[region.idx];
    if (!text) return;

    const matches = String(text).matchAll(/([가-힣a-zA-Z0-9().&+_-]{1,28})\s*(\d+(?:\.\d+)?)/g);
    for (const match of matches) {
      const company = normalizeLabel(match[1]);
      const count = parseDashboardQty(match[2]);
      if (company && count > 0) records.push({ company, count, region: region.name, row });
    }
  });
  return records;
}

function addDispatcherRow(scope, row, headers, cols) {
  const meta = getRowMeta(row, cols);
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
    addBaseRowMetrics(scope, row, cols, viewType);
    if (viewMode === 'dispatcher') {
      addDispatcherRow(scope, row, headers, cols);
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
  (LUNAR_HOLIDAYS[year] || []).forEach((day) => holidays.add(day));

  Array.from(holidays).forEach((holiday) => {
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

function resolveOptionKey(options = [], requested = '', fallback = '') {
  if (!requested) return fallback;
  if (options.some((option) => option.key === requested)) return requested;

  const monthLike = String(requested).padStart(2, '0');
  const monthMatch = options.filter((option) => option.key.endsWith(`-${monthLike}`));
  return monthMatch[monthMatch.length - 1]?.key || fallback;
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
