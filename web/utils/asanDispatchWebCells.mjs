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
    const idx = findDispatchHeaderIndex(headers, candidates);
    return [key, idx >= 0 ? normalizeDispatchCell(row[idx]) : ''];
  });
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
} = {}) {
  const occurrenceMap = new Map();

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

    return {
      branchId,
      sourceType: dispatchType,
      targetDate,
      rowSignature,
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

export function buildWebCellMap(cells = []) {
  const cellMap = new Map();
  for (const cell of cells || []) {
    const key = buildWebCellLookupKey({
      branchId: cell.branch_id || DEFAULT_BRANCH_ID,
      dispatchType: cell.dispatch_type,
      targetDate: cell.target_date,
      rowSignature: cell.row_signature,
      fieldKey: cell.field_key,
    });
    cellMap.set(key, cell);
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
    const cell = cellMap.get(buildWebCellLookupKey({ ...meta, fieldKey }));
    nextRow[idx] = cell?.value ?? '';
  });

  return nextRow;
}

export function webCellFieldSummary(headers = []) {
  return headers
    .filter(isDispatchWebCellField)
    .map((header) => getDispatchWebCellFieldLabel(normalizeDispatchWebCellFieldKey(header)))
    .filter(Boolean);
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

    const { data: cells, error: cellsError } = await supabase
      .from(WEB_CELL_TABLE)
      .select('branch_id, dispatch_type, target_date, row_signature, field_key, value, updated_at')
      .eq('branch_id', branchId)
      .in('dispatch_type', dispatchTypes)
      .in('target_date', targetDates);

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
