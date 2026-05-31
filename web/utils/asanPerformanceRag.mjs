import {
  buildAsanPerformanceDashboardView,
  buildAsanPerformanceExecutiveSummary,
} from './asanPerformanceSummary.mjs';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const PERFORMANCE_TRIGGER_WORDS = [
  '실적관리', '종합실적', '월간실적', '연간실적', '통합실적',
  '실적', '마감', '마감자료', '이익', '이익률', '손익', '손익률',
  '매출', '매입', '청구', '하불', '이익률', '순매출', '순매입',
];

const BREAKDOWN_AXIS_ALIASES = {
  carrier: ['운송사', '운송사명의', '업체', '지급처', '하불처', '하불거래처', '매입처', '외주처'],
  billTo: ['청구처', '거래처', '화주', '고객사', '매출처'],
  workSite: ['작업지', '상차지', '현장'],
  route: ['노선', '구간', '선적', '픽업'],
  vehicle: ['차량', '차번', '영업넘버'],
};

function normalizeCompact(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function kstParts(now = new Date()) {
  const date = new Date(new Date(now).getTime() + KST_OFFSET_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function formatMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function shiftMonth(year, month, delta) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function parseExplicitMonth(text, now) {
  const current = kstParts(now);
  const full = String(text || '').match(/(20\d{2})\s*년?\s*[./년 -]?\s*(1[0-2]|0?[1-9])\s*월?/);
  if (full) return formatMonth(Number(full[1]), Number(full[2]));
  const slash = String(text || '').match(/(20\d{2})[./-](1[0-2]|0?[1-9])/);
  if (slash) return formatMonth(Number(slash[1]), Number(slash[2]));
  const monthOnly = String(text || '').match(/(?:^|[^0-9])(1[0-2]|0?[1-9])\s*월/);
  if (monthOnly) return formatMonth(current.year, Number(monthOnly[1]));
  return '';
}

function parseExplicitDay(text, now) {
  const current = kstParts(now);
  const full = String(text || '').match(/(20\d{2})\s*[./년 -]\s*(1[0-2]|0?[1-9])\s*[./월 -]\s*([12]\d|3[01]|0?[1-9])\s*일?/);
  if (full) {
    const date = `${full[1]}-${String(Number(full[2])).padStart(2, '0')}-${String(Number(full[3])).padStart(2, '0')}`;
    return `${date.slice(0, 7)}::${date}`;
  }
  const md = String(text || '').match(/(?:^|[^0-9])(1[0-2]|0?[1-9])[./](3[01]|[12]\d|0?[1-9])(?:[^0-9]|$)/);
  if (md) {
    const date = `${current.year}-${String(Number(md[1])).padStart(2, '0')}-${String(Number(md[2])).padStart(2, '0')}`;
    return `${date.slice(0, 7)}::${date}`;
  }
  return '';
}

function parsePerformanceScope(text, now) {
  const compact = normalizeCompact(text);
  const current = kstParts(now);

  if (compact.includes('오늘')) {
    const date = `${current.year}-${String(current.month).padStart(2, '0')}-${String(current.day).padStart(2, '0')}`;
    return { mode: 'day', dayKey: `${date.slice(0, 7)}::${date}` };
  }
  if (compact.includes('어제')) {
    const date = new Date(Date.UTC(current.year, current.month - 1, current.day - 1));
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    return { mode: 'day', dayKey: `${value.slice(0, 7)}::${value}` };
  }

  const dayKey = parseExplicitDay(text, now);
  if (dayKey) return { mode: 'day', dayKey };

  if (compact.includes('이번달') || compact.includes('금월') || compact.includes('당월')) {
    return { mode: 'month', month: formatMonth(current.year, current.month) };
  }
  if (compact.includes('지난달') || compact.includes('전월')) {
    const prev = shiftMonth(current.year, current.month, -1);
    return { mode: 'month', month: formatMonth(prev.year, prev.month) };
  }
  const explicitMonth = parseExplicitMonth(text, now);
  if (explicitMonth) return { mode: 'month', month: explicitMonth };

  if (compact.includes('올해') || compact.includes('금년')) {
    return { mode: 'year', year: String(current.year) };
  }
  if (compact.includes('작년') || compact.includes('지난해')) {
    return { mode: 'year', year: String(current.year - 1) };
  }
  const yearMatch = String(text || '').match(/(20\d{2})\s*년/);
  if (yearMatch) return { mode: 'year', year: yearMatch[1] };

  return { mode: 'all' };
}

function detectBreakdownAxes(compact = '') {
  const axes = [];
  for (const [axis, aliases] of Object.entries(BREAKDOWN_AXIS_ALIASES)) {
    if (aliases.some((alias) => compact.includes(normalizeCompact(alias)))) axes.push(axis);
  }
  return axes;
}

function detectRankMetric(compact = '') {
  if (compact.includes('매입순위') || compact.includes('매입금순위') || compact.includes('하불순위')) return 'purchase';
  if (compact.includes('이익순위') || compact.includes('손익순위') || compact.includes('이익률순위') || compact.includes('손익률순위')) return 'profit';
  if (compact.includes('건수순위') || compact.includes('건수별')) return 'rowCount';
  return 'revenue';
}

export function parseAsanPerformanceIntent(userText = '', options = {}) {
  const text = String(userText || '');
  const compact = normalizeCompact(text);
  const hasTrigger = PERFORMANCE_TRIGGER_WORDS.some((word) => compact.includes(normalizeCompact(word)))
    || (compact.includes('금액') && /(아산|실적|마감|이익|손익|매출|매입|청구|하불)/.test(compact));
  const menu = compact.includes('연간실적') || compact.includes('연간')
    ? 'annual'
    : (compact.includes('월간실적') || compact.includes('월간') || compact.includes('마감') ? 'monthly' : 'summary');
  const scope = parsePerformanceScope(text, options.now || new Date());

  return {
    shouldQuery: hasTrigger,
    menu,
    scope,
    breakdownAxes: detectBreakdownAxes(compact),
    rankMetric: detectRankMetric(compact),
  };
}

function compactSource(data = {}) {
  const summary = data.summary && typeof data.summary === 'object' ? data.summary : {};
  return {
    total: data.total || 0,
    total_is_estimated: Boolean(data.total_is_estimated),
    file_path: data.file_path || '',
    sheet_name: data.sheet_name || '',
    file_modified_at: data.file_modified_at || '',
    synced_at: data.synced_at || '',
    source: data.source || '',
    read_path: data.read_path || '',
    summary: {
      totalRevenue: summary.totalRevenue || 0,
      totalPurchase: summary.totalPurchase || 0,
      totalProfit: summary.totalProfit || 0,
      profitRate: summary.profitRate || 0,
      analysisRows: summary.analysisRows || 0,
      totalRows: summary.totalRows || 0,
      annualFileCount: summary.annualFileCount || 0,
      monthlyFileCount: summary.monthlyFileCount || 0,
      monthlyBasis: summary.monthlyBasis || '',
      periodStart: summary.periodStart || '',
      periodEnd: summary.periodEnd || '',
    },
  };
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  const abs = Math.abs(amount);
  if (abs >= 100000000) return `${(amount / 100000000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원`;
  if (abs >= 10000) return `${(amount / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원`;
  return `${amount.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`;
}

function formatRate(value) {
  return `${(Number(value) || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`;
}

function formatDelta(delta = {}) {
  const amount = Number(delta.amount || 0);
  const sign = amount > 0 ? '+' : '';
  return `${sign}${formatMoney(amount)} (${sign}${(Number(delta.rate || 0)).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%)`;
}

function metricText(item = {}) {
  const label = item.label || item.name || item.vehicleNo || item.key || '-';
  return `${label}: 매출 ${formatMoney(item.revenue)} / 매입 ${formatMoney(item.purchase)} / 이익 ${formatMoney(item.profit)} / 이익률 ${formatRate(item.profitRate)}`;
}

function rankingText(item = {}, rank = 0) {
  const label = item.label || item.name || item.vehicleNo || item.key || '-';
  return `${rank}. ${label}: 매출 ${formatMoney(item.revenue)} / 건수 ${Number(item.rowCount || 0).toLocaleString('ko-KR')}건 / 매입금 ${formatMoney(item.purchase)} / 이익 ${formatMoney(item.profit)} / 이익률 ${formatRate(item.profitRate)}`;
}

function sourceLine(source = {}, label = '') {
  return `${label}: 매출 ${formatMoney(source.revenue)} / 매입 ${formatMoney(source.purchase)} / 이익 ${formatMoney(source.profit)} / 행 ${Number(source.rowCount || 0).toLocaleString('ko-KR')}건`;
}

function targetMenuLabel(menu) {
  if (menu === 'annual') return '연간실적';
  if (menu === 'monthly') return '월간실적';
  return '종합실적';
}

function axisMatchesSection(column = '', axes = []) {
  if (!axes?.length) return true;
  const compactColumn = normalizeCompact(column);
  return axes.some((axis) => (
    (BREAKDOWN_AXIS_ALIASES[axis] || []).some((alias) => {
      const compactAlias = normalizeCompact(alias);
      return compactColumn.includes(compactAlias) || compactAlias.includes(compactColumn);
    })
  ));
}

function sortBreakdownItems(items = [], metric = 'revenue') {
  const metricKey = ['purchase', 'profit', 'rowCount'].includes(metric) ? metric : 'revenue';
  return [...items].sort((a, b) => {
    const diff = Math.abs(Number(b?.[metricKey] || 0)) - Math.abs(Number(a?.[metricKey] || 0));
    if (diff) return diff;
    return String(a?.label || a?.name || '').localeCompare(String(b?.label || b?.name || ''), 'ko-KR');
  });
}

function selectedBreakdowns(summary = {}, intent = {}) {
  const sections = Array.isArray(summary.breakdowns) ? summary.breakdowns : [];
  const axes = intent.breakdownAxes || [];
  const matched = sections.filter((section) => axisMatchesSection(section.column || section.label || '', axes));
  return axes.length ? matched : sections.slice(0, 4);
}

export function buildAsanPerformanceRagText(data = {}, intent = {}, options = {}) {
  const maxItems = options.maxItems || 8;
  const summary = data.summary && typeof data.summary === 'object' ? data.summary : data;
  const scope = summary.scope || intent.scope || { mode: 'all', label: '전체' };
  const sourceMix = summary.sourceMix || {};
  const latestMonth = summary.latestMonth || {};
  const previousMonth = summary.previousMonth || {};
  const latestDay = summary.latestDay || {};
  const executiveSignals = Array.isArray(summary.executiveSignals) ? summary.executiveSignals : [];
  const strategicSegments = Array.isArray(summary.strategicSegments) ? summary.strategicSegments : [];
  const vehiclePerformance = Array.isArray(summary.vehiclePerformance) ? summary.vehiclePerformance : [];
  const breakdownSections = selectedBreakdowns(summary, intent);
  const trendItems = Array.isArray(summary.trendItems) ? summary.trendItems : Array.isArray(summary.monthly) ? summary.monthly : [];

  let text = `\n\n## 아산지점 실적관리\n`;
  text += `[시스템: 실적관리 화면 도출항목 재사용 / 메뉴 ${targetMenuLabel(intent.menu)} / 범위 ${scope.label || scope.mode || '전체'} / 원천 Supabase branch_performance_files·dashboard_snapshots]\n`;
  text += `- 예하 메뉴 연결: 종합실적, 월간실적, 연간실적\n`;
  text += `- 합계: 매출 ${formatMoney(summary.totalRevenue)} / 매입 ${formatMoney(summary.totalPurchase)} / 이익 ${formatMoney(summary.totalProfit)} / 이익률 ${formatRate(summary.profitRate)} / 원가율 ${formatRate(summary.purchaseRate)}\n`;
  text += `- 기간/원장: ${summary.periodStart || '-'} ~ ${summary.periodEnd || '-'} / 행 ${Number(summary.rowCount || 0).toLocaleString('ko-KR')}건 / 파일 ${Number(summary.fileCount || 0).toLocaleString('ko-KR')}개 / 동기화 ${summary.syncedAt || '-'}\n`;
  if (latestMonth?.period) {
    text += `- 최신월 ${latestMonth.period}: ${metricText(latestMonth)}\n`;
  }
  if (previousMonth?.period) {
    text += `- 전월 ${previousMonth.period} 대비: 매출 ${formatDelta(summary.latestRevenueDelta)} / 이익 ${formatDelta(summary.latestProfitDelta)}\n`;
  }
  if (latestDay?.date) {
    text += `- 최신 일별 ${latestDay.date}: ${metricText(latestDay)}\n`;
  }
  if (sourceMix.annual || sourceMix.monthly) {
    text += `- 소스별: ${sourceLine(sourceMix.annual || {}, '연간실적')} / ${sourceLine(sourceMix.monthly || {}, '월간실적')}\n`;
  }
  text += `> [해석 규칙] 실적관리 질문은 화면이 이미 만든 도출항목·요약 스냅샷을 기준으로 답한다. 원장 전체 행을 AI 프롬프트에 직접 주입하거나 금액을 추정하지 마라.\n`;

  if (executiveSignals.length) {
    text += `### 도출항목/경보\n`;
    executiveSignals.slice(0, maxItems).forEach((signal) => {
      text += `- ${signal.title || '-'}: ${signal.value || '-'} (${signal.detail || '-'})\n`;
    });
  }
  if (strategicSegments.length) {
    text += `### 전략 세그먼트\n`;
    strategicSegments.slice(0, maxItems).forEach((item) => {
      text += `- ${metricText(item)}\n`;
    });
  }
  if (vehiclePerformance.length) {
    text += `### 차량/계약 상위\n`;
    vehiclePerformance.slice(0, maxItems).forEach((item) => {
      text += `- ${metricText(item)}\n`;
    });
  }
  if (breakdownSections.length) {
    text += `### 업체/거래처별 도출항목\n`;
    breakdownSections.slice(0, 6).forEach((section) => {
      const column = section.column || section.label || '구분';
      text += `- ${column} 기준\n`;
      sortBreakdownItems(section.items || [], intent.rankMetric).slice(0, maxItems).forEach((item, idx) => {
        text += `  ${rankingText(item, idx + 1)}\n`;
      });
    });
  }
  if (trendItems.length) {
    text += `### 기간 흐름 샘플\n`;
    trendItems.slice(-Math.min(maxItems, trendItems.length)).forEach((item) => {
      text += `- ${item.period || item.year || item.date || '-'}: 매출 ${formatMoney(item.revenue)} / 이익 ${formatMoney(item.profit)} / 이익률 ${formatRate(item.profitRate)}\n`;
    });
  }

  return {
    text,
    hasMatches: Boolean(summary.totalRevenue || summary.totalPurchase || summary.totalProfit || summary.rowCount),
    total: Number(summary.rowCount || 0),
  };
}

function applyScopeParams(params, scope = {}) {
  if (!scope?.mode || scope.mode === 'all') return;
  params.set('scope_mode', scope.mode);
  if (scope.year) params.set('scope_year', scope.year);
  if (scope.month) params.set('scope_month', scope.month);
  if (scope.dayKey) params.set('scope_day_key', scope.dayKey);
}

export async function buildAsanPerformanceRagContext({
  userText = '',
  now = new Date(),
  maxItems = 8,
} = {}) {
  const intent = parseAsanPerformanceIntent(userText, { now });
  if (!intent.shouldQuery) {
    return { shouldQuery: false, success: false, text: '', intent };
  }

  const params = new URLSearchParams();
  params.set('view', 'dashboard');
  applyScopeParams(params, intent.scope);

  try {
    const { queryAsanSummaryPerformanceDashboardViewFromSupabase } = await import('../lib/asan-branch-db.js');
    const data = await queryAsanSummaryPerformanceDashboardViewFromSupabase(
      params,
      buildAsanPerformanceExecutiveSummary,
      compactSource,
      buildAsanPerformanceDashboardView,
    );
    const rag = buildAsanPerformanceRagText(data, intent, { maxItems });
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
      text: `\n\n## 아산지점 실적관리\n> [조회 실패] ${error?.message || String(error)}`,
    };
  }
}
