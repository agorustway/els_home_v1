import { createHash } from 'node:crypto';
import {
  ASAN_DISPATCH_WEB_CELL_FIELDS,
  getDispatchWebCellFieldLabel,
  isDispatchWebCellField,
  normalizeDispatchWebCellFieldKey,
} from './asanDispatchWebCellFields.mjs';

const DEFAULT_BRANCH_ID = 'asan';
const WEB_CELL_TABLE = 'branch_dispatch_web_cells';
const WEB_CELL_SETTINGS_TABLE = 'branch_dispatch_web_column_settings';
const WEB_CELL_PAGE_SIZE = 1000;

const STABLE_FIELD_CANDIDATES = Object.freeze([
  ['direction', ['구분']],
  ['shipper', ['화주']],
  ['manager', ['담당자', '당당자']],
  ['workplace', ['작업지']],
  ['customer', ['고객사(국가)', '고객사', '국가명', '국가']],
  ['port', ['포트(도착항)', '포트', '도착항']],
  ['nomi', ['특이사항(Nomi,구간)', '특이사항', 'Nomi,구간']],
  ['line', ['라인(선사명)', '라인', '선사명', '선사']],
  ['container_type', ['TYPE', 'T']],
  ['order_qty', ['오더(계)', '오더', '계', '수량']],
]);

export function normalizeDispatchHeader(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function normalizeDispatchCell(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findDispatchHeaderIndex(headers = [], candidates = []) {
  const normalizedHeaders = headers.map(normalizeDispatchHeader);
  const targets = candidates.map(normalizeDispatchHeader).filter(Boolean);

  for (const target of targets) {
    const idx = normalizedHeaders.findIndex((header) => header === target);
    if (idx >= 0) return idx;
  }

  for (const target of targets) {
    const idx = normalizedHeaders.findIndex((header) => header && header.includes(target));
    if (idx >= 0) return idx;
  }

  return -1;
}

export function normalizeDispatchHeadersForType(headers = [], dispatchType = '') {
  const nextHeaders = [...(headers || [])];
  const normalizedType = String(dispatchType || '').trim().toLowerCase();
  const replacements = normalizedType === 'glovis'
    ? [['col_12', 'T']]
    : normalizedType === 'mobis'
      ? [['col_15', 'TYPE']]
      : [];

  replacements.forEach(([source, target]) => {
    const sourceKey = normalizeDispatchHeader(source);
    const idx = nextHeaders.findIndex((header) => normalizeDispatchHeader(header) === sourceKey);
    if (idx >= 0) nextHeaders[idx] = target;
  });

  const bkgIndices = nextHeaders
    .map((header, idx) => ({ idx, key: normalizeDispatchHeader(header) }))
    .filter((item) => /^BKG[123]$/.test(item.key))
    .map((item) => item.idx);

  if (bkgIndices.length >= 2) {
    bkgIndices.slice(0, 3).forEach((idx, offset) => {
      nextHeaders[idx] = `BKG${offset + 1}`;
    });
  }

  return nextHeaders;
}

export function normalizeDispatchRecordHeaders(record = {}) {
  const originalHeaders = record?.headers || [];
  const normalizedHeaders = normalizeDispatchHeadersForType(originalHeaders, record?.type || record?.dispatch_type || '');
  const hasLegacyHeaders = JSON.stringify(originalHeaders) !== JSON.stringify(normalizedHeaders);
  return {
    ...record,
    headers: normalizedHeaders,
    webCellLegacyHeaders: hasLegacyHeaders ? originalHeaders : [],
  };
}

export function findDispatchOrderIndex(headers = [], dispatchType = '') {
  if (dispatchType === 'mobis') {
    return findDispatchHeaderIndex(headers, ['계', '수량', '오더']);
  }
  return findDispatchHeaderIndex(headers, ['오더', '오더(계)', '계', '수량']);
}

export function isMeaningfulDispatchOrderValue(value) {
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (!text || ['0', 'nan', 'none', 'null', '-'].includes(text.toLowerCase())) return false;
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return false;
  return Number(text) > 0;
}

export function shouldIncludeDispatchRow(headers = [], row = [], dispatchType = '') {
  const orderIdx = findDispatchOrderIndex(headers, dispatchType);
  if (orderIdx < 0) return true;
  return isMeaningfulDispatchOrderValue(row[orderIdx]);
}

function stableFieldEntries(headers = [], row = []) {
  return STABLE_FIELD_CANDIDATES.map(([key, candidates]) => {
    const idx = key === 'nomi'
      ? findStableNomiIndex(headers)
      : findDispatchHeaderIndex(headers, candidates);
    return [key, idx >= 0 ? normalizeDispatchCell(row[idx]) : ''];
  });
}

function findStableNomiIndex(headers = []) {
  const directIdx = findDispatchHeaderIndex(headers, ['특이사항(Nomi,구간)', 'Nomi,구간']);
  if (directIdx >= 0) return directIdx;

  const noteIdx = findDispatchHeaderIndex(headers, ['특이사항']);
  if (noteIdx < 0) return -1;
  const beforeLineIdx = findDispatchHeaderIndex(headers, ['라인(선사명)', '라인', '선사명', '선사', 'TYPE', 'T']);
  return beforeLineIdx < 0 || noteIdx < beforeLineIdx ? noteIdx : -1;
}

function hashStablePayload(payload) {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 32);
}

export function createDispatchRowMetaBuilder({
  branchId = DEFAULT_BRANCH_ID,
  dispatchType,
  targetDate,
  headers = [],
  legacyHeaders = [],
} = {}) {
  const occurrenceMap = new Map();
  const legacyHeaderSets = Array.isArray(legacyHeaders?.[0])
    ? legacyHeaders
    : (Array.isArray(legacyHeaders) && legacyHeaders.length > 0 ? [legacyHeaders] : []);
  const legacyOccurrenceMaps = legacyHeaderSets.map(() => new Map());

  return function buildDispatchRowMeta(row = [], rowIndex = 0) {
    const fields = Object.fromEntries(stableFieldEntries(headers, row));
    const baseHash = hashStablePayload({
      branchId,
      dispatchType,
      targetDate,
      fields,
    });
    const occurrence = (occurrenceMap.get(baseHash) || 0) + 1;
    occurrenceMap.set(baseHash, occurrence);
    const rowSignature = `${baseHash}:${String(occurrence).padStart(3, '0')}`;
    const legacyRowSignatures = [];

    legacyHeaderSets.forEach((headerSet, idx) => {
      const legacyFields = Object.fromEntries(stableFieldEntries(headerSet, row));
      const legacyHash = hashStablePayload({
        branchId,
        dispatchType,
        targetDate,
        fields: legacyFields,
      });
      const legacyMap = legacyOccurrenceMaps[idx];
      const legacyOccurrence = (legacyMap.get(legacyHash) || 0) + 1;
      legacyMap.set(legacyHash, legacyOccurrence);
      const legacySignature = `${legacyHash}:${String(legacyOccurrence).padStart(3, '0')}`;
      if (legacySignature !== rowSignature && !legacyRowSignatures.includes(legacySignature)) {
        legacyRowSignatures.push(legacySignature);
      }
    });

    return {
      branchId,
      sourceType: dispatchType,
      targetDate,
      rowSignature,
      legacyRowSignatures,
      sourceRowIndex: rowIndex,
      rowContext: fields,
    };
  };
}

export function buildWebCellLookupKey({
  branchId = DEFAULT_BRANCH_ID,
  dispatchType,
  sourceType,
  targetDate,
  rowSignature,
  fieldKey,
}) {
  const normalizedField = normalizeDispatchWebCellFieldKey(fieldKey);
  return [
    branchId,
    dispatchType || sourceType,
    targetDate,
    rowSignature,
    normalizedField,
  ].join('|');
}

export function buildWebCellRowIndexLookupKey({
  branchId = DEFAULT_BRANCH_ID,
  dispatchType,
  sourceType,
  targetDate,
  rowIndex,
  sourceRowIndex,
  fieldKey,
}) {
  const normalizedField = normalizeDispatchWebCellFieldKey(fieldKey);
  const normalizedRowIndex = Number(rowIndex ?? sourceRowIndex);
  if (!Number.isFinite(normalizedRowIndex)) return '';
  return [
    '__row_index__',
    branchId,
    dispatchType || sourceType,
    targetDate,
    normalizedRowIndex,
    normalizedField,
  ].join('|');
}

function webCellUpdatedTime(cell = {}) {
  const time = new Date(cell.updated_at || cell.created_at || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function shouldDisplayDispatchWebCell(cell = {}) {
  const fieldKey = normalizeDispatchWebCellFieldKey(cell.field_key);
  if (fieldKey !== ASAN_DISPATCH_WEB_CELL_FIELDS.NOTE) return true;
  return String(cell.source || '').toLowerCase() === 'web';
}

function setLatestWebCell(cellMap, key, cell) {
  if (!key) return;
  const existing = cellMap.get(key);
  if (!existing || webCellUpdatedTime(existing) <= webCellUpdatedTime(cell)) {
    cellMap.set(key, cell);
  }
}

function appendRowIndexWebCell(cellMap, key, cell) {
  if (!key) return;
  const existing = cellMap.get(key);
  if (!existing) {
    cellMap.set(key, [cell]);
    return;
  }
  const cells = Array.isArray(existing) ? existing : [existing];
  cells.push(cell);
  cells.sort((a, b) => webCellUpdatedTime(a) - webCellUpdatedTime(b));
  cellMap.set(key, cells);
}

function isCompatibleRowContext(cell = {}, meta = {}) {
  const savedContext = cell.row_context;
  const currentContext = meta.rowContext;
  if (!savedContext || typeof savedContext !== 'object' || !currentContext || typeof currentContext !== 'object') {
    return true;
  }

  const keys = ['direction', 'shipper', 'workplace', 'customer', 'port', 'line', 'container_type', 'order_qty'];
  let comparable = 0;
  let matches = 0;
  keys.forEach((key) => {
    const saved = normalizeDispatchCell(savedContext[key]);
    const current = normalizeDispatchCell(currentContext[key]);
    if (!saved || !current) return;
    comparable += 1;
    if (saved === current) matches += 1;
  });

  if (comparable === 0) return true;
  return matches >= Math.min(3, comparable);
}

export function buildWebCellMap(cells = []) {
  const cellMap = new Map();
  const sortedCells = [...(cells || [])].sort((a, b) => webCellUpdatedTime(a) - webCellUpdatedTime(b));
  for (const cell of sortedCells) {
    if (!shouldDisplayDispatchWebCell(cell)) continue;
    const key = buildWebCellLookupKey({
      branchId: cell.branch_id || DEFAULT_BRANCH_ID,
      dispatchType: cell.dispatch_type,
      targetDate: cell.target_date,
      rowSignature: cell.row_signature,
      fieldKey: cell.field_key,
    });
    setLatestWebCell(cellMap, key, cell);
    appendRowIndexWebCell(cellMap, buildWebCellRowIndexLookupKey({
      branchId: cell.branch_id || DEFAULT_BRANCH_ID,
      dispatchType: cell.dispatch_type,
      targetDate: cell.target_date,
      rowIndex: cell.row_index,
      fieldKey: cell.field_key,
    }), cell);
  }
  return cellMap;
}

export function applyDispatchWebCellOverlay({
  headers = [],
  row = [],
  meta,
  cellMap = new Map(),
  enabled = false,
} = {}) {
  const nextRow = [...row];
  if (!enabled || !meta?.rowSignature) return nextRow;

  headers.forEach((header, idx) => {
    const fieldKey = normalizeDispatchWebCellFieldKey(header);
    if (!fieldKey) return;
    const signatureCandidates = [
      meta.rowSignature,
      ...(Array.isArray(meta.legacyRowSignatures) ? meta.legacyRowSignatures : []),
    ].filter(Boolean);
    const cell = signatureCandidates
      .map((rowSignature) => cellMap.get(buildWebCellLookupKey({ ...meta, rowSignature, fieldKey })))
      .find(Boolean);
    const rowIndexCells = cellMap.get(buildWebCellRowIndexLookupKey({ ...meta, fieldKey }));
    const rowIndexCell = Array.isArray(rowIndexCells)
      ? [...rowIndexCells].reverse().find((candidate) => isCompatibleRowContext(candidate, meta))
      : (isCompatibleRowContext(rowIndexCells, meta) ? rowIndexCells : null);
    nextRow[idx] = (cell || rowIndexCell)?.value ?? '';
  });

  return nextRow;
}

export function webCellFieldSummary(headers = []) {
  return headers
    .filter(isDispatchWebCellField)
    .map((header) => getDispatchWebCellFieldLabel(normalizeDispatchWebCellFieldKey(header)))
    .filter(Boolean);
}

async function fetchDispatchWebCells(supabase, { branchId, dispatchTypes, targetDates }) {
  const selectFields = 'branch_id, dispatch_type, target_date, row_signature, field_key, value, source, row_index, row_context, updated_at';
  const cells = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(WEB_CELL_TABLE)
      .select(selectFields)
      .eq('branch_id', branchId)
      .in('dispatch_type', dispatchTypes)
      .in('target_date', targetDates)
      .range(from, from + WEB_CELL_PAGE_SIZE - 1);

    if (error) return { data: cells, error };
    cells.push(...(data || []));
    if (!data || data.length < WEB_CELL_PAGE_SIZE) return { data: cells, error: null };
    from += WEB_CELL_PAGE_SIZE;
  }
}

function isMissingWebCellTableError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01'
    || code === 'PGRST205'
    || code === 'PGRST116'
    || message.includes(WEB_CELL_TABLE)
    || message.includes(WEB_CELL_SETTINGS_TABLE);
}

export async function loadDispatchWebCellState(supabase, records = [], { branchId = DEFAULT_BRANCH_ID } = {}) {
  const baseState = {
    enabled: false,
    settings: null,
    cells: [],
    cellMap: new Map(),
    reason: 'disabled',
  };

  try {
    const { data: settings, error: settingsError } = await supabase
      .from(WEB_CELL_SETTINGS_TABLE)
      .select('*')
      .eq('branch_id', branchId)
      .maybeSingle();

    if (settingsError) {
      if (isMissingWebCellTableError(settingsError)) return { ...baseState, reason: 'not_configured' };
      throw settingsError;
    }

    if (!settings?.enabled) return { ...baseState, settings, reason: 'not_enabled' };

    const sourceRecords = (records || []).filter((record) => ['glovis', 'mobis'].includes(record?.type));
    const targetDates = [...new Set(sourceRecords.map((record) => record.target_date).filter(Boolean))];
    const dispatchTypes = [...new Set(sourceRecords.map((record) => record.type).filter(Boolean))];

    if (targetDates.length === 0 || dispatchTypes.length === 0) {
      return { ...baseState, enabled: true, settings, reason: 'no_records' };
    }

    const { data: cells, error: cellsError } = await fetchDispatchWebCells(supabase, {
      branchId,
      dispatchTypes,
      targetDates,
    });

    if (cellsError) {
      if (isMissingWebCellTableError(cellsError)) return { ...baseState, settings, reason: 'not_configured' };
      throw cellsError;
    }

    return {
      enabled: true,
      settings,
      cells: cells || [],
      cellMap: buildWebCellMap(cells || []),
      reason: 'enabled',
    };
  } catch (error) {
    console.error('[asan-dispatch-web-cells] overlay load failed:', error);
    return { ...baseState, reason: 'error', error };
  }
}

export function asWebCellDbField(fieldKey) {
  return normalizeDispatchWebCellFieldKey(fieldKey) || ASAN_DISPATCH_WEB_CELL_FIELDS.NOTE;
}
