export const GLAPS_FORMULA_HELPER_SHEET_NAME = 'GLAPS자동계산';
export const GLAPS_FORMULA_SOURCE_SCAN_LAST_ROW = 20000;
export const GLAPS_FORMULA_OUTPUT_ROW_COUNT = 200;

export const GLAPS_FORMULA_HELPER_HEADERS = Object.freeze([
  '순번',
  '원본행',
  '배차 요청일',
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
  '컨테이너 종류  (위험물,리퍼)',
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

export function normalizeGlapsFormulaHeader(value = '') {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

export function quoteExcelSheetName(sheetName = '') {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

export function excelColumnLetter(columnNumber) {
  let number = Number(columnNumber);
  let letter = '';
  while (number > 0) {
    const mod = (number - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    number = Math.floor((number - mod) / 26);
  }
  return letter;
}

export function buildGlapsContainerRowNumberFormula({
  sourceSheetName,
  containerColumnLetter,
  ordinalCell,
  sourceScanLastRow = GLAPS_FORMULA_SOURCE_SCAN_LAST_ROW,
} = {}) {
  const sheet = quoteExcelSheetName(sourceSheetName);
  const containerRange = `${sheet}!$${containerColumnLetter}$2:$${containerColumnLetter}$${sourceScanLastRow}`;
  return `IFERROR(AGGREGATE(15,6,ROW(${containerRange})/(${containerRange}<>""),${ordinalCell}),"")`;
}

export function buildHelperIndexFormula(sourceSheetName, sourceColumnLetter, rowNumberCell = '$B2') {
  const sheet = quoteExcelSheetName(sourceSheetName);
  const sourceValue = `INDEX(${sheet}!$${sourceColumnLetter}:$${sourceColumnLetter},${rowNumberCell})`;
  return `IF(${rowNumberCell}="","",IF(${sourceValue}="","",${sourceValue}))`;
}

export function buildHelperBlankGuardFormula(body, rowNumberCell = '$B2') {
  return `IF(${rowNumberCell}="","",${body})`;
}

export function wrapFormulaWithInputGuard(formula, rowNumber) {
  const body = String(formula || '').trim().replace(/^=/, '');
  if (!body) return '';
  if (/^IF\(\$B\d+=""/i.test(body)) return body;
  return `IF($B${rowNumber}="","",${body})`;
}

export function translateFormulaRowReferences(formula, sourceRowNumber, targetRowNumber) {
  const source = Number(sourceRowNumber);
  const target = Number(targetRowNumber);
  const body = String(formula || '');
  if (!body || !Number.isInteger(source) || !Number.isInteger(target) || source === target) return body;
  const pattern = new RegExp(`(?<![A-Za-z0-9_])(\\$?[A-Z]{1,3})${source}(?!\\d)`, 'g');
  return body.replace(pattern, `$1${target}`);
}

export function removeUnsafeFilterDatabaseDefinedNames(workbookXml = '') {
  let removed = 0;
  let xml = String(workbookXml || '').replace(
    /<definedName\b(?=[^>]*\bname=(["'])_xlnm\._FilterDatabase\1)(?![^>]*\blocalSheetId=)[^>]*>[\s\S]*?<\/definedName>/g,
    () => {
      removed += 1;
      return '';
    },
  );
  xml = xml.replace(/<definedNames>\s*<\/definedNames>/g, '');
  return { xml, removed };
}
