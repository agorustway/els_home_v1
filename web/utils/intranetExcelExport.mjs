export const INTRANET_EXCEL_MAX_ROWS = 50000;

export const INTRANET_EXCEL_COLORS = Object.freeze({
  titleText: 'FF0F172A',
  metaText: 'FF64748B',
  headerFill: 'FF1F5673',
  headerBorder: 'FF16445C',
  headerSideBorder: 'FF6BA4BC',
  cellBorder: 'FFD7DEE8',
  subtleFill: 'FFF8FAFC',
  sectionFill: 'FFEAF4FF',
});

const DEFAULT_NUMERIC_HEADERS = new Set(
  ['오더(계)', '오더', '계', '수량', '배차', '상세배차수량', '컨테이너 수량'].map(normalizeExcelHeader),
);
const DEFAULT_TIME_HEADERS = new Set(
  ['시간', '배차요청시간'].map(normalizeExcelHeader),
);

export function cleanExcelText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

export function normalizeExcelHeader(value) {
  return cleanExcelText(value).normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

export function safeExcelSheetName(value, fallback = '다운로드') {
  const text = cleanExcelText(value || fallback).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim();
  return text || fallback;
}

export function uniqueExcelSheetName(workbook, value, fallback = '다운로드') {
  const base = safeExcelSheetName(value, fallback);
  if (!workbook.getWorksheet(base)) return base;
  const trimmedBase = base.slice(0, 27).trim() || fallback;
  for (let idx = 2; idx < 100; idx += 1) {
    const name = `${trimmedBase}_${idx}`.slice(0, 31);
    if (!workbook.getWorksheet(name)) return name;
  }
  return `${trimmedBase}_${Date.now()}`.slice(0, 31);
}

export function safeExcelFileName(value, fallback = '다운로드.xlsx') {
  const text = cleanExcelText(value || fallback).replace(/[\\/:*?"<>|]/g, '_');
  return text.toLowerCase().endsWith('.xlsx') ? text : `${text}.xlsx`;
}

export function measureExcelTextWidth(value) {
  const text = value === null || value === undefined ? '' : String(value);
  let len = 0;
  for (let idx = 0; idx < text.length; idx += 1) {
    len += text.charCodeAt(idx) > 127 ? 2.1 : 1.1;
  }
  return len;
}

export function createNumericHeaderSet(headers = []) {
  const set = new Set(DEFAULT_NUMERIC_HEADERS);
  headers.forEach(header => {
    const normalized = normalizeExcelHeader(header);
    if (normalized) set.add(normalized);
  });
  return set;
}

export function createTextHeaderSet(headers = []) {
  return new Set((headers || []).map(normalizeExcelHeader).filter(Boolean));
}

export function isIntranetNumericHeader(header, numericHeaders = []) {
  const set = numericHeaders instanceof Set ? numericHeaders : createNumericHeaderSet(numericHeaders);
  return set.has(normalizeExcelHeader(header));
}

export function isIntranetTextHeader(header, textHeaders = []) {
  const set = textHeaders instanceof Set ? textHeaders : createTextHeaderSet(textHeaders);
  return set.has(normalizeExcelHeader(header));
}

export function isIntranetTimeHeader(header) {
  return DEFAULT_TIME_HEADERS.has(normalizeExcelHeader(header));
}

function normalizeIntranetTimeFormat(value) {
  return cleanExcelText(value).toLowerCase() === 'compact' ? 'compact' : 'colon';
}

function parseIntranetExcelTimeParts(value) {
  const text = cleanExcelText(value).replace(/\s+/g, '');
  const match = text.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function toIntranetExcelTimeText(value, options = {}) {
  const parts = parseIntranetExcelTimeParts(value);
  if (!parts) return cleanExcelText(value);
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');
  return normalizeIntranetTimeFormat(options.timeFormat) === 'compact' ? `${hour}${minute}` : `${hour}:${minute}`;
}

export function toIntranetExcelTimeValue(value) {
  const parts = parseIntranetExcelTimeParts(value);
  if (!parts) return null;
  const { hour, minute } = parts;
  return (hour * 60 + minute) / 1440;
}

export function toIntranetExcelValue(header, value, numericHeaders = [], textHeaders = [], options = {}) {
  if (typeof value === 'number' && !Number.isFinite(value)) return '';
  const text = cleanExcelText(value);
  if (isIntranetTextHeader(header, textHeaders)) return text;
  if (isIntranetTimeHeader(header)) return toIntranetExcelTimeText(text, { timeFormat: options.timeFormat });
  if (typeof value === 'number') return value;
  if (!isIntranetNumericHeader(header, numericHeaders)) return text;
  const normalized = text.replace(/,/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return text;
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : text;
}

export function normalizeIntranetExcelRows(headers = [], rows = [], options = {}) {
  const maxRows = Number(options.maxRows || INTRANET_EXCEL_MAX_ROWS);
  const numericHeaders = options.numericHeaders instanceof Set
    ? options.numericHeaders
    : createNumericHeaderSet(options.numericHeaders || []);
  const textHeaders = options.textHeaders instanceof Set
    ? options.textHeaders
    : createTextHeaderSet(options.textHeaders || []);
  const timeFormat = normalizeIntranetTimeFormat(options.timeFormat);
  return (Array.isArray(rows) ? rows : []).slice(0, maxRows).map(row => {
    const values = Array.isArray(row) ? row : [];
    return headers.map((header, idx) => toIntranetExcelValue(header, values[idx], numericHeaders, textHeaders, { timeFormat }));
  });
}

export function normalizeIntranetExportSheet(input = {}, options = {}) {
  const headers = Array.isArray(input.headers) ? input.headers.map(cleanExcelText).filter(Boolean) : [];
  const numericHeaders = options.numericHeaders instanceof Set
    ? options.numericHeaders
    : createNumericHeaderSet([...(options.numericHeaders || []), ...(input.numericHeaders || [])]);
  const textHeaders = options.textHeaders instanceof Set
    ? options.textHeaders
    : createTextHeaderSet([...(options.textHeaders || []), ...(input.textHeaders || [])]);
  const timeFormat = normalizeIntranetTimeFormat(input.timeFormat || options.timeFormat);
  return {
    title: cleanExcelText(input.title),
    generatedAt: cleanExcelText(input.generatedAt),
    sheetName: cleanExcelText(input.sheetName || input.title || '다운로드'),
    headers,
    rows: normalizeIntranetExcelRows(headers, input.rows || [], {
      maxRows: options.maxRows,
      numericHeaders,
      textHeaders,
      timeFormat,
    }),
    numericHeaders,
    textHeaders,
    timeFormat,
  };
}

export function applyIntranetExcelHeaderCell(cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INTRANET_EXCEL_COLORS.headerFill } };
  cell.font = { bold: true, size: 10, name: '맑은 고딕', color: { argb: 'FFFFFFFF' } };
  cell.border = {
    top: { style: 'thin', color: { argb: INTRANET_EXCEL_COLORS.headerBorder } },
    bottom: { style: 'thin', color: { argb: INTRANET_EXCEL_COLORS.headerBorder } },
    left: { style: 'thin', color: { argb: INTRANET_EXCEL_COLORS.headerSideBorder } },
    right: { style: 'thin', color: { argb: INTRANET_EXCEL_COLORS.headerSideBorder } },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

export function applyIntranetExcelBodyCell(cell, options = {}) {
  const numeric = Boolean(options.numeric);
  const time = Boolean(options.time);
  const text = Boolean(options.text);
  const existingFont = cell.font || {};
  cell.border = {
    top: { style: 'thin', color: { argb: INTRANET_EXCEL_COLORS.cellBorder } },
    bottom: { style: 'thin', color: { argb: INTRANET_EXCEL_COLORS.cellBorder } },
    left: { style: 'thin', color: { argb: INTRANET_EXCEL_COLORS.cellBorder } },
    right: { style: 'thin', color: { argb: INTRANET_EXCEL_COLORS.cellBorder } },
  };
  cell.font = { ...existingFont, size: existingFont.size || 10, name: existingFont.name || '맑은 고딕' };
  cell.alignment = { vertical: 'middle', horizontal: options.horizontal || (time || text ? 'center' : numeric ? 'right' : 'left') };
  if (text) cell.numFmt = '@';
  else if (time) cell.numFmt = 'hh:mm';
  if (!text && numeric) cell.numFmt = '#,##0';
}

export function fitIntranetExcelColumns(sheet, options = {}) {
  const minWidth = Number(options.minWidth || 8);
  const maxWidth = Number(options.maxWidth || 80);
  sheet.columns.forEach(col => {
    let maxLen = minWidth;
    col.eachCell({ includeEmpty: true }, cell => {
      const value = cell.value ? String(cell.value) : '';
      const len = measureExcelTextWidth(value);
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(Math.ceil(maxLen) + 2, maxWidth);
  });
}

export function freezeAndFilterIntranetSheet(sheet, options = {}) {
  const headerRowNumber = Number(options.headerRowNumber || 1);
  const columnCount = Number(options.columnCount || 0);
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
  if (columnCount > 0) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: columnCount },
    };
  }
}

export function addIntranetExportWorksheet(workbook, exportSheet = {}, options = {}) {
  const normalized = exportSheet.numericHeaders
    ? exportSheet
    : normalizeIntranetExportSheet(exportSheet, options);
  const headers = normalized.headers || [];
  const rows = normalized.rows || [];
  const numericHeaders = normalized.numericHeaders instanceof Set
    ? normalized.numericHeaders
    : createNumericHeaderSet([...(options.numericHeaders || []), ...(normalized.numericHeaders || [])]);
  const textHeaders = normalized.textHeaders instanceof Set
    ? normalized.textHeaders
    : createTextHeaderSet([...(options.textHeaders || []), ...(normalized.textHeaders || [])]);
  const sheet = workbook.addWorksheet(uniqueExcelSheetName(workbook, normalized.sheetName || normalized.title));
  let headerRowNumber = 1;
  const mergeColumnCount = Math.max(headers.length, 1);

  if (normalized.title) {
    const titleRow = sheet.addRow([normalized.title]);
    sheet.mergeCells(1, 1, 1, mergeColumnCount);
    titleRow.height = 24;
    titleRow.getCell(1).font = { bold: true, size: 13, name: '맑은 고딕', color: { argb: INTRANET_EXCEL_COLORS.titleText } };
    titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    headerRowNumber += 1;
  }

  if (normalized.generatedAt) {
    const metaRow = sheet.addRow([normalized.generatedAt]);
    sheet.mergeCells(headerRowNumber, 1, headerRowNumber, mergeColumnCount);
    metaRow.getCell(1).font = { size: 9, name: '맑은 고딕', color: { argb: INTRANET_EXCEL_COLORS.metaText } };
    metaRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    headerRowNumber += 1;
  }

  const hRow = sheet.addRow(headers);
  hRow.eachCell({ includeEmpty: true }, applyIntranetExcelHeaderCell);

  rows.forEach(row => {
    const excelRow = sheet.addRow(row);
    for (let colIdx = 1; colIdx <= headers.length; colIdx += 1) {
      const header = headers[colIdx - 1];
      const isTimeHeader = isIntranetTimeHeader(header);
      applyIntranetExcelBodyCell(excelRow.getCell(colIdx), {
        numeric: !isTimeHeader && isIntranetNumericHeader(header, numericHeaders),
        time: false,
        text: isTimeHeader || isIntranetTextHeader(header, textHeaders),
      });
    }
  });

  freezeAndFilterIntranetSheet(sheet, { headerRowNumber, columnCount: headers.length });
  fitIntranetExcelColumns(sheet);
  return sheet;
}
