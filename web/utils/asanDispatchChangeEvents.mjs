import { DISPATCH_DETAIL_HEADERS, detailLineToRow } from './asanDispatchDetailLines.mjs';

export const DISPATCH_CHANGE_TYPE_LABELS = Object.freeze({
  add: '추가',
  delete: '삭제',
  change: '변경',
});

export const DISPATCH_CHANGE_STATUS_LABELS = Object.freeze({
  pending: '미확인',
  confirmed: '확인완료',
});

export const DISPATCH_CHANGE_HEADERS = Object.freeze([
  ...DISPATCH_DETAIL_HEADERS,
  '변동구분',
  '확인상태',
  '발생일시',
  '확인일시',
  '관리',
]);

const DERIVED_GLAPS_HEADERS = new Set([
  '운송경로',
  '운송경로코드',
  '포트코드',
  '라인코드',
  '타입코드',
  '오더구분코드',
  '화주사코드',
  '반출지(출발)코드',
  '작업지(하차지)코드',
  '반입지(도착)코드',
  '운송서비스코드',
  '운송사코드',
  '컨샤이니',
]);
const TRANSPORT_CHANGE_HEADERS = Object.freeze([
  '고객사',
  '포트(DIST)',
  '라인',
  '타입',
]);
const TRANSPORT_CHANGE_CONTEXT_KEYS = Object.freeze([
  'transportRemark',
]);
const MEMO_ONLY_HEADERS = new Set([
  'BKG확정',
  'BKG1',
  'BKG2',
  'BKG3',
  'TARGET VESSEL',
  '비고',
  '수정일시',
]);

export function isDispatchDerivedGlapsHeader(header = '') {
  return DERIVED_GLAPS_HEADERS.has(header);
}
const IDENTITY_FALLBACK_HEADERS = Object.freeze([
  '작업일자',
  '구분',
  '화주',
  '상차지',
  '작업지',
  '하차지(선적)',
  '업체명',
]);

function cleanText(value = '') {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function normalizeValues(values = []) {
  return DISPATCH_DETAIL_HEADERS.map((_, idx) => cleanText(values[idx] ?? ''));
}

function valuesByHeader(values = []) {
  const normalized = normalizeValues(values);
  return DISPATCH_DETAIL_HEADERS.reduce((acc, header, idx) => {
    acc[header] = normalized[idx] || '';
    return acc;
  }, {});
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? '');
}

export function hashDispatchChangeText(value = '') {
  const text = String(value ?? '');
  let hash = 2166136261;
  for (let idx = 0; idx < text.length; idx += 1) {
    hash ^= text.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function makeKey(parts = []) {
  return parts.map(cleanText).join('\u001f');
}

function makeRowFingerprint(headerMap = {}, rowContext = {}) {
  return makeKey([
    ...TRANSPORT_CHANGE_HEADERS.map(header => headerMap[header] || ''),
    ...TRANSPORT_CHANGE_CONTEXT_KEYS.map(key => rowContext[key] || ''),
  ]);
}

export function getDispatchChangeDiffHeaders(beforeValues = [], afterValues = [], beforeContext = {}, afterContext = {}) {
  const beforeMap = valuesByHeader(beforeValues);
  const afterMap = valuesByHeader(afterValues);
  const changed = TRANSPORT_CHANGE_HEADERS.filter(header => cleanText(beforeMap[header]) !== cleanText(afterMap[header]));
  TRANSPORT_CHANGE_CONTEXT_KEYS.forEach((key) => {
    if (cleanText(beforeContext[key]) !== cleanText(afterContext[key])) changed.push(key);
  });
  return changed;
}

export function getDispatchMemoOnlyDiffHeaders(beforeValues = [], afterValues = []) {
  const beforeMap = valuesByHeader(beforeValues);
  const afterMap = valuesByHeader(afterValues);
  return [...MEMO_ONLY_HEADERS].filter(header => cleanText(beforeMap[header]) !== cleanText(afterMap[header]));
}

function makeIdentityKey(line = {}, headerMap = {}) {
  const sourceParts = [
    line.sourceRowIndex ?? line.rowContext?.sourceRowIndex ?? '',
    line.sourceRegionColumn ?? line.startRegion ?? line.rowContext?.sourceRegion ?? '',
    line.rawCompany ?? line.rowContext?.rawCompany ?? '',
    line.company ?? headerMap['업체명'] ?? '',
    line.startSuffix ?? line.rowContext?.startSuffix ?? '',
    line.workDate ?? headerMap['작업일자'] ?? '',
    line.shipper ?? headerMap['화주'] ?? '',
  ].map(cleanText);

  if (sourceParts.some(Boolean)) return makeKey(sourceParts);
  return makeKey(IDENTITY_FALLBACK_HEADERS.map(header => headerMap[header] || ''));
}

function makeRowPayload(record = {}) {
  return {
    detailLineKey: record.detailLineKey || '',
    identityKey: record.identityKey || '',
    groupKey: record.groupKey || record.rowFingerprint || '',
    rowFingerprint: record.rowFingerprint || '',
    rowValues: normalizeValues(record.rowValues || []),
    rowContext: record.rowContext || {},
  };
}

export function makeDispatchChangeSnapshotLine(line = {}, detailLineKey = '') {
  const rowValues = normalizeValues(detailLineToRow(line));
  const headerMap = valuesByHeader(rowValues);
  const rowContext = {
    lineNo: line.lineNo || null,
    workDate: line.workDate || '',
    shipper: line.shipper || '',
    direction: line.direction || '',
    startLocation: line.startLocation || '',
    workplace: line.workplace || '',
    destination: line.destination || '',
    customer: line.customer || '',
    port: line.port || '',
    transportRemark: line.transportRemark || '',
    line: line.line || '',
    containerType: line.containerType || '',
    company: line.company || '',
    bkg1: line.bkg1 || '',
    bkg2: line.bkg2 || '',
    bkg3: line.bkg3 || '',
    confirmedBkg: line.confirmedBkg || line.bkg1 || '',
    sourceRowIndex: line.sourceRowIndex ?? null,
    sourceRegion: line.sourceRegion || '',
    sourceText: line.sourceText || '',
    sourceUnitIndex: line.sourceUnitIndex || null,
    rawCompany: line.rawCompany || '',
    startSuffix: line.startSuffix || '',
  };
  const rowFingerprint = makeRowFingerprint(headerMap, rowContext);
  const identityKey = makeIdentityKey(line, headerMap);
  return {
    detailLineKey,
    identityKey,
    groupKey: rowFingerprint,
    rowFingerprint,
    rowValues,
    rowByHeader: headerMap,
    rowContext,
  };
}

export function normalizeDispatchChangeLineRecord(input = {}) {
  const rawValues = input.rowValues
    || input.row_values?.values
    || input.row_values
    || input.values
    || [];
  const rowValues = normalizeValues(rawValues);
  const headerMap = valuesByHeader(rowValues);
  const detailLineKey = cleanText(input.detailLineKey || input.detail_line_key);
  const rowContext = input.rowContext || input.row_context || {};
  const rowFingerprint = makeRowFingerprint(headerMap, rowContext) || cleanText(input.rowFingerprint || input.row_fingerprint);
  const identityKey = cleanText(input.identityKey || input.identity_key) || makeIdentityKey({ ...rowContext, detailLineKey }, headerMap);
  const groupKey = cleanText(input.groupKey || input.group_key) || rowFingerprint;
  return {
    detailLineKey,
    identityKey,
    groupKey,
    rowFingerprint,
    rowValues,
    rowByHeader: headerMap,
    rowContext,
  };
}

function groupIndexed(records = [], keyField) {
  const map = new Map();
  records.forEach((record, index) => {
    const key = record[keyField] || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(index);
  });
  return map;
}

function takeFirstUnmatched(indexes = [], matched) {
  return indexes.find(index => !matched.has(index));
}

function compareLineOrder(a = {}, b = {}) {
  const aLine = Number(a.rowContext?.lineNo || 0);
  const bLine = Number(b.rowContext?.lineNo || 0);
  if (aLine !== bLine) return aLine - bLine;
  return String(a.detailLineKey || '').localeCompare(String(b.detailLineKey || ''));
}

function getEventKeyBase(type, beforeRecord, afterRecord) {
  const anchor = afterRecord || beforeRecord || {};
  return type === 'change'
    ? anchor.identityKey || anchor.groupKey || anchor.detailLineKey
    : anchor.groupKey || anchor.identityKey || anchor.detailLineKey;
}

function buildEvent(type, beforeRecord, afterRecord, slot, occurredAt) {
  const anchor = afterRecord || beforeRecord || {};
  const beforePayload = beforeRecord ? makeRowPayload(beforeRecord) : null;
  const afterPayload = afterRecord ? makeRowPayload(afterRecord) : null;
  const editablePayload = makeRowPayload(afterRecord || beforeRecord || {});
  const keyBase = getEventKeyBase(type, beforeRecord, afterRecord);
  return {
    eventKey: `${type}:${hashDispatchChangeText(keyBase)}:${slot}`,
    changeType: type,
    detailLineKey: anchor.detailLineKey || '',
    groupKey: anchor.groupKey || anchor.rowFingerprint || '',
    identityKey: anchor.identityKey || '',
    quantityDelta: type === 'add' ? 1 : type === 'delete' ? -1 : 0,
    beforeSnapshot: beforePayload,
    afterSnapshot: afterPayload,
    editablePayload,
    occurredAt,
  };
}

export function diffDispatchChangeLines(snapshotLines = [], currentLines = [], options = {}) {
  const occurredAt = options.occurredAt || new Date().toISOString();
  const before = snapshotLines.map(normalizeDispatchChangeLineRecord).sort(compareLineOrder);
  const after = currentLines.map(normalizeDispatchChangeLineRecord).sort(compareLineOrder);
  const matchedBefore = new Set();
  const matchedAfter = new Set();
  const events = [];
  const eventSlotCounters = new Map();
  const pushEvent = (type, beforeRecord, afterRecord) => {
    const keyBase = `${type}:${getEventKeyBase(type, beforeRecord, afterRecord)}`;
    const nextSlot = (eventSlotCounters.get(keyBase) || 0) + 1;
    eventSlotCounters.set(keyBase, nextSlot);
    events.push(buildEvent(type, beforeRecord, afterRecord, nextSlot, occurredAt));
  };

  const beforeByFingerprint = groupIndexed(before, 'rowFingerprint');
  const afterByFingerprint = groupIndexed(after, 'rowFingerprint');
  beforeByFingerprint.forEach((beforeIndexes, fingerprint) => {
    const afterIndexes = afterByFingerprint.get(fingerprint) || [];
    beforeIndexes.forEach((beforeIndex) => {
      if (matchedBefore.has(beforeIndex)) return;
      const afterIndex = takeFirstUnmatched(afterIndexes, matchedAfter);
      if (afterIndex === undefined) return;
      matchedBefore.add(beforeIndex);
      matchedAfter.add(afterIndex);
    });
  });

  const beforeRemaining = before
    .map((record, index) => ({ record, index }))
    .filter(item => !matchedBefore.has(item.index));
  const afterRemaining = after
    .map((record, index) => ({ record, index }))
    .filter(item => !matchedAfter.has(item.index));

  const beforeByIdentity = new Map();
  beforeRemaining.forEach((item) => {
    const key = item.record.identityKey || item.record.groupKey || item.record.detailLineKey || '';
    if (!beforeByIdentity.has(key)) beforeByIdentity.set(key, []);
    beforeByIdentity.get(key).push(item);
  });
  const afterByIdentity = new Map();
  afterRemaining.forEach((item) => {
    const key = item.record.identityKey || item.record.groupKey || item.record.detailLineKey || '';
    if (!afterByIdentity.has(key)) afterByIdentity.set(key, []);
    afterByIdentity.get(key).push(item);
  });

  const usedAfterRemaining = new Set();
  beforeByIdentity.forEach((beforeItems, identityKey) => {
    const afterItems = afterByIdentity.get(identityKey) || [];
    const pairCount = Math.min(beforeItems.length, afterItems.length);
    for (let idx = 0; idx < pairCount; idx += 1) {
      const beforeItem = beforeItems[idx];
      const afterItem = afterItems[idx];
      usedAfterRemaining.add(afterItem.index);
      if (beforeItem.record.rowFingerprint !== afterItem.record.rowFingerprint) {
        pushEvent('change', beforeItem.record, afterItem.record);
      }
      matchedBefore.add(beforeItem.index);
      matchedAfter.add(afterItem.index);
    }
  });

  before.forEach((record, index) => {
    if (matchedBefore.has(index)) return;
    pushEvent('delete', record, null);
  });
  after.forEach((record, index) => {
    if (matchedAfter.has(index) || usedAfterRemaining.has(index)) return;
    pushEvent('add', null, record);
  });

  return events.sort((a, b) => {
    const aLine = Number((a.afterSnapshot || a.beforeSnapshot)?.rowContext?.lineNo || 0);
    const bLine = Number((b.afterSnapshot || b.beforeSnapshot)?.rowContext?.lineNo || 0);
    if (aLine !== bLine) return aLine - bLine;
    return a.eventKey.localeCompare(b.eventKey);
  });
}

export function diffDispatchMemoOnlyChanges(snapshotLines = [], currentLines = [], options = {}) {
  const occurredAt = options.occurredAt || new Date().toISOString();
  const before = snapshotLines.map(normalizeDispatchChangeLineRecord).sort(compareLineOrder);
  const after = currentLines.map(normalizeDispatchChangeLineRecord).sort(compareLineOrder);
  const afterByIdentity = new Map();
  after.forEach((record) => {
    const key = record.identityKey || record.groupKey || record.detailLineKey || '';
    if (!afterByIdentity.has(key)) afterByIdentity.set(key, []);
    afterByIdentity.get(key).push(record);
  });

  const memoChanges = [];
  before.forEach((beforeRecord) => {
    const key = beforeRecord.identityKey || beforeRecord.groupKey || beforeRecord.detailLineKey || '';
    const candidates = afterByIdentity.get(key) || [];
    const afterRecord = candidates.shift();
    if (!afterRecord) return;
    if (beforeRecord.rowFingerprint !== afterRecord.rowFingerprint) return;
    const diffHeaders = getDispatchMemoOnlyDiffHeaders(beforeRecord.rowValues, afterRecord.rowValues);
    if (diffHeaders.length === 0) return;
    memoChanges.push({
      eventKey: `memo:${hashDispatchChangeText(`${key}:${diffHeaders.join('|')}`)}`,
      diffHeaders,
      beforeSnapshot: makeRowPayload(beforeRecord),
      afterSnapshot: makeRowPayload(afterRecord),
      occurredAt,
    });
  });
  return memoChanges;
}

export function changeEventToEditableValues(event = {}) {
  return normalizeValues(
    event.editable_payload?.rowValues
    || event.editablePayload?.rowValues
    || event.after_snapshot?.rowValues
    || event.afterSnapshot?.rowValues
    || event.before_snapshot?.rowValues
    || event.beforeSnapshot?.rowValues
    || [],
  );
}

export function formatDispatchChangeType(type = '') {
  return DISPATCH_CHANGE_TYPE_LABELS[type] || type || '';
}

export function formatDispatchChangeStatus(status = '') {
  return DISPATCH_CHANGE_STATUS_LABELS[status] || status || '';
}
