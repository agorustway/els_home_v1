import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  ASAN_DISPATCH_WEB_CELL_FIELDS,
  normalizeDispatchWebCellFieldKey,
  normalizeDispatchWebCellValue,
} from '../utils/asanDispatchWebCellFields.mjs';
import {
  createDispatchRowMetaBuilder,
  shouldIncludeDispatchRow,
} from '../utils/asanDispatchWebCells.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '..');

dotenv.config({ path: path.join(webRoot, '.env.local') });
dotenv.config({ path: path.join(webRoot, '.env') });

const BRANCH_ID = 'asan';
const ACTOR = 'asan-dispatch-web-cell-cutover';
const BATCH_SIZE = 400;
const force = process.argv.includes('--force');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAllDispatchRecords() {
  const all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('branch_dispatch')
      .select('*')
      .eq('branch_id', BRANCH_ID)
      .in('type', ['glovis', 'mobis'])
      .order('target_date', { ascending: true })
      .range(from, to);

    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

function buildCutoverCells(records = []) {
  const cells = [];

  for (const record of records) {
    const headers = record.headers || [];
    const webColumns = headers
      .map((header, idx) => ({ idx, fieldKey: normalizeDispatchWebCellFieldKey(header) }))
      .filter((item) => item.fieldKey);

    if (webColumns.length === 0) continue;

    const buildMeta = createDispatchRowMetaBuilder({
      branchId: BRANCH_ID,
      dispatchType: record.type,
      targetDate: record.target_date,
      headers,
    });

    (record.data || []).forEach((row, rowIndex) => {
      if (!shouldIncludeDispatchRow(headers, row, record.type)) return;
      const meta = buildMeta(row, rowIndex);

      for (const column of webColumns) {
        if (column.fieldKey === ASAN_DISPATCH_WEB_CELL_FIELDS.NOTE) continue;
        const value = normalizeDispatchWebCellValue(row[column.idx]);
        if (!value) continue;
        cells.push({
          branch_id: BRANCH_ID,
          dispatch_type: record.type,
          target_date: record.target_date,
          row_signature: meta.rowSignature,
          row_index: rowIndex,
          field_key: column.fieldKey,
          value,
          source: 'cutover',
          row_context: meta.rowContext,
          created_by: ACTOR,
          updated_by: ACTOR,
        });
      }
    });
  }

  return cells;
}

async function insertBatches(table, rows, options = {}) {
  const inserted = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const query = options.upsert
      ? supabase.from(table).upsert(batch, options.upsert)
      : supabase.from(table).insert(batch);
    const { data, error } = await query.select('*');
    if (error) throw error;
    inserted.push(...(data || []));
    console.log(`${table}: ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`);
  }
  return inserted;
}

async function main() {
  const { data: settings, error: settingsError } = await supabase
    .from('branch_dispatch_web_column_settings')
    .select('*')
    .eq('branch_id', BRANCH_ID)
    .maybeSingle();

  if (settingsError) throw settingsError;
  if (settings?.enabled && !force) {
    console.log('이미 WEB 전용 컬럼 모드가 활성화되어 있어 중단합니다. 다시 실행하려면 --force를 붙이세요.');
    return;
  }

  const records = await fetchAllDispatchRecords();
  const cells = buildCutoverCells(records);
  console.log(`branch_dispatch 레코드 ${records.length}개, 컷오버 셀 ${cells.length}개를 준비했습니다.`);

  const insertedCells = await insertBatches('branch_dispatch_web_cells', cells, {
    upsert: {
      onConflict: 'branch_id,dispatch_type,target_date,row_signature,field_key',
      ignoreDuplicates: true,
    },
  });

  const historyRows = insertedCells.map((cell) => ({
    cell_id: cell.id,
    branch_id: cell.branch_id,
    dispatch_type: cell.dispatch_type,
    target_date: cell.target_date,
    row_signature: cell.row_signature,
    row_index: cell.row_index,
    field_key: cell.field_key,
    old_value: '',
    new_value: cell.value,
    action: 'cutover',
    row_context: cell.row_context || {},
    changed_by: ACTOR,
  }));

  if (historyRows.length > 0) {
    await insertBatches('branch_dispatch_web_cell_history', historyRows);
  }

  const { error: enableError } = await supabase
    .from('branch_dispatch_web_column_settings')
    .upsert({
      branch_id: BRANCH_ID,
      enabled: true,
      effective_at: new Date().toISOString(),
      updated_by: ACTOR,
    }, { onConflict: 'branch_id' });

  if (enableError) throw enableError;
  console.log(`컷오버 완료: 신규 저장 셀 ${insertedCells.length}개, 이력 ${historyRows.length}개. 이제 WEB 값이 우선입니다.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
