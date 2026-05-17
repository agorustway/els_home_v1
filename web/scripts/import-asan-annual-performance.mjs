import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';

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
    if (key === 'dry-run' || key === 'help' || key === 'confirm-large-import') {
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
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
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

async function parseExcel(filePath, sheetName = DEFAULT_SHEET_NAME, headerRow = null) {
  const { actualSheet, targetSheetNo } = readWorkbookSheetNames(filePath, sheetName || DEFAULT_SHEET_NAME);
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
  });
  workbookReader.model = { sheets: [] };

  const warmupRows = [];
  const rows = [];
  let headers = [];
  let headerIdx = null;
  let lastCol = null;
  let foundSheet = false;
  let rawRowCount = 0;

  const finishWarmup = () => {
    if (headerIdx != null) return;
    if (!warmupRows.length) {
      headerIdx = 0;
      lastCol = 0;
      headers = [];
      return;
    }

    headerIdx = detectHeaderIndex(warmupRows, headerRow);
    lastCol = detectLastCol(warmupRows, headerIdx);
    headers = cleanHeaders((warmupRows[headerIdx] || []).slice(0, lastCol + 1));
    for (let rowIdx = headerIdx + 1; rowIdx < warmupRows.length; rowIdx += 1) {
      const rawRow = warmupRows[rowIdx] || [];
      const row = [];
      for (let colIdx = 0; colIdx <= lastCol; colIdx += 1) row.push(cleanCell(rawRow[colIdx]));
      if (row.some(Boolean)) rows.push(row);
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
        finishWarmup();
        continue;
      }

      const parsedRow = [];
      for (let colIdx = 0; colIdx <= lastCol; colIdx += 1) parsedRow.push(cleanCell(rawValues[colIdx]));
      if (parsedRow.some(Boolean)) rows.push(parsedRow);
      if (rows.length > 0 && rows.length % 1000 === 0) {
        console.error(`[annual-performance-import] parsed rows=${rows.length}`);
      }
    }
  }

  if (!foundSheet) throw new Error(`Excel sheet를 찾을 수 없습니다: ${actualSheet}`);
  finishWarmup();

  return {
    headers,
    data: rows,
    sheetName: actualSheet,
    headerRow: (headerIdx || 0) + 1,
    rawRowCount,
  };
}

function numericColumnIndices(headers, rows) {
  const sampleRows = rows.slice(0, 2000);
  const total = Math.max(1, sampleRows.length);
  const excluded = ['년', '연도', '월', '일자', '날짜', '번호', '코드', '사업자', '전화', '차량'];
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

function buildSummary(headers, rows) {
  const analysisRows = rows.filter(row => !isTotalRow(row));
  const numericCols = numericColumnIndices(headers, analysisRows);
  const salesWords = ['매출', '청구', '수입', '운송수입', '공급가', '운임'];
  const purchaseWords = ['매입', '원가', '비용', '지급', '외주', '운송비', '정산'];
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

  const yearly = new Map();
  const monthly = new Map();
  const groups = new Map();
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
    detected: {
      numericColumns: numericCols.map(idx => headers[idx]),
      revenueColumns: revenueCols.map(idx => headers[idx]),
      purchaseColumns: purchaseCols.map(idx => headers[idx]),
      profitColumns: profitCols.map(idx => headers[idx]),
      groupColumns: groupCandidates.map(idx => headers[idx]),
    },
  };
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

function rowIndexFilter(query, key) {
  return query
    .eq('branch_id', key.branchId)
    .eq('dataset_type', key.datasetType)
    .eq('file_path', key.filePath)
    .eq('sheet_name', key.sheetName)
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

function buildRowPayload({ headers, row, rowIndex, hash, key, snapshotId, fileModifiedAt, nowIso }) {
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
    is_current: true,
    change_status: 'current',
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
  const parsed = await parseExcel(filePath, preferredSheetName, args['header-row']);
  const summary = buildSummary(parsed.headers, parsed.data);
  const fileStat = fs.statSync(filePath);
  const fileModifiedAt = fileStat.mtime.toISOString();
  const nowIso = new Date().toISOString();

  const key = {
    branchId: 'asan',
    datasetType: 'annual',
    filePath: dbPath,
    sheetName: parsed.sheetName,
  };

  console.log(JSON.stringify({
    mode: args['dry-run'] ? 'dry-run' : 'import',
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

  if (args['dry-run']) return;
  if (parsed.data.length > 100000 && !args['confirm-large-import']) {
    throw new Error(`대용량 주입 보호: ${parsed.data.length}행입니다. dry-run 결과를 확인한 뒤 --confirm-large-import 옵션을 붙여 다시 실행하세요.`);
  }

  const supabase = createSupabaseClient();
  const currentRows = await readCurrentRows(supabase, key);
  const snapshotId = uuidV4();
  const newHashByIndex = new Map();
  const insertRowIndexes = [];
  const rowHashes = new Map();
  const changedIndices = [];
  const removedIndices = [];
  const duplicateIds = [];
  let unchangedCount = 0;

  for (let rowIndex = 0; rowIndex < parsed.data.length; rowIndex += 1) {
    const row = parsed.data[rowIndex];
    const hash = rowHash(parsed.headers, row);
    newHashByIndex.set(rowIndex, hash);
    rowHashes.set(rowIndex, hash);

    const current = currentRows.get(rowIndex) || [];
    const matchingIdx = current.findIndex(item => item.hash === hash);
    if (matchingIdx >= 0) {
      unchangedCount += 1;
      current.forEach((item, idx) => {
        if (idx !== matchingIdx) duplicateIds.push(item.id);
      });
      continue;
    }
    if (current.length) changedIndices.push(rowIndex);
    insertRowIndexes.push(rowIndex);
  }

  for (const rowIndex of currentRows.keys()) {
    if (!newHashByIndex.has(rowIndex)) removedIndices.push(rowIndex);
  }

  const basePatch = {
    is_current: false,
    replaced_at: nowIso,
    last_seen_at: nowIso,
  };

  const duplicateCount = duplicateIds.length
    ? await updateRowsWithRetry({
      supabase,
      table: 'branch_performance_rows',
      patch: { ...basePatch, change_status: 'duplicate_current_retired' },
      filter: query => query.eq('is_current', true),
      values: duplicateIds,
      column: 'id',
      chunkSize,
    })
    : 0;

  const supersededCount = changedIndices.length
    ? await updateRowsWithRetry({
      supabase,
      table: 'branch_performance_rows',
      patch: { ...basePatch, change_status: 'superseded_by_excel' },
      filter: query => rowIndexFilter(query, key),
      values: changedIndices,
      column: 'row_index',
      chunkSize,
    })
    : 0;

  const removedCount = removedIndices.length
    ? await updateRowsWithRetry({
      supabase,
      table: 'branch_performance_rows',
      patch: { ...basePatch, change_status: 'removed_from_excel' },
      filter: query => rowIndexFilter(query, key),
      values: removedIndices,
      column: 'row_index',
      chunkSize,
    })
    : 0;

  let insertedCount = 0;
  let insertBatch = [];
  for (const rowIndex of insertRowIndexes) {
    const row = parsed.data[rowIndex];
    insertBatch.push(buildRowPayload({
      headers: parsed.headers,
      row,
      rowIndex,
      hash: rowHashes.get(rowIndex),
      key,
      snapshotId,
      fileModifiedAt,
      nowIso,
    }));
    if (insertBatch.length >= chunkSize) {
      insertedCount += await insertRowsWithRetry({ supabase, rows: insertBatch, chunkSize });
      insertBatch = [];
      if (insertedCount > 0 && insertedCount % 10000 === 0) {
        console.error(`[annual-performance-import] inserted rows=${insertedCount}`);
      }
    }
  }
  if (insertBatch.length) {
    insertedCount += await insertRowsWithRetry({ supabase, rows: insertBatch, chunkSize });
  }

  const { error: metaError } = await supabase.from('branch_performance_files').upsert({
    branch_id: key.branchId,
    dataset_type: key.datasetType,
    file_path: key.filePath,
    sheet_name: key.sheetName,
    header_row: parsed.headerRow,
    headers: parsed.headers,
    row_count: parsed.data.length,
    current_row_count: parsed.data.length,
    summary,
    file_modified_at: fileModifiedAt,
    synced_at: nowIso,
  }, {
    onConflict: 'branch_id,dataset_type,file_path,sheet_name',
  });
  if (metaError) throw new Error(metaError.message);

  console.log(JSON.stringify({
    ok: true,
    insertedCount,
    unchangedCount,
    supersededCount,
    removedCount,
    duplicateCount,
    totalRows: parsed.data.length,
    snapshotId,
  }, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
