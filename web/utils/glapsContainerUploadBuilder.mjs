import {
  getGlapsRouteLocationPrimaryCode,
  isGlapsRouteLocationCodeValue,
} from './glapsMasterData.mjs';
import { GLAPS_UPLOAD_HEADERS } from './asanGlapsUploadExport.mjs';

export const GLAPS_CONTAINER_SOURCE_SHEET_NAME = '컨테이너배차관리__';
export const GLAPS_CONTAINER_TEMPLATE_SHEET_NAME = 'ELS';
export const GLAPS_CONTAINER_CODE_SHEET_NAME = 'GLAPS정리';
export const GLAPS_CONTAINER_CUSTOMER_CODE_SHEET_NAME = 'CKD고객사코드';
export const GLAPS_CONTAINER_ISSUE_SHEET_NAME = '확인필요';

export const GLAPS_CONTAINER_ELS_HEADERS = Object.freeze([
  '배차요청일',
  '운송사',
  '배차시간',
  '구분(오전,오후)',
  '포장장',
  '실출하지',
  '고객사',
  '선사',
  '사이즈',
  '반입지',
  '국가(도착항)',
  '비고',
  '차량넘버',
  '반출지',
  '컨테이너 종류 (위험물,리퍼)',
  '20',
  '40',
  '40HC',
  'ContainerNo.',
  'SealNumber1',
  '할증',
  '편성넘버',
  '부킹',
  '반입일 (ODCY/터미널)',
  'ODCY(세방) 반입터미널',
  'ODCY 세부명칭',
]);

export const GLAPS_CONTAINER_ISSUE_HEADERS = Object.freeze([
  '원본행',
  '필드',
  '값',
  '내용',
  '조치',
]);

const UNKNOWN_ROUTE_CODE = 'AAAAAAAAA';
const UNKNOWN_LOCATION_CODE = 'AAA';

const ORDER_TYPE_CODES = Object.freeze({
  수입: '10',
  수출: '20',
});

const TRANSPORT_SERVICE_CODES = Object.freeze({
  수출: '5010001',
  '수출(보관)': '5010002',
  수입: '5020001',
  '수입(보관)': '5020002',
  반품: '311101',
  내수: '6032001',
  석회석: '6032001',
});

const TRANSPORT_SERVICE_NAMES = Object.freeze({
  '5010001': '컨테이너_수출',
  '5010002': '컨테이너_수출(보관)',
  '5020001': '컨테이너_수입',
  '5020002': '컨테이너_수입(보관)',
  '311101': '컨테이너_반품',
  '6032001': '컨테이너_내수',
});

function cleanText(value = '') {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return cleanText(value.richText.map(part => part?.text || '').join(''));
    if ('result' in value) return cleanText(value.result);
    if ('text' in value) return cleanText(value.text);
    if ('hyperlink' in value && 'text' in value) return cleanText(value.text);
  }
  return String(value).normalize('NFKC').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value = '') {
  const text = cleanText(value);
  if (text instanceof Date) return formatDateText(text);
  return text
    .replace(/㈜|\(주\)|주식회사/gi, '')
    .replace(/[()\[\]{}.,_\-\s]/g, '')
    .toUpperCase();
}

function splitAliasValues(value = '') {
  const text = cleanText(value);
  if (!text) return [];
  return text
    .split(/[,\n/&]+/)
    .map(part => cleanText(part))
    .filter(Boolean);
}

function addMapValue(map, key, code) {
  const cleanCode = cleanText(code);
  const cleanKey = cleanText(key);
  if (!cleanKey || !cleanCode) return;
  const normalized = normalizeKey(cleanKey);
  if (!normalized || map.has(normalized)) return;
  map.set(normalized, cleanCode);
}

function addAliases(map, code, values = []) {
  values.forEach(value => {
    addMapValue(map, value, code);
    splitAliasValues(value).forEach(part => addMapValue(map, part, code));
  });
}

function buildHeaderIndex(headers = []) {
  const index = new Map();
  headers.forEach((header, idx) => {
    const normalized = normalizeKey(header);
    if (normalized && !index.has(normalized)) index.set(normalized, idx);
  });
  return index;
}

function getByHeader(row = [], headerIndex, candidates = []) {
  for (const candidate of candidates) {
    const idx = headerIndex.get(normalizeKey(candidate));
    if (idx !== undefined) {
      const value = cleanText(row[idx]);
      if (value instanceof Date || value) return value;
    }
  }
  return '';
}

function rowValue(row = [], idx) {
  return idx >= 0 && idx < row.length ? cleanText(row[idx]) : '';
}

function isMeaningfulSourceRow(row = [], headerIndex) {
  return Boolean(
    getByHeader(row, headerIndex, ['오더구분'])
    || getByHeader(row, headerIndex, ['오더번호(TMS)', '편성번호', '배차번호'])
    || getByHeader(row, headerIndex, ['픽업부킹번호', '반입부킹번호'])
    || getByHeader(row, headerIndex, ['운송경로코드'])
    || getByHeader(row, headerIndex, ['컨테이너 번호']),
  );
}

function formatDateText(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return [
      String(value.getFullYear()).padStart(4, '0'),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return [
      String(date.getUTCFullYear()).padStart(4, '0'),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  const text = cleanText(value);
  const match = text.match(/(\d{4})[-/.년\s]+(\d{1,2})[-/.월\s]+(\d{1,2})/);
  if (!match) return text;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function parseTimeParts(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return { hour: value.getHours(), minute: value.getMinutes() };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalMinutes = Math.round((value % 1) * 1440);
    return {
      hour: Math.floor(totalMinutes / 60) % 24,
      minute: totalMinutes % 60,
    };
  }

  const text = cleanText(value).replace(/\s+/g, '');
  const match = text.match(/^(\d{1,2})(?::?(\d{1,2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function formatGlapsContainerDate(value) {
  return formatDateText(value);
}

export function formatGlapsContainerTime(value, options = {}) {
  const parts = parseTimeParts(value);
  if (!parts) return cleanText(value);
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');
  return options.compact ? `${hour}${minute}` : `${hour}:${minute}`;
}

function getTimeBucket(value) {
  const parts = parseTimeParts(value);
  if (!parts) return '';
  if (parts.hour < 12) return '오전';
  if (parts.hour < 18) return '오후';
  return '잔업';
}

function normalizeYesNo(value, fallback = 'N') {
  const key = normalizeKey(value);
  if (!key) return fallback;
  if (['Y', 'YES', 'TRUE', '1', '위험물', '리퍼', '냉동'].includes(key)) return 'Y';
  if (['N', 'NO', 'FALSE', '0', '일반'].includes(key)) return 'N';
  return cleanText(value);
}

function normalizeWorkplaceName(value = '') {
  return cleanText(value)
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim();
}

function inferContainerSizeLabel(code = '') {
  const text = cleanText(code).toUpperCase();
  if (!text) return '';
  if (text.includes('20') || text.startsWith('22')) return '20';
  if (text.includes('40HC') || text.includes('40HQ') || text.startsWith('45')) return '40HC';
  if (text.includes('40') || text.startsWith('42')) return '40';
  return text;
}

function buildContainerKindLabel({ reefer = 'N', dangerous = 'N' } = {}) {
  return [
    normalizeYesNo(dangerous) === 'Y' ? '위험물' : '',
    normalizeYesNo(reefer) === 'Y' ? '리퍼' : '',
  ].filter(Boolean).join(',');
}

function resolveMapCode(map, value = '') {
  const text = cleanText(value);
  if (!text) return { code: '', status: 'empty' };
  const direct = map.get(normalizeKey(text));
  if (direct) return { code: direct, status: 'direct' };

  const parts = splitAliasValues(text);
  if (parts.length <= 1) return { code: '', status: 'missing' };
  const codes = [...new Set(parts.map(part => map.get(normalizeKey(part))).filter(Boolean))];
  if (codes.length === 1) return { code: codes[0], status: 'split' };
  if (codes.length > 1) return { code: '', status: 'ambiguous', codes };
  return { code: '', status: 'missing' };
}

function resolveLocationCode(codes, codeValue = '', nameValue = '') {
  const code = cleanText(codeValue);
  if (code) {
    if (codes.locationCodes.has(normalizeKey(code)) || isGlapsRouteLocationCodeValue(code)) {
      return { code, status: 'direct' };
    }
    const mapped = resolveMapCode(codes.locationCodeByAlias, code);
    if (mapped.code) return mapped;
    return { code, status: 'unverified' };
  }

  const name = cleanText(nameValue);
  if (!name) return { code: '', status: 'empty' };
  const mapped = resolveMapCode(codes.locationCodeByAlias, name);
  if (mapped.code) return mapped;
  const primary = getGlapsRouteLocationPrimaryCode(name);
  return primary ? { code: primary, status: 'primary' } : { code: '', status: 'missing' };
}

function inferOrderTypeCode(value = '') {
  const text = cleanText(value);
  return ORDER_TYPE_CODES[text] || '';
}

function inferTransportServiceCode(orderType = '') {
  return TRANSPORT_SERVICE_CODES[cleanText(orderType)] || '';
}

function ensureManualAliases(codes) {
  addAliases(codes.shipperCodeByAlias, 'KR10', ['현대글로비스', '현대글로비스주식회사', '글로비스', '글로비스KD외']);
  addAliases(codes.carrierBpByAlias, 'B000005273', ['ELS', 'ELS솔루션', '이엘에스솔루션', '㈜이엘에스솔루션', '1011']);
  addAliases(codes.lineCodeByAlias, 'EMA', ['EMC', 'EVERGREEN', 'EVERGREEN LINE', '에버그린']);
}

export function parseGlapsContainerTemplateCodes({ glapsRows = [], ckdRows = [] } = {}) {
  const codes = {
    lineCodeByAlias: new Map(),
    workplaceCodeByAlias: new Map(),
    consigneeCodeByAlias: new Map(),
    podCodeByAlias: new Map(),
    locationCodeByAlias: new Map(),
    terminalCodeByAlias: new Map(),
    terminalLocationCodeByAlias: new Map(),
    shipperCodeByAlias: new Map(),
    carrierBpByAlias: new Map(),
    actualUnloadingByWorkplaceCode: new Map(),
    locationCodes: new Set(),
  };

  glapsRows.forEach((row = []) => {
    const lineCode = rowValue(row, 3) || rowValue(row, 0);
    addAliases(codes.lineCodeByAlias, lineCode, [
      rowValue(row, 0),
      rowValue(row, 1),
      rowValue(row, 2),
      rowValue(row, 3),
      rowValue(row, 4),
    ]);

    const workplaceCode = rowValue(row, 7);
    addAliases(codes.workplaceCodeByAlias, workplaceCode, [rowValue(row, 6), workplaceCode]);

    const consigneeCode = rowValue(row, 12);
    addAliases(codes.consigneeCodeByAlias, consigneeCode, [rowValue(row, 11), consigneeCode]);

    const podCode = rowValue(row, 22);
    addAliases(codes.podCodeByAlias, podCode, [rowValue(row, 21), podCode]);

    const shipperCode = rowValue(row, 47);
    addAliases(codes.shipperCodeByAlias, shipperCode, [rowValue(row, 46), shipperCode]);

    const carrierBp = rowValue(row, 51);
    addAliases(codes.carrierBpByAlias, carrierBp, [
      rowValue(row, 49),
      rowValue(row, 50),
      carrierBp,
    ]);

    const locationAlias = rowValue(row, 53);
    const locationCode = rowValue(row, 54);
    addAliases(codes.locationCodeByAlias, locationCode, [
      locationAlias,
      locationCode,
      rowValue(row, 55),
    ]);
    if (locationCode) codes.locationCodes.add(normalizeKey(locationCode));

    const terminalCode = rowValue(row, 60);
    const terminalLocationCode = rowValue(row, 63);
    addAliases(codes.terminalCodeByAlias, terminalCode, [
      rowValue(row, 59),
      terminalCode,
      rowValue(row, 61),
      rowValue(row, 62),
    ]);
    addAliases(codes.terminalLocationCodeByAlias, terminalLocationCode, [
      rowValue(row, 59),
      terminalCode,
      rowValue(row, 61),
      rowValue(row, 62),
      terminalLocationCode,
    ]);
    if (terminalLocationCode) {
      codes.locationCodes.add(normalizeKey(terminalLocationCode));
      addAliases(codes.locationCodeByAlias, terminalLocationCode, [terminalLocationCode]);
    }

    const actualWorkplaceCode = rowValue(row, 71);
    const actualCode = rowValue(row, 73);
    if (actualWorkplaceCode && actualCode && !codes.actualUnloadingByWorkplaceCode.has(normalizeKey(actualWorkplaceCode))) {
      codes.actualUnloadingByWorkplaceCode.set(normalizeKey(actualWorkplaceCode), actualCode);
    }
  });

  ckdRows.forEach((row = []) => {
    addAliases(codes.consigneeCodeByAlias, rowValue(row, 0), [rowValue(row, 0), rowValue(row, 1)]);
    addAliases(codes.consigneeCodeByAlias, rowValue(row, 7), [rowValue(row, 7), rowValue(row, 8)]);
  });

  ensureManualAliases(codes);
  return codes;
}

function addIssue(issues, sourceRowNumber, field, value, message, action = 'GLAPS 코드표 확인 후 수정') {
  issues.push({
    sourceRowNumber,
    field,
    value: cleanText(value),
    message,
    action,
  });
}

function createUploadObject(values = {}) {
  const upload = {};
  GLAPS_UPLOAD_HEADERS.forEach(header => {
    upload[header] = values[header] ?? '';
  });
  return upload;
}

function getResolvedCodeOrIssue({
  codes,
  mapName,
  value,
  fallback = '',
  sourceRowNumber,
  field,
  issues,
  message,
}) {
  const resolved = resolveMapCode(codes[mapName], value);
  if (resolved.status === 'ambiguous') {
    addIssue(issues, sourceRowNumber, field, value, `${message}: 후보 ${resolved.codes.join(', ')}`);
    return fallback;
  }
  if (!resolved.code && cleanText(value)) addIssue(issues, sourceRowNumber, field, value, message);
  return resolved.code || fallback;
}

function buildGlapsContainerRow(sourceRow, headerIndex, codes, sourceRowNumber) {
  const issues = [];
  const orderType = getByHeader(sourceRow, headerIndex, ['오더구분']);
  const requestDate = formatDateText(getByHeader(sourceRow, headerIndex, ['작업지(하차지)도착요청일']));
  const requestTimeRaw = getByHeader(sourceRow, headerIndex, ['작업지(하차지)도착요청시간']);
  const requestTime = formatGlapsContainerTime(requestTimeRaw);
  const requestTimeCompact = formatGlapsContainerTime(requestTimeRaw, { compact: true });
  const lineSourceCode = getByHeader(sourceRow, headerIndex, ['선사코드']);
  const lineName = getByHeader(sourceRow, headerIndex, ['선사명']);
  const shipperName = getByHeader(sourceRow, headerIndex, ['화주사']);
  const workplaceName = getByHeader(sourceRow, headerIndex, ['작업지(하차지)명']);
  const normalizedWorkplaceName = normalizeWorkplaceName(workplaceName);
  const workplaceCodeRaw = getByHeader(sourceRow, headerIndex, ['작업지 코드']);
  const consigneeName = getByHeader(sourceRow, headerIndex, ['컨샤이니명', '컨사이니명']);
  const destinationPodRaw = getByHeader(sourceRow, headerIndex, ['최종목적지', 'Pod', 'POD']);
  const containerTypeRaw = getByHeader(sourceRow, headerIndex, ['컨규격', '컨테이너 규격']);
  const carrierCodeRaw = getByHeader(sourceRow, headerIndex, ['운송사코드']);
  const carrierName = getByHeader(sourceRow, headerIndex, ['운송사']);
  const routeCode = getByHeader(sourceRow, headerIndex, ['운송경로코드']);
  const startCodeRaw = getByHeader(sourceRow, headerIndex, ['반출지 코드']);
  const startName = getByHeader(sourceRow, headerIndex, ['반출지명(출발)', '반출지명']);
  const inboundCyRaw = getByHeader(sourceRow, headerIndex, ['반입CY']);
  const outboundCyRaw = getByHeader(sourceRow, headerIndex, ['반출CY']);
  const serviceCodeRaw = getByHeader(sourceRow, headerIndex, ['운송서비스코드']);
  const serviceNameRaw = getByHeader(sourceRow, headerIndex, ['운송서비스']);
  const bookingNumber = getByHeader(sourceRow, headerIndex, ['픽업부킹번호', '반입부킹번호', '부킹번호']);
  const containerNumber = getByHeader(sourceRow, headerIndex, ['컨테이너 번호']);
  const sealNumber = getByHeader(sourceRow, headerIndex, ['봉인번호', 'SealNumber1']);
  const formationNumber = getByHeader(sourceRow, headerIndex, ['편성번호', '편성넘버']);
  const vehicleNumber = getByHeader(sourceRow, headerIndex, ['차량번호']);
  const shippingPlace = getByHeader(sourceRow, headerIndex, ['선적지']);
  const pol = getByHeader(sourceRow, headerIndex, ['POL']);
  const eta = formatDateText(getByHeader(sourceRow, headerIndex, ['ETA']));
  const etd = formatDateText(getByHeader(sourceRow, headerIndex, ['ETD']));
  const emptyReturnDeadline = formatDateText(getByHeader(sourceRow, headerIndex, ['공컨반납기한']));
  const reeferFlag = normalizeYesNo(getByHeader(sourceRow, headerIndex, ['냉동']), 'N');
  const dangerousFlag = normalizeYesNo(getByHeader(sourceRow, headerIndex, ['위험물']), 'N');
  const notice = getByHeader(sourceRow, headerIndex, ['통지사항', '메모']);
  const registrantName = getByHeader(sourceRow, headerIndex, ['오더등록자명']);
  const registrantPhone = getByHeader(sourceRow, headerIndex, ['오더등록자 연락처', '오더등록자연락처']);
  const registrantCompany = getByHeader(sourceRow, headerIndex, ['오더등록업체']);
  const registrantEmail = getByHeader(sourceRow, headerIndex, ['오더등록자 이메일', '오더등록자이메일']);
  const odcyCode = getByHeader(sourceRow, headerIndex, ['ODCY 코드']);
  const odcyName = getByHeader(sourceRow, headerIndex, ['ODCY창고명', 'ODCY(세방) 반입터미널']);
  const inboundDate = formatDateText(getByHeader(sourceRow, headerIndex, ['반입일시', '반입일 (ODCY/터미널)']));

  const orderTypeCode = inferOrderTypeCode(orderType);
  if (!orderTypeCode && orderType) addIssue(issues, sourceRowNumber, '오더구분', orderType, '수출입 코드 미매칭');

  const lineCode = getResolvedCodeOrIssue({
    codes,
    mapName: 'lineCodeByAlias',
    value: lineSourceCode || lineName,
    fallback: lineSourceCode,
    sourceRowNumber,
    field: '선사코드',
    issues,
    message: '선사코드 코드표 미매칭',
  });

  const shipperCode = getResolvedCodeOrIssue({
    codes,
    mapName: 'shipperCodeByAlias',
    value: shipperName,
    sourceRowNumber,
    field: '화주사',
    issues,
    message: '화주사 코드 미매칭',
  });

  const workplaceCode = getResolvedCodeOrIssue({
    codes,
    mapName: 'workplaceCodeByAlias',
    value: workplaceCodeRaw || normalizedWorkplaceName,
    fallback: workplaceCodeRaw,
    sourceRowNumber,
    field: '작업지 코드',
    issues,
    message: '작업지 코드표 미매칭',
  });

  const consigneeCode = getResolvedCodeOrIssue({
    codes,
    mapName: 'consigneeCodeByAlias',
    value: consigneeName,
    sourceRowNumber,
    field: '컨샤이니명',
    issues,
    message: '컨샤이니 코드 미매칭',
  });

  const carrierBpCode = getResolvedCodeOrIssue({
    codes,
    mapName: 'carrierBpByAlias',
    value: carrierCodeRaw || carrierName,
    sourceRowNumber,
    field: '운송사',
    issues,
    message: '운송사 BP 코드 미매칭',
  }) || getResolvedCodeOrIssue({
    codes,
    mapName: 'carrierBpByAlias',
    value: carrierName,
    sourceRowNumber,
    field: '운송사',
    issues,
    message: '운송사 BP 코드 미매칭',
  });

  const startLocation = resolveLocationCode(codes, startCodeRaw, startName);
  const startLocationCode = startLocation.code;
  if (startLocation.status === 'empty') {
    addIssue(issues, sourceRowNumber, '반출지 코드', '', '반출지(출발)코드 누락');
  } else if (startLocation.status === 'missing' || startLocation.status === 'unverified' || startLocationCode === UNKNOWN_LOCATION_CODE) {
    addIssue(issues, sourceRowNumber, '반출지 코드', startCodeRaw || startName, '반출지(출발)코드 코드표 미확인');
  }

  const terminalCode = resolveMapCode(codes.terminalCodeByAlias, inboundCyRaw).code || inboundCyRaw;
  const terminalLocationCode = resolveMapCode(codes.terminalLocationCodeByAlias, inboundCyRaw).code;
  const destinationLocationCode = terminalLocationCode || (startLocation.status === 'direct' || startLocation.status === 'primary' ? startLocationCode : '');
  if (inboundCyRaw && !terminalLocationCode) {
    addIssue(issues, sourceRowNumber, '반입CY', inboundCyRaw, '반입CY의 반입지(도착)코드 미매칭');
  }
  if (!destinationLocationCode) {
    addIssue(issues, sourceRowNumber, '반입지(도착)코드', inboundCyRaw || startLocationCode, '반입지(도착)코드 미도출');
  }

  const podCode = resolveMapCode(codes.podCodeByAlias, destinationPodRaw).code || destinationPodRaw;
  if (destinationPodRaw && !podCode) addIssue(issues, sourceRowNumber, '최종목적지', destinationPodRaw, 'POD/최종목적지 코드 미매칭');

  const serviceCode = serviceCodeRaw || inferTransportServiceCode(orderType);
  if (!serviceCode) addIssue(issues, sourceRowNumber, '운송서비스코드', serviceCodeRaw, '운송서비스 코드 미도출');
  const serviceName = serviceNameRaw || TRANSPORT_SERVICE_NAMES[serviceCode] || '';

  if (!routeCode) addIssue(issues, sourceRowNumber, '운송경로코드', '', '운송경로코드 누락');
  if (routeCode === UNKNOWN_ROUTE_CODE) {
    addIssue(issues, sourceRowNumber, '운송경로코드', routeCode, '급행/미정의 운송경로코드', 'GLAPS 운송경로 확정 후 교체');
  }

  if (!requestDate) addIssue(issues, sourceRowNumber, '작업지(하차지)도착요청일', '', '배차요청일자 누락');
  if (!requestTimeCompact) addIssue(issues, sourceRowNumber, '작업지(하차지)도착요청시간', '', '배차요청시간 누락');
  if (!bookingNumber) addIssue(issues, sourceRowNumber, '픽업부킹번호', '', '부킹번호 누락');
  if (!containerTypeRaw) addIssue(issues, sourceRowNumber, '컨규격', '', '컨테이너 규격 누락');

  const actualUnloading = codes.actualUnloadingByWorkplaceCode.get(normalizeKey(workplaceCode)) || '';
  if (workplaceCode && !actualUnloading) {
    addIssue(issues, sourceRowNumber, '실출하지', workplaceCode, '작업지 코드 기준 실출하지 미매칭');
  }

  const sizeLabel = inferContainerSizeLabel(containerTypeRaw);
  const els = {
    배차요청일: requestDate,
    운송사: carrierName || carrierCodeRaw,
    배차시간: requestTime,
    '구분(오전,오후)': getTimeBucket(requestTimeRaw),
    포장장: normalizedWorkplaceName || workplaceName,
    실출하지: actualUnloading,
    고객사: consigneeName,
    선사: lineSourceCode || lineName,
    사이즈: sizeLabel,
    반입지: destinationLocationCode || startLocationCode,
    '국가(도착항)': podCode,
    비고: notice,
    차량넘버: vehicleNumber,
    반출지: startLocationCode,
    '컨테이너 종류 (위험물,리퍼)': buildContainerKindLabel({ reefer: reeferFlag, dangerous: dangerousFlag }),
    20: sizeLabel === '20' ? 1 : '',
    40: sizeLabel === '40' ? 1 : '',
    '40HC': sizeLabel === '40HC' ? 1 : '',
    'ContainerNo.': containerNumber,
    SealNumber1: sealNumber,
    할증: [1, 2, 3, 4, 5].map(idx => getByHeader(sourceRow, headerIndex, [`할증${idx}`, `할증 ${idx}`])).filter(Boolean).join(', '),
    편성넘버: formationNumber,
    부킹: bookingNumber,
    '반입일 (ODCY/터미널)': inboundDate,
    'ODCY(세방) 반입터미널': odcyName || terminalCode,
    'ODCY 세부명칭': getByHeader(sourceRow, headerIndex, ['ODCY 세부명칭', 'ODCY창고명']),
  };

  const upload = createUploadObject({
    오더구분: orderTypeCode,
    선사코드: lineCode,
    선사명: lineName,
    '화주사 코드': shipperCode,
    화주사명: shipperName,
    '반출지(출발)코드 ': startLocationCode,
    '작업지(하차지)코드': workplaceCode,
    '반입지(도착)코드': destinationLocationCode,
    '운송경로 코드': routeCode,
    '운송서비스 코드 ': serviceCode,
    운송서비스명: serviceName,
    배차요청일자: requestDate,
    배차요청시간: requestTimeCompact,
    '운송사 코드': carrierBpCode,
    운송사명: carrierName,
    부킹번호: bookingNumber,
    'B/L': getByHeader(sourceRow, headerIndex, ['B/L', 'BL']),
    '컨테이너 번호': containerNumber,
    MRN: getByHeader(sourceRow, headerIndex, ['MRN']),
    POL: pol,
    POD: '',
    최종목적지: podCode,
    ETA: eta,
    ETD: etd,
    'DOC ': getByHeader(sourceRow, headerIndex, ['DOC']),
    'CGO ': getByHeader(sourceRow, headerIndex, ['CGO', '화물설명']),
    '실화주사 코드': getByHeader(sourceRow, headerIndex, ['실화주사 코드']),
    실화주사명: getByHeader(sourceRow, headerIndex, ['실화주사명']),
    '포워더 코드': getByHeader(sourceRow, headerIndex, ['포워더 코드']),
    포워더명: getByHeader(sourceRow, headerIndex, ['포워더명']),
    선사항차: getByHeader(sourceRow, headerIndex, ['선사항차']),
    모선코드: getByHeader(sourceRow, headerIndex, ['모선코드']),
    반출기한: getByHeader(sourceRow, headerIndex, ['반출기한']),
    모선항차: getByHeader(sourceRow, headerIndex, ['모선항차']),
    모선명: getByHeader(sourceRow, headerIndex, ['모선명']),
    선적지: shippingPlace,
    '컨테이너 규격': containerTypeRaw,
    '컨테이너 수량': 1,
    터미널: getByHeader(sourceRow, headerIndex, ['터미널']),
    양하터미널: getByHeader(sourceRow, headerIndex, ['양하터미널']),
    반출예약: getByHeader(sourceRow, headerIndex, ['반출예약']),
    '냉동 여부': reeferFlag,
    '위험물 여부 ': dangerousFlag,
    'FREE TIME': getByHeader(sourceRow, headerIndex, ['위험물 Free Time', 'FREE TIME']),
    공컨반납기한: emptyReturnDeadline,
    반출CY: outboundCyRaw,
    반입CY: terminalCode,
    ODCY업체코드: odcyCode,
    선픽업: getByHeader(sourceRow, headerIndex, ['선픽업여부', '선픽업']),
    컨사이니: consigneeCode,
    '할증 1': getByHeader(sourceRow, headerIndex, ['할증1', '할증 1']),
    '할증 2': getByHeader(sourceRow, headerIndex, ['할증2', '할증 2']),
    '할증 3': getByHeader(sourceRow, headerIndex, ['할증3', '할증 3']),
    '할증 4': getByHeader(sourceRow, headerIndex, ['할증4', '할증 4']),
    '할증 5': getByHeader(sourceRow, headerIndex, ['할증5', '할증 5']),
    오더등록자명: registrantName,
    오더등록자연락처: registrantPhone,
    오더등록업체코드: registrantCompany,
    오더등록자이메일: registrantEmail,
    통지사항: notice,
    차량번호: vehicleNumber,
    실출하지: actualUnloading,
  });

  return {
    sourceRowNumber,
    els,
    upload,
    issues,
  };
}

export function buildGlapsContainerUploadData({ sourceRows = [], glapsCodeRows = [], ckdCustomerRows = [] } = {}) {
  const [headers = [], ...rows] = sourceRows;
  const headerIndex = buildHeaderIndex(headers);
  const codes = parseGlapsContainerTemplateCodes({ glapsRows: glapsCodeRows, ckdRows: ckdCustomerRows });
  const outputRows = [];
  const issues = [];

  rows.forEach((row, idx) => {
    if (!isMeaningfulSourceRow(row, headerIndex)) return;
    const output = buildGlapsContainerRow(row, headerIndex, codes, idx + 2);
    outputRows.push(output);
    issues.push(...output.issues);
  });

  const issueRowNumbers = new Set(issues.map(issue => issue.sourceRowNumber));
  return {
    rows: outputRows,
    issues,
    stats: {
      totalRows: outputRows.length,
      issueRows: issueRowNumbers.size,
      issueCount: issues.length,
      unknownRouteRows: issues.filter(issue => issue.field === '운송경로코드' && issue.value === UNKNOWN_ROUTE_CODE).length,
      unknownStartRows: issues.filter(issue => issue.field === '반출지 코드' && issue.value === UNKNOWN_LOCATION_CODE).length,
    },
  };
}

export function glapsContainerRowsToArrays(rows = []) {
  return rows.map(row => ({
    sourceRowNumber: row.sourceRowNumber,
    elsValues: GLAPS_CONTAINER_ELS_HEADERS.map(header => row.els[header] ?? ''),
    uploadValues: GLAPS_UPLOAD_HEADERS.map(header => row.upload[header] ?? ''),
  }));
}

export function glapsContainerIssuesToRows(issues = []) {
  return issues.map(issue => [
    issue.sourceRowNumber,
    issue.field,
    issue.value,
    issue.message,
    issue.action,
  ]);
}
