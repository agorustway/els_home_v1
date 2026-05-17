import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import {
  isPerformanceDateHeader,
  normalizeAnnualPerformanceRow,
  parsePerformanceDateParts,
} from '../utils/asanPerformanceView.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '..');

dotenv.config({ path: path.join(webRoot, '.env.local'), override: false });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: false });

const DEFAULT_NAS_FILE_PATH = '/volume2/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx';
const FALLBACK_FILE_PATHS = [
  DEFAULT_NAS_FILE_PATH,
  'A:\\B_총무\\C_마감\\합계연간실적\\합계연간실적.xlsx',
  'A:\\아산지점\\B_총무\\C_마감\\합계연간실적\\합계연간실적.xlsx',
  'N:\\아산지점\\B_총무\\C_마감\\합계연간실적\\합계연간실적.xlsx',
  'N:\\공유\\아산지점\\B_총무\\C_마감\\합계연간실적\\합계연간실적.xlsx',
];
const DEFAULT_DB_PATH = '/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx';
const DEFAULT_SHEET_NAME = '합계';
const DEFAULT_CHUNK_SIZE = 200;

function parseArgs(argv) {
  const args = {};
  for (let idx = 0; idx < argv.length; idx += 1) {
    const token = argv[idx];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'dry-run' || key === 'help' || key === 'confirm-large-import' || key === 'force' || key === 'diff-current' || key === 'retire-previous-current' || key === 'summary-only') {
      args[key] = true;
      continue;
    }
    args[key] = argv[idx + 1];
    idx += 1;
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node web/scripts/import-asan-annual-performance.mjs --file "/volume2/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx"',
    '',
    'Options:',
    '  --file <path>        Excel file path. Default: ASAN_ANNUAL_PERFORMANCE_FILE or /volume2/아산지점/...',
    '  --db-path <path>     Supabase logical file_path. Default: /아산지점/B_총무/...',
    '  --sheet <name>       Sheet name. Default: 합계',
    '  --header-row <n>     1-based title row override',
    '  --chunk-size <n>     Insert/update chunk size. Default: 200',
    '  --dry-run           Parse only; do not write Supabase',
    '  --confirm-large-import  Required when importing more than 100,000 rows',
  '  --force             Import even when Supabase file_modified_at matches the Excel mtime',
  '  --diff-current      Compare current rows by hash before insert. Slower; requires DB index health',
  '  --retire-previous-current  After publishing the new snapshot, best-effort retire previous current rows. Optional.',
  '  --summary-only      Recalculate Excel summary and update branch_performance_files only. No row insert/update.',
  '  --snapshot-id <id>  Snapshot id to keep as currentSnapshotId during --summary-only.',
  ].join('\n');
}

function toRuntimePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (process.platform === 'win32' && raw.startsWith('/')) return path.resolve(raw);
  return path.resolve(raw);
}

function pickFilePath(argValue) {
  if (argValue) return toRuntimePath(argValue);
  const candidates = [
    process.env.ASAN_ANNUAL_PERFORMANCE_FILE,
    ...FALLBACK_FILE_PATHS,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const runtimePath = toRuntimePath(candidate);
    if (fs.existsSync(runtimePath)) return runtimePath;
  }
  return toRuntimePath(candidates[0] || DEFAULT_NAS_FILE_PATH);
}

function normalizeDbPath(value) {
  let normalized = String(value || DEFAULT_DB_PATH).replace(/\\/g, '/').trim();
  normalized = normalized.replace(/^[A-Za-z]:/, '');
  while (normalized.startsWith('//')) normalized = normalized.slice(1);
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  if (normalized.startsWith('/B_총무/')) normalized = `/아산지점${normalized}`;
  return normalized;
}

function cleanCell(value) {
  if (value == null) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).replace(/\r?\n/g, ' ').trim();
}

function parseAmount(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).trim();
  if (!text) return 0;
  const negative = text.startsWith('(') && text.endsWith(')');
  const cleaned = text.replace(/,/g, '').replace(/원/g, '').replace(/₩/g, '').replace(/\u00a0/g, ' ').trim();
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const amount = Number(match[0]);
  return negative ? -Math.abs(amount) : amount;
}

function hasNumber(value) {
  return /\d/.test(String(value ?? ''));
}

function headerText(header) {
  return String(header || '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function hasKeyword(header, keywords) {
  const compact = headerText(header);
  return keywords.some(keyword => compact.includes(String(keyword).replace(/\s+/g, '').toLocaleLowerCase('ko-KR')));
}

function isTotalRow(row) {
  const labels = row.map(cleanCell).filter(Boolean);
  if (!labels.length) return false;
  const first = labels[0].replace(/\s+/g, '');
  return ['합계', '총계', '소계', '계', '합계:'].includes(first);
}

function detectHeaderIndex(matrix, headerRow) {
  if (headerRow) {
    const parsed = Number.parseInt(headerRow, 10);
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(matrix.length - 1, parsed - 1));
  }

  const keywords = ['년', '연도', '월', '일자', '거래처', '업체', '매출', '매입', '손익', '금액', '합계'];
  let bestIdx = 0;
  let bestScore = -1;
  const scanCount = Math.min(matrix.length, 40);

  for (let idx = 0; idx < scanCount; idx += 1) {
    const values = (matrix[idx] || []).map(cleanCell);
    const nonEmpty = values.filter(Boolean);
    if (nonEmpty.length < 2) continue;

    const keywordHits = nonEmpty.filter(value => keywords.some(keyword => value.includes(keyword))).length;
    let belowNonEmpty = 0;
    for (let belowIdx = idx + 1; belowIdx < Math.min(matrix.length, idx + 4); belowIdx += 1) {
      belowNonEmpty += (matrix[belowIdx] || []).filter(value => cleanCell(value)).length;
    }

    const score = (nonEmpty.length * 2) + (keywordHits * 4) + Math.min(belowNonEmpty, 20) - (idx * 0.05);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }

  return bestIdx;
}

function cleanHeaders(rawHeaders) {
  const seen = new Map();
  return rawHeaders.map((value, idx) => {
    let header = cleanCell(value);
    if (!header || header.toLocaleLowerCase('ko-KR').startsWith('unnamed')) header = `col_${idx + 1}`;
    const count = seen.get(header) || 0;
    seen.set(header, count + 1);
    return count ? `${header}_${count}` : header;
  });
}

function sheetNameFromWorkbook(workbook, preferred) {
  const sheets = workbook.SheetNames || [];
  if (!sheets.length) throw new Error('Excel sheet가 없습니다.');
  if (sheets.includes(preferred)) return preferred;
  return sheets.find(sheet => preferred && sheet.includes(preferred)) || sheets[0];
}

function readWorkbookSheetNames(filePath, preferred) {
  const workbook = XLSX.readFile(filePath, {
    bookSheets: true,
    bookProps: false,
    bookFiles: false,
    cellStyles: false,
  });
  const actualSheet = sheetNameFromWorkbook(workbook, preferred || DEFAULT_SHEET_NAME);
  return {
    actualSheet,
    targetSheetNo: Math.max(1, (workbook.SheetNames || []).indexOf(actualSheet) + 1),
  };
}

function normalizeExcelJsCellValue(value) {
  if (value == null) return '';
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
  if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result;
  if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
  if (Object.prototype.hasOwnProperty.call(value, 'hyperlink')) return value.text || value.hyperlink;
  return JSON.stringify(value);
}

function rowToArray(row) {
  const values = row.values || [];
  const result = [];
  for (let idx = 1; idx < values.length; idx += 1) {
    result.push(normalizeExcelJsCellValue(values[idx]));
  }
  return result;
}

function detectLastCol(matrix, headerIdx) {
  const rawHeader = matrix[headerIdx] || [];
  let lastCol = -1;
  const maxCols = Math.max(...matrix.map(row => row.length), rawHeader.length, 1);

  for (let colIdx = 0; colIdx < maxCols; colIdx += 1) {
    if (cleanCell(rawHeader[colIdx])) {
      lastCol = colIdx;
      continue;
    }
    const sample = matrix.slice(headerIdx + 1, headerIdx + 201).map(row => row[colIdx]);
    if (sample.some(value => cleanCell(value))) lastCol = colIdx;
  }
  return lastCol < 0 ? Math.max(0, rawHeader.length - 1) : lastCol;
}

async function streamExcelRows(filePath, sheetName = DEFAULT_SHEET_NAME, headerRow = null, handlers = {}) {
  const { actualSheet, targetSheetNo } = readWorkbookSheetNames(filePath, sheetName || DEFAULT_SHEET_NAME);
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
  });
  workbookReader.model = { sheets: [] };

  const warmupRows = [];
  let headers = [];
  let headerIdx = null;
  let lastCol = null;
  let foundSheet = false;
  let rawRowCount = 0;
  let emittedRows = 0;
  let readyCalled = false;

  const emitDataRow = async rawRow => {
    const parsedRow = [];
    for (let colIdx = 0; colIdx <= lastCol; colIdx += 1) parsedRow.push(cleanCell(rawRow[colIdx]));
    const normalizedRow = normalizeAnnualPerformanceRow(headers, parsedRow);
    if (!normalizedRow.some(Boolean)) return;
    await handlers.onRow?.(normalizedRow, emittedRows);
    emittedRows += 1;
    if (emittedRows > 0 && emittedRows % 1000 === 0) {
      console.error(`[annual-performance-import] parsed rows=${emittedRows}`);
    }
  };

  const finishWarmup = async () => {
    if (headerIdx != null) return;
    if (!warmupRows.length) {
      headerIdx = 0;
      lastCol = 0;
      headers = [];
    } else {
      headerIdx = detectHeaderIndex(warmupRows, headerRow);
      lastCol = detectLastCol(warmupRows, headerIdx);
      headers = cleanHeaders((warmupRows[headerIdx] || []).slice(0, lastCol + 1));
    }

    if (!readyCalled) {
      readyCalled = true;
      await handlers.onReady?.({
        headers,
        sheetName: actualSheet,
        headerRow: (headerIdx || 0) + 1,
      });
    }

    for (let rowIdx = headerIdx + 1; rowIdx < warmupRows.length; rowIdx += 1) {
      const rawRow = warmupRows[rowIdx] || [];
      await emitDataRow(rawRow);
    }
  };

  for await (const worksheetReader of workbookReader) {
    const worksheetId = Number(worksheetReader.id);
    if (worksheetReader.name !== actualSheet && worksheetId !== targetSheetNo) continue;
    const worksheetName = worksheetReader.name === `Sheet${worksheetId}` ? actualSheet : (worksheetReader.name || actualSheet);
    foundSheet = true;
    console.error(`[annual-performance-import] sheet="${worksheetName}" streaming parse start`);

    for await (const row of worksheetReader) {
      rawRowCount += 1;
      const rawValues = rowToArray(row);
      if (headerIdx == null) {
        warmupRows.push(rawValues);
        if (warmupRows.length < 240) continue;
        await finishWarmup();
        continue;
      }

      await emitDataRow(rawValues);
    }
  }

  if (!foundSheet) throw new Error(`Excel sheet를 찾을 수 없습니다: ${actualSheet}`);
  await finishWarmup();

  return {
    headers,
    sheetName: actualSheet,
    headerRow: (headerIdx || 0) + 1,
    rowCount: emittedRows,
    rawRowCount,
  };
}

async function parseExcel(filePath, sheetName = DEFAULT_SHEET_NAME, headerRow = null) {
  const rows = [];
  const parsed = await streamExcelRows(filePath, sheetName, headerRow, {
    onRow(row) {
      rows.push(row);
    },
  });
  return {
    headers: parsed.headers,
    data: rows,
    sheetName: parsed.sheetName,
    headerRow: parsed.headerRow,
    rawRowCount: parsed.rawRowCount,
  };
}

function numericColumnIndices(headers, rows) {
  const sampleRows = rows.slice(0, 2000);
  const total = Math.max(1, sampleRows.length);
  const excluded = ['년', '연도', '월', '일자', '날짜', '번호', '코드', '사업자', '전화', '차량', '작업지', '영업넘버', 'seal', 'booking', 'type', '비고'];
  const result = [];

  headers.forEach((header, idx) => {
    if (hasKeyword(header, excluded)) return;
    let parsed = 0;
    let amountSum = 0;
    for (const row of sampleRows) {
      const value = row[idx] || '';
      if (!hasNumber(value)) continue;
      parsed += 1;
      amountSum += Math.abs(parseAmount(value));
    }
    if (parsed >= 3 && parsed / total >= 0.08 && amountSum > 0) result.push(idx);
  });

  return result;
}

function inferYearMonth(headers, row) {
  let year = null;
  let month = null;
  const dateKeywords = ['일자', '날짜', '년월', '마감월', '마감일'];
  const yearKeywords = ['연도', '년도', '년'];
  const monthKeywords = ['월'];

  headers.forEach((header, idx) => {
    const text = String(row[idx] || '');
    if (isPerformanceDateHeader(header)) {
      const parts = parsePerformanceDateParts(text);
      if (parts) {
        if (year == null) year = parts.year;
        if (month == null) month = parts.month;
      }
    }
    if (year == null && hasKeyword(header, yearKeywords)) {
      const match = text.match(/(20\d{2}|19\d{2})/);
      if (match) year = Number(match[1]);
    }
    if (month == null && hasKeyword(header, monthKeywords)) {
      const match = text.match(/\b(1[0-2]|0?[1-9])\b/);
      if (match) month = Number(match[1]);
    }
    if (hasKeyword(header, dateKeywords)) {
      const match = text.match(/(20\d{2}|19\d{2})[-./년\s]?(0?[1-9]|1[0-2])?/);
      if (match) {
        if (year == null) year = Number(match[1]);
        if (month == null && match[2]) month = Number(match[2]);
      }
    }
  });

  return { year, month };
}

function yearFromHeader(header) {
  const match = String(header || '').match(/(20\d{2}|19\d{2})/);
  return match ? Number(match[1]) : null;
}

const BREAKDOWN_COLUMN_WORDS = ['매출', '지역', '작업지', '운송사', '구분', '노선', '픽업', '포트', '하차', '청구처', '지급처', '계약'];

function breakdownColumnIndices(headers, numericCols) {
  return headers
    .map((header, idx) => ({ header, idx }))
    .filter(({ header, idx }) => !numericCols.includes(idx) && hasKeyword(header, BREAKDOWN_COLUMN_WORDS))
    .slice(0, 8)
    .map(item => item.idx);
}

function addBreakdownRow(breakdowns, columnIndices, row, revenue, purchase, profit) {
  for (const idx of columnIndices) {
    const value = row[idx] || '미분류';
    if (!breakdowns.has(idx)) breakdowns.set(idx, new Map());
    const bucket = breakdowns.get(idx);
    if (!bucket.has(value)) bucket.set(value, { name: value, revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
    const item = bucket.get(value);
    item.revenue += revenue;
    item.purchase += purchase;
    item.profit += profit;
    item.rowCount += 1;
  }
}

function finalizeBreakdowns(headers, columnIndices, breakdowns, totalRevenue, roundItem) {
  return columnIndices.map((idx) => {
    const items = Array.from((breakdowns.get(idx) || new Map()).values()).map((item) => {
      const rounded = roundItem(item);
      rounded.profitRate = rounded.revenue ? Math.round((rounded.profit / rounded.revenue) * 10000) / 100 : 0;
      rounded.revenueShare = totalRevenue ? Math.round((rounded.revenue / totalRevenue) * 10000) / 100 : 0;
      return rounded;
    });
    items.sort((a, b) => Math.abs(b.revenue) - Math.abs(a.revenue));
    return {
      column: headers[idx],
      items: items.slice(0, 10),
    };
  }).filter(item => item.items.length);
}

function buildSummary(headers, rows) {
  const analysisRows = rows.filter(row => !isTotalRow(row));
  const numericCols = numericColumnIndices(headers, analysisRows);
  const salesWords = ['매출', '청구', '수입', '운송수입', '공급가', '운임'];
  const purchaseWords = ['매입', '원가', '비용', '지급', '외주', '운송비', '정산', '하불'];
  const profitWords = ['손익', '이익', '마진', '차익', '수익'];
  const amountExcludes = ['처', '거래처', '업체', '부가세', 'vat', '세액', '번호', '코드'];

  let revenueCols = numericCols.filter(idx => hasKeyword(headers[idx], salesWords) && !hasKeyword(headers[idx], amountExcludes));
  const purchaseCols = numericCols.filter(idx => hasKeyword(headers[idx], purchaseWords) && !hasKeyword(headers[idx], amountExcludes));
  const profitCols = numericCols.filter(idx => hasKeyword(headers[idx], profitWords) && !hasKeyword(headers[idx], amountExcludes));
  if (!revenueCols.length) {
    revenueCols = numericCols
      .filter(idx => hasKeyword(headers[idx], ['금액', '합계', 'total']) && !hasKeyword(headers[idx], purchaseWords))
      .slice(0, 1);
  }

  const groupCandidates = headers
    .map((header, idx) => ({ header, idx }))
    .filter(({ header, idx }) => !numericCols.includes(idx) && hasKeyword(header, ['거래처', '업체', '화주', '운송사', '구분', '품목', '노선', '작업지', '지점']))
    .slice(0, 4)
    .map(item => item.idx);
  const breakdownCandidates = breakdownColumnIndices(headers, numericCols);

  const yearly = new Map();
  const monthly = new Map();
  const groups = new Map();
  const breakdowns = new Map();
  let totalRevenue = 0;
  let totalPurchase = 0;
  let totalProfit = 0;

  if (revenueCols.length || purchaseCols.length || profitCols.length) {
    for (const row of analysisRows) {
      const { year, month } = inferYearMonth(headers, row);
      const revenue = revenueCols.reduce((sum, idx) => sum + parseAmount(row[idx] || ''), 0);
      const purchase = purchaseCols.reduce((sum, idx) => sum + parseAmount(row[idx] || ''), 0);
      const explicitProfit = profitCols.reduce((sum, idx) => sum + parseAmount(row[idx] || ''), 0);
      const profit = profitCols.length ? explicitProfit : revenue - purchase;
      totalRevenue += revenue;
      totalPurchase += purchase;
      totalProfit += profit;

      const yearKey = String(year || '미지정');
      if (!yearly.has(yearKey)) yearly.set(yearKey, { year: yearKey, revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
      const yearItem = yearly.get(yearKey);
      yearItem.revenue += revenue;
      yearItem.purchase += purchase;
      yearItem.profit += profit;
      yearItem.rowCount += 1;

      if (year && month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!monthly.has(monthKey)) monthly.set(monthKey, { period: monthKey, year, month, revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
        const monthItem = monthly.get(monthKey);
        monthItem.revenue += revenue;
        monthItem.purchase += purchase;
        monthItem.profit += profit;
        monthItem.rowCount += 1;
      }

      if (groupCandidates.length) {
        const groupValue = groupCandidates.map(idx => row[idx]).find(Boolean) || '미분류';
        if (!groups.has(groupValue)) groups.set(groupValue, { name: groupValue, revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
        const groupItem = groups.get(groupValue);
        groupItem.revenue += revenue;
        groupItem.purchase += purchase;
        groupItem.profit += profit;
        groupItem.rowCount += 1;
      }
      addBreakdownRow(breakdowns, breakdownCandidates, row, revenue, purchase, profit);
    }
  } else {
    const yearCols = numericCols.filter(idx => yearFromHeader(headers[idx]));
    const labelCols = headers.map((_, idx) => idx).filter(idx => !yearCols.includes(idx)).slice(0, 4);
    for (const row of analysisRows) {
      const label = labelCols.map(idx => row[idx]).filter(Boolean).join(' ');
      const isRevenue = salesWords.some(word => label.includes(word)) || !purchaseWords.concat(profitWords).some(word => label.includes(word));
      const isPurchase = purchaseWords.some(word => label.includes(word));
      const isProfit = profitWords.some(word => label.includes(word));
      for (const idx of yearCols) {
        const year = yearFromHeader(headers[idx]);
        const amount = parseAmount(row[idx] || '');
        const yearKey = String(year);
        if (!yearly.has(yearKey)) yearly.set(yearKey, { year: yearKey, revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
        const item = yearly.get(yearKey);
        if (isPurchase) {
          item.purchase += amount;
          totalPurchase += amount;
        } else if (isProfit) {
          item.profit += amount;
          totalProfit += amount;
        } else if (isRevenue) {
          item.revenue += amount;
          totalRevenue += amount;
        }
        item.rowCount += 1;
      }
    }
    for (const item of yearly.values()) {
      if (!item.profit) item.profit = item.revenue - item.purchase;
    }
    totalProfit = totalProfit || totalRevenue - totalPurchase;
  }

  const roundItem = item => {
    for (const key of ['revenue', 'purchase', 'profit']) {
      if (key in item) item[key] = Math.round(Number(item[key]) * 100) / 100;
    }
    return item;
  };

  const yearlyList = Array.from(yearly.values()).map(roundItem);
  yearlyList.sort((a, b) => (a.year === '미지정') - (b.year === '미지정') || String(a.year).localeCompare(String(b.year), 'ko-KR'));
  const monthlyList = Array.from(monthly.values()).map(roundItem);
  monthlyList.sort((a, b) => a.period.localeCompare(b.period));
  const topGroups = Array.from(groups.values()).map(roundItem);
  topGroups.sort((a, b) => Math.abs(b.revenue) - Math.abs(a.revenue));

  return {
    totalRows: rows.length,
    analysisRows: analysisRows.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalPurchase: Math.round(totalPurchase * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    profitRate: totalRevenue ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0,
    yearly: yearlyList,
    monthly: monthlyList.slice(0, 240),
    topGroups: topGroups.slice(0, 15),
    breakdowns: finalizeBreakdowns(headers, breakdownCandidates, breakdowns, totalRevenue, roundItem),
    detected: {
      numericColumns: numericCols.map(idx => headers[idx]),
      revenueColumns: revenueCols.map(idx => headers[idx]),
      purchaseColumns: purchaseCols.map(idx => headers[idx]),
      profitColumns: profitCols.map(idx => headers[idx]),
      groupColumns: groupCandidates.map(idx => headers[idx]),
    },
  };
}

async function summarizeExcelStreaming(filePath, preferredSheetName, headerRow) {
  const sampleRows = [];
  let accumulator = null;
  let ready = null;

  const ensureAccumulator = () => {
    if (accumulator) return;
    accumulator = createSummaryAccumulator(ready.headers, sampleRows);
    for (const sampleRow of sampleRows) accumulator.add(sampleRow);
  };

  const parsed = await streamExcelRows(filePath, preferredSheetName, headerRow, {
    async onReady(meta) {
      ready = meta;
    },
    async onRow(row) {
      if (sampleRows.length < 2000) {
        sampleRows.push(row);
      } else {
        ensureAccumulator();
        accumulator.add(row);
      }
    },
  });

  ensureAccumulator();
  return {
    headers: parsed.headers,
    sheetName: parsed.sheetName,
    headerRow: parsed.headerRow,
    rowCount: parsed.rowCount,
    summary: accumulator.finish(),
  };
}

function createSummaryAccumulator(headers, sampleRows) {
  const analysisSampleRows = sampleRows.filter(row => !isTotalRow(row));
  const numericCols = numericColumnIndices(headers, analysisSampleRows);
  const salesWords = ['매출', '청구', '수입', '운송수입', '공급가', '운임'];
  const purchaseWords = ['매입', '원가', '비용', '지급', '외주', '운송비', '정산', '하불'];
  const profitWords = ['손익', '이익', '마진', '차익', '수익'];
  const amountExcludes = ['처', '거래처', '업체', '부가세', 'vat', '세액', '번호', '코드'];
  let revenueCols = numericCols.filter(idx => hasKeyword(headers[idx], salesWords) && !hasKeyword(headers[idx], amountExcludes));
  const purchaseCols = numericCols.filter(idx => hasKeyword(headers[idx], purchaseWords) && !hasKeyword(headers[idx], amountExcludes));
  const profitCols = numericCols.filter(idx => hasKeyword(headers[idx], profitWords) && !hasKeyword(headers[idx], amountExcludes));
  if (!revenueCols.length) {
    revenueCols = numericCols
      .filter(idx => hasKeyword(headers[idx], ['금액', '합계', 'total']) && !hasKeyword(headers[idx], purchaseWords))
      .slice(0, 1);
  }
  const groupCandidates = headers
    .map((header, idx) => ({ header, idx }))
    .filter(({ header, idx }) => !numericCols.includes(idx) && hasKeyword(header, ['거래처', '업체', '화주', '운송사', '구분', '품목', '노선', '작업지', '지점']))
    .slice(0, 4)
    .map(item => item.idx);
  const breakdownCandidates = breakdownColumnIndices(headers, numericCols);
  const yearCols = revenueCols.length || purchaseCols.length || profitCols.length
    ? []
    : numericCols.filter(idx => yearFromHeader(headers[idx]));
  const labelCols = yearCols.length ? headers.map((_, idx) => idx).filter(idx => !yearCols.includes(idx)).slice(0, 4) : [];
  const yearly = new Map();
  const monthly = new Map();
  const groups = new Map();
  const breakdowns = new Map();
  let totalRows = 0;
  let analysisRows = 0;
  let totalRevenue = 0;
  let totalPurchase = 0;
  let totalProfit = 0;

  function add(row) {
    totalRows += 1;
    if (isTotalRow(row)) return;
    analysisRows += 1;

    if (revenueCols.length || purchaseCols.length || profitCols.length) {
      const { year, month } = inferYearMonth(headers, row);
      const revenue = revenueCols.reduce((sum, idx) => sum + parseAmount(row[idx] || ''), 0);
      const purchase = purchaseCols.reduce((sum, idx) => sum + parseAmount(row[idx] || ''), 0);
      const explicitProfit = profitCols.reduce((sum, idx) => sum + parseAmount(row[idx] || ''), 0);
      const profit = profitCols.length ? explicitProfit : revenue - purchase;
      totalRevenue += revenue;
      totalPurchase += purchase;
      totalProfit += profit;

      const yearKey = String(year || '미지정');
      if (!yearly.has(yearKey)) yearly.set(yearKey, { year: yearKey, revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
      const yearItem = yearly.get(yearKey);
      yearItem.revenue += revenue;
      yearItem.purchase += purchase;
      yearItem.profit += profit;
      yearItem.rowCount += 1;

      if (year && month) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        if (!monthly.has(monthKey)) monthly.set(monthKey, { period: monthKey, year, month, revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
        const monthItem = monthly.get(monthKey);
        monthItem.revenue += revenue;
        monthItem.purchase += purchase;
        monthItem.profit += profit;
        monthItem.rowCount += 1;
      }

      if (groupCandidates.length) {
        const groupValue = groupCandidates.map(idx => row[idx]).find(Boolean) || '미분류';
        if (!groups.has(groupValue)) groups.set(groupValue, { name: groupValue, revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
        const groupItem = groups.get(groupValue);
        groupItem.revenue += revenue;
        groupItem.purchase += purchase;
        groupItem.profit += profit;
        groupItem.rowCount += 1;
      }
      addBreakdownRow(breakdowns, breakdownCandidates, row, revenue, purchase, profit);
      return;
    }

    const label = labelCols.map(idx => row[idx]).filter(Boolean).join(' ');
    const isRevenue = salesWords.some(word => label.includes(word)) || !purchaseWords.concat(profitWords).some(word => label.includes(word));
    const isPurchase = purchaseWords.some(word => label.includes(word));
    const isProfit = profitWords.some(word => label.includes(word));
    for (const idx of yearCols) {
      const year = yearFromHeader(headers[idx]);
      const amount = parseAmount(row[idx] || '');
      const yearKey = String(year);
      if (!yearly.has(yearKey)) yearly.set(yearKey, { year: yearKey, revenue: 0, purchase: 0, profit: 0, rowCount: 0 });
      const item = yearly.get(yearKey);
      if (isPurchase) {
        item.purchase += amount;
        totalPurchase += amount;
      } else if (isProfit) {
        item.profit += amount;
        totalProfit += amount;
      } else if (isRevenue) {
        item.revenue += amount;
        totalRevenue += amount;
      }
      item.rowCount += 1;
    }
  }

  function finish() {
    if (yearCols.length) {
      for (const item of yearly.values()) {
        if (!item.profit) item.profit = item.revenue - item.purchase;
      }
      totalProfit = totalProfit || totalRevenue - totalPurchase;
    }

    const roundItem = item => {
      for (const key of ['revenue', 'purchase', 'profit']) {
        if (key in item) item[key] = Math.round(Number(item[key]) * 100) / 100;
      }
      return item;
    };
    const yearlyList = Array.from(yearly.values()).map(roundItem);
    yearlyList.sort((a, b) => (a.year === '미지정') - (b.year === '미지정') || String(a.year).localeCompare(String(b.year), 'ko-KR'));
    const monthlyList = Array.from(monthly.values()).map(roundItem);
    monthlyList.sort((a, b) => a.period.localeCompare(b.period));
    const topGroups = Array.from(groups.values()).map(roundItem);
    topGroups.sort((a, b) => Math.abs(b.revenue) - Math.abs(a.revenue));

    return {
      totalRows,
      analysisRows,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalPurchase: Math.round(totalPurchase * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      profitRate: totalRevenue ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0,
      yearly: yearlyList,
      monthly: monthlyList.slice(0, 240),
      topGroups: topGroups.slice(0, 15),
      breakdowns: finalizeBreakdowns(headers, breakdownCandidates, breakdowns, totalRevenue, roundItem),
      detected: {
        numericColumns: numericCols.map(idx => headers[idx]),
        revenueColumns: revenueCols.map(idx => headers[idx]),
        purchaseColumns: purchaseCols.map(idx => headers[idx]),
        profitColumns: profitCols.map(idx => headers[idx]),
        groupColumns: groupCandidates.map(idx => headers[idx]),
      },
    };
  }

  return { add, finish };
}

function pythonJsonDumps(value) {
  if (Array.isArray(value)) return `[${value.map(pythonJsonDumps).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${pythonJsonDumps(item)}`).join(', ')}}`;
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (value == null) return 'null';
  return JSON.stringify(value);
}

function rowHash(headers, row) {
  return createHash('sha256')
    .update(pythonJsonDumps({ headers, row }), 'utf8')
    .digest('hex');
}

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function timestampsClose(leftValue, rightValue) {
  const left = new Date(leftValue).getTime();
  const right = new Date(rightValue).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) < 1000;
}

async function readPerformanceMeta(supabase, key) {
  const { data, error } = await supabase
    .from('branch_performance_files')
    .select('file_modified_at,synced_at,row_count,current_row_count,header_row,summary')
    .eq('branch_id', key.branchId)
    .eq('dataset_type', key.datasetType)
    .eq('file_path', key.filePath)
    .eq('sheet_name', key.sheetName)
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function readCurrentRows(supabase, key) {
  const rowsByIndex = new Map();
  let start = 0;
  const pageSize = 1000;

  for (;;) {
    const { data, error } = await supabase
      .from('branch_performance_rows')
      .select('id,row_index,source_row_hash')
      .eq('branch_id', key.branchId)
      .eq('dataset_type', key.datasetType)
      .eq('file_path', key.filePath)
      .eq('sheet_name', key.sheetName)
      .eq('is_current', true)
      .order('row_index', { ascending: true })
      .range(start, start + pageSize - 1);

    if (error) throw new Error(error.message);
    for (const item of data || []) {
      const rowIndex = Number(item.row_index);
      if (!rowsByIndex.has(rowIndex)) rowsByIndex.set(rowIndex, []);
      rowsByIndex.get(rowIndex).push({
        id: item.id,
        hash: item.source_row_hash,
      });
    }
    if (!data || data.length < pageSize) break;
    start += pageSize;
  }

  return rowsByIndex;
}

function keyFilter(query, key) {
  return query
    .eq('branch_id', key.branchId)
    .eq('dataset_type', key.datasetType)
    .eq('file_path', key.filePath)
    .eq('sheet_name', key.sheetName);
}

function rowIndexFilter(query, key) {
  return keyFilter(query, key)
    .eq('is_current', true);
}

async function updateRowsWithRetry({ supabase, table, patch, filter, values, column, chunkSize, minChunkSize = 20 }) {
  let affected = 0;
  for (let start = 0; start < values.length; start += chunkSize) {
    const chunk = values.slice(start, start + chunkSize);
    let query = supabase.from(table).update(patch);
    query = filter(query).in(column, chunk);
    const { error } = await query;
    if (error) {
      if ((error.code === '57014' || /timeout/i.test(error.message || '')) && chunk.length > minChunkSize) {
        affected += await updateRowsWithRetry({
          supabase,
          table,
          patch,
          filter,
          values: chunk,
          column,
          chunkSize: Math.max(minChunkSize, Math.floor(chunk.length / 2)),
          minChunkSize,
        });
        continue;
      }
      throw new Error(error.message);
    }
    affected += chunk.length;
  }
  return affected;
}

async function updateRowIndexRangeWithRetry({
  supabase,
  table,
  patch,
  filter,
  rangeStart,
  rangeEnd,
  minChunkSize = 20,
}) {
  let query = supabase.from(table).update(patch);
  query = filter(query).gte('row_index', rangeStart).lte('row_index', rangeEnd);
  const { error } = await query;
  if (!error) return rangeEnd - rangeStart + 1;

  const size = rangeEnd - rangeStart + 1;
  if ((error.code === '57014' || /timeout/i.test(error.message || '')) && size > minChunkSize) {
    const middle = Math.floor((rangeStart + rangeEnd) / 2);
    const left = await updateRowIndexRangeWithRetry({
      supabase,
      table,
      patch,
      filter,
      rangeStart,
      rangeEnd: middle,
      minChunkSize,
    });
    const right = await updateRowIndexRangeWithRetry({
      supabase,
      table,
      patch,
      filter,
      rangeStart: middle + 1,
      rangeEnd,
      minChunkSize,
    });
    return left + right;
  }

  throw new Error(error.message);
}

async function updateRowsByRowIndexRange({
  supabase,
  table,
  patch,
  filter,
  rowCount,
  chunkSize,
  minChunkSize = 20,
}) {
  let affected = 0;
  for (let start = 0; start < rowCount; start += chunkSize) {
    affected += await updateRowIndexRangeWithRetry({
      supabase,
      table,
      patch,
      filter,
      rangeStart: start,
      rangeEnd: Math.min(rowCount - 1, start + chunkSize - 1),
      minChunkSize,
    });
  }
  return affected;
}

async function retirePreviousCurrentSnapshot({
  supabase,
  key,
  previousSnapshotId,
  previousCurrentCount,
  currentSnapshotId,
  nowIso,
  chunkSize,
}) {
  if (!previousSnapshotId || previousSnapshotId === currentSnapshotId || previousCurrentCount <= 0) {
    return {
      status: 'skipped',
      supersededCount: 0,
      reason: 'no_previous_snapshot',
    };
  }

  const supersededCount = await updateRowsByRowIndexRange({
    supabase,
    table: 'branch_performance_rows',
    patch: {
      is_current: false,
      change_status: 'superseded_by_excel',
      replaced_at: nowIso,
      last_seen_at: nowIso,
    },
    filter: query => keyFilter(query, key)
      .eq('snapshot_id', previousSnapshotId)
      .eq('is_current', true),
    rowCount: previousCurrentCount,
    chunkSize,
  });

  return {
    status: 'done',
    supersededCount,
    previousSnapshotId,
  };
}

async function insertRowsWithRetry({ supabase, rows, chunkSize, minChunkSize = 20 }) {
  let inserted = 0;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const { error } = await supabase.from('branch_performance_rows').insert(chunk);
    if (error) {
      if ((error.code === '57014' || /timeout/i.test(error.message || '')) && chunk.length > minChunkSize) {
        inserted += await insertRowsWithRetry({
          supabase,
          rows: chunk,
          chunkSize: Math.max(minChunkSize, Math.floor(chunk.length / 2)),
          minChunkSize,
        });
        continue;
      }
      throw new Error(error.message);
    }
    inserted += chunk.length;
  }
  return inserted;
}

function buildRowPayload({
  headers,
  row,
  rowIndex,
  hash,
  key,
  snapshotId,
  fileModifiedAt,
  nowIso,
  isCurrent = true,
  changeStatus = 'current',
}) {
  const rowData = {};
  headers.forEach((header, idx) => {
    rowData[header] = row[idx] || '';
  });
  const { year, month } = inferYearMonth(headers, row);
  return {
    branch_id: key.branchId,
    dataset_type: key.datasetType,
    file_path: key.filePath,
    sheet_name: key.sheetName,
    snapshot_id: snapshotId,
    row_index: rowIndex,
    row_values: row,
    row_data: rowData,
    search_text: row.filter(Boolean).join(' ').slice(0, 8000),
    source_row_hash: hash || rowHash(headers, row),
    year_value: year,
    month_value: month,
    revenue_amount: 0,
    purchase_amount: 0,
    profit_amount: 0,
    is_current: isCurrent,
    change_status: changeStatus,
    file_modified_at: fileModifiedAt,
    first_seen_at: nowIso,
    last_seen_at: nowIso,
  };
}

function uuidV4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, marker => {
    const rand = Math.floor(Math.random() * 16);
    const value = marker === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function importExcelSnapshotStreaming({
  filePath,
  preferredSheetName,
  headerRow,
  supabase,
  key,
  chunkSize,
  fileModifiedAt,
  nowIso,
  currentMeta,
}) {
  const snapshotId = uuidV4();
  const previousCurrentCount = Math.max(0, Number(currentMeta?.current_row_count || currentMeta?.row_count || 0) || 0);
  const stageBeforeActivation = previousCurrentCount > 0;
  const previousSnapshotId = currentMeta?.summary?.currentSnapshotId || currentMeta?.summary?.snapshotId || '';
  const sampleRows = [];
  let accumulator = null;
  let ready = null;
  let insertedCount = 0;
  let insertBatch = [];

  const ensureAccumulator = () => {
    if (accumulator) return;
    accumulator = createSummaryAccumulator(ready.headers, sampleRows);
    for (const sampleRow of sampleRows) accumulator.add(sampleRow);
  };

  const flush = async () => {
    if (!insertBatch.length) return;
    insertedCount += await insertRowsWithRetry({ supabase, rows: insertBatch, chunkSize });
    insertBatch = [];
    if (insertedCount > 0 && insertedCount % 10000 === 0) {
      console.error(`[annual-performance-import] inserted rows=${insertedCount}`);
    }
  };

  const parsed = await streamExcelRows(filePath, preferredSheetName, headerRow, {
    async onReady(meta) {
      ready = meta;
    },
    async onRow(row, rowIndex) {
      if (sampleRows.length < 2000) {
        sampleRows.push(row);
      } else {
        ensureAccumulator();
        accumulator.add(row);
      }

      const hash = rowHash(ready.headers, row);
      insertBatch.push(buildRowPayload({
        headers: ready.headers,
        row,
        rowIndex,
        hash,
        key,
        snapshotId,
        fileModifiedAt,
        nowIso,
        isCurrent: !stageBeforeActivation,
        changeStatus: stageBeforeActivation ? 'staged_current' : 'current',
      }));

      if (insertBatch.length >= chunkSize) await flush();
    },
  });

  ensureAccumulator();
  await flush();

  let activatedCount = 0;
  let supersededCount = 0;

  const summary = accumulator.finish();
  summary.currentSnapshotId = snapshotId;
  summary.previousSnapshotId = previousSnapshotId || null;
  summary.importMode = stageBeforeActivation ? 'snapshot-replace' : 'bootstrap-snapshot';
  summary.currentSelectionMode = 'summary.currentSnapshotId';
  return {
    mode: stageBeforeActivation ? 'snapshot-replace' : 'bootstrap-snapshot',
    headers: parsed.headers,
    sheetName: parsed.sheetName,
    headerRow: parsed.headerRow,
    rowCount: parsed.rowCount,
    summary,
    insertedCount,
    activatedCount,
    unchangedCount: 0,
    supersededCount,
    removedCount: 0,
    duplicateCount: 0,
    snapshotId,
    previousSnapshotId,
    previousCurrentCount,
  };
}

async function importExcelStreaming({
  filePath,
  preferredSheetName,
  headerRow,
  supabase,
  key,
  chunkSize,
  fileModifiedAt,
  nowIso,
}) {
  const currentRows = await readCurrentRows(supabase, key);
  const snapshotId = uuidV4();
  const sampleRows = [];
  let accumulator = null;
  let ready = null;
  let insertedCount = 0;
  let unchangedCount = 0;
  let supersededCount = 0;
  let removedCount = 0;
  let duplicateCount = 0;
  let insertBatch = [];
  let changedBatch = [];
  let duplicateBatch = [];

  const ensureAccumulator = () => {
    if (accumulator) return;
    accumulator = createSummaryAccumulator(ready.headers, sampleRows);
    for (const sampleRow of sampleRows) accumulator.add(sampleRow);
  };

  const flush = async () => {
    if (duplicateBatch.length) {
      duplicateCount += await updateRowsWithRetry({
        supabase,
        table: 'branch_performance_rows',
        patch: {
          is_current: false,
          change_status: 'duplicate_current_retired',
          replaced_at: nowIso,
          last_seen_at: nowIso,
        },
        filter: query => query.eq('is_current', true),
        values: duplicateBatch,
        column: 'id',
        chunkSize,
      });
      duplicateBatch = [];
    }

    if (changedBatch.length) {
      supersededCount += await updateRowsWithRetry({
        supabase,
        table: 'branch_performance_rows',
        patch: {
          is_current: false,
          change_status: 'superseded_by_excel',
          replaced_at: nowIso,
          last_seen_at: nowIso,
        },
        filter: query => rowIndexFilter(query, key),
        values: changedBatch,
        column: 'row_index',
        chunkSize,
      });
      changedBatch = [];
    }

    if (insertBatch.length) {
      insertedCount += await insertRowsWithRetry({ supabase, rows: insertBatch, chunkSize });
      insertBatch = [];
      if (insertedCount > 0 && insertedCount % 10000 === 0) {
        console.error(`[annual-performance-import] inserted rows=${insertedCount}`);
      }
    }
  };

  const parsed = await streamExcelRows(filePath, preferredSheetName, headerRow, {
    async onReady(meta) {
      ready = meta;
    },
    async onRow(row, rowIndex) {
      if (sampleRows.length < 2000) {
        sampleRows.push(row);
      } else {
        ensureAccumulator();
        accumulator.add(row);
      }

      const hash = rowHash(ready.headers, row);
      const current = currentRows.get(rowIndex) || [];
      const matchingIdx = current.findIndex(item => item.hash === hash);
      if (matchingIdx >= 0) {
        unchangedCount += 1;
        current.forEach((item, idx) => {
          if (idx !== matchingIdx) duplicateBatch.push(item.id);
        });
        currentRows.delete(rowIndex);
      } else {
        if (current.length) changedBatch.push(rowIndex);
        insertBatch.push(buildRowPayload({
          headers: ready.headers,
          row,
          rowIndex,
          hash,
          key,
          snapshotId,
          fileModifiedAt,
          nowIso,
        }));
        currentRows.delete(rowIndex);
      }

      if (insertBatch.length >= chunkSize || changedBatch.length >= chunkSize || duplicateBatch.length >= chunkSize) {
        await flush();
      }
    },
  });

  ensureAccumulator();
  await flush();

  const removedIndices = Array.from(currentRows.keys());
  if (removedIndices.length) {
    removedCount = await updateRowsWithRetry({
      supabase,
      table: 'branch_performance_rows',
      patch: {
        is_current: false,
        change_status: 'removed_from_excel',
        replaced_at: nowIso,
        last_seen_at: nowIso,
      },
      filter: query => rowIndexFilter(query, key),
      values: removedIndices,
      column: 'row_index',
      chunkSize,
    });
  }

  const summary = accumulator.finish();
  summary.currentSnapshotId = snapshotId;
  summary.importMode = 'diff-current';
  return {
    mode: 'diff-current',
    headers: parsed.headers,
    sheetName: parsed.sheetName,
    headerRow: parsed.headerRow,
    rowCount: parsed.rowCount,
    summary,
    insertedCount,
    unchangedCount,
    supersededCount,
    removedCount,
    duplicateCount,
    snapshotId,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const filePath = pickFilePath(args.file);
  const filePathExists = fs.existsSync(filePath);
  if (!filePathExists) {
    throw new Error(`Excel 파일을 찾을 수 없습니다: ${filePath}`);
  }

  const dbPath = normalizeDbPath(args['db-path'] || process.env.ASAN_ANNUAL_PERFORMANCE_DB_PATH || DEFAULT_DB_PATH);
  const preferredSheetName = args.sheet || process.env.ASAN_ANNUAL_PERFORMANCE_SHEET || DEFAULT_SHEET_NAME;
  const chunkSize = Math.max(20, Number.parseInt(args['chunk-size'] || DEFAULT_CHUNK_SIZE, 10) || DEFAULT_CHUNK_SIZE);
  const fileStat = fs.statSync(filePath);
  const fileModifiedAt = fileStat.mtime.toISOString();
  const nowIso = new Date().toISOString();
  const requestedKey = {
    branchId: 'asan',
    datasetType: 'annual',
    filePath: dbPath,
    sheetName: preferredSheetName,
  };
  let supabase = null;
  let currentMeta = null;

  if (!args['dry-run']) {
    supabase = createSupabaseClient();
    if (!args.force) {
      currentMeta = await readPerformanceMeta(supabase, requestedKey);
      if (currentMeta?.file_modified_at && timestampsClose(currentMeta.file_modified_at, fileModifiedAt)) {
        console.log(JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'file_modified_at_unchanged',
          filePath,
          dbPath,
          sheetName: requestedKey.sheetName,
          fileModifiedAt,
          previousSyncedAt: currentMeta.synced_at,
          rowCount: currentMeta.current_row_count || currentMeta.row_count || 0,
        }, null, 2));
        return;
      }
    } else {
      currentMeta = await readPerformanceMeta(supabase, requestedKey);
    }
  }

  if (args['dry-run']) {
    const parsed = await parseExcel(filePath, preferredSheetName, args['header-row']);
    const summary = buildSummary(parsed.headers, parsed.data);
    console.log(JSON.stringify({
      mode: 'dry-run',
      filePath,
      dbPath,
      sheetName: parsed.sheetName,
      headerRow: parsed.headerRow,
      rows: parsed.data.length,
      headers: parsed.headers.length,
      summary: {
        totalRevenue: summary.totalRevenue,
        totalPurchase: summary.totalPurchase,
        totalProfit: summary.totalProfit,
        yearly: summary.yearly.length,
        detected: summary.detected,
      },
      headersPreview: parsed.headers,
    }, null, 2));
    return;
  }

  if (args['summary-only']) {
    supabase = supabase || createSupabaseClient();
    currentMeta = currentMeta || await readPerformanceMeta(supabase, requestedKey);
    const refreshed = await summarizeExcelStreaming(filePath, preferredSheetName, args['header-row'] || currentMeta?.header_row);
    const currentSnapshotId = args['snapshot-id']
      || currentMeta?.summary?.currentSnapshotId
      || currentMeta?.summary?.snapshotId
      || '';
    if (!currentSnapshotId) {
      throw new Error('--summary-only에는 currentSnapshotId가 필요합니다. --snapshot-id 옵션을 지정하세요.');
    }
    refreshed.summary.currentSnapshotId = currentSnapshotId;
    refreshed.summary.currentSelectionMode = 'summary.currentSnapshotId';
    refreshed.summary.importMode = currentMeta?.summary?.importMode === 'snapshot-replace-recovered'
      ? 'snapshot-replace-recovered'
      : 'summary-refresh';
    if (currentMeta?.summary?.recoveredSnapshotId) {
      refreshed.summary.recoveredSnapshotId = currentMeta.summary.recoveredSnapshotId;
    }

    const { error: summaryError } = await supabase.from('branch_performance_files').upsert({
      branch_id: requestedKey.branchId,
      dataset_type: requestedKey.datasetType,
      file_path: requestedKey.filePath,
      sheet_name: refreshed.sheetName,
      header_row: refreshed.headerRow,
      headers: refreshed.headers,
      row_count: refreshed.rowCount,
      current_row_count: refreshed.rowCount,
      summary: refreshed.summary,
      file_modified_at: fileModifiedAt,
      synced_at: nowIso,
    }, {
      onConflict: 'branch_id,dataset_type,file_path,sheet_name',
    });
    if (summaryError) throw new Error(summaryError.message);

    console.log(JSON.stringify({
      ok: true,
      mode: 'summary-only',
      filePath,
      dbPath,
      sheetName: refreshed.sheetName,
      headerRow: refreshed.headerRow,
      rowCount: refreshed.rowCount,
      currentSnapshotId,
      yearly: refreshed.summary.yearly?.length || 0,
      monthly: refreshed.summary.monthly?.length || 0,
      breakdowns: refreshed.summary.breakdowns?.length || 0,
    }, null, 2));
    return;
  }

  if (!args['confirm-large-import']) {
    throw new Error('실제 주입은 안전을 위해 --confirm-large-import 옵션이 필요합니다.');
  }

  supabase = supabase || createSupabaseClient();
  const importer = args['diff-current'] ? importExcelStreaming : importExcelSnapshotStreaming;
  const result = await importer({
    filePath,
    preferredSheetName,
    headerRow: args['header-row'],
    supabase,
    key: requestedKey,
    chunkSize,
    fileModifiedAt,
    nowIso,
    currentMeta,
  });

  let retirePreviousResult = {
    status: 'not_requested',
    supersededCount: result.supersededCount || 0,
  };

  const { error: metaError } = await supabase.from('branch_performance_files').upsert({
    branch_id: requestedKey.branchId,
    dataset_type: requestedKey.datasetType,
    file_path: requestedKey.filePath,
    sheet_name: result.sheetName,
    header_row: result.headerRow,
    headers: result.headers,
    row_count: result.rowCount,
    current_row_count: result.rowCount,
    summary: result.summary,
    file_modified_at: fileModifiedAt,
    synced_at: nowIso,
  }, {
    onConflict: 'branch_id,dataset_type,file_path,sheet_name',
  });
  if (metaError) throw new Error(metaError.message);

  if (args['retire-previous-current'] && result.previousSnapshotId && result.previousCurrentCount) {
    retirePreviousResult = await retirePreviousCurrentSnapshot({
      supabase,
      key: requestedKey,
      previousSnapshotId: result.previousSnapshotId,
      previousCurrentCount: result.previousCurrentCount,
      currentSnapshotId: result.snapshotId,
      nowIso,
      chunkSize,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    mode: result.mode,
    insertedCount: result.insertedCount,
    activatedCount: result.activatedCount || 0,
    unchangedCount: result.unchangedCount,
    supersededCount: retirePreviousResult.supersededCount || result.supersededCount,
    retirePreviousStatus: retirePreviousResult.status,
    removedCount: result.removedCount,
    duplicateCount: result.duplicateCount,
    totalRows: result.rowCount,
    snapshotId: result.snapshotId,
  }, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
