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

export function groupContainerHistoryRows(rows = [], targets = []) {
  const grouped = {};
  rows.forEach((row) => {
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
  if (!rows.length) return null;
  return rows.find((row) => String(row?.[1] || '').trim() === '1') || rows[0];
}

export function buildContainerLookupRecord(containerNo, rows = [], lookedUpAt = new Date().toISOString()) {
  const normalized = normalizeContainerNo(containerNo || rows?.[0]?.[0]);
  const resultRows = Array.isArray(rows) ? rows : [];
  const mainRow = selectMainContainerHistoryRow(resultRows) || [
    normalized,
    'ERROR',
    '추출 내역 없음',
    '-',
    '-',
    '-',
    '-',
    '-',
    '-',
    '-',
    '-',
    '-',
    '-',
    '-',
    '-',
  ];

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
    map[containerNo] = buildContainerLookupRecord(containerNo, containerRows, lookedUpAt);
  });
  return map;
}

export function getContainerLookupValue(record, displayHeader) {
  if (!record || !displayHeader) return '';
  const column = CONTAINER_LOOKUP_DISPLAY_COLUMNS.find((item) => item.header === displayHeader);
  if (!column) return '';
  if (column.source === 'looked_up_at') {
    return record.lookedUpAt ? new Date(record.lookedUpAt).toLocaleString() : '';
  }
  const sourceIdx = CONTAINER_HISTORY_HEADERS.indexOf(column.source);
  return sourceIdx >= 0 ? (record.mainRow?.[sourceIdx] ?? '') : '';
}
