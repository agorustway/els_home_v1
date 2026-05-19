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
  };
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

function buildExecutiveSignals({
  latestMonth,
  previousMonth,
  profitRate,
  purchaseRate,
  strategicSegments,
  vehiclePerformance,
  sourceMix,
}) {
  const revenueDelta = deltaMetric(latestMonth, previousMonth, 'revenue');
  const profitDelta = deltaMetric(latestMonth, previousMonth, 'profit');
  const topSegment = strategicSegments[0] || null;
  const topVehicles = vehiclePerformance.slice(0, 5);
  const vehicleShare = rate(
    topVehicles.reduce((sum, item) => sum + safeNumber(item.revenue), 0),
    sourceMix.totalRevenue,
    1,
  );
  const lowMarginVehicles = vehiclePerformance.filter(item => safeNumber(item.profitRate) < 3 || safeNumber(item.profit) < 0).length;

  return [
    {
      title: '최근월 방향',
      value: latestMonth?.period || '-',
      detail: previousMonth
        ? `매출 ${revenueDelta.amount >= 0 ? '+' : ''}${revenueDelta.rate}% · 손익 ${profitDelta.amount >= 0 ? '+' : ''}${profitDelta.rate}%`
        : '비교월 없음',
      tone: revenueDelta.amount >= 0 && profitDelta.amount >= 0 ? 'good' : 'watch',
    },
    {
      title: '수익성 압력',
      value: `${profitRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`,
      detail: `매입률 ${purchaseRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`,
      tone: signalTone(profitRate, 10, 5),
    },
    {
      title: '계약/차량 집중도',
      value: topSegment ? `${topSegment.label || topSegment.name} ${safeNumber(topSegment.revenueShare).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%` : '-',
      detail: `상위 5대 차량 매출 비중 ${vehicleShare.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`,
      tone: signalTone(vehicleShare, 45, 65, true),
    },
    {
      title: '데이터 신뢰',
      value: `${safeNumber(sourceMix.rowCount).toLocaleString('ko-KR')}행`,
      detail: `연간 ${sourceMix.annual.fileCount || 0}개 · 월간 ${sourceMix.monthly.fileCount || 0}개 원장`,
      tone: sourceMix.rowCount > 0 ? 'good' : 'danger',
    },
    {
      title: '저마진 차량',
      value: `${lowMarginVehicles.toLocaleString('ko-KR')}대`,
      detail: '손익률 3% 미만 또는 손실 차량',
      tone: lowMarginVehicles ? 'watch' : 'good',
    },
  ];
}

export function buildAsanPerformanceExecutiveSummary({ annual = {}, monthly = {} } = {}) {
  const annualSummary = summaryOf(annual);
  const monthlySummary = summaryOf(monthly);
  const annualSource = sourceTotals(annual, 'annual');
  const monthlySource = sourceTotals(monthly, 'monthly');
  const totalRevenue = roundMetric(annualSource.revenue + monthlySource.revenue);
  const totalPurchase = roundMetric(annualSource.purchase + monthlySource.purchase);
  const totalProfit = roundMetric(annualSource.profit + monthlySource.profit);
  const monthlySeries = mergePerformanceSeries([
    annualSummary.monthly,
    monthlySummary.monthly,
  ], {
    keyOf: item => item.period,
    seedOf: item => ({ period: item.period, year: item.year || Number(String(item.period).slice(0, 4)), month: item.month || Number(String(item.period).slice(5, 7)) }),
    totalRevenue,
    limit: 600,
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
  const latestMonth = monthlySeries.at(-1) || null;
  const previousMonth = monthlySeries.length > 1 ? monthlySeries.at(-2) : null;
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
    latestRevenueDelta: deltaMetric(latestMonth, previousMonth, 'revenue'),
    latestProfitDelta: deltaMetric(latestMonth, previousMonth, 'profit'),
    yearly: yearlySeries,
    monthly: monthlySeries,
    strategicSegments,
    vehiclePerformance,
    sourceMix,
    executiveSignals: buildExecutiveSignals({
      latestMonth,
      previousMonth,
      profitRate,
      purchaseRate,
      strategicSegments,
      vehiclePerformance,
      sourceMix,
    }),
  };
}
