import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import {
  GLAPS_CONTAINER_CODE_SHEET_NAME,
  GLAPS_CONTAINER_CUSTOMER_CODE_SHEET_NAME,
  GLAPS_CONTAINER_ELS_HEADERS,
  GLAPS_CONTAINER_ISSUE_HEADERS,
  GLAPS_CONTAINER_ISSUE_SHEET_NAME,
  GLAPS_CONTAINER_TEMPLATE_SHEET_NAME,
  buildGlapsContainerUploadData,
  glapsContainerIssuesToRows,
} from '../utils/glapsContainerUploadBuilder.mjs';
import { GLAPS_UPLOAD_HEADERS } from '../utils/asanGlapsUploadExport.mjs';
import {
  applyIntranetExcelBodyCell,
  applyIntranetExcelHeaderCell,
  fitIntranetExcelColumns,
} from '../utils/intranetExcelExport.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '..');

const DEFAULT_INPUT_PATH = 'C:\\Users\\hoon\\Downloads\\컨테이너배차관리___20260603110551.xlsx';
const DEFAULT_TEMPLATE_PATH = 'C:\\Users\\hoon\\Documents\\카카오톡 받은 파일\\GLAPS 26년 6월 업로드양식.xlsx';
const DEFAULT_OUTPUT_PATH = path.join(
  REPO_ROOT,
  'work-docs',
  'glaps',
  'GLAPS_26년_6월_업로드_자동기입_20260603.xlsx',
);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[idx + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      idx += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function normalizeHeader(value = '') {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
}

function plainCellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value.richText)) return value.richText.map(part => part?.text || '').join('');
  if ('result' in value) return plainCellValue(value.result);
  if ('text' in value) return plainCellValue(value.text);
  return String(value);
}

function worksheetToRows(sheet) {
  const rows = [];
  const rowCount = sheet.rowCount;
  const columnCount = sheet.columnCount;
  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = [];
    for (let colNumber = 1; colNumber <= columnCount; colNumber += 1) {
      values.push(plainCellValue(row.getCell(colNumber).value));
    }
    rows.push(values);
  }
  return rows;
}

function cloneStyle(style = {}) {
  return JSON.parse(JSON.stringify(style || {}));
}

function buildHeaderColumnMap(sheet, headerRowNumber = 2) {
  const map = new Map();
  const headerRow = sheet.getRow(headerRowNumber);
  for (let colNumber = 1; colNumber <= sheet.columnCount; colNumber += 1) {
    const header = plainCellValue(headerRow.getCell(colNumber).value);
    const normalized = normalizeHeader(header);
    if (!normalized) continue;
    if (!map.has(normalized)) map.set(normalized, []);
    map.get(normalized).push(colNumber);
  }
  return map;
}

function getHeaderColumn(headerMap, header, options = {}) {
  const columns = headerMap.get(normalizeHeader(header)) || [];
  const minCol = Number(options.minCol || 1);
  const maxCol = Number(options.maxCol || Number.MAX_SAFE_INTEGER);
  const matches = columns.filter(col => col >= minCol && col <= maxCol);
  if (!matches.length) return undefined;
  return options.last ? matches[matches.length - 1] : matches[0];
}

function setCellValue(cell, value, options = {}) {
  cell.value = value === '' || value === undefined ? null : value;
  if (options.text && value !== '' && value !== undefined && value !== null) cell.numFmt = '@';
}

function getUploadRange(headerMap) {
  const uploadStartColumn = getHeaderColumn(headerMap, '오더구분') || 29;
  const uploadColumns = GLAPS_UPLOAD_HEADERS
    .map(header => getHeaderColumn(headerMap, header, { minCol: uploadStartColumn }))
    .filter(Boolean);
  const uploadEndColumn = Math.max(uploadStartColumn, ...uploadColumns);
  return { uploadStartColumn, uploadEndColumn };
}

function collectTargetColumns(headerMap) {
  const { uploadStartColumn, uploadEndColumn } = getUploadRange(headerMap);
  const startColumn = 2;
  const columns = [];
  for (let col = startColumn; col <= uploadEndColumn; col += 1) columns.push(col);
  return { columns, uploadStartColumn, uploadEndColumn };
}

function applyTemplateStyles(sheet, columns, startRowNumber, endRowNumber) {
  const templateRow = sheet.getRow(3);
  const styleByColumn = new Map(columns.map(col => [col, cloneStyle(templateRow.getCell(col).style)]));
  for (let rowNumber = startRowNumber; rowNumber <= endRowNumber; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (templateRow.height) row.height = templateRow.height;
    columns.forEach(col => {
      const style = styleByColumn.get(col);
      if (style) row.getCell(col).style = cloneStyle(style);
    });
  }
}

function clearTemplateData(sheet, columns, startRowNumber, endRowNumber) {
  for (let rowNumber = startRowNumber; rowNumber <= endRowNumber; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    columns.forEach(col => {
      row.getCell(col).value = null;
    });
  }
}

function writeRowsToTemplate(sheet, resultRows) {
  const headerMap = buildHeaderColumnMap(sheet, 2);
  const { columns: targetColumns, uploadStartColumn, uploadEndColumn } = collectTargetColumns(headerMap);
  const elsEndColumn = uploadStartColumn - 1;
  const initialLastRow = Math.max(sheet.rowCount, resultRows.length + 2);
  applyTemplateStyles(sheet, targetColumns, 3, Math.max(initialLastRow, resultRows.length + 2));
  clearTemplateData(sheet, targetColumns, 3, initialLastRow);

  const textHeaders = new Set([
    ...GLAPS_CONTAINER_ELS_HEADERS.filter(header => !['20', '40', '40HC'].includes(header)),
    ...GLAPS_UPLOAD_HEADERS.filter(header => header !== '컨테이너 수량'),
  ].map(normalizeHeader));

  resultRows.forEach((resultRow, idx) => {
    const excelRowNumber = idx + 3;
    const row = sheet.getRow(excelRowNumber);

    GLAPS_CONTAINER_ELS_HEADERS.forEach(header => {
      const col = getHeaderColumn(headerMap, header, { minCol: 2, maxCol: elsEndColumn });
      if (!col) return;
      setCellValue(row.getCell(col), resultRow.els[header] ?? '', { text: textHeaders.has(normalizeHeader(header)) });
    });

    GLAPS_UPLOAD_HEADERS.forEach(header => {
      const col = getHeaderColumn(headerMap, header, { minCol: uploadStartColumn, maxCol: uploadEndColumn });
      if (!col) return;
      setCellValue(row.getCell(col), resultRow.upload[header] ?? '', { text: textHeaders.has(normalizeHeader(header)) });
    });
    row.commit?.();
  });

  sheet.views = [{ state: 'frozen', ySplit: 2 }];
  sheet.autoFilter = {
    from: { row: 2, column: 2 },
    to: { row: 2, column: uploadEndColumn },
  };
}

function removeWorksheetIfExists(workbook, sheetName) {
  const sheet = workbook.getWorksheet(sheetName);
  if (sheet) workbook.removeWorksheet(sheet.id);
}

function writeIssuesSheet(workbook, { inputPath, templatePath, outputPath, stats, issues }) {
  removeWorksheetIfExists(workbook, GLAPS_CONTAINER_ISSUE_SHEET_NAME);
  const sheet = workbook.addWorksheet(GLAPS_CONTAINER_ISSUE_SHEET_NAME);
  sheet.getCell('A1').value = 'GLAPS 컨테이너 업로드 자동기입 결과';
  sheet.getCell('A1').font = { bold: true, size: 14, name: '맑은 고딕' };

  const summaryRows = [
    ['원본 파일', inputPath],
    ['템플릿 파일', templatePath],
    ['산출 파일', outputPath],
    ['작성 행수', stats.totalRows],
    ['확인필요 행수', stats.issueRows],
    ['확인필요 항목수', stats.issueCount],
    ['급행/미정의 운송경로', stats.unknownRouteRows],
    ['미정의 반출지', stats.unknownStartRows],
  ];
  summaryRows.forEach((values, idx) => {
    const row = sheet.getRow(idx + 3);
    row.values = [, ...values];
    row.eachCell(cell => applyIntranetExcelBodyCell(cell, { text: true }));
  });

  const issueStartRow = summaryRows.length + 5;
  const headerRow = sheet.getRow(issueStartRow);
  headerRow.values = [, ...GLAPS_CONTAINER_ISSUE_HEADERS];
  headerRow.eachCell(cell => applyIntranetExcelHeaderCell(cell));

  const issueRows = glapsContainerIssuesToRows(issues);
  issueRows.forEach((values, idx) => {
    const row = sheet.getRow(issueStartRow + idx + 1);
    row.values = [, ...values];
    row.eachCell(cell => applyIntranetExcelBodyCell(cell, { text: true }));
  });

  sheet.views = [{ state: 'frozen', ySplit: issueStartRow }];
  sheet.autoFilter = {
    from: { row: issueStartRow, column: 1 },
    to: { row: issueStartRow, column: GLAPS_CONTAINER_ISSUE_HEADERS.length },
  };
  fitIntranetExcelColumns(sheet, { startRowNumber: 1, minWidth: 12, maxWidth: 80 });
}

async function loadWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

async function main() {
  const args = parseArgs();
  const inputPath = path.resolve(args.input || DEFAULT_INPUT_PATH);
  const templatePath = path.resolve(args.template || DEFAULT_TEMPLATE_PATH);
  const outputPath = path.resolve(args.output || DEFAULT_OUTPUT_PATH);

  const [sourceWorkbook, templateWorkbook] = await Promise.all([
    loadWorkbook(inputPath),
    loadWorkbook(templatePath),
  ]);

  const sourceSheet = sourceWorkbook.getWorksheet(args.sourceSheet || 1);
  const templateSheet = templateWorkbook.getWorksheet(GLAPS_CONTAINER_TEMPLATE_SHEET_NAME);
  const glapsCodeSheet = templateWorkbook.getWorksheet(GLAPS_CONTAINER_CODE_SHEET_NAME);
  const ckdCustomerSheet = templateWorkbook.getWorksheet(GLAPS_CONTAINER_CUSTOMER_CODE_SHEET_NAME);

  if (!sourceSheet) throw new Error('컨테이너배차관리 원본 시트를 찾지 못했습니다.');
  if (!templateSheet) throw new Error(`${GLAPS_CONTAINER_TEMPLATE_SHEET_NAME} 시트를 찾지 못했습니다.`);
  if (!glapsCodeSheet) throw new Error(`${GLAPS_CONTAINER_CODE_SHEET_NAME} 시트를 찾지 못했습니다.`);
  if (!ckdCustomerSheet) throw new Error(`${GLAPS_CONTAINER_CUSTOMER_CODE_SHEET_NAME} 시트를 찾지 못했습니다.`);

  const result = buildGlapsContainerUploadData({
    sourceRows: worksheetToRows(sourceSheet),
    glapsCodeRows: worksheetToRows(glapsCodeSheet),
    ckdCustomerRows: worksheetToRows(ckdCustomerSheet),
  });

  writeRowsToTemplate(templateSheet, result.rows);
  writeIssuesSheet(templateWorkbook, {
    inputPath,
    templatePath,
    outputPath,
    stats: result.stats,
    issues: result.issues,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await templateWorkbook.xlsx.writeFile(outputPath);

  console.log(JSON.stringify({
    outputPath,
    rows: result.stats.totalRows,
    issueRows: result.stats.issueRows,
    issueCount: result.stats.issueCount,
    unknownRouteRows: result.stats.unknownRouteRows,
    unknownStartRows: result.stats.unknownStartRows,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
