export const GLAPS_UPLOAD_SHEET_NAME = 'GLAPS_업로드';

export const GLAPS_UPLOAD_HEADERS = Object.freeze([
  '오더구분',
  '선사코드',
  '선사명',
  '화주사 코드',
  '화주사명',
  '반출지(출발)코드 ',
  '작업지(하차지)코드',
  '반입지(도착)코드',
  '운송경로 코드',
  '운송서비스 코드 ',
  '운송서비스명',
  '배차요청일자',
  '배차요청시간',
  '운송사 코드',
  '운송사명',
  '부킹번호',
  'B/L',
  '컨테이너 번호',
  'MRN',
  'POL',
  'POD',
  '최종목적지',
  'ETA',
  'ETD',
  'DOC ',
  'CGO ',
  '실화주사 코드',
  '실화주사명',
  '포워더 코드',
  '포워더명',
  '선사항차',
  '모선코드',
  '반출기한',
  '모선항차',
  '모선명',
  '선적지',
  '컨테이너 규격',
  '컨테이너 수량',
  '터미널',
  '양하터미널',
  '반출예약',
  '냉동 여부',
  '위험물 여부 ',
  'FREE TIME',
  '공컨반납기한',
  '반출CY',
  '반입CY',
  'ODCY업체코드',
  '선픽업',
  '컨사이니',
  '할증 1',
  '할증 2',
  '할증 3',
  '할증 4',
  '할증 5',
  '오더등록자명',
  '오더등록자연락처',
  '오더등록업체코드',
  '오더등록자이메일',
  '통지사항',
  '차량번호',
  '실출하지',
]);

const GLAPS_UPLOAD_QUANTITY_HEADER = '컨테이너 수량';
const GLAPS_CHANGE_TYPE_HEADER = '변동구분';

function cleanText(value = '') {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value = '') {
  return cleanText(value).replace(/\s+/g, '').toUpperCase();
}

function buildHeaderIndex(headers = []) {
  const index = new Map();
  headers.forEach((header, idx) => {
    const normalized = normalizeHeader(header);
    if (normalized && !index.has(normalized)) index.set(normalized, idx);
  });
  return index;
}

function getByHeader(row = [], headerIndex, candidates = []) {
  for (const candidate of candidates) {
    const idx = headerIndex.get(normalizeHeader(candidate));
    if (idx !== undefined) return cleanText(row[idx]);
  }
  return '';
}

function setUploadValue(uploadRow, header, value) {
  const idx = GLAPS_UPLOAD_HEADERS.indexOf(header);
  if (idx >= 0) uploadRow[idx] = value;
}

function detailRowToGlapsUploadRow(headerIndex, row = []) {
  const uploadRow = GLAPS_UPLOAD_HEADERS.map(() => '');
  const bookingNumber = getByHeader(row, headerIndex, ['BKG확정', 'BKG1', 'BKG2', 'BKG3']);
  const portCode = getByHeader(row, headerIndex, ['포트코드']);

  setUploadValue(uploadRow, '오더구분', getByHeader(row, headerIndex, ['오더구분코드']));
  setUploadValue(uploadRow, '선사코드', getByHeader(row, headerIndex, ['라인코드']));
  setUploadValue(uploadRow, '화주사 코드', getByHeader(row, headerIndex, ['화주사코드']));
  setUploadValue(uploadRow, '반출지(출발)코드 ', getByHeader(row, headerIndex, ['반출지(출발)코드']));
  setUploadValue(uploadRow, '작업지(하차지)코드', getByHeader(row, headerIndex, ['작업지(하차지)코드']));
  setUploadValue(uploadRow, '반입지(도착)코드', getByHeader(row, headerIndex, ['반입지(도착)코드']));
  setUploadValue(uploadRow, '운송경로 코드', getByHeader(row, headerIndex, ['운송경로코드']));
  setUploadValue(uploadRow, '운송서비스 코드 ', getByHeader(row, headerIndex, ['운송서비스코드']));
  setUploadValue(uploadRow, '배차요청시간', getByHeader(row, headerIndex, ['시간']));
  setUploadValue(uploadRow, '운송사 코드', getByHeader(row, headerIndex, ['운송사코드']));
  setUploadValue(uploadRow, '부킹번호', bookingNumber);
  setUploadValue(uploadRow, 'POD', portCode);
  setUploadValue(uploadRow, '최종목적지', portCode);
  setUploadValue(uploadRow, '컨테이너 규격', getByHeader(row, headerIndex, ['타입코드']));
  setUploadValue(uploadRow, GLAPS_UPLOAD_QUANTITY_HEADER, 1);
  setUploadValue(uploadRow, '냉동 여부', getByHeader(row, headerIndex, ['DG.RF']));
  setUploadValue(uploadRow, '컨사이니', getByHeader(row, headerIndex, ['컨샤이니']));

  return uploadRow;
}

function shouldSkipDetailRow(headerIndex, row = [], options = {}) {
  if (!options.skipDeleted) return false;
  return getByHeader(row, headerIndex, [GLAPS_CHANGE_TYPE_HEADER]) === '삭제';
}

export function buildGlapsUploadRowsFromDetailRows({ headers = [], rows = [], skipDeleted = false } = {}) {
  const headerIndex = buildHeaderIndex(headers);
  return rows
    .filter(row => !shouldSkipDetailRow(headerIndex, row, { skipDeleted }))
    .map(row => detailRowToGlapsUploadRow(headerIndex, row));
}
