export const DEFAULT_ANNUAL_PERFORMANCE_PATH = '/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx';
export const DEFAULT_ANNUAL_PERFORMANCE_SHEET = '합계';

export function normalizePerformancePath(path = DEFAULT_ANNUAL_PERFORMANCE_PATH) {
  const raw = String(path || DEFAULT_ANNUAL_PERFORMANCE_PATH).replace(/\\/g, '/').trim();
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
