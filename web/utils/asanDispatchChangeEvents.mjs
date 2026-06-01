import {
  DISPATCH_DETAIL_DG_HEADER,
  DISPATCH_DETAIL_HEADERS,
  DISPATCH_DETAIL_RF_HEADER,
  DISPATCH_DETAIL_TIME_HEADER,
  detailLineToRow,
  normalizeDispatchDetailRowValues,
} from './asanDispatchDetailLines.mjs';

export const DISPATCH_CHANGE_SCHEMA_VERSION = 3;

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
  '상차지',
  '작업지',
  '하차지(선적)',
  '포트(DIST)',
  '타입',
  DISPATCH_DETAIL_DG_HEADER,
  DISPATCH_DETAIL_RF_HEADER,
  '업체명',
  DISPATCH_DETAIL_TIME_HEADER,
]);
const TRANSPORT_CHANGE_CONTEXT_KEYS = Object.freeze([]);
const MEMO_ONLY_HEADERS = new Set([
  'BKG1',
  'BKG2',
  'BKG3',
  'TARGET VESSEL',
  '비고',
  '수정일시',
]);
const NON_STRUCTURAL_CHANGE_HEADERS = new Set([
  ...MEMO_ONLY_HEADERS,
  'BKG확정',
]);
const AUTO_REFRESH_MEMO_HEADERS = Object.freeze([
  'BKG1',
  'BKG2',
  'BKG3',
  'TARGET VESSEL',
  '비고',
  '수정일시',
]);
const AUTO_REFRESH_MEMO_CONTEXT_KEYS = Object.freeze([
  'bkg1',
  'bkg2',
  'bkg3',
  'targetVessel',
  'note',
  'detailUpdatedAt',
]);
const NEUTRAL_ADD_DELETE_HEADERS = Object.freeze([
  '작업일자',
  '구분',
  '화주',
  '상차지',
  '작업지',
  '하차지(선적)',
  '고객사',
  '포트(DIST)',
  '라인',
  '타입',
  '업체명',
  DISPATCH_DETAIL_TIME_HEADER,
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
const TRANSPORT_MATCH_FALLBACK_HEADERS = Object.freeze([
  '작업일자',
  '구분',
  '화주',
  '라인',
]);

function cleanText(value = '') {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function normalizeValues(values = []) {
  return normalizeDispatchDetailRowValues(values);
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

function makeTransportMatchKey(headerMap = {}, rowContext = {}) {
  const sourceRowIndex = rowContext.sourceRowIndex ?? '';
  const sourceType = rowContext.sourceType || '';
  const hasSourceAnchor = cleanText(sourceRowIndex) || cleanText(sourceType);
  if (hasSourceAnchor) {
    return makeKey([
      rowContext.workDate || headerMap['작업일자'] || '',
      rowContext.direction || headerMap['구분'] || '',
      rowContext.shipper || headerMap['화주'] || '',
      sourceType,
      sourceRowIndex,
      headerMap['라인'] || rowContext.line || '',
    ]);
  }
  return makeKey(TRANSPORT_MATCH_FALLBACK_HEADERS.map(header => headerMap[header] || ''));
}

function makeStableDispatchContentKey(record = {}) {
  const headerMap = record.rowByHeader || valuesByHeader(record.rowValues || []);
  return makeKey(NEUTRAL_ADD_DELETE_HEADERS.map(header => headerMap[header] || ''));
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
    transportMatchKey: record.transportMatchKey || '',
    rowFingerprint: record.rowFingerprint || '',
    rowValues: normalizeValues(record.rowValues || []),
    rowContext: record.rowContext || {},
  };
}

function eventRowValues(event = {}) {
  return event.editablePayload?.rowValues
    || event.editable_payload?.rowValues
    || event.afterSnapshot?.rowValues
    || event.after_snapshot?.rowValues
    || event.beforeSnapshot?.rowValues
    || event.before_snapshot?.rowValues
    || [];
}

export function makeDispatchNeutralPairKey(event = {}) {
  const headerMap = valuesByHeader(eventRowValues(event));
  return makeKey([
    ...NEUTRAL_ADD_DELETE_HEADERS.map(header => headerMap[header] || ''),
  ]);
}

export function filterNeutralizedDispatchChangeEvents(events = [], options = {}) {
  const isConfirmedEvent = typeof options.isConfirmedEvent === 'function'
    ? options.isConfirmedEvent
    : () => false;
  const grouped = new Map();
  events.forEach((event, index) => {
    if (!['add', 'delete'].includes(event.changeType)) return;
    const key = makeDispatchNeutralPairKey(event);
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ event, index });
  });

  const removeIndexes = new Set();
  grouped.forEach((items) => {
    const freeAdds = items.filter(item => item.event.changeType === 'add' && !isConfirmedEvent(item.event));
    const freeDeletes = items.filter(item => item.event.changeType === 'delete' && !isConfirmedEvent(item.event));
    const cancelCount = Math.min(freeAdds.length, freeDeletes.length);
    for (let idx = 0; idx < cancelCount; idx += 1) {
      removeIndexes.add(freeAdds[idx].index);
      removeIndexes.add(freeDeletes[idx].index);
    }
  });

  if (removeIndexes.size === 0) return events;
  return events.filter((_, index) => !removeIndexes.has(index));
}

function makeNonStructuralPairKey(event = {}) {
  const headerMap = valuesByHeader(eventRowValues(event));
  return makeKey(
    DISPATCH_DETAIL_HEADERS
      .filter(header => !NON_STRUCTURAL_CHANGE_HEADERS.has(header))
      .map(header => headerMap[header] || ''),
  );
}

export function filterMemoOnlyDispatchChangeEvents(events = [], options = {}) {
  const isConfirmedEvent = typeof options.isConfirmedEvent === 'function'
    ? options.isConfirmedEvent
    : () => false;
  const deletesByKey = new Map();
  events.forEach((event, index) => {
    if (event.changeType !== 'delete' || isConfirmedEvent(event)) return;
    const key = makeNonStructuralPairKey(event);
    if (!key) return;
    if (!deletesByKey.has(key)) deletesByKey.set(key, []);
    deletesByKey.get(key).push(index);
  });

  const removeIndexes = new Set();
  events.forEach((event, index) => {
    if (event.changeType !== 'add' || isConfirmedEvent(event)) return;
    const key = makeNonStructuralPairKey(event);
    const candidates = deletesByKey.get(key) || [];
    const deleteIndex = candidates.find(candidateIndex => !removeIndexes.has(candidateIndex));
    if (deleteIndex === undefined) return;
    removeIndexes.add(index);
    removeIndexes.add(deleteIndex);
  });

  if (removeIndexes.size === 0) return events;
  return events.filter((_, index) => !removeIndexes.has(index));
}

export function makeDispatchMemoSignature(values = []) {
  const headerMap = valuesByHeader(values);
  return makeKey(AUTO_REFRESH_MEMO_HEADERS.map(header => headerMap[header] || ''));
}

export function mergeDispatchMemoOnlyPayload(existingPayload = null, nextPayload = null) {
  if (!existingPayload || !Object.keys(existingPayload || {}).length) return nextPayload;
  if (!nextPayload || !Object.keys(nextPayload || {}).length) return existingPayload;

  const mergedValues = normalizeValues(existingPayload.rowValues || []);
  const nextValues = normalizeValues(nextPayload.rowValues || []);
  AUTO_REFRESH_MEMO_HEADERS.forEach((header) => {
    const idx = DISPATCH_DETAIL_HEADERS.indexOf(header);
    if (idx >= 0) mergedValues[idx] = nextValues[idx] || '';
  });

  const mergedContext = {
    ...(existingPayload.rowContext || {}),
  };
  const nextContext = nextPayload.rowContext || {};
  AUTO_REFRESH_MEMO_CONTEXT_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(nextContext, key)) mergedContext[key] = nextContext[key] ?? '';
  });

  return {
    ...nextPayload,
    ...existingPayload,
    rowValues: mergedValues,
    rowContext: mergedContext,
  };
}

export function makeDispatchChangeSnapshotLine(line = {}, detailLineKey = '') {
  const rowValues = normalizeValues(detailLineToRow(line));
  const headerMap = valuesByHeader(rowValues);
  const rowContext = {
    changeSchemaVersion: DISPATCH_CHANGE_SCHEMA_VERSION,
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
    dgFlag: line.dgFlag || 'N',
    rfFlag: (line.rfFlag ?? line.dgRfFlag) || '',
    company: line.company || '',
    dispatchTime: line.dispatchTime || '',
    bkg1: line.bkg1 || '',
    bkg2: line.bkg2 || '',
    bkg3: line.bkg3 || '',
    confirmedBkg: line.confirmedBkg || line.bkg1 || '',
    targetVessel: line.targetVessel || '',
    note: line.note || '',
    detailUpdatedAt: line.detailUpdatedAt || '',
    sourceType: line.sourceType || '',
    sourceRowIndex: line.sourceRowIndex ?? null,
    sourceRegion: line.sourceRegion || '',
    sourceText: line.sourceText || '',
    sourceUnitIndex: line.sourceUnitIndex || null,
    rawCompany: line.rawCompany || '',
    startSuffix: line.startSuffix || '',
  };
  const rowFingerprint = makeRowFingerprint(headerMap, rowContext);
  const transportMatchKey = makeTransportMatchKey(headerMap, rowContext);
  const identityKey = makeIdentityKey(line, headerMap);
  return {
    detailLineKey,
    identityKey,
    groupKey: transportMatchKey,
    transportMatchKey,
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
  const transportMatchKey = cleanText(input.transportMatchKey || input.transport_match_key)
    || makeTransportMatchKey(headerMap, rowContext);
  const groupKey = cleanText(input.groupKey || input.group_key) || transportMatchKey || rowFingerprint;
  return {
    detailLineKey,
    identityKey,
    groupKey,
    transportMatchKey,
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
  if (type === 'change') {
    const beforeFingerprint = beforeRecord?.rowFingerprint || '';
    const afterFingerprint = afterRecord?.rowFingerprint || '';
    return makeKey([
      anchor.transportMatchKey || anchor.groupKey || anchor.identityKey || anchor.detailLineKey,
      beforeFingerprint,
      afterFingerprint,
    ]);
  }
  return makeStableDispatchContentKey(anchor) || anchor.groupKey || anchor.identityKey || anchor.detailLineKey;
}

function buildEvent(type, beforeRecord, afterRecord, slot, occurredAt) {
  const anchor = afterRecord || beforeRecord || {};
  const beforePayload = beforeRecord ? makeRowPayload(beforeRecord) : null;
  const afterPayload = afterRecord ? makeRowPayload(afterRecord) : null;
  const editablePayload = makeRowPayload(afterRecord || beforeRecord || {});
  const keyBase = getEventKeyBase(type, beforeRecord, afterRecord);
  const timedKeyBase = makeKey([keyBase, occurredAt]);
  return {
    eventKey: `${type}:${hashDispatchChangeText(timedKeyBase)}:${slot}`,
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

  const beforeByStableContent = new Map();
  before.forEach((record, index) => {
    const key = makeStableDispatchContentKey(record);
    if (!beforeByStableContent.has(key)) beforeByStableContent.set(key, []);
    beforeByStableContent.get(key).push(index);
  });
  const afterByStableContent = new Map();
  after.forEach((record, index) => {
    const key = makeStableDispatchContentKey(record);
    if (!afterByStableContent.has(key)) afterByStableContent.set(key, []);
    afterByStableContent.get(key).push(index);
  });
  beforeByStableContent.forEach((beforeIndexes, stableKey) => {
    const afterIndexes = afterByStableContent.get(stableKey) || [];
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
    const key = item.record.transportMatchKey || item.record.groupKey || item.record.identityKey || item.record.detailLineKey || '';
    if (!beforeByIdentity.has(key)) beforeByIdentity.set(key, []);
    beforeByIdentity.get(key).push(item);
  });
  const afterByIdentity = new Map();
  afterRemaining.forEach((item) => {
    const key = item.record.transportMatchKey || item.record.groupKey || item.record.identityKey || item.record.detailLineKey || '';
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
