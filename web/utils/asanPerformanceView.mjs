export const DEFAULT_ANNUAL_PERFORMANCE_PATH = '/B_총무/C_마감/합계연간실적/합계연간실적.xlsx';
export const DEFAULT_ANNUAL_PERFORMANCE_SHEET = '합계';

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
