export const TRANSPORT_HISTORY_TABLE = 'branch_transport_history';
export const TRANSPORT_HISTORY_QUERY_MODES = new Set(['full', 'meta', 'date', 'rows', 'filter-values']);

const HEADER_ALIAS_MAP = new Map([
  ['출차시간', '청구금액'],
  ['청구금액', '청구금액'],
]);

function compactHeader(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

export function normalizeTransportHistoryHeader(value, index = 0) {
  const original = String(value || '').replace(/\s+/g, ' ').trim();
  const compact = compactHeader(original);
  if (!compact) return `col_${index + 1}`;
  return HEADER_ALIAS_MAP.get(compact) || original;
}

export function normalizeTransportHistoryHeaders(headers = []) {
  const used = new Map();
  return (headers || []).map((header, index) => {
    const normalized = normalizeTransportHistoryHeader(header, index);
    const count = used.get(normalized) || 0;
    used.set(normalized, count + 1);
    return count > 0 ? `${normalized}_${count + 1}` : normalized;
  });
}

export function getTransportHistoryQueryMode(value) {
  const mode = String(value || 'full').trim().toLowerCase();
  return TRANSPORT_HISTORY_QUERY_MODES.has(mode) ? mode : 'full';
}

export function normalizeTransportHistoryMonth(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return '';
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function normalizeTransportHistoryYear(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})$/);
  if (!match) return '';
  const year = Number(match[1]);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return '';
  return String(year);
}

export function normalizeTransportHistoryDay(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function countTransportHistoryRows(item = {}) {
  const explicitCount = Number(item.valid_row_count ?? item.row_count);
  if (Number.isFinite(explicitCount) && explicitCount >= 0) return explicitCount;
  return Array.isArray(item.data) ? item.data.length : 0;
}

export function makeTransportHistoryMetaItem(item = {}) {
  const rowCount = countTransportHistoryRows(item);
  return {
    ...item,
    data: [],
    row_count: Number(item.row_count ?? rowCount) || 0,
    valid_row_count: Number(item.valid_row_count ?? rowCount) || 0,
    meta_only: true,
  };
}

function normalizeCellValue(value) {
  return String(value ?? '').trim();
}

export function normalizeTransportHistoryFilterValue(value) {
  const text = normalizeCellValue(value);
  return text || '(빈 값)';
}

export function normalizeTransportHistoryColumnFilters(filters = {}) {
  if (!filters || typeof filters !== 'object') return {};
  return Object.fromEntries(
    Object.entries(filters)
      .map(([column, values]) => [
        String(column || '').trim(),
        Array.from(new Set((Array.isArray(values) ? values : [])
          .map(normalizeTransportHistoryFilterValue))),
      ])
      .filter(([column, values]) => column && values.length > 0)
  );
}

function parseTransportHistoryDate(value) {
  const raw = normalizeCellValue(value);
  if (!raw) return '';
  const compact = raw.replace(/[./]/g, '-');
  const eightDigit = compact.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (eightDigit) return `${eightDigit[1]}-${eightDigit[2]}-${eightDigit[3]}`;
  const dateMatch = compact.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!dateMatch) return raw;
  return `${dateMatch[1]}-${String(Number(dateMatch[2])).padStart(2, '0')}-${String(Number(dateMatch[3])).padStart(2, '0')}`;
}

function compareTransportHistoryValues(a, b, direction = 'asc') {
  const sign = direction === 'desc' ? -1 : 1;
  const left = normalizeCellValue(a);
  const right = normalizeCellValue(b);
  const leftNumber = Number(left.replace(/,/g, ''));
  const rightNumber = Number(right.replace(/,/g, ''));
  if (left && right && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return (leftNumber - rightNumber) * sign;
  }
  return left.localeCompare(right, 'ko-KR', { numeric: true }) * sign;
}

function getHeaderIndex(headers, candidates) {
  return candidates
    .map(candidate => headers.indexOf(candidate))
    .find(index => index >= 0) ?? -1;
}

function collectTransportHistoryHeaders(records = []) {
  const headers = [];
  const addHeader = (header) => {
    if (header && !headers.includes(header)) headers.push(header);
  };
  records.forEach(record => {
    (record.headers || []).forEach(addHeader);
  });
  return headers;
}

function flattenTransportHistoryRows(records = [], headers = []) {
  const flattened = [];
  records.forEach(record => {
    const sourceHeaders = record.headers || [];
    const sourceRows = Array.isArray(record.data) ? record.data : [];
    const indexMap = headers.map(header => sourceHeaders.indexOf(header));
    sourceRows.forEach((row, sourceRowIndex) => {
      const values = indexMap.map(index => (index >= 0 ? row[index] : ''));
      flattened.push({
        values,
        targetMonth: normalizeTransportHistoryMonth(record.target_month) || record.target_month || '',
        sheetName: record.sheet_name || '',
        sourceRowIndex,
      });
    });
  });
  return flattened;
}

function getTransportHistoryDateIndex(headers = [], dateColumn = '') {
  return dateColumn && headers.includes(dateColumn)
    ? headers.indexOf(dateColumn)
    : getHeaderIndex(headers, ['작업일자', '작업일', '날짜', '일자']);
}

function filterTransportHistoryRows(rows = [], headers = [], options = {}) {
  const searchTerms = String(options.search || '')
    .split(',')
    .map(term => term.trim().toLowerCase())
    .filter(Boolean);
  const dateFilter = normalizeTransportHistoryDay(options.date || options.day);
  const dateFrom = normalizeTransportHistoryDay(options.dateFrom || options.date_from);
  const dateTo = normalizeTransportHistoryDay(options.dateTo || options.date_to);
  const rangeStart = dateFrom && dateTo && dateFrom > dateTo ? dateTo : dateFrom;
  const rangeEnd = dateFrom && dateTo && dateFrom > dateTo ? dateFrom : dateTo;
  const dateColumn = String(options.dateColumn || '').trim();
  const dateIndex = getTransportHistoryDateIndex(headers, dateColumn);
  const columnFilters = normalizeTransportHistoryColumnFilters(options.columnFilters || options.filters || {});

  let nextRows = rows;
  if ((dateFilter || rangeStart || rangeEnd) && dateIndex >= 0) {
    nextRows = nextRows.filter(item => {
      const rowDate = parseTransportHistoryDate(item.values[dateIndex]);
      if (!rowDate) return false;
      if (dateFilter) return rowDate === dateFilter;
      if (rangeStart && rowDate < rangeStart) return false;
      if (rangeEnd && rowDate > rangeEnd) return false;
      return true;
    });
  }
  if (searchTerms.length) {
    nextRows = nextRows.filter(item => {
      const haystack = item.values.map(value => normalizeCellValue(value).toLowerCase()).join(' ');
      return searchTerms.some(term => haystack.includes(term));
    });
  }
  Object.entries(columnFilters).forEach(([column, selectedValues]) => {
    const columnIndex = headers.indexOf(column);
    if (columnIndex < 0 || !selectedValues.length) return;
    const selectedSet = new Set(selectedValues);
    nextRows = nextRows.filter(item => selectedSet.has(normalizeTransportHistoryFilterValue(item.values[columnIndex])));
  });

  return { rows: nextRows, dateIndex };
}

export function buildTransportHistoryRowsPage(records = [], options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 500));
  const offset = Math.max(0, Number(options.offset || 0));
  const sortKey = String(options.sortKey || '').trim();
  const sortDirection = options.sortDirection === 'desc' ? 'desc' : 'asc';
  const defaultDateDirection = options.defaultDateDirection === 'asc' ? 'asc' : 'desc';
  const headers = collectTransportHistoryHeaders(records);
  const seqIndex = getHeaderIndex(headers, ['SEQ', 'Seq', 'seq']);
  const sortIndex = sortKey ? headers.indexOf(sortKey) : -1;
  const flattened = flattenTransportHistoryRows(records, headers);
  const filtered = filterTransportHistoryRows(flattened, headers, options);
  const rows = filtered.rows;
  const dateIndex = filtered.dateIndex;

  rows.sort((a, b) => {
    if (sortIndex >= 0) {
      const sorted = compareTransportHistoryValues(a.values[sortIndex], b.values[sortIndex], sortDirection);
      if (sorted !== 0) return sorted;
    }
    const dateA = dateIndex >= 0 ? parseTransportHistoryDate(a.values[dateIndex]) : a.targetMonth;
    const dateB = dateIndex >= 0 ? parseTransportHistoryDate(b.values[dateIndex]) : b.targetMonth;
    const byDate = compareTransportHistoryValues(dateA, dateB, defaultDateDirection);
    if (byDate !== 0) return byDate;
    const byMonth = compareTransportHistoryValues(a.targetMonth, b.targetMonth, defaultDateDirection);
    if (byMonth !== 0) return byMonth;
    return a.sourceRowIndex - b.sourceRowIndex;
  });

  const total = rows.length;
  const pagedItems = rows.slice(offset, offset + limit);
  const data = pagedItems.map((item, index) => {
    const values = [...item.values];
    if (seqIndex >= 0) values[seqIndex] = String(offset + index + 1);
    return values;
  });

  return {
    headers,
    data,
    row_count: total,
    valid_row_count: total,
    total,
    limit,
    offset,
    has_more: offset + data.length < total,
  };
}

export function buildTransportHistoryFilterValues(records = [], options = {}) {
  const column = String(options.column || '').trim();
  const headers = collectTransportHistoryHeaders(records);
  const columnIndex = headers.indexOf(column);
  if (!column || columnIndex < 0) {
    return { column, values: [], total: 0 };
  }

  const columnFilters = normalizeTransportHistoryColumnFilters(options.columnFilters || options.filters || {});
  delete columnFilters[column];
  const flattened = flattenTransportHistoryRows(records, headers);
  const { rows } = filterTransportHistoryRows(flattened, headers, {
    ...options,
    columnFilters,
  });
  const values = Array.from(new Set(rows.map(item => normalizeTransportHistoryFilterValue(item.values[columnIndex]))))
    .sort((a, b) => compareTransportHistoryValues(a, b, 'asc'));
  return {
    column,
    values,
    total: rows.length,
  };
}
