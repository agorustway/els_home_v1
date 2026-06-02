import { isGlapsRouteLocationCodeValue } from './glapsMasterData.mjs';

export const DISPATCH_DETAIL_PORT_HEADER = '포트(DIST)';
export const DISPATCH_DETAIL_TIME_HEADER = '시간';
export const DISPATCH_DETAIL_DG_HEADER = 'DG';
export const DISPATCH_DETAIL_RF_HEADER = 'RF';
export const DISPATCH_DETAIL_DG_RF_HEADER = DISPATCH_DETAIL_RF_HEADER;
export const DISPATCH_DETAIL_BILLING_START_HEADER = '상차지(청구)';

export const DISPATCH_DETAIL_HEADERS = Object.freeze([
  '작업일자',
  '구분',
  '화주',
  '상차지',
  DISPATCH_DETAIL_BILLING_START_HEADER,
  '작업지',
  '하차지(선적)',
  '운송경로',
  '운송경로코드',
  '고객사',
  DISPATCH_DETAIL_PORT_HEADER,
  '포트코드',
  '라인',
  '라인코드',
  '타입',
  '타입코드',
  DISPATCH_DETAIL_DG_HEADER,
  DISPATCH_DETAIL_RF_HEADER,
  '업체명',
  DISPATCH_DETAIL_TIME_HEADER,
  'BKG확정',
  'BKG1',
  'BKG2',
  'BKG3',
  'TARGET VESSEL',
  '비고',
  '오더구분코드',
  '화주사코드',
  '반출지(출발)코드',
  '작업지(하차지)코드',
  '반입지(도착)코드',
  '운송서비스코드',
  '운송사코드',
  '컨샤이니',
  '수정일시',
]);

export const GLAPS_START_LOCATION_OPTIONS = Object.freeze([
  '',
  '부산신항',
  '인천항국제여객터미널',
  '인천신항',
  '인천항',
  '광양항',
  '평택항',
  '부산북항',
  '울산신항',
  '울산구항',
  '의왕ICD',
  '아산',
  '군산항',
  '온산항',
]);

const DISPATCH_REGION_HEADERS = Object.freeze([
  '기타/철송',
  '기타',
  '아산',
  '부산',
  '신항',
  '광양',
  '평택',
  '중부',
  '부곡',
  '인천',
  '울산',
]);

const MANUAL_START_REGIONS = new Set(['기타/철송', '기타', '아산', '중부']);
const DISPATCH_DETAIL_DG_INDEX = DISPATCH_DETAIL_HEADERS.indexOf(DISPATCH_DETAIL_DG_HEADER);
const DISPATCH_DETAIL_RF_INDEX = DISPATCH_DETAIL_HEADERS.indexOf(DISPATCH_DETAIL_RF_HEADER);
const DISPATCH_DETAIL_TYPE_INDEX = DISPATCH_DETAIL_HEADERS.indexOf('타입');
const DISPATCH_DETAIL_TIME_INDEX = DISPATCH_DETAIL_HEADERS.indexOf(DISPATCH_DETAIL_TIME_HEADER);

function cleanText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function normalizeDispatchTimeValue(value = '') {
  const text = cleanText(value).replace(/\s+/g, '');
  const match = text.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return text;
  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return text;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function inferDispatchRfFlag(containerType = '') {
  return cleanText(containerType).toUpperCase().includes('R') ? 'Y' : 'N';
}

export function inferDispatchDgFlag(transportRemark = '') {
  const text = cleanText(transportRemark).toUpperCase();
  return /(^|[^A-Z0-9])DG([^A-Z0-9]|$)/.test(text) ? 'Y' : 'N';
}

export function normalizeDispatchDgValue(value = '') {
  const text = cleanText(value).toUpperCase();
  if (['Y', 'YES', '1', 'TRUE'].includes(text)) return 'Y';
  if (['N', 'NO', '0', 'FALSE'].includes(text)) return 'N';
  return 'N';
}

export function normalizeDispatchRfValue(value = '', containerType = '') {
  const text = cleanText(value).toUpperCase();
  if (['Y', 'YES', '1', 'TRUE'].includes(text)) return 'Y';
  if (['N', 'NO', '0', 'FALSE'].includes(text)) return 'N';
  return inferDispatchRfFlag(containerType);
}

export const inferDispatchDgRfFlag = inferDispatchRfFlag;
export const normalizeDispatchDgRfValue = normalizeDispatchRfValue;

function normalizeHeader(value) {
  return cleanText(value).replace(/\s+/g, '').toUpperCase();
}

export function normalizeDispatchDetailRowValues(values = []) {
  const rawValues = Array.isArray(values) ? values : [];
  let sourceValues = rawValues;
  const billingStartIndex = DISPATCH_DETAIL_HEADERS.indexOf(DISPATCH_DETAIL_BILLING_START_HEADER);
  const workplaceIndex = DISPATCH_DETAIL_HEADERS.indexOf('작업지');
  const looksLikeLegacyWithoutBillingStart = (
    rawValues.length === DISPATCH_DETAIL_HEADERS.length - 1
    && billingStartIndex >= 0
    && workplaceIndex >= 0
  );
  if (looksLikeLegacyWithoutBillingStart) {
    sourceValues = [
      ...rawValues.slice(0, billingStartIndex),
      rawValues[billingStartIndex - 1] || '',
      ...rawValues.slice(billingStartIndex),
    ];
  }
  if (sourceValues.length === DISPATCH_DETAIL_HEADERS.length - 1 && DISPATCH_DETAIL_DG_INDEX >= 0) {
    sourceValues = [
      ...sourceValues.slice(0, DISPATCH_DETAIL_DG_INDEX),
      '',
      ...sourceValues.slice(DISPATCH_DETAIL_DG_INDEX),
    ];
  } else if (sourceValues.length === DISPATCH_DETAIL_HEADERS.length - 2 && DISPATCH_DETAIL_DG_INDEX >= 0) {
    const withDg = [
      ...sourceValues.slice(0, DISPATCH_DETAIL_DG_INDEX),
      '',
      ...sourceValues.slice(DISPATCH_DETAIL_DG_INDEX),
    ];
    sourceValues = [
      ...withDg.slice(0, DISPATCH_DETAIL_RF_INDEX),
      '',
      ...withDg.slice(DISPATCH_DETAIL_RF_INDEX),
    ];
  } else if (
    sourceValues.length === DISPATCH_DETAIL_HEADERS.length - 3
    && DISPATCH_DETAIL_DG_INDEX >= 0
    && DISPATCH_DETAIL_TIME_INDEX >= 0
  ) {
    const withDg = [
      ...sourceValues.slice(0, DISPATCH_DETAIL_DG_INDEX),
      '',
      ...sourceValues.slice(DISPATCH_DETAIL_DG_INDEX),
    ];
    const withRf = [
      ...withDg.slice(0, DISPATCH_DETAIL_RF_INDEX),
      '',
      ...withDg.slice(DISPATCH_DETAIL_RF_INDEX),
    ];
    sourceValues = [
      ...withRf.slice(0, DISPATCH_DETAIL_TIME_INDEX),
      '',
      ...withRf.slice(DISPATCH_DETAIL_TIME_INDEX),
    ];
  }
  return DISPATCH_DETAIL_HEADERS.map((_, idx) => (
    idx === DISPATCH_DETAIL_TIME_INDEX
      ? normalizeDispatchTimeValue(sourceValues[idx])
      : (
          idx === DISPATCH_DETAIL_DG_INDEX
            ? normalizeDispatchDgValue(sourceValues[idx])
            : idx === DISPATCH_DETAIL_RF_INDEX
              ? normalizeDispatchRfValue(sourceValues[idx], sourceValues[DISPATCH_DETAIL_TYPE_INDEX])
            : cleanText(sourceValues[idx] ?? '')
        )
  ));
}

export function findDispatchDetailHeaderIndex(headers = [], candidates = []) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const targets = candidates.map(normalizeHeader).filter(Boolean);
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

export function parseDispatchAssignmentCell(value = '') {
  const text = cleanText(value)
    .replace(/[，、]/g, ',')
    .replace(/(\d)\.(?=[^\d\s])/g, '$1,');
  if (!text) return [];

  const records = [];
  const regex = /([^,\s/]+?)\s*(-?\d+(?:\.\d+)?)(?=$|[,/\s])/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const companyToken = cleanText(match[1]);
    const count = Number(match[2]);
    if (!companyToken || !Number.isFinite(count) || count <= 0) continue;
    records.push({
      companyToken,
      count,
      rawText: match[0],
    });
  }
  return records;
}

function splitCompanySuffix(companyToken, region) {
  const text = cleanText(companyToken);
  const match = text.match(/^(.*?)([BK])$/i);
  if (!match) return { company: text, suffix: '' };

  const suffix = match[2].toUpperCase();
  const normalizedRegion = cleanText(region);
  const suffixIsMeaningful = suffix === 'B'
    ? ['부산', '인천', '울산'].includes(normalizedRegion)
    : normalizedRegion === '인천';
  if (!suffixIsMeaningful) return { company: text, suffix: '' };

  return {
    company: cleanText(match[1]) || text,
    suffix,
  };
}

function commentText(value = '') {
  if (Array.isArray(value)) return cleanText(value.join(' '));
  if (value && typeof value === 'object') {
    return cleanText(value.text || value.comment || value.note || value.value || '');
  }
  return cleanText(value);
}

function getDispatchCellComment(comments = {}, rowIndex, columnIndex) {
  if (!comments || rowIndex === undefined || columnIndex === undefined) return '';
  return commentText(comments[`${rowIndex}:${columnIndex}`]);
}

function normalizeTimeLabel(value = '') {
  return cleanText(value).replace(/\s+/g, '').toUpperCase();
}

function extractDispatchTimeTokens(value = '') {
  const text = String(value ?? '').normalize('NFKC');
  return (text.match(/\b\d{1,2}(?::\d{1,2})?\b/g) || [])
    .map(normalizeDispatchTimeValue)
    .filter(Boolean);
}

function parseDispatchTimeGroups(value = '') {
  const text = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[，、；;]/g, ' ');
  const groups = new Map();
  const groupRegex = /([^\d\s:：,;][^:：]*?)\s*[:：]\s*([\d\s,，、;；:\/.-]*?)(?=\s+[^\d\s:：,;][^:：]*?\s*[:：]|$)/g;
  let match;
  while ((match = groupRegex.exec(text)) !== null) {
    const label = normalizeTimeLabel(match[1]);
    const times = extractDispatchTimeTokens(match[2]);
    if (!label || times.length === 0) continue;
    groups.set(label, times);
  }
  return groups;
}

function createDispatchTimeResolver(comment = '', assignmentCount = 0) {
  const text = commentText(comment);
  const labeledGroups = parseDispatchTimeGroups(text);
  const fallbackTimes = labeledGroups.size > 0 ? [] : extractDispatchTimeTokens(text);
  let fallbackCursor = 0;

  return ({ company = '', rawCompany = '', count = 0 } = {}) => {
    const labels = [company, rawCompany].map(normalizeTimeLabel).filter(Boolean);
    const matchedLabel = labels.find(label => labeledGroups.has(label));
    if (matchedLabel) return (labeledGroups.get(matchedLabel) || []).slice(0, count);
    if (assignmentCount === 1 && labeledGroups.size === 1) {
      return [...labeledGroups.values()][0].slice(0, count);
    }
    if (labeledGroups.size > 0) return [];
    const times = fallbackTimes.slice(fallbackCursor, fallbackCursor + count);
    fallbackCursor += count;
    return times;
  };
}

export function resolveGlapsStartLocation(region, suffix = '') {
  const normalizedRegion = cleanText(region);
  const normalizedSuffix = cleanText(suffix).toUpperCase();

  if (normalizedRegion === '부산' || normalizedRegion === '신항') {
    return normalizedSuffix === 'B' ? '부산북항' : '부산신항';
  }
  if (normalizedRegion === '인천') {
    if (normalizedSuffix === 'K') return '인천항국제여객터미널';
    if (normalizedSuffix === 'B') return '인천항';
    return '인천신항';
  }
  if (normalizedRegion === '울산') {
    return normalizedSuffix === 'B' ? '울산구항' : '울산신항';
  }
  if (normalizedRegion === '부곡') return '의왕ICD';
  if (normalizedRegion === '광양') return '광양항';
  if (normalizedRegion === '평택') return '평택항';
  return '';
}

function detailValue(row, cols, key) {
  const idx = cols[key];
  return idx >= 0 ? cleanText(row[idx]) : '';
}

function getDetailColumns(headers = []) {
  const mobisPortCodeIdx = findDispatchDetailHeaderIndex(headers, ['포트(CODE)', 'CODE']);
  return {
    date: findDispatchDetailHeaderIndex(headers, ['날짜', '작업일자']),
    direction: findDispatchDetailHeaderIndex(headers, ['구분']),
    shipper: findDispatchDetailHeaderIndex(headers, ['화주']),
    workplace: findDispatchDetailHeaderIndex(headers, ['작업지']),
    destination: findDispatchDetailHeaderIndex(headers, ['선적', '하차지(선적)', '하차지']),
    customer: findDispatchDetailHeaderIndex(headers, ['고객사(국가)', '고객사', '국가명', '국가']),
    port: findDispatchDetailHeaderIndex(headers, ['포트(CODE)', 'CODE', '포트(도착항)', '포트', '도착항']),
    transportRemark: findDispatchDetailHeaderIndex(headers, ['특이사항(Nomi,구간)', 'Nomi,구간']),
    arrivalPort: mobisPortCodeIdx >= 0 ? findDispatchDetailHeaderIndex(headers, ['도착항', '도착지', '포트(도착항)']) : -1,
    mobisPortCode: mobisPortCodeIdx,
    line: findDispatchDetailHeaderIndex(headers, ['라인(선사명)', '라인', '선사명', '선사']),
    containerType: findDispatchDetailHeaderIndex(headers, ['TYPE', 'T']),
    bkg1: findDispatchDetailHeaderIndex(headers, ['BKG1']),
    bkg2: findDispatchDetailHeaderIndex(headers, ['BKG2']),
    bkg3: findDispatchDetailHeaderIndex(headers, ['BKG3']),
    targetVessel: findDispatchDetailHeaderIndex(headers, ['TARGET VESSEL', 'TARGETVESSEL']),
    note: findDispatchDetailHeaderIndex(headers, ['비고']),
  };
}

function buildDetailCustomer(row, cols) {
  const customer = detailValue(row, cols, 'customer');
  const arrivalPort = detailValue(row, cols, 'arrivalPort');
  if (cols.mobisPortCode >= 0 && arrivalPort) {
    return cleanText([customer, arrivalPort].filter(Boolean).join(' '));
  }
  return customer;
}

function findExactDispatchDetailHeaderIndex(headers = [], target) {
  const normalizedTarget = normalizeHeader(target);
  return headers.findIndex((header) => normalizeHeader(header) === normalizedTarget);
}

function buildBaseLine(row, cols, fallbackWorkDate) {
  const transportRemark = detailValue(row, cols, 'transportRemark');
  return {
    sourceType: cleanText(row?.webCellMeta?.sourceType || ''),
    workDate: detailValue(row, cols, 'date') || fallbackWorkDate || '',
    direction: detailValue(row, cols, 'direction'),
    shipper: detailValue(row, cols, 'shipper'),
    workplace: detailValue(row, cols, 'workplace'),
    destination: detailValue(row, cols, 'destination'),
    customer: buildDetailCustomer(row, cols),
    port: detailValue(row, cols, 'port'),
    transportRemark,
    line: detailValue(row, cols, 'line'),
    containerType: detailValue(row, cols, 'containerType'),
    dgFlag: inferDispatchDgFlag(transportRemark),
    rfFlag: inferDispatchRfFlag(detailValue(row, cols, 'containerType')),
    bkg1: detailValue(row, cols, 'bkg1'),
    bkg2: detailValue(row, cols, 'bkg2'),
    bkg3: detailValue(row, cols, 'bkg3'),
    targetVessel: detailValue(row, cols, 'targetVessel'),
    note: detailValue(row, cols, 'note'),
  };
}

export function buildDispatchDetailLines({ headers = [], rows = [], workDate = '', comments = {} } = {}) {
  const cols = getDetailColumns(headers);
  const regionCols = DISPATCH_REGION_HEADERS
    .map((region) => ({
      region,
      idx: findExactDispatchDetailHeaderIndex(headers, region),
    }))
    .filter((item) => item.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  const detailLines = [];
  rows.forEach((row = [], rowIndex) => {
    const baseLine = buildBaseLine(row, cols, workDate);
    regionCols.forEach(({ region, idx }) => {
      const assignments = parseDispatchAssignmentCell(row[idx]);
      const sourceRowIndex = Number.isFinite(row.origIdx) ? row.origIdx : rowIndex;
      const resolveTime = createDispatchTimeResolver(
        getDispatchCellComment(comments, sourceRowIndex, idx),
        assignments.length,
      );
      assignments.forEach((assignment) => {
        const { company, suffix } = splitCompanySuffix(assignment.companyToken, region);
        const startLocation = resolveGlapsStartLocation(region, suffix);
        const unitCount = Math.max(0, Math.round(assignment.count));
        const dispatchTimes = resolveTime({
          company,
          rawCompany: assignment.companyToken,
          count: unitCount,
        });
        for (let unitIndex = 0; unitIndex < unitCount; unitIndex += 1) {
          detailLines.push({
            ...baseLine,
            startLocation,
            startRegion: region,
            startSuffix: suffix,
            company,
            dispatchTime: normalizeDispatchTimeValue(dispatchTimes[unitIndex] || ''),
            rawCompany: assignment.companyToken,
            sourceText: assignment.rawText,
            sourceRowIndex,
            sourceUnitIndex: unitIndex + 1,
            needsStartLocationSelection: MANUAL_START_REGIONS.has(region) || !startLocation,
          });
        }
      });
    });
  });

  return detailLines.map((line, idx) => ({
    ...line,
    lineNo: idx + 1,
  }));
}

export function detailLineToRow(line = {}) {
  const billingStartLocation = line.billingStartLocation || line.startLocation || '';
  const glapsStartLocationCode = line.glapsStartLocationCode
    || (isGlapsRouteLocationCodeValue(billingStartLocation) ? billingStartLocation : '');
  return [
    line.workDate || '',
    line.direction || '',
    line.shipper || '',
    line.startLocation || '',
    billingStartLocation,
    line.workplace || '',
    line.destination || '',
    line.glapsRouteName || '',
    line.glapsRouteCode || '',
    line.customer || '',
    line.port || '',
    line.glapsPortCode || '',
    line.line || '',
    line.glapsLineCode || '',
    line.containerType || '',
    line.glapsTypeCode || '',
    normalizeDispatchDgValue(line.dgFlag),
    normalizeDispatchRfValue(line.rfFlag ?? line.dgRfFlag, line.containerType),
    line.company || '',
    normalizeDispatchTimeValue(line.dispatchTime || ''),
    line.confirmedBkg || line.bkg1 || '',
    line.bkg1 || '',
    line.bkg2 || '',
    line.bkg3 || '',
    line.targetVessel || '',
    line.note || '',
    line.glapsOrderTypeCode || '',
    line.glapsShipperCode || '',
    glapsStartLocationCode,
    line.glapsWorkplaceCode || '',
    line.glapsDestinationCode || '',
    line.glapsTransportServiceCode || '',
    line.glapsCarrierBpCode || '',
    line.glapsConsigneeCode || '',
    line.detailUpdatedAt || line.confirmedBkgUpdatedAt || '',
  ];
}

export function summarizeDispatchDetailLines(lines = []) {
  return {
    total: lines.length,
    manualStartLocationCount: lines.filter((line) => line.needsStartLocationSelection).length,
    routeMissingCount: lines.filter((line) => line.needsRouteCodeMapping).length,
    portMissingCount: lines.filter((line) => line.needsPortCodeMapping).length,
    lineMissingCount: lines.filter((line) => line.needsLineCodeMapping).length,
    typeMissingCount: lines.filter((line) => line.needsTypeCodeMapping).length,
    carrierMissingCount: lines.filter((line) => line.needsCarrierCodeMapping).length,
    orderTypeMissingCount: lines.filter((line) => line.needsOrderTypeCodeMapping).length,
    shipperCodeMissingCount: lines.filter((line) => line.needsShipperCodeMapping).length,
    routePartMissingCount: lines.filter((line) => line.needsRoutePartCodeMapping).length,
    consigneeMissingCount: lines.filter((line) => line.needsConsigneeCodeMapping).length,
    modifiedCount: lines.filter((line) => Boolean(line.detailUpdatedAt || line.confirmedBkgUpdatedAt)).length,
  };
}
