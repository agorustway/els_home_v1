export const TRANSPORT_HISTORY_TABLE = 'branch_transport_history';
export const TRANSPORT_HISTORY_QUERY_MODES = new Set(['full', 'meta', 'date']);

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
