function formatFallbackCount(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function topFallbackMapText(map = {}, limit = 8) {
  const entries = Object.entries(map || {})
    .filter(([, value]) => Number(value || 0) > 0)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, limit);

  return entries.length
    ? entries.map(([key, value]) => `${key}(${formatFallbackCount(value)}대)`).join(', ')
    : '없음';
}

function hasDispatchFallbackFilters(intent = {}) {
  return Boolean(intent.filterHour)
    || Boolean(intent.typeFilters?.length)
    || Boolean(intent.carrierFilters?.length)
    || Boolean(intent.regionFilters?.length)
    || Boolean(intent.specificKeywords?.length)
    || Boolean(intent.detailIssueFilters?.length);
}

function buildFallbackFilterLabel(intent = {}) {
  return [
    ...(intent.typeFilters || []).map((type) => (type === 'mobis' ? '모비스' : (type === 'glovis' ? '글로비스' : type))),
    intent.filterHour ? `${intent.filterHour}시` : '',
    ...(intent.carrierFilters || []),
    ...(intent.regionFilters || []),
    ...(intent.specificKeywords || []),
  ].filter(Boolean).join(', ') || '전체';
}

function getFallbackMetricLine(summary = {}, intent = {}) {
  const dispatch = formatFallbackCount(summary.dispatchCount);
  const order = formatFallbackCount(summary.orderCount);
  const metric = intent.quantityMetric || 'dispatch';

  if (metric === 'order') {
    return `오더 ${order}대입니다. 실제 배차는 ${dispatch}대입니다.`;
  }
  if (metric === 'both') {
    return `실제 배차 ${dispatch}대, 오더 ${order}대입니다.`;
  }
  return `실제 배차 ${dispatch}대입니다. 오더는 ${order}대입니다.`;
}

export function buildDispatchRateLimitFallbackText(context = {}) {
  if (!context?.success || !context?.shouldQuery) return '';

  const intent = context.intent || {};
  const hasFilters = hasDispatchFallbackFilters(intent);
  const summary = hasFilters ? context.matchedSummary : context.overallSummary;
  if (!summary || Number(summary.rowCount || 0) <= 0) return '';

  const scopeLabel = intent.dateScope?.label || '요청 범위';
  const filterLabel = buildFallbackFilterLabel(intent);
  const dateList = Array.isArray(context.loadedDates) && context.loadedDates.length
    ? context.loadedDates.join(', ')
    : '확인된 날짜 없음';
  const subject = hasFilters ? `${scopeLabel} ${filterLabel} 조건` : scopeLabel;

  const lines = [
    '생성 모델 요청 한도가 잠깐 걸려서, 서버가 이미 계산한 배차판 집계로 먼저 답할게요.',
    '',
    `${subject} 기준 아산 배차는 ${getFallbackMetricLine(summary, intent)}`,
    `- 매칭 행: ${formatFallbackCount(summary.rowCount)}건`,
    `- 운송사별: ${topFallbackMapText(summary.byCarrier)}`,
    `- 상차지별: ${topFallbackMapText(summary.byRegion)}`,
    `- 실제 조회일: ${dateList}`,
    '- 출처: [사내 통합 데이터베이스] branch_dispatch',
  ];

  if (hasFilters && Number(summary.dispatchCount || 0) === 0) {
    lines.splice(3, 0, '요청 조건에 맞는 실제 배차 항목은 0대입니다.');
  }

  return lines.join('\n');
}

export function buildSseTextPayload(text = '') {
  return `data: ${JSON.stringify({ text })}\n\ndata: [DONE]\n\n`;
}
