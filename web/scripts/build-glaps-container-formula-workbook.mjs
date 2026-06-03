import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  GLAPS_FORMULA_HELPER_HEADERS,
  GLAPS_FORMULA_HELPER_SHEET_NAME,
  GLAPS_FORMULA_OUTPUT_ROW_COUNT,
  GLAPS_FORMULA_SOURCE_SCAN_LAST_ROW,
  buildGlapsContainerRowNumberFormula,
  buildHelperBlankGuardFormula,
  buildHelperIndexFormula,
  excelColumnLetter,
  normalizeGlapsFormulaHeader,
  quoteExcelSheetName,
  removeUnsafeFilterDatabaseDefinedNames,
  translateFormulaRowReferences,
  wrapFormulaWithInputGuard,
} from '../utils/glapsContainerFormulaTemplate.mjs';
import {
  GLAPS_CONTAINER_SOURCE_SHEET_NAME,
  GLAPS_CONTAINER_CODE_SHEET_NAME,
  GLAPS_CONTAINER_TEMPLATE_SHEET_NAME,
} from '../utils/glapsContainerUploadBuilder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '..');

const DEFAULT_REFERENCE_TEMPLATE_PATH = path.join(REPO_ROOT, 'work-docs', 'glaps', 'GLAPS 26년 6월 업로드양식.xlsx');
const DEFAULT_OUTPUT_FILE_NAME = 'GLAPS 업로드양식_자동_최신파일참조.xlsx';
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, 'work-docs', 'glaps', DEFAULT_OUTPUT_FILE_NAME);
const EMBEDDED_SOURCE_SHEET_NAME = 'GLAPS컨테이너배차관리';
const SOURCE_WORKBOOK_FILE_PATTERN = /^컨테이너배차관리___(\d+)\.xlsx$/i;
const ELS_INPUT_START_COLUMN = 2;
const ELS_INPUT_END_COLUMN = 27;
const ELS_UPLOAD_START_COLUMN = 29;
const ELS_UPLOAD_END_COLUMN = 90;
const ELS_FIRST_DATA_ROW = 3;
const OOXML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OOXML_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const WORKSHEET_REL_TYPE = `${OOXML_REL_NS}/worksheet`;
const CALC_CHAIN_REL_TYPE = `${OOXML_REL_NS}/calcChain`;
const WORKSHEET_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
const CALC_CHAIN_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml';

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

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttr(value = '') {
  return escapeXml(value).replace(/"/g, '&quot;');
}

function parseXmlAttributes(tag = '') {
  const attrs = {};
  String(tag).replace(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g, (_, key, value) => {
    attrs[key] = value;
    return '';
  });
  return attrs;
}

function attrsToXml(attrs = {}) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}="${escapeXmlAttr(value)}"`)
    .join(' ');
}

function normalizeZipTarget(target = '') {
  const clean = String(target || '').replace(/^\/+/, '');
  return clean.startsWith('xl/') ? clean : `xl/${clean}`;
}

function columnNumberFromRef(ref = '') {
  const letters = String(ref).replace(/\d+/g, '').toUpperCase();
  let number = 0;
  for (const letter of letters) number = number * 26 + (letter.charCodeAt(0) - 64);
  return number;
}

function excelRef(rowNumber, columnNumber) {
  return `${excelColumnLetter(columnNumber)}${rowNumber}`;
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

function planCellValue(value) {
  const plain = plainCellValue(value);
  if (plain instanceof Date) return excelSerialDate(plain);
  return plain;
}

function excelSerialDate(date) {
  return (Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ) - Date.UTC(1899, 11, 30)) / 86400000;
}

function buildHeaderColumnMap(sheet, headerRowNumber = 1) {
  const map = new Map();
  const row = sheet.getRow(headerRowNumber);
  for (let colNumber = 1; colNumber <= sheet.columnCount; colNumber += 1) {
    const key = normalizeGlapsFormulaHeader(plainCellValue(row.getCell(colNumber).value));
    if (key && !map.has(key)) map.set(key, colNumber);
  }
  return map;
}

function requiredColumn(headerMap, headerName) {
  const col = headerMap.get(normalizeGlapsFormulaHeader(headerName));
  if (!col) throw new Error(`원본 시트에서 "${headerName}" 컬럼을 찾지 못했습니다.`);
  return excelColumnLetter(col);
}

function optionalColumn(headerMap, headerName) {
  const col = headerMap.get(normalizeGlapsFormulaHeader(headerName));
  return col ? excelColumnLetter(col) : '';
}

export async function findLatestContainerSourceWorkbook(directoryPath) {
  const dir = path.resolve(directoryPath);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isFile() && !entry.name.startsWith('~$'))
    .map(entry => {
      const match = entry.name.match(SOURCE_WORKBOOK_FILE_PATTERN);
      if (!match) return null;
      return {
        fileName: entry.name,
        timestamp: BigInt(match[1]),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.timestamp === right.timestamp) return left.fileName.localeCompare(right.fileName);
      return left.timestamp > right.timestamp ? -1 : 1;
    });

  if (!candidates.length) {
    throw new Error(`${dir} 폴더에서 컨테이너배차관리___*.xlsx 원본 파일을 찾지 못했습니다.`);
  }
  return path.join(dir, candidates[0].fileName);
}

export function buildExternalSourceSheetName(sourceWorkbookPath, sourceWorksheetName) {
  return `[${path.basename(sourceWorkbookPath)}]${sourceWorksheetName}`;
}

function sourceIndex(sourceSheet, sourceColumnLetter, rowCell = '$B2') {
  return buildHelperIndexFormula(sourceSheet, sourceColumnLetter, rowCell);
}

function sourceIndexBody(sourceSheet, sourceColumnLetter, rowCell = '$B2') {
  const formula = sourceIndex(sourceSheet, sourceColumnLetter, rowCell);
  const prefix = `IF(${rowCell}="","",`;
  return formula.startsWith(prefix) ? formula.slice(prefix.length, -1) : formula;
}

function buildFirstNonBlankFormula(columns, sourceSheet, rowCell = '$B2') {
  const refs = columns.filter(Boolean).map(col => sourceIndexBody(sourceSheet, col, rowCell));
  if (!refs.length) return '""';
  return refs.reduceRight((acc, ref) => `IF(${ref}<>"",${ref},${acc})`, '""');
}

function buildHelperFormulaByHeader(header, columns, sourceSheet, helperRowNumber) {
  const rowCell = `$B${helperRowNumber}`;
  const raw = (name) => sourceIndexBody(sourceSheet, columns[name], rowCell);
  const wrapped = (body) => buildHelperBlankGuardFormula(body, rowCell);
  const date = raw('작업지(하차지)도착요청일');
  const time = raw('작업지(하차지)도착요청시간');
  const workplaceCode = raw('작업지 코드');
  const workplaceName = raw('작업지(하차지)명');
  const customer = raw('컨샤이니명');
  const line = raw('선사코드');
  const finalDestination = raw('최종목적지');
  const containerType = raw('컨규격');
  const startLocationCode = raw('반출지 코드');
  const outboundCy = raw('반출CY');
  const reefer = raw('냉동');
  const dangerous = raw('위험물');
  const odcyCode = raw('ODCY 코드');
  const odcyName = raw('ODCY창고명');
  const inboundDateTime = columns['반입일시'] ? raw('반입일시') : '';

  switch (header) {
    case '순번':
      return '';
    case '원본행':
      return buildGlapsContainerRowNumberFormula({
        sourceSheetName: sourceSheet,
        containerColumnLetter: columns['컨테이너 번호'],
        ordinalCell: `A${helperRowNumber}`,
        sourceScanLastRow: GLAPS_FORMULA_SOURCE_SCAN_LAST_ROW,
      });
    case '배차 요청일':
      return wrapped(`INT(${date})`);
    case '운송사':
      return wrapped(`IF(ISNUMBER(SEARCH("이엘에스",${raw('운송사')})),"ELS솔루션",${raw('운송사')})`);
    case '배차시간':
      return sourceIndex(sourceSheet, columns['작업지(하차지)도착요청시간'], rowCell);
    case '구분(오전,오후)':
      return wrapped(`IF(HOUR(${time})<12,"오전",IF(HOUR(${time})<18,"오후","잔업"))`);
    case '포장장':
      return wrapped(`IFERROR(INDEX(GLAPS정리!$G$3:$G$264,MATCH(${workplaceCode},GLAPS정리!$H$3:$H$264,0)),TRIM(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${workplaceName},"[GA]",""),"[GB]",""),"[GC]",""),"[KC]",""),"[GS]","")))`);
    case '실출하지':
      return wrapped(`IFERROR(VLOOKUP(${workplaceCode},GLAPS정리!$BT$3:$BV$200,3,0),"")`);
    case '고객사':
      return wrapped(`LEFT(${customer},FIND("/",${customer}&"/")-1)`);
    case '선사':
      return wrapped(`IF(${line}="EMC","EMA",IFERROR(INDEX(GLAPS정리!$A$2:$A$50,MATCH(${line},GLAPS정리!$D$2:$D$50,0)),${line}))`);
    case '사이즈':
      return wrapped(`IF(LEFT(${containerType},2)="22","20 Feet",IF(LEFT(${containerType},2)="42","40 Feet","40 Feet H"))`);
    case '반입지':
      return wrapped(`IFERROR(INDEX(GLAPS정리!$BB$2:$BB$80,MATCH(${startLocationCode},GLAPS정리!$BC$2:$BC$80,0)),${startLocationCode})`);
    case '국가(도착항)':
      return wrapped(`IFERROR(INDEX(GLAPS정리!$V$3:$V$180,MATCH(${finalDestination},GLAPS정리!$W$3:$W$180,0)),${finalDestination})`);
    case '비고':
      return buildHelperBlankGuardFormula(buildFirstNonBlankFormula([columns['통지사항'], columns['메모']], sourceSheet, rowCell), rowCell);
    case '차량넘버':
      return sourceIndex(sourceSheet, columns['차량번호'], rowCell);
    case '반출지':
      return wrapped(`IF(${outboundCy}="","",IFERROR(INDEX(GLAPS정리!$BH$2:$BH$101,MATCH(${outboundCy},GLAPS정리!$BI$2:$BI$101,0)),${outboundCy}))`);
    case '컨테이너 종류  (위험물,리퍼)':
      return wrapped(`IF(AND(${dangerous}="Y",${reefer}="Y"),"위험물리퍼",IF(${dangerous}="Y","위험물",IF(${reefer}="Y","리퍼","")))`);
    case '20':
      return wrapped(`IF(LEFT(${containerType},2)="22",1,"")`);
    case '40':
      return wrapped(`IF(LEFT(${containerType},2)="42",1,"")`);
    case '40HC':
      return wrapped(`IF(LEFT(${containerType},2)="45",1,"")`);
    case 'ContainerNo.':
      return sourceIndex(sourceSheet, columns['컨테이너 번호'], rowCell);
    case 'SealNumber1':
      return sourceIndex(sourceSheet, columns['봉인번호'], rowCell);
    case '할증':
      return buildHelperBlankGuardFormula(buildFirstNonBlankFormula([
        columns['할증1'],
        columns['할증2'],
        columns['할증3'],
        columns['할증4'],
        columns['할증5'],
      ], sourceSheet, rowCell), rowCell);
    case '편성넘버':
      return sourceIndex(sourceSheet, columns['편성번호'], rowCell);
    case '부킹':
      return buildHelperBlankGuardFormula(buildFirstNonBlankFormula([columns['픽업부킹번호'], columns['반입부킹번호']], sourceSheet, rowCell), rowCell);
    case '반입일 (ODCY/터미널)':
      return inboundDateTime ? wrapped(`IF(${inboundDateTime}="","",IFERROR(INT(${inboundDateTime}),""))`) : '';
    case 'ODCY(세방) 반입터미널':
      return wrapped(`IF(AND(${odcyCode}="",${odcyName}=""),"",IF(OR(${odcyCode}="B000016649",ISNUMBER(SEARCH("B015",${odcyName})),ISNUMBER(SEARCH("세방",${odcyName})),ISNUMBER(SEARCH("SB",${odcyName}))),"세방",""))`);
    case 'ODCY 세부명칭':
      return wrapped(`IF(${odcyName}="","",IF(ISNUMBER(SEARCH("이지스두동",${odcyName})),"이지스두동",IF(ISNUMBER(SEARCH("이지스녹산",${odcyName})),"이지스녹산",IF(ISNUMBER(SEARCH("천우",${odcyName})),"천우",IF(OR(ISNUMBER(SEARCH("청암",${odcyName})),ISNUMBER(SEARCH("SB청암",${odcyName}))),"청암신항",${odcyName})))))`);
    default:
      return '';
  }
}

function collectSourceColumns(sourceSheet) {
  const headerMap = buildHeaderColumnMap(sourceSheet, 1);
  const names = [
    '작업지(하차지)도착요청일',
    '작업지(하차지)도착요청시간',
    '작업지(하차지)명',
    '컨샤이니명',
    '선사코드',
    '최종목적지',
    '컨규격',
    '반출지 코드',
    '반출CY',
    '냉동',
    '위험물',
    '컨테이너 번호',
    '봉인번호',
    '편성번호',
    '픽업부킹번호',
    '반입부킹번호',
    '작업지 코드',
    '운송사',
    '차량번호',
    'ODCY 코드',
    'ODCY창고명',
  ];

  const columns = Object.fromEntries(names.map(name => [name, requiredColumn(headerMap, name)]));
  [
    '통지사항',
    '메모',
    '할증1',
    '할증2',
    '할증3',
    '할증4',
    '할증5',
    '반입일시',
  ].forEach(name => {
    columns[name] = optionalColumn(headerMap, name);
  });
  return columns;
}

function readUploadFormulaMap(elsSheet) {
  const row = elsSheet.getRow(ELS_FIRST_DATA_ROW);
  const formulas = new Map();
  for (let col = ELS_UPLOAD_START_COLUMN; col <= ELS_UPLOAD_END_COLUMN; col += 1) {
    const value = row.getCell(col).value;
    const formula = value?.formula || (typeof value === 'string' && value.startsWith('=') ? value.slice(1) : '');
    if (formula) formulas.set(col, formula);
  }
  return formulas;
}

function buildFormulaPlan({ uploadFormulaByColumn, sourceColumns, formulaSourceSheetName }) {
  const helperMatrix = [GLAPS_FORMULA_HELPER_HEADERS];
  for (let rowOffset = 0; rowOffset < GLAPS_FORMULA_OUTPUT_ROW_COUNT; rowOffset += 1) {
    const rowNumber = rowOffset + 2;
    const row = [rowOffset + 1];
    GLAPS_FORMULA_HELPER_HEADERS.forEach((header, idx) => {
      if (idx === 0) return;
      const formula = buildHelperFormulaByHeader(header, sourceColumns, formulaSourceSheetName, rowNumber);
      row.push(formula ? `=${formula}` : null);
    });
    helperMatrix.push(row);
  }

  const helperSheet = quoteExcelSheetName(GLAPS_FORMULA_HELPER_SHEET_NAME);
  const elsMatrix = [];
  for (let rowOffset = 0; rowOffset < GLAPS_FORMULA_OUTPUT_ROW_COUNT; rowOffset += 1) {
    const rowNumber = ELS_FIRST_DATA_ROW + rowOffset;
    const helperRow = rowOffset + 2;
    const row = [];
    for (let col = ELS_INPUT_START_COLUMN; col <= ELS_UPLOAD_END_COLUMN; col += 1) {
      if (col <= ELS_INPUT_END_COLUMN) {
        const helperCol = excelColumnLetter(col + 1);
        row.push(`=IF(${helperSheet}!${helperCol}${helperRow}="","",${helperSheet}!${helperCol}${helperRow})`);
        continue;
      }
      const templateFormula = uploadFormulaByColumn.get(col);
      if (templateFormula) {
        const translatedFormula = translateFormulaRowReferences(templateFormula, ELS_FIRST_DATA_ROW, rowNumber);
        const blankGuardedFormula = guardUploadFormulaBlankDriver(translatedFormula, rowNumber);
        row.push(`=${wrapFormulaWithInputGuard(blankGuardedFormula, rowNumber)}`);
      } else {
        row.push(null);
      }
    }
    elsMatrix.push(row);
  }

  return {
    helperRange: 'A1:AB201',
    helperRows: GLAPS_FORMULA_OUTPUT_ROW_COUNT + 1,
    helperCols: GLAPS_FORMULA_HELPER_HEADERS.length,
    helperMatrix,
    elsRange: 'B3:CL202',
    elsRows: GLAPS_FORMULA_OUTPUT_ROW_COUNT,
    elsCols: ELS_UPLOAD_END_COLUMN - ELS_INPUT_START_COLUMN + 1,
    elsMatrix,
  };
}

function guardUploadFormulaBlankDriver(formula, rowNumber) {
  const body = String(formula || '').trim().replace(/^=/, '');
  const rowPattern = `\\$?([A-Z]{1,3})\\$?${rowNumber}`;
  const driverRefs = [];
  const directRefMatch = body.match(new RegExp(`^(${rowPattern})$`, 'i'));
  if (directRefMatch) driverRefs.push(directRefMatch[1]);

  const vlookupMatch = body.match(new RegExp(`^VLOOKUP\\(\\s*(${rowPattern})\\s*,`, 'i'));
  if (vlookupMatch) driverRefs.push(vlookupMatch[1]);

  const indexMatchMatch = body.match(new RegExp(`^INDEX\\([\\s\\S]*?MATCH\\(\\s*(${rowPattern})\\s*,`, 'i'));
  if (indexMatchMatch) driverRefs.push(indexMatchMatch[1]);

  const uniqueRefs = [...new Set(driverRefs)];
  if (!uniqueRefs.length) return body;
  return uniqueRefs.reduceRight((acc, ref) => `IF(${ref}="","",${acc})`, body);
}

async function writeFormulaPlan(plan) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'glaps-formula-'));
  const planPath = path.join(tempDir, 'formula-plan.json');
  await fs.writeFile(planPath, JSON.stringify(plan), 'utf8');
  return { tempDir, planPath };
}

function runExcelComBuilder({ referenceTemplatePath, sourceWorkbookPath, outputPath, planPath }) {
  const psScriptPath = path.join(WEB_ROOT, 'scripts', 'build-glaps-container-formula-workbook.ps1');
  const result = spawnSync('pwsh', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    psScriptPath,
    '-ReferencePath',
    referenceTemplatePath,
    '-SourceDataPath',
    sourceWorkbookPath,
    '-OutputPath',
    outputPath,
    '-PlanPath',
    planPath,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(`Excel COM 생성 실패\n${detail}`);
  }
  return result.stdout.trim();
}

function normalizePathForXmlSearch(value = '') {
  return String(value || '').replace(/\\/g, '[\\\\/]');
}

export function removeAbsoluteExternalLinkXmlArtifacts({
  workbookXml = '',
  externalLinkXml = '',
  externalLinkRelsXml = '',
  sourceWorkbookPath = '',
} = {}) {
  const sourceFileName = path.basename(sourceWorkbookPath);
  const sourcePathPattern = normalizePathForXmlSearch(sourceWorkbookPath);
  const sourceFilePattern = escapeRegex(sourceFileName);
  let removedAbsoluteLinks = 0;

  let nextWorkbookXml = String(workbookXml || '')
    .replace(
      /<mc:AlternateContent\b[\s\S]*?<x15ac:absPath\b[\s\S]*?<\/mc:AlternateContent>/g,
      '',
    )
    .replace(/\s+xmlns:x15ac="http:\/\/schemas\.microsoft\.com\/office\/spreadsheetml\/2010\/11\/ac"/g, '');

  const nextExternalLinkXml = String(externalLinkXml || '')
    .replace(/<xxl21:alternateUrls>[\s\S]*?<\/xxl21:alternateUrls>/g, '');

  let nextExternalLinkRelsXml = String(externalLinkRelsXml || '').replace(
    /<Relationship\b(?=[^>]*\bType="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/externalLinkPath")(?=[^>]*\bTarget="file:\/\/\/[^"]*")[^>]*\/>/g,
    (match) => {
      if (!sourceFileName || new RegExp(sourcePathPattern, 'i').test(match) || new RegExp(sourceFilePattern, 'i').test(match)) {
        removedAbsoluteLinks += 1;
        return '';
      }
      return match;
    },
  );

  const hasRelativeSourceLink = new RegExp(
    `<Relationship\\b(?=[^>]*\\bType="http://schemas\\.openxmlformats\\.org/officeDocument/2006/relationships/externalLinkPath")(?=[^>]*\\bTarget="${sourceFilePattern}")`,
    'i',
  ).test(nextExternalLinkRelsXml);

  if (!hasRelativeSourceLink && sourceFileName) {
    nextExternalLinkRelsXml = nextExternalLinkRelsXml.replace(
      /(<Relationship\b(?=[^>]*\bType="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/externalLinkPath")[^>]*\bTarget=")([^"]*)("[^>]*\/>)/,
      `$1${escapeXmlAttr(sourceFileName)}$3`,
    );
  }

  return {
    workbookXml: nextWorkbookXml,
    externalLinkXml: nextExternalLinkXml,
    externalLinkRelsXml: nextExternalLinkRelsXml,
    removedAbsoluteLinks,
  };
}

async function makeExternalLinksPortable({ outputPath, sourceWorkbookPath }) {
  const buffer = await fs.readFile(outputPath);
  const zip = await JSZip.loadAsync(buffer);
  const workbookFile = zip.file('xl/workbook.xml');
  if (!workbookFile) return { removedAbsoluteLinks: 0, patchedExternalLinks: 0 };

  let workbookXml = await workbookFile.async('string');
  let totalRemoved = 0;
  let patchedExternalLinks = 0;

  const externalLinkFiles = Object.keys(zip.files)
    .filter(name => /^xl\/externalLinks\/externalLink\d+\.xml$/i.test(name))
    .sort();

  for (const externalLinkPath of externalLinkFiles) {
    const relsPath = externalLinkPath.replace('xl/externalLinks/', 'xl/externalLinks/_rels/') + '.rels';
    const externalLinkFile = zip.file(externalLinkPath);
    const relsFile = zip.file(relsPath);
    if (!externalLinkFile || !relsFile) continue;

    const externalLinkXml = await externalLinkFile.async('string');
    const externalLinkRelsXml = await relsFile.async('string');
    const patched = removeAbsoluteExternalLinkXmlArtifacts({
      workbookXml,
      externalLinkXml,
      externalLinkRelsXml,
      sourceWorkbookPath,
    });

    workbookXml = patched.workbookXml;
    zip.file(externalLinkPath, patched.externalLinkXml);
    zip.file(relsPath, patched.externalLinkRelsXml);
    totalRemoved += patched.removedAbsoluteLinks;
    patchedExternalLinks += 1;
  }

  zip.file('xl/workbook.xml', workbookXml);
  const nextBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  await fs.writeFile(outputPath, nextBuffer);
  return { removedAbsoluteLinks: totalRemoved, patchedExternalLinks };
}

function parseWorkbookSheets(workbookXml, relsXml) {
  const rels = new Map();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const attrs = parseXmlAttributes(match[0]);
    rels.set(attrs.Id, attrs.Target);
  }

  const sheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const attrs = parseXmlAttributes(match[0]);
    sheets.push({
      name: attrs.name,
      sheetId: Number(attrs.sheetId),
      relId: attrs['r:id'],
      target: rels.get(attrs['r:id']),
    });
  }
  return sheets;
}

function worksheetZipPathFor(sheets, sheetName) {
  const sheet = sheets.find(item => item.name === sheetName);
  if (!sheet) throw new Error(`${sheetName} 시트를 기준 양식에서 찾지 못했습니다.`);
  return normalizeZipTarget(sheet.target);
}

function nextWorksheetIndex(zip) {
  let max = 0;
  for (const name of Object.keys(zip.files)) {
    const match = name.match(/^xl\/worksheets\/sheet(\d+)\.xml$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function nextRelationshipId(relsXml) {
  let max = 0;
  for (const match of relsXml.matchAll(/\bId="rId(\d+)"/g)) max = Math.max(max, Number(match[1]));
  return `rId${max + 1}`;
}

function removeWorkbookSheetByName({ zip, workbookXml, relsXml, contentTypesXml, sheetName }) {
  const sheets = parseWorkbookSheets(workbookXml, relsXml);
  const target = sheets.find(sheet => sheet.name === sheetName);
  if (!target) return { workbookXml, relsXml, contentTypesXml };

  const targetPath = normalizeZipTarget(target.target);
  zip.remove(targetPath);
  workbookXml = workbookXml.replace(new RegExp(`<sheet\\b(?=[^>]*\\bname="${escapeRegex(sheetName)}")[^>]*/>`, 'g'), '');
  relsXml = relsXml.replace(new RegExp(`<Relationship\\b(?=[^>]*\\bId="${escapeRegex(target.relId)}")[^>]*/>`, 'g'), '');
  contentTypesXml = contentTypesXml.replace(new RegExp(`<Override\\b(?=[^>]*\\bPartName="/${escapeRegex(targetPath)}")[^>]*/>`, 'g'), '');
  return { workbookXml, relsXml, contentTypesXml };
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function insertWorksheetSheet({ workbookXml, relsXml, contentTypesXml, sheetName, sheetId, relId, worksheetPath, afterSheetName = '' }) {
  const sheetTag = `<sheet name="${escapeXmlAttr(sheetName)}" sheetId="${sheetId}" r:id="${relId}"/>`;
  if (afterSheetName && new RegExp(`<sheet\\b(?=[^>]*\\bname="${escapeRegex(afterSheetName)}")[^>]*/>`).test(workbookXml)) {
    workbookXml = workbookXml.replace(
      new RegExp(`(<sheet\\b(?=[^>]*\\bname="${escapeRegex(afterSheetName)}")[^>]*/>)`),
      `$1${sheetTag}`,
    );
  } else {
    workbookXml = workbookXml.replace('</sheets>', `${sheetTag}</sheets>`);
  }

  relsXml = relsXml.replace(
    '</Relationships>',
    `<Relationship Id="${relId}" Type="${WORKSHEET_REL_TYPE}" Target="${worksheetPath.replace(/^xl\//, '')}"/></Relationships>`,
  );
  contentTypesXml = contentTypesXml.replace(
    '</Types>',
    `<Override PartName="/${worksheetPath}" ContentType="${WORKSHEET_CONTENT_TYPE}"/></Types>`,
  );
  return { workbookXml, relsXml, contentTypesXml };
}

function stripCalcChain({ zip, workbookXml, relsXml, contentTypesXml }) {
  zip.remove('xl/calcChain.xml');
  relsXml = relsXml.replace(new RegExp(`<Relationship\\b(?=[^>]*\\bType="${escapeRegex(CALC_CHAIN_REL_TYPE)}")[^>]*/>`, 'g'), '');
  contentTypesXml = contentTypesXml.replace(new RegExp(`<Override\\b(?=[^>]*\\bContentType="${escapeRegex(CALC_CHAIN_CONTENT_TYPE)}")[^>]*/>`, 'g'), '');
  workbookXml = workbookXml.replace(/<calcPr\b[^>]*(?:\/>|>[\s\S]*?<\/calcPr>)/, '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');
  if (!/<calcPr\b/.test(workbookXml)) {
    workbookXml = workbookXml.replace('</workbook>', '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');
  }
  return { workbookXml, relsXml, contentTypesXml };
}

function parseRows(sheetXml) {
  const sheetDataMatch = sheetXml.match(/<sheetData>([\s\S]*?)<\/sheetData>/);
  if (!sheetDataMatch) throw new Error('worksheet XML에 sheetData가 없습니다.');

  const rows = new Map();
  for (const rowMatch of sheetDataMatch[1].matchAll(/<row\b[^>]*(?:\/>|>[\s\S]*?<\/row>)/g)) {
    const rowXml = rowMatch[0];
    const rowAttrs = parseXmlAttributes(rowXml.match(/^<row\b[^>]*>/)?.[0] || rowXml);
    const rowNumber = Number(rowAttrs.r);
    if (!rowNumber) continue;
    const cells = new Map();
    for (const cellMatch of rowXml.matchAll(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g)) {
      const cellXml = cellMatch[0];
      const attrs = parseXmlAttributes(cellXml.match(/^<c\b[^>]*>/)?.[0] || cellXml);
      const col = columnNumberFromRef(attrs.r);
      if (col) cells.set(col, { attrs, xml: cellXml });
    }
    rows.set(rowNumber, { attrs: rowAttrs, cells });
  }
  return rows;
}

function templateCellAttrs(rows, columnNumber) {
  const row = rows.get(ELS_FIRST_DATA_ROW);
  const cell = row?.cells.get(columnNumber);
  return cell ? { ...cell.attrs } : {};
}

function formulaCellXml(ref, formula, sourceAttrs = {}) {
  const attrs = { ...sourceAttrs, r: ref };
  delete attrs.t;
  return `<c ${attrsToXml(attrs)}><f>${escapeXml(formula)}</f></c>`;
}

function emptyCellXml(ref, sourceAttrs = {}) {
  const attrs = { ...sourceAttrs, r: ref };
  delete attrs.t;
  return `<c ${attrsToXml(attrs)}/>`;
}

function formulaTextCellXml(ref, formula) {
  return `<c r="${ref}"><f>${escapeXml(formula)}</f></c>`;
}

function valueCellXml(ref, value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return `<c r="${ref}"><v>${excelSerialDate(value)}</v></c>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function rebuildSheetData(sheetXml, rows) {
  const rowXmls = [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, row]) => {
      const attrs = attrsToXml(row.attrs);
      const cells = [...row.cells.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, cell]) => cell.xml)
        .join('');
      return cells ? `<row ${attrs}>${cells}</row>` : `<row ${attrs}/>`;
    })
    .join('');
  return sheetXml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${rowXmls}</sheetData>`);
}

function updateElsWorksheetXml(sheetXml, uploadFormulaByColumn) {
  const rows = parseRows(sheetXml);
  const templateAttrsByColumn = new Map();
  for (let col = ELS_INPUT_START_COLUMN; col <= ELS_UPLOAD_END_COLUMN; col += 1) {
    templateAttrsByColumn.set(col, templateCellAttrs(rows, col));
  }

  const helperSheet = quoteExcelSheetName(GLAPS_FORMULA_HELPER_SHEET_NAME);
  for (let rowOffset = 0; rowOffset < GLAPS_FORMULA_OUTPUT_ROW_COUNT; rowOffset += 1) {
    const rowNumber = ELS_FIRST_DATA_ROW + rowOffset;
    const row = rows.get(rowNumber) || { attrs: { r: String(rowNumber) }, cells: new Map() };
    row.attrs.r = String(rowNumber);
    rows.set(rowNumber, row);
    const helperRow = rowOffset + 2;

    for (let col = ELS_INPUT_START_COLUMN; col <= ELS_INPUT_END_COLUMN; col += 1) {
      const ref = excelRef(rowNumber, col);
      const existingAttrs = row.cells.get(col)?.attrs || templateAttrsByColumn.get(col) || {};
      const helperCol = excelColumnLetter(col + 1);
      row.cells.set(col, {
        attrs: { ...existingAttrs, r: ref },
        xml: formulaCellXml(ref, `IF(${helperSheet}!${helperCol}${helperRow}="","",${helperSheet}!${helperCol}${helperRow})`, existingAttrs),
      });
    }

    for (let col = ELS_UPLOAD_START_COLUMN; col <= ELS_UPLOAD_END_COLUMN; col += 1) {
      const ref = excelRef(rowNumber, col);
      const existingAttrs = row.cells.get(col)?.attrs || templateAttrsByColumn.get(col) || {};
      const templateFormula = uploadFormulaByColumn.get(col);
      if (templateFormula) {
        const translatedFormula = translateFormulaRowReferences(templateFormula, ELS_FIRST_DATA_ROW, rowNumber);
        row.cells.set(col, {
          attrs: { ...existingAttrs, r: ref },
          xml: formulaCellXml(ref, wrapFormulaWithInputGuard(translatedFormula, rowNumber), existingAttrs),
        });
      } else if (row.cells.has(col)) {
        row.cells.set(col, {
          attrs: { ...existingAttrs, r: ref },
          xml: emptyCellXml(ref, existingAttrs),
        });
      }
    }
  }

  for (const [rowNumber, row] of rows.entries()) {
    if (rowNumber < ELS_FIRST_DATA_ROW + GLAPS_FORMULA_OUTPUT_ROW_COUNT) continue;
    for (let col = ELS_INPUT_START_COLUMN; col <= ELS_UPLOAD_END_COLUMN; col += 1) {
      if (!row.cells.has(col)) continue;
      const ref = excelRef(rowNumber, col);
      const attrs = row.cells.get(col).attrs || templateAttrsByColumn.get(col) || {};
      row.cells.set(col, { attrs: { ...attrs, r: ref }, xml: emptyCellXml(ref, attrs) });
    }
  }

  return rebuildSheetData(sheetXml, rows);
}

function buildSourceWorksheetXml(sourceSheet) {
  const maxRow = sourceSheet.rowCount;
  const maxCol = sourceSheet.columnCount;
  const rows = [];
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const cells = [];
    const row = sourceSheet.getRow(rowNumber);
    for (let col = 1; col <= maxCol; col += 1) {
      const xml = valueCellXml(excelRef(rowNumber, col), plainCellValue(row.getCell(col).value));
      if (xml) cells.push(xml);
    }
    rows.push(cells.length ? `<row r="${rowNumber}">${cells.join('')}</row>` : `<row r="${rowNumber}"/>`);
  }
  const lastRef = excelRef(Math.max(maxRow, 1), Math.max(maxCol, 1));
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<worksheet xmlns="${OOXML_NS}" xmlns:r="${OOXML_REL_NS}">`,
    `<dimension ref="A1:${lastRef}"/>`,
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>',
    '<sheetFormatPr defaultRowHeight="15"/>',
    `<sheetData>${rows.join('')}</sheetData>`,
    `<autoFilter ref="A1:${excelColumnLetter(maxCol)}1"/>`,
    '</worksheet>',
  ].join('');
}

function buildHelperWorksheetXml(columns) {
  const rows = [];
  const headerCells = GLAPS_FORMULA_HELPER_HEADERS.map((header, idx) => valueCellXml(excelRef(1, idx + 1), header)).join('');
  rows.push(`<row r="1">${headerCells}</row>`);

  for (let rowOffset = 0; rowOffset < GLAPS_FORMULA_OUTPUT_ROW_COUNT; rowOffset += 1) {
    const rowNumber = rowOffset + 2;
    const cells = [valueCellXml(`A${rowNumber}`, rowOffset + 1)];
    GLAPS_FORMULA_HELPER_HEADERS.forEach((header, idx) => {
      if (idx === 0) return;
      const formula = buildHelperFormulaByHeader(header, columns, EMBEDDED_SOURCE_SHEET_NAME, rowNumber);
      if (formula) cells.push(formulaTextCellXml(excelRef(rowNumber, idx + 1), formula));
    });
    rows.push(`<row r="${rowNumber}">${cells.join('')}</row>`);
  }

  const lastCol = excelColumnLetter(GLAPS_FORMULA_HELPER_HEADERS.length);
  const lastRow = GLAPS_FORMULA_OUTPUT_ROW_COUNT + 1;
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<worksheet xmlns="${OOXML_NS}" xmlns:r="${OOXML_REL_NS}">`,
    `<dimension ref="A1:${lastCol}${lastRow}"/>`,
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>',
    '<sheetFormatPr defaultRowHeight="15"/>',
    `<sheetData>${rows.join('')}</sheetData>`,
    `<autoFilter ref="A1:${lastCol}1"/>`,
    '</worksheet>',
  ].join('');
}

async function loadWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

async function main() {
  const args = parseArgs();
  const referenceTemplatePath = path.resolve(args.template || args.reference || DEFAULT_REFERENCE_TEMPLATE_PATH);
  const sourceDirArg = args.sourceDir || args['source-dir'];
  const sourceDirPath = sourceDirArg ? path.resolve(sourceDirArg) : '';
  const outputPath = path.resolve(
    args.output || (
      sourceDirPath
        ? path.join(sourceDirPath, DEFAULT_OUTPUT_FILE_NAME)
        : DEFAULT_OUTPUT_PATH
    ),
  );
  const sourceSelectDirectory = path.resolve(sourceDirPath || path.dirname(outputPath));
  const sourceWorkbookPath = args.source
    ? path.resolve(args.source)
    : await findLatestContainerSourceWorkbook(sourceSelectDirectory);
  const sourceSelectMode = args.source ? 'explicit' : 'latest-in-output-folder';

  const [referenceWorkbook, sourceWorkbook] = await Promise.all([
    loadWorkbook(referenceTemplatePath),
    loadWorkbook(sourceWorkbookPath),
  ]);
  const elsTemplateSheet = referenceWorkbook.getWorksheet(GLAPS_CONTAINER_TEMPLATE_SHEET_NAME);
  const sourceSheet = sourceWorkbook.getWorksheet(EMBEDDED_SOURCE_SHEET_NAME)
    || sourceWorkbook.getWorksheet(GLAPS_CONTAINER_SOURCE_SHEET_NAME)
    || sourceWorkbook.worksheets[0];
  const glapsCodeSheet = referenceWorkbook.getWorksheet(GLAPS_CONTAINER_CODE_SHEET_NAME);
  if (!elsTemplateSheet) throw new Error(`${GLAPS_CONTAINER_TEMPLATE_SHEET_NAME} 시트를 기준 양식에서 찾지 못했습니다.`);
  if (!sourceSheet) throw new Error(`${EMBEDDED_SOURCE_SHEET_NAME} 시트를 원본 데이터 파일에서 찾지 못했습니다.`);
  if (!glapsCodeSheet) throw new Error(`${GLAPS_CONTAINER_CODE_SHEET_NAME} 시트를 기준 양식에서 찾지 못했습니다.`);

  const sourceColumns = collectSourceColumns(sourceSheet);
  const uploadFormulaByColumn = readUploadFormulaMap(elsTemplateSheet);
  const containerColumn = columnNumberFromRef(sourceColumns['컨테이너 번호']);
  const formulaSourceSheetName = buildExternalSourceSheetName(sourceWorkbookPath, sourceSheet.name);
  let sourceContainerRows = 0;
  for (let rowNumber = 2; rowNumber <= sourceSheet.rowCount; rowNumber += 1) {
    if (plainCellValue(sourceSheet.getRow(rowNumber).getCell(containerColumn).value)) sourceContainerRows += 1;
  }

  const plan = {
    containerColumnNumber: containerColumn,
    sourceSheetName: sourceSheet.name,
    formulaSourceSheetName,
    ...buildFormulaPlan({ uploadFormulaByColumn, sourceColumns, formulaSourceSheetName }),
  };
  const { tempDir, planPath } = await writeFormulaPlan(plan);
  let excelComOutput = '';
  try {
    excelComOutput = runExcelComBuilder({
      referenceTemplatePath,
      sourceWorkbookPath,
      outputPath,
      planPath,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  const portableLinkOutput = await makeExternalLinksPortable({ outputPath, sourceWorkbookPath });

  console.log(JSON.stringify({
    outputPath,
    referenceTemplatePath,
    sourceWorkbookPath,
    sourceSelectMode,
    sourceSheetName: sourceSheet.name,
    formulaSourceSheetName,
    sourceRows: sourceSheet.rowCount,
    sourceContainerRows,
    sourceScanLastRow: GLAPS_FORMULA_SOURCE_SCAN_LAST_ROW,
    outputRows: GLAPS_FORMULA_OUTPUT_ROW_COUNT,
    helperSheet: GLAPS_FORMULA_HELPER_SHEET_NAME,
    excelComOutput: excelComOutput ? JSON.parse(excelComOutput) : null,
    portableLinkOutput,
    preservedReferenceSheets: [GLAPS_CONTAINER_CODE_SHEET_NAME, 'CKD고객사코드'],
    outputMethod: 'excel-com',
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
