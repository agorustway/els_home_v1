import { isContainerLookupColumn } from './containerHistoryResults.mjs';

export const SHIPPING_SIGNAL_TYPES = new Set(['반입', '적하']);

export function normalizeShippingColumnOrder(order = [], currentHeaders = []) {
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

  const excelCols = normalized.filter((col) => !isContainerLookupColumn(col));
  const lookupCols = currentHeaders.filter((col) => isContainerLookupColumn(col) && normalized.includes(col));
  const extraLookupCols = normalized.filter((col) => isContainerLookupColumn(col) && !lookupCols.includes(col));

  return [...excelCols, ...lookupCols, ...extraLookupCols];
}

export function getVisibleShippingColumns(order = [], currentHeaders = [], hiddenCols = []) {
  const hidden = hiddenCols instanceof Set ? hiddenCols : new Set(hiddenCols || []);
  return normalizeShippingColumnOrder(order, currentHeaders).filter((col) => !hidden.has(col));
}

export function areArraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item === b[idx]);
}

export function areSetsEqual(a = new Set(), b = new Set()) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function normalizeDateOnly(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const raw = String(value).trim();
  if (!raw) return '';

  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})(?:\.0)?$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

  const separated = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (separated) {
    return `${separated[1]}-${separated[2].padStart(2, '0')}-${separated[3].padStart(2, '0')}`;
  }

  return '';
}

export function normalizeShippingFilterValue(value) {
  if (value == null) return '';
  return String(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

export function compareShippingFilterValues(a, b, direction = 'asc') {
  const dir = direction === 'desc' ? -1 : 1;
  const valueA = normalizeShippingFilterValue(a);
  const valueB = normalizeShippingFilterValue(b);
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

export function findWorkDateColumnIndex(headers = []) {
  const exactIdx = headers.findIndex((header) => String(header || '').trim() === '작업일자');
  if (exactIdx >= 0) return exactIdx;

  return headers.findIndex((header) => {
    const text = String(header || '').replace(/\s+/g, '').toLowerCase();
    return text.includes('작업') && (text.includes('일자') || text.includes('일'));
  });
}

export function getShippingSignalTone(headers = [], row = [], lookupRecord = null) {
  if (!lookupRecord?.mainRow) return 'neutral';
  if (!Array.isArray(headers) || !Array.isArray(row)) return 'neutral';

  const workDateIdx = findWorkDateColumnIndex(headers);
  const workDate = normalizeDateOnly(workDateIdx >= 0 ? row[workDateIdx] : '');
  const moveDate = normalizeDateOnly(lookupRecord.mainRow?.[5]);
  if (!workDate || !moveDate) return 'neutral';

  const eventType = String(lookupRecord.mainRow?.[3] || '').trim();
  const isTargetType = SHIPPING_SIGNAL_TYPES.has(eventType);
  const isOnOrAfterWorkDate = moveDate >= workDate;

  if (!isOnOrAfterWorkDate) return 'open';
  return isTargetType ? 'completed' : 'unshipped';
}
