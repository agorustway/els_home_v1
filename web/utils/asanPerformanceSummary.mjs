const EMPTY_LIST = Object.freeze([]);

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundMetric(value) {
  return Math.round(safeNumber(value) * 100) / 100;
}

function rate(numerator, denominator, digits = 2) {
  const bottom = safeNumber(denominator);
  if (!bottom) return 0;
  const multiplier = 10 ** digits;
  return Math.round((safeNumber(numerator) / bottom) * 100 * multiplier) / multiplier;
}

function safeList(value) {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : EMPTY_LIST;
}

function metricPeriod(item = {}) {
  return item.period || item.sourcePeriod || (item.date ? String(item.date).slice(0, 7) : '');
}

function dailyScopeKey(item = {}) {
  const date = String(item.date || '').trim();
  if (!date) return '';
  return item.scopeKey || item.dateKey || `${metricPeriod(item) || date.slice(0, 7)}::${date}`;
}

function normalizeDailySeed(item = {}) {
  const date = String(item.date || '').trim();
  const period = metricPeriod(item) || date.slice(0, 7);
  return {
    date,
    period,
    sourcePeriod: item.sourcePeriod || period,
    workPeriod: item.workPeriod || date.slice(0, 7),
    scopeKey: dailyScopeKey({ ...item, period }),
    day: item.day,
    label: item.label,
  };
}

function normalizeMonthlySeed(item = {}) {
  const period = metricPeriod(item);
  return {
    period,
    year: item.year || Number(String(period).slice(0, 4)),
    month: item.month || Number(String(period).slice(5, 7)),
  };
}

function summaryOf(data = {}) {
  return data?.summary && typeof data.summary === 'object' ? data.summary : {};
}

function sourceTotals(data = {}, label = '') {
  const summary = summaryOf(data);
  const revenue = roundMetric(summary.totalRevenue);
  const purchase = roundMetric(summary.totalPurchase);
  const profit = roundMetric(summary.totalProfit);
  return {
    key: label,
    label,
    revenue,
    purchase,
    profit,
    profitRate: rate(profit, revenue, 2),
    purchaseRate: rate(purchase, revenue, 2),
    rowCount: safeNumber(summary.analysisRows || data.total || summary.totalRows),
    fileCount: safeNumber(summary.annualFileCount || summary.monthlyFileCount),
    syncedAt: data.synced_at || summary.syncedAt || '',
    periodStart: summary.periodStart || safeList(summary.monthly)[0]?.period || '',
    periodEnd: summary.periodEnd || safeList(summary.monthly).at(-1)?.period || '',
  };
}

function addMetric(bucket, item = {}) {
  bucket.revenue += safeNumber(item.revenue);
  bucket.purchase += safeNumber(item.purchase);
  bucket.profit += safeNumber(item.profit);
  bucket.rowCount += safeNumber(item.rowCount);
}

function finalizeMetric(item = {}, totalRevenue = 0) {
  const revenue = roundMetric(item.revenue);
  const purchase = roundMetric(item.purchase);
  const profit = roundMetric(item.profit);
  return {
    ...item,
    revenue,
    purchase,
    profit,
    rowCount: safeNumber(item.rowCount),
    profitRate: rate(profit, revenue, 2),
    revenueShare: rate(revenue, totalRevenue, 2),
  };
}

export function mergePerformanceSeries(lists = [], options = {}) {
  const {
    keyOf = item => item.period || item.year || item.label || item.name,
    seedOf = item => ({ period: item.period, year: item.year, month: item.month }),
    sorter = (a, b) => String(a.period ?? a.year ?? a.label ?? '').localeCompare(String(b.period ?? b.year ?? b.label ?? ''), 'ko-KR'),
    totalRevenue = 0,
    limit = 1000,
  } = options;
  const map = new Map();

  for (const list of lists) {
    for (const item of safeList(list)) {
      const key = String(keyOf(item) || '').trim();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          ...seedOf(item, key),
          revenue: 0,
          purchase: 0,
          profit: 0,
          rowCount: 0,
        });
      }
      addMetric(map.get(key), item);
    }
  }

  return Array.from(map.values())
    .map(item => finalizeMetric(item, totalRevenue))
    .sort(sorter)
    .slice(0, limit);
}

function buildYearlyFromMonthly(monthly = [], totalRevenue = 0) {
  return mergePerformanceSeries([monthly], {
    keyOf: item => String(item.year || String(item.period || '').slice(0, 4)),
    seedOf: item => ({ year: Number(item.year || String(item.period || '').slice(0, 4)) || item.year || String(item.period || '').slice(0, 4) }),
    sorter: (a, b) => String(a.year).localeCompare(String(b.year), 'ko-KR'),
    totalRevenue,
    limit: 80,
  });
}

function buildSourceSeries(data = {}, label = '') {
  const summary = summaryOf(data);
  const source = sourceTotals(data, label);
  const monthly = mergePerformanceSeries([summary.monthly], {
    keyOf: item => item.period,
    seedOf: normalizeMonthlySeed,
    totalRevenue: source.revenue,
    limit: 600,
  });
  const yearly = monthly.length
    ? buildYearlyFromMonthly(monthly, source.revenue)
    : mergePerformanceSeries([summary.yearly], {
      keyOf: item => String(item.year || ''),
      seedOf: item => ({ year: item.year }),
      sorter: (a, b) => String(a.year).localeCompare(String(b.year), 'ko-KR'),
      totalRevenue: source.revenue,
      limit: 80,
    });
  const daily = mergePerformanceSeries([summary.daily], {
    keyOf: dailyScopeKey,
    seedOf: normalizeDailySeed,
    sorter: (a, b) => String(a.period || '').localeCompare(String(b.period || ''), 'ko-KR') || String(a.date || '').localeCompare(String(b.date || ''), 'ko-KR'),
    totalRevenue: source.revenue,
    limit: 900,
  });

  return {
    ...source,
    yearly,
    monthly,
    daily,
  };
}

function mergeNamedPerformance(lists = [], totalRevenue = 0, limit = 12) {
  return mergePerformanceSeries(lists, {
    keyOf: item => item.vehicleNo || item.name || item.label || item.key,
    seedOf: (item, key) => ({
      ...item,
      key: item.key || key,
      name: item.name || item.label || item.vehicleNo || key,
      label: item.label || item.name || item.vehicleNo || key,
      vehicleNo: item.vehicleNo,
    }),
    sorter: (a, b) => Math.abs(safeNumber(b.revenue)) - Math.abs(safeNumber(a.revenue)),
    totalRevenue,
    limit,
  });
}

function compactMetricSeries(list = [], type = 'monthly') {
  const keyOf = type === 'daily' ? dailyScopeKey : item => item.period || item.year || item.label || item.name;
  const seedOf = type === 'daily'
    ? normalizeDailySeed
    : item => ({
      ...item,
      period: item.period,
      year: item.year,
      month: item.month,
      label: item.label,
    });
  return mergePerformanceSeries([list], {
    keyOf,
    seedOf,
    sorter: (a, b) => String(a.period ?? a.year ?? a.scopeKey ?? '').localeCompare(String(b.period ?? b.year ?? b.scopeKey ?? ''), 'ko-KR') || String(a.date || '').localeCompare(String(b.date || ''), 'ko-KR'),
    totalRevenue: 0,
    limit: type === 'daily' ? 900 : 600,
  });
}

function compactSubMetric(item = {}) {
  return {
    key: item.key || item.name || item.label || '',
    name: item.name || item.label || '',
    label: item.label || item.name || '',
    revenue: item.revenue || 0,
    purchase: item.purchase || 0,
    profit: item.profit || 0,
    rowCount: item.rowCount || 0,
    profitRate: item.profitRate || 0,
    revenueShare: item.revenueShare || 0,
    monthly: compactMetricSeries(item.monthly, 'monthly'),
    daily: compactMetricSeries(item.daily, 'daily'),
  };
}

function compactNamedMetric(item = {}) {
  return {
    key: item.key || '',
    name: item.name || item.label || item.vehicleNo || '',
    label: item.label || item.name || item.vehicleNo || '',
    vehicleNo: item.vehicleNo || '',
    drivers: item.drivers || '',
    revenue: item.revenue || 0,
    purchase: item.purchase || 0,
    profit: item.profit || 0,
    rowCount: item.rowCount || 0,
    profitRate: item.profitRate || 0,
    revenueShare: item.revenueShare || 0,
    monthly: compactMetricSeries(item.monthly, 'monthly'),
    daily: compactMetricSeries(item.daily, 'daily'),
    yearly: compactMetricSeries(item.yearly, 'yearly'),
    weekday: compactMetricSeries(item.weekday, 'weekday'),
    description: item.description || '',
    filterTerms: Array.isArray(item.filterTerms) ? item.filterTerms.slice(0, 8) : [],
    topWorkSites: safeList(item.topWorkSites).slice(0, 6).map(compactSubMetric),
    topClients: safeList(item.topClients).slice(0, 6).map(compactSubMetric),
    topRoutes: safeList(item.topRoutes).slice(0, 6).map(compactSubMetric),
  };
}

function mergeBreakdownSections(lists = [], totalRevenue = 0) {
  const sections = new Map();
  for (const list of lists) {
    for (const section of safeList(list)) {
      const column = String(section.column || section.label || '').trim();
      if (!column) continue;
      if (!sections.has(column)) sections.set(column, { column, items: [] });
      sections.get(column).items.push(...safeList(section.items));
    }
  }
  return Array.from(sections.values())
    .map(section => ({
      column: section.column,
      items: mergeNamedPerformance([section.items], totalRevenue, 60).map(compactSubMetric),
    }))
    .filter(section => section.items.length);
}

function sourceShare(source, totalRevenue) {
  return {
    ...source,
    revenueShare: rate(source.revenue, totalRevenue, 1),
  };
}

function latestSyncedAt(...values) {
  return values
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || '';
}

function deltaMetric(current = null, previous = null, key = 'revenue') {
  if (!current || !previous) return { amount: 0, rate: 0 };
  const amount = safeNumber(current[key]) - safeNumber(previous[key]);
  const base = Math.abs(safeNumber(previous[key]));
  return {
    amount: roundMetric(amount),
    rate: base ? Math.round((amount / base) * 1000) / 10 : 0,
  };
}

function signalTone(value, goodThreshold, warnThreshold, reverse = false) {
  const score = safeNumber(value);
  if (reverse) {
    if (score <= goodThreshold) return 'good';
    if (score <= warnThreshold) return 'watch';
    return 'danger';
  }
  if (score >= goodThreshold) return 'good';
  if (score >= warnThreshold) return 'watch';
  return 'danger';
}

function formatSignalAmount(value) {
  const amount = safeNumber(value);
  const abs = Math.abs(amount);
  if (abs >= 100000000) {
    return `${(amount / 100000000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원`;
  }
  if (abs >= 10000) {
    return `${(amount / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원`;
  }
  return `${amount.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`;
}

function findBreakdownSection(sections = [], primaryWords = [], fallbackWords = []) {
  const normalized = safeList(sections);
  const pick = (words = []) => normalized.find(section => words.some(word => (
    String(section.column || section.label || '').toLowerCase().includes(String(word).toLowerCase())
  )));
  return pick(primaryWords) || pick(fallbackWords) || null;
}

function marginCandidate(section = null, direction = 'high', amountMetric = 'revenue') {
  const metricKey = amountMetric === 'purchase' ? 'purchase' : 'revenue';
  const items = safeList(section?.items)
    .filter(item => safeNumber(item[metricKey]) > 0 && (safeNumber(item.profit) || safeNumber(item.revenue) || safeNumber(item.purchase) || safeNumber(item.rowCount)));
  const sorted = items.slice().sort((a, b) => {
    const rateGap = safeNumber(direction === 'high' ? b.profitRate - a.profitRate : a.profitRate - b.profitRate);
    if (rateGap) return rateGap;
    return direction === 'high'
      ? safeNumber(b.profit) - safeNumber(a.profit)
      : safeNumber(a.profit) - safeNumber(b.profit);
  });
  return sorted[0] || null;
}

function buildMarginSignal(title, section, direction = 'high', amountMetric = 'revenue') {
  const metricKey = amountMetric === 'purchase' ? 'purchase' : 'revenue';
  const metricLabel = metricKey === 'purchase' ? '매입' : '매출';
  const item = marginCandidate(section, direction, metricKey);
  const isHigh = direction === 'high';
  const lowTone = !item
    ? 'watch'
    : safeNumber(item.profit) < 0 || safeNumber(item.profitRate) < 3
      ? 'danger'
      : safeNumber(item.profitRate) < 8
        ? 'watch'
        : 'good';
  return {
    title,
    value: item?.label || item?.name || '-',
    detail: item
      ? `${metricLabel} ${formatSignalAmount(item[metricKey])} · 이익률 ${safeNumber(item.profitRate).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`
      : `${section?.column || '세분화'} 자료 없음`,
    tone: isHigh && item ? 'good' : lowTone,
  };
}

function buildExecutiveSignals({
  profitRate,
  purchaseRate,
  strategicSegments,
  vehiclePerformance,
  sourceMix,
  breakdowns,
}) {
  const ownSegment = strategicSegments.find(item => item.key === 'own_direct') || null;
  const externalSegment = strategicSegments.find(item => item.key === 'external_carrier') || null;
  const topVehicles = vehiclePerformance.slice(0, 5);
  const vehicleShare = rate(
    topVehicles.reduce((sum, item) => sum + safeNumber(item.revenue), 0),
    sourceMix.totalRevenue,
    1,
  );
  const billingSection = findBreakdownSection(breakdowns, ['청구처'], ['거래처', '화주', '매출']);
  const payeeSection = findBreakdownSection(breakdowns, ['지급처'], ['운송사', '하불', '매입처', '외주처']);
  const ownShare = safeNumber(ownSegment?.revenueShare);
  const externalShare = safeNumber(externalSegment?.revenueShare);

  return [
    {
      title: '이익률',
      value: `${profitRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`,
      detail: `매입률 ${purchaseRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`,
      tone: signalTone(profitRate, 10, 5),
    },
    {
      title: '자사 비율',
      value: `자사 ${ownShare.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}% · 외부 ${externalShare.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`,
      detail: `자사 직계약/외부 동시 표시 · 상위 5대 ${vehicleShare.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`,
      tone: signalTone(vehicleShare, 45, 65, true),
    },
    buildMarginSignal('고마진 청구처', billingSection, 'high', 'revenue'),
    buildMarginSignal('고마진 지급처', payeeSection, 'high', 'purchase'),
    buildMarginSignal('저마진 청구처', billingSection, 'low', 'revenue'),
    buildMarginSignal('저마진 지급처', payeeSection, 'low', 'purchase'),
  ];
}

function sumMetricItems(items = []) {
  const bucket = { revenue: 0, purchase: 0, profit: 0, rowCount: 0 };
  for (const item of safeList(items)) addMetric(bucket, item);
  return finalizeMetric(bucket);
}

function isActiveMetric(item = {}) {
  return Boolean(safeNumber(item.revenue) || safeNumber(item.purchase) || safeNumber(item.profit) || safeNumber(item.rowCount));
}

function periodYear(period = '') {
  return String(period || '').slice(0, 4);
}

function formatMonthLabel(period = '') {
  const [year, month] = String(period || '').split('-');
  if (!year || !month) return period || '-';
  return `${year}년 ${Number(month)}월`;
}

function formatDayLabel(item = {}) {
  const date = item.date || '';
  const period = metricPeriod(item);
  if (!date) return '-';
  if (period && period !== String(date).slice(0, 7)) return `${formatMonthLabel(period)} 마감 · ${date}`;
  return date;
}

export function buildAsanSummaryScopeOptions(summary = {}) {
  const endPeriod = summary.periodEnd || '';
  const endYear = Number(String(endPeriod).slice(0, 4));
  const endMonth = Number(String(endPeriod).slice(5, 7));
  const yearly = safeList(summary.yearly).map(item => {
    const year = Number(item.year) || item.year;
    const isProgress = endYear && String(year) === String(endYear) && endMonth;
    return {
      value: String(year),
      label: isProgress ? `${year}년 ${endMonth}월까지` : `${year}년`,
      year,
    };
  });
  const monthly = safeList(summary.monthly).map(item => ({
    value: item.period,
    label: formatMonthLabel(item.period),
    year: item.year || Number(String(item.period).slice(0, 4)),
    month: item.month || Number(String(item.period).slice(5, 7)),
  })).filter(item => item.value);
  const daily = safeList(summary.daily).map(item => ({
    value: dailyScopeKey(item),
    label: formatDayLabel(item),
    date: item.date,
    period: metricPeriod(item),
    workPeriod: item.workPeriod || String(item.date || '').slice(0, 7),
  })).filter(item => item.value);

  return { yearly, monthly, daily };
}

function normalizeScope(summary = {}, scope = {}) {
  const options = summary.scopeOptions || buildAsanSummaryScopeOptions(summary);
  const mode = ['year', 'month', 'day'].includes(scope.mode) ? scope.mode : 'all';
  const latestMonth = summary.periodEnd || options.monthly.at(-1)?.value || '';
  const defaultYear = periodYear(latestMonth) || options.yearly.at(-1)?.value || '';
  const year = String(scope.year || defaultYear || '');
  const month = String(scope.month || latestMonth || options.monthly.at(-1)?.value || '');
  const dayOption = options.daily.find(item => item.value === scope.dayKey)
    || options.daily.find(item => item.period === month)
    || options.daily.at(-1)
    || null;
  const dayKey = String(scope.dayKey || dayOption?.value || '');
  const normalized = {
    mode,
    year,
    month,
    dayKey,
    dayDate: dayOption?.date || '',
    dayPeriod: dayOption?.period || '',
    options,
  };
  normalized.label = mode === 'year'
    ? `${year}년`
    : mode === 'month'
      ? formatMonthLabel(month)
      : mode === 'day'
        ? (dayOption?.label || normalized.dayDate || '선택일')
        : '전체';
  return normalized;
}

function monthlyMatches(item = {}, scope = {}) {
  if (scope.mode === 'year') return String(item.year || periodYear(item.period)) === String(scope.year);
  if (scope.mode === 'month') return item.period === scope.month;
  if (scope.mode === 'day') return item.period === scope.dayPeriod || item.period === String(scope.dayDate || '').slice(0, 7);
  return true;
}

function dailyMatches(item = {}, scope = {}, exact = false) {
  if (scope.mode === 'day' && exact) return dailyScopeKey(item) === scope.dayKey;
  if (scope.mode === 'year') return periodYear(metricPeriod(item) || item.date) === String(scope.year);
  if (scope.mode === 'month') return metricPeriod(item) === scope.month || String(item.date || '').slice(0, 7) === scope.month;
  if (scope.mode === 'day') return metricPeriod(item) === scope.dayPeriod || String(item.date || '').slice(0, 7) === String(scope.dayDate || '').slice(0, 7);
  return true;
}

function scopeSeriesForTotals(summary = {}, scope = {}) {
  if (scope.mode === 'day') return safeList(summary.daily).filter(item => dailyMatches(item, scope, true));
  if (scope.mode === 'year' || scope.mode === 'month') return safeList(summary.monthly).filter(item => monthlyMatches(item, scope));
  return [];
}

function scopeSource(source = {}, scope = {}, totalRevenue = 0) {
  const metric = scope.mode === 'all'
    ? source
    : sumMetricItems(scopeSeriesForTotals(source, scope));
  return sourceShare({
    ...source,
    revenue: metric.revenue || 0,
    purchase: metric.purchase || 0,
    profit: metric.profit || 0,
    rowCount: metric.rowCount || 0,
    profitRate: rate(metric.profit, metric.revenue, 2),
    purchaseRate: rate(metric.purchase, metric.revenue, 2),
  }, totalRevenue);
}

function scopedMetricOfItem(item = {}, scope = {}) {
  if (scope.mode === 'all') return item;
  const series = scope.mode === 'day'
    ? safeList(item.daily).filter(metric => dailyMatches(metric, scope, true))
    : safeList(item.monthly).filter(metric => monthlyMatches(metric, scope));
  if (!series.length) return null;
  return sumMetricItems(series);
}

function scopeNamedItems(items = [], scope = {}, totalRevenue = 0, limit = 30, withTopLists = false) {
  return safeList(items)
    .map((item) => {
      const metric = scopedMetricOfItem(item, scope);
      if (!metric || !isActiveMetric(metric)) return null;
      const scoped = finalizeMetric({
        ...item,
        revenue: metric.revenue,
        purchase: metric.purchase,
        profit: metric.profit,
        rowCount: metric.rowCount,
      }, totalRevenue);
      if (withTopLists) {
        scoped.topClients = scopeNamedItems(item.topClients, scope, totalRevenue, 5, false);
        scoped.topWorkSites = scopeNamedItems(item.topWorkSites, scope, totalRevenue, 5, false);
        scoped.topRoutes = scopeNamedItems(item.topRoutes, scope, totalRevenue, 5, false);
      }
      return scoped;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const order = ['own_direct', 'external_carrier'];
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      if (ai >= 0 || bi >= 0) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      return Math.abs(safeNumber(b.revenue)) - Math.abs(safeNumber(a.revenue));
    })
    .slice(0, limit);
}

function scopeBreakdownSections(sections = [], scope = {}, totalRevenue = 0) {
  return safeList(sections)
    .map(section => ({
      ...section,
      items: scopeNamedItems(section.items, scope, totalRevenue, 60, false),
    }))
    .filter(section => section.items.length);
}

function trendForScope(summary = {}, scope = {}) {
  if (scope.mode === 'year') {
    const years = safeList(summary.yearly).map(item => ({
      ...item,
      scopeKey: String(item.year || ''),
      isSelected: String(item.year || '') === String(scope.year || ''),
    }));
    return { items: years, basis: '연도별', unit: '년' };
  }
  if (scope.mode === 'month') {
    const selectedYear = periodYear(scope.month) || scope.year;
    const months = safeList(summary.monthly)
      .filter(item => !selectedYear || String(item.year || periodYear(item.period)) === String(selectedYear))
      .map(item => ({
        ...item,
        scopeKey: item.period,
        isSelected: item.period === scope.month,
      }));
    return { items: months, basis: '월별', unit: '월' };
  }
  if (scope.mode === 'day') {
    const days = safeList(summary.daily)
      .filter(item => dailyMatches(item, scope))
      .slice(-40)
      .map(item => ({
        ...item,
        scopeKey: dailyScopeKey(item),
        isSelected: dailyScopeKey(item) === scope.dayKey,
      }));
    return { items: days, basis: '일별', unit: '일' };
  }
  const months = safeList(summary.monthly).slice(-12).map(item => ({
    ...item,
    scopeKey: item.period,
  }));
  return { items: months, basis: '월별', unit: '월' };
}

function compactMetricForDashboard(item = {}) {
  if (!item || typeof item !== 'object') return null;
  return {
    key: item.key || '',
    name: item.name || item.label || item.vehicleNo || '',
    label: item.label || item.name || item.vehicleNo || '',
    vehicleNo: item.vehicleNo || '',
    drivers: item.drivers || item.driver || '',
    carriers: item.carriers || item.carrier || '',
    description: item.description || '',
    filterTerms: Array.isArray(item.filterTerms) ? item.filterTerms.slice(0, 8) : [],
    period: item.period || '',
    sourcePeriod: item.sourcePeriod || '',
    workPeriod: item.workPeriod || '',
    year: item.year || '',
    month: item.month || '',
    date: item.date || '',
    dateKey: item.dateKey || '',
    scopeKey: item.scopeKey || dailyScopeKey(item) || '',
    day: item.day,
    weekStart: item.weekStart || '',
    weekEnd: item.weekEnd || '',
    revenue: roundMetric(item.revenue),
    purchase: roundMetric(item.purchase),
    profit: roundMetric(item.profit),
    rowCount: safeNumber(item.rowCount),
    profitRate: safeNumber(item.profitRate),
    purchaseRate: safeNumber(item.purchaseRate),
    revenueShare: safeNumber(item.revenueShare),
    isSelected: Boolean(item.isSelected),
  };
}

function compactMetricListForDashboard(items = [], limit = 80) {
  return safeList(items)
    .slice(0, limit)
    .map(compactMetricForDashboard)
    .filter(Boolean);
}

function compactSourceForDashboard(source = {}) {
  const compact = compactMetricForDashboard(source) || {};
  return {
    ...compact,
    syncedAt: source.syncedAt || '',
    periodStart: source.periodStart || '',
    periodEnd: source.periodEnd || '',
    fileCount: safeNumber(source.fileCount),
  };
}

function compactSegmentForDashboard(item = {}) {
  const compact = compactMetricForDashboard(item) || {};
  return {
    ...compact,
    topClients: compactMetricListForDashboard(item.topClients, 6),
    topWorkSites: compactMetricListForDashboard(item.topWorkSites, 6),
    topRoutes: compactMetricListForDashboard(item.topRoutes, 6),
  };
}

function compactExecutiveSignals(signals = []) {
  return safeList(signals).map(signal => ({
    title: signal.title || '',
    value: signal.value || '',
    detail: signal.detail || '',
    tone: signal.tone || 'watch',
  }));
}

export function buildAsanPerformanceDashboardView(summary = null, scope = {}) {
  const scoped = buildScopedAsanPerformanceSummary(summary, scope);
  if (!scoped) return null;
  const scopeInfo = { ...(scoped.scope || {}) };
  delete scopeInfo.options;
  return {
    totalRevenue: roundMetric(scoped.totalRevenue),
    totalPurchase: roundMetric(scoped.totalPurchase),
    totalProfit: roundMetric(scoped.totalProfit),
    profitRate: safeNumber(scoped.profitRate),
    purchaseRate: safeNumber(scoped.purchaseRate),
    contributionMargin: safeNumber(scoped.contributionMargin),
    rowCount: safeNumber(scoped.rowCount),
    fileCount: safeNumber(scoped.fileCount),
    syncedAt: scoped.syncedAt || '',
    periodStart: scoped.periodStart || '',
    periodEnd: scoped.periodEnd || '',
    latestMonth: compactMetricForDashboard(scoped.latestMonth),
    previousMonth: compactMetricForDashboard(scoped.previousMonth),
    latestDay: compactMetricForDashboard(scoped.latestDay),
    latestRevenueDelta: scoped.latestRevenueDelta || { amount: 0, rate: 0 },
    latestProfitDelta: scoped.latestProfitDelta || { amount: 0, rate: 0 },
    yearly: compactMetricListForDashboard(summary?.yearly || scoped.yearly, 80),
    trendItems: compactMetricListForDashboard(scoped.trendItems, 80),
    trendBasis: scoped.trendBasis || '월별',
    trendUnit: scoped.trendUnit || '월',
    strategicSegments: safeList(scoped.strategicSegments).slice(0, 8).map(compactSegmentForDashboard),
    vehiclePerformance: compactMetricListForDashboard(scoped.vehiclePerformance, 30),
    sourceMix: {
      annual: compactSourceForDashboard(scoped.sourceMix?.annual),
      monthly: compactSourceForDashboard(scoped.sourceMix?.monthly),
      totalRevenue: roundMetric(scoped.sourceMix?.totalRevenue),
      totalPurchase: roundMetric(scoped.sourceMix?.totalPurchase),
      totalProfit: roundMetric(scoped.sourceMix?.totalProfit),
      rowCount: safeNumber(scoped.sourceMix?.rowCount),
      fileCount: safeNumber(scoped.sourceMix?.fileCount),
    },
    scope: scopeInfo,
    scopeOptions: scoped.scopeOptions || buildAsanSummaryScopeOptions(summary || {}),
    executiveSignals: compactExecutiveSignals(scoped.executiveSignals),
  };
}

export function buildScopedAsanPerformanceSummary(summary = null, scope = {}) {
  if (!summary) return null;
  const normalized = normalizeScope(summary, scope);
  const metric = normalized.mode === 'all'
    ? {
      revenue: summary.totalRevenue,
      purchase: summary.totalPurchase,
      profit: summary.totalProfit,
      rowCount: summary.rowCount,
    }
    : sumMetricItems(scopeSeriesForTotals(summary, normalized));
  const totalRevenue = roundMetric(metric.revenue);
  const totalPurchase = roundMetric(metric.purchase);
  const totalProfit = roundMetric(metric.profit);
  const scopedMonthly = normalized.mode === 'all'
    ? safeList(summary.monthly)
    : safeList(summary.monthly).filter(item => monthlyMatches(item, normalized));
  const scopedDaily = normalized.mode === 'all'
    ? safeList(summary.daily)
    : safeList(summary.daily).filter(item => normalized.mode === 'day' ? dailyMatches(item, normalized) : dailyMatches(item, normalized));
  const sourceMix = {
    annual: scopeSource(summary.sourceMix?.annual, normalized, totalRevenue),
    monthly: scopeSource(summary.sourceMix?.monthly, normalized, totalRevenue),
    totalRevenue,
    totalPurchase,
    totalProfit,
    rowCount: safeNumber(metric.rowCount),
    fileCount: safeNumber(summary.sourceMix?.fileCount),
  };
  const latestMonth = scopedMonthly.at(-1) || summary.latestMonth || null;
  const previousMonth = scopedMonthly.length > 1 ? scopedMonthly.at(-2) : null;
  const latestDay = scopedDaily.at(-1) || summary.latestDay || null;
  const trend = trendForScope(summary, normalized);
  const strategicSegments = scopeNamedItems(summary.strategicSegments, normalized, totalRevenue, 8, true);
  const vehiclePerformance = scopeNamedItems(summary.vehiclePerformance, normalized, totalRevenue, 30, false);
  const breakdowns = scopeBreakdownSections(summary.breakdowns, normalized, totalRevenue);
  const profitRate = rate(totalProfit, totalRevenue, 2);
  const purchaseRate = rate(totalPurchase, totalRevenue, 2);

  return {
    ...summary,
    totalRevenue,
    totalPurchase,
    totalProfit,
    profitRate,
    purchaseRate,
    contributionMargin: rate(totalProfit, totalPurchase, 2),
    rowCount: safeNumber(metric.rowCount),
    latestMonth,
    previousMonth,
    latestDay,
    latestRevenueDelta: deltaMetric(latestMonth, previousMonth, 'revenue'),
    latestProfitDelta: deltaMetric(latestMonth, previousMonth, 'profit'),
    monthly: scopedMonthly,
    daily: scopedDaily,
    trendItems: trend.items,
    trendBasis: trend.basis,
    trendUnit: trend.unit,
    strategicSegments,
    vehiclePerformance,
    breakdowns,
    sourceMix,
    scope: normalized,
    scopeOptions: normalized.options,
    executiveSignals: buildExecutiveSignals({
      latestMonth,
      previousMonth,
      profitRate,
      purchaseRate,
      strategicSegments,
      vehiclePerformance,
      sourceMix,
      breakdowns,
    }),
  };
}

export function buildAsanPerformanceExecutiveSummary({ annual = {}, monthly = {} } = {}) {
  const annualSummary = summaryOf(annual);
  const monthlySummary = summaryOf(monthly);
  const annualSource = buildSourceSeries(annual, 'annual');
  const monthlySource = buildSourceSeries(monthly, 'monthly');
  const totalRevenue = roundMetric(annualSource.revenue + monthlySource.revenue);
  const totalPurchase = roundMetric(annualSource.purchase + monthlySource.purchase);
  const totalProfit = roundMetric(annualSource.profit + monthlySource.profit);
  const monthlySeries = mergePerformanceSeries([
    annualSource.monthly,
    monthlySource.monthly,
  ], {
    keyOf: item => item.period,
    seedOf: normalizeMonthlySeed,
    totalRevenue,
    limit: 600,
  });
  const dailySeries = mergePerformanceSeries([
    annualSource.daily,
    monthlySource.daily,
  ], {
    keyOf: dailyScopeKey,
    seedOf: normalizeDailySeed,
    sorter: (a, b) => String(a.period || '').localeCompare(String(b.period || ''), 'ko-KR') || String(a.date || '').localeCompare(String(b.date || ''), 'ko-KR'),
    totalRevenue,
    limit: 1200,
  });
  const yearlySeries = monthlySeries.length
    ? buildYearlyFromMonthly(monthlySeries, totalRevenue)
    : mergePerformanceSeries([annualSummary.yearly, monthlySummary.yearly], {
      keyOf: item => String(item.year || ''),
      seedOf: item => ({ year: item.year }),
      sorter: (a, b) => String(a.year).localeCompare(String(b.year), 'ko-KR'),
      totalRevenue,
      limit: 80,
    });
  const strategicSegments = mergeNamedPerformance([
    annualSummary.strategicSegments,
    monthlySummary.strategicSegments,
  ], totalRevenue, 8)
    .filter(item => ['own_direct', 'external_carrier'].includes(item.key))
    .map(compactNamedMetric);
  const vehiclePerformance = mergeNamedPerformance([
    annualSummary.vehiclePerformance,
    monthlySummary.vehiclePerformance,
  ], totalRevenue, 30).map(compactNamedMetric);
  const breakdowns = mergeBreakdownSections([
    annualSummary.breakdowns,
    monthlySummary.breakdowns,
  ], totalRevenue);
  const latestMonth = monthlySeries.at(-1) || null;
  const previousMonth = monthlySeries.length > 1 ? monthlySeries.at(-2) : null;
  const latestDay = dailySeries.at(-1) || null;
  const sourceMix = {
    annual: sourceShare(annualSource, totalRevenue),
    monthly: sourceShare(monthlySource, totalRevenue),
    totalRevenue,
    totalPurchase,
    totalProfit,
    rowCount: safeNumber(annualSource.rowCount) + safeNumber(monthlySource.rowCount),
    fileCount: safeNumber(annualSource.fileCount) + safeNumber(monthlySource.fileCount),
  };
  const profitRate = rate(totalProfit, totalRevenue, 2);
  const purchaseRate = rate(totalPurchase, totalRevenue, 2);

  return {
    totalRevenue,
    totalPurchase,
    totalProfit,
    profitRate,
    purchaseRate,
    contributionMargin: rate(totalProfit, totalPurchase, 2),
    rowCount: sourceMix.rowCount,
    fileCount: sourceMix.fileCount,
    syncedAt: latestSyncedAt(annualSource.syncedAt, monthlySource.syncedAt),
    periodStart: monthlySeries[0]?.period || annualSource.periodStart || monthlySource.periodStart || '',
    periodEnd: latestMonth?.period || annualSource.periodEnd || monthlySource.periodEnd || '',
    latestMonth,
    previousMonth,
    latestDay,
    latestRevenueDelta: deltaMetric(latestMonth, previousMonth, 'revenue'),
    latestProfitDelta: deltaMetric(latestMonth, previousMonth, 'profit'),
    yearly: yearlySeries,
    monthly: monthlySeries,
    daily: dailySeries,
    strategicSegments,
    vehiclePerformance,
    breakdowns,
    sourceMix,
    scopeOptions: buildAsanSummaryScopeOptions({
      yearly: yearlySeries,
      monthly: monthlySeries,
      daily: dailySeries,
      periodEnd: latestMonth?.period || annualSource.periodEnd || monthlySource.periodEnd || '',
    }),
    executiveSignals: buildExecutiveSignals({
      latestMonth,
      previousMonth,
      profitRate,
      purchaseRate,
      strategicSegments,
      vehiclePerformance,
      sourceMix,
      breakdowns,
    }),
  };
}
