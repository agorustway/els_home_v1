import { isContainerNoShape, normalizeContainerNo } from './containerInput.mjs';

export const CONTAINER_HISTORY_HEADERS = [
  '컨테이너번호',
  'No',
  '수출입',
  '구분',
  '터미널',
  'MOVE TIME',
  '모선',
  '항차',
  '선사',
  '적공',
  'SIZE',
  'POD',
  'POL',
  '차량번호',
  'RFID',
];

export const CONTAINER_LOOKUP_PREFIX = '이력 ';

export const CONTAINER_LOOKUP_DISPLAY_COLUMNS = [
  ...CONTAINER_HISTORY_HEADERS.slice(1).map((source) => ({
    source,
    header: `${CONTAINER_LOOKUP_PREFIX}${source}`,
  })),
  { source: 'looked_up_at', header: `${CONTAINER_LOOKUP_PREFIX}조회시각` },
];

export function isContainerLookupColumn(header) {
  return CONTAINER_LOOKUP_DISPLAY_COLUMNS.some((col) => col.header === header);
}

export function findContainerColumnIndex(headers = []) {
  const upperIndex = headers.findIndex((header) => String(header || '').toUpperCase().includes('CONTAINER'));
  if (upperIndex >= 0) return upperIndex;
  return headers.findIndex((header) => String(header || '').includes('컨테이너'));
}

export function extractUniqueContainerNos(headers = [], rows = []) {
  const containerIdx = findContainerColumnIndex(headers);
  if (containerIdx < 0) return [];

  const seen = new Set();
  const containers = [];
  rows.forEach((row) => {
    const containerNo = normalizeContainerNo(row?.[containerIdx]);
    if (!isContainerNoShape(containerNo) || seen.has(containerNo)) return;
    seen.add(containerNo);
    containers.push(containerNo);
  });
  return containers;
}

export function orderContainerLookupTargets(containers = [], lookupResults = {}) {
  const missing = [];
  const alreadyLookedUp = [];
  const seen = new Set();

  containers.forEach((value) => {
    const containerNo = normalizeContainerNo(value);
    if (!isContainerNoShape(containerNo) || seen.has(containerNo)) return;
    seen.add(containerNo);
    const record = lookupResults?.[containerNo];
    if (record?.mainRow) alreadyLookedUp.push(containerNo);
    else missing.push(containerNo);
  });

  return [...missing, ...alreadyLookedUp];
}

export function isActualContainerHistoryRow(row = []) {
  const no = String(row?.[1] || '').trim();
  if (!/^\d+$/.test(no)) return false;
  const historyText = row.slice(2, 14).map((cell) => String(cell || '')).join('|');
  return /(수입|수출|반입|반출|양하|적하)/.test(historyText);
}

export function groupContainerHistoryRows(rows = [], targets = [], options = {}) {
  const actualOnly = options.actualOnly !== false;
  const grouped = {};
  rows.forEach((row) => {
    if (actualOnly && !isActualContainerHistoryRow(row)) return;
    const containerNo = normalizeContainerNo(row?.[0]);
    if (!containerNo) return;
    if (!grouped[containerNo]) grouped[containerNo] = [];
    grouped[containerNo].push(row);
  });

  Object.keys(grouped).forEach((containerNo) => {
    grouped[containerNo].sort((a, b) => {
      const noA = Number(a?.[1]) || 0;
      const noB = Number(b?.[1]) || 0;
      return noA - noB;
    });
  });

  if (!targets.length) return grouped;

  const ordered = {};
  targets.forEach((target) => {
    const containerNo = normalizeContainerNo(target);
    if (grouped[containerNo]) {
      ordered[containerNo] = grouped[containerNo];
      delete grouped[containerNo];
    }
  });
  Object.keys(grouped).forEach((containerNo) => {
    ordered[containerNo] = grouped[containerNo];
  });
  return ordered;
}

export function selectMainContainerHistoryRow(rows = []) {
  const actualRows = rows.filter(isActualContainerHistoryRow);
  if (!actualRows.length) return null;
  return actualRows.find((row) => String(row?.[1] || '').trim() === '1') || actualRows[0];
}

export function buildContainerLookupRecord(containerNo, rows = [], lookedUpAt = new Date().toISOString()) {
  const normalized = normalizeContainerNo(containerNo || rows?.[0]?.[0]);
  const resultRows = Array.isArray(rows) ? rows.filter(isActualContainerHistoryRow) : [];
  const mainRow = selectMainContainerHistoryRow(resultRows);
  if (!mainRow) return null;

  return {
    containerNo: normalized,
    resultRows,
    mainRow,
    lookedUpAt,
  };
}

export function buildContainerLookupMapFromRows(rows = [], targets = [], lookedUpAt = new Date().toISOString()) {
  const grouped = groupContainerHistoryRows(rows, targets);
  const map = {};
  Object.entries(grouped).forEach(([containerNo, containerRows]) => {
    const record = buildContainerLookupRecord(containerNo, containerRows, lookedUpAt);
    if (record) map[containerNo] = record;
  });
  return map;
}

function padDatePart(value) {
  return String(value || '').padStart(2, '0');
}

function formatLocalDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('/') + ` ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

export function formatContainerLookupDateTime(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const plain = text.match(/^(\d{4})[-/.]\s*(\d{1,2})[-/.]\s*(\d{1,2})\.?[\sT]+(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/);
  if (plain) {
    const [, y, mo, d, h, mi] = plain;
    return `${y}/${padDatePart(mo)}/${padDatePart(d)} ${padDatePart(h)}:${mi}`;
  }

  const korean = text.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (korean) {
    const [, y, mo, d, meridiem, rawHour, mi] = korean;
    const hour = Number(rawHour);
    const normalizedHour = meridiem === '오후'
      ? (hour === 12 ? 12 : hour + 12)
      : (hour === 12 ? 0 : hour);
    return `${y}/${padDatePart(mo)}/${padDatePart(d)} ${padDatePart(normalizedHour)}:${mi}`;
  }

  const zoned = text.match(/^(\d{4})-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i);
  if (zoned) {
    const parsed = new Date(text);
    const formatted = formatLocalDateTime(parsed);
    if (formatted) return formatted;
  }

  return text;
}

export function getContainerLookupValue(record, displayHeader) {
  if (!record || !displayHeader) return '';
  const column = CONTAINER_LOOKUP_DISPLAY_COLUMNS.find((item) => item.header === displayHeader);
  if (!column) return '';
  if (column.source === 'looked_up_at') {
    return formatContainerLookupDateTime(record.lookedUpAt);
  }
  const sourceIdx = CONTAINER_HISTORY_HEADERS.indexOf(column.source);
  const value = sourceIdx >= 0 ? (record.mainRow?.[sourceIdx] ?? '') : '';
  return column.source === 'MOVE TIME' ? formatContainerLookupDateTime(value) : value;
}
