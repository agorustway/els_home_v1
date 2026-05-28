import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import { getNasClient } from '@/lib/nas';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import {
  buildGlapsAliasDuplicateGroupKey,
  buildGlapsRouteDuplicateGroupKey,
} from '@/utils/glapsDuplicateGroups.mjs';
import {
  DEFAULT_GLAPS_BRANCH_ID,
  buildGlapsRouteFingerprint,
  getGlapsRouteReviewStatus,
  getGlapsRouteMatchQuery,
  normalizeGlapsAliasType,
  parseGlapsAliasTemplateSheets,
  parseGlapsMasterSheets,
  parseGlapsRouteTemplateSheets,
  splitGlapsAliasValues,
  summarizeGlapsRoutes,
} from '@/utils/glapsMasterData.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_GLAPS_MASTER_PATH = '/아산지점/A_운송실무/GLAPS_마스터코드.xlsx';
const PAGE_SIZE = 1000;
const GLAPS_ALIAS_TYPES = new Set(['start', 'waypoint', 'destination', 'port', 'line', 'container_type', 'carrier', 'consignee', 'generic']);
const GLAPS_REVIEW_STATUSES = new Set(['ready', 'needs_mapping', 'missing_route_code']);
const GLAPS_LOOKUP_ALIAS_TYPES = Object.freeze(['port', 'line', 'container_type', 'carrier', 'consignee']);
const GLAPS_LOOKUP_SHEET_NAMES = Object.freeze(['컨테이너규격', '수출입코드']);

function isMissingGlapsTableError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '').toLowerCase();
  const isGlapsObject = /glaps_(master_versions|transport_routes|master_aliases|master_sheet_rows)/.test(message);
  if (['42P01', '42703', 'PGRST205', 'PGRST204'].includes(code)) return isGlapsObject || message.includes('schema cache');
  return isGlapsObject && (message.includes('does not exist') || message.includes('schema cache'));
}

function isDuplicateConstraintError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key') || message.includes('unique constraint');
}

function isLegacyAliasSourceConstraintError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return isDuplicateConstraintError(error)
    && message.includes('glaps_master_aliases')
    && message.includes('alias_type_source');
}

function jsonError(message, status = 500, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function cleanText(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function duplicateKeyPart(value) {
  return cleanText(value).replace(/\s+/g, ' ').toUpperCase();
}

function aliasExactDuplicateKey(row = {}) {
  return [
    row.alias_type,
    row.source_name,
    row.route_code,
    row.glaps_code,
  ].map(duplicateKeyPart).join('|');
}

function summarizeDuplicateRows(rows = [], formatter = row => row.id) {
  return rows.slice(0, 5).map(formatter).filter(Boolean);
}

function duplicateJsonError(message, duplicates = []) {
  return jsonError(message, 409, {
    duplicate: true,
    duplicates,
  });
}

function normalizeReviewStatus(value, fallback = 'needs_mapping') {
  const text = cleanText(value).replace(/\s+/g, ' ').toLowerCase();
  if (GLAPS_REVIEW_STATUSES.has(text)) return text;
  if (['확정', '정상'].includes(text)) return 'ready';
  if (['코드없음', '코드 없음'].includes(text)) return 'missing_route_code';
  if (['조정필요', '조정 필요', '확인필요', '확인 필요'].includes(text)) return 'needs_mapping';
  return fallback;
}

function buildEditActor(editSource, userEmail) {
  return `${editSource || 'unknown'}:${userEmail || 'system'}`;
}

function editActorSource(value = '') {
  return cleanText(value).split(':')[0];
}

function isWebEditedRow(row = {}) {
  return editActorSource(row.updated_by) === 'web';
}

function routeProtectionKey(row = {}) {
  const routeCode = cleanText(row.route_code ?? row.routeCode);
  if (routeCode) return `code:${routeCode}`;
  const fingerprint = cleanText(row.route_fingerprint ?? row.routeFingerprint);
  if (fingerprint) return `fingerprint:${fingerprint}`;
  return '';
}

function aliasProtectionKey(row = {}) {
  const aliasType = cleanText(row.alias_type ?? row.aliasType);
  const sourceName = cleanText(row.source_name ?? row.sourceName);
  const routeCode = cleanText(row.route_code ?? row.routeCode);
  const fallback = cleanText(row.glaps_code ?? row.glapsCode ?? row.glaps_name ?? row.glapsName ?? row.els_name ?? row.elsName);
  if (!aliasType) return '';
  return [aliasType, sourceName || fallback, routeCode].map(cleanText).join('|');
}

function directRouteFromPayload(row = {}) {
  const route = {
    id: cleanText(row.id),
    routeCode: cleanText(row.routeCode ?? row.route_code),
    routeName: cleanText(row.routeName ?? row.route_name),
    startLocationName: cleanText(row.startLocationName ?? row.start_location_name),
    waypointName: cleanText(row.waypointName ?? row.waypoint_name),
    waypointElsName: cleanText(row.waypointElsName ?? row.waypoint_els_name),
    destinationName: cleanText(row.destinationName ?? row.destination_name),
    reviewNote: cleanText(row.reviewNote ?? row.review_note),
    sourceSheet: cleanText(row.sourceSheet ?? row.source_sheet) || 'WEB',
    sourceRowNumber: Number(row.sourceRowNumber ?? row.source_row_number) || null,
    rawPayload: {
      ...(row.rawPayload || row.raw_payload || {}),
      edit_source: 'web',
    },
  };
  route.routeFingerprint = buildGlapsRouteFingerprint(route);
  route.reviewStatus = normalizeReviewStatus(row.reviewStatus ?? row.review_status, getGlapsRouteReviewStatus(route));
  return route;
}

function directAliasFromPayload(row = {}) {
  const aliasType = normalizeGlapsAliasType(row.aliasType ?? row.alias_type, 'waypoint');
  const alias = {
    id: cleanText(row.id),
    aliasType,
    sourceName: cleanText(row.sourceName ?? row.source_name),
    elsName: cleanText(row.elsName ?? row.els_name),
    glapsName: cleanText(row.glapsName ?? row.glaps_name),
    glapsCode: cleanText(row.glapsCode ?? row.glaps_code),
    routeCode: cleanText(row.routeCode ?? row.route_code),
    reviewNote: cleanText(row.reviewNote ?? row.review_note),
  };
  alias.reviewStatus = normalizeReviewStatus(row.reviewStatus ?? row.review_status, alias.elsName || alias.glapsCode ? 'ready' : 'needs_mapping');
  return alias;
}

async function requireGlapsUser({ write = false } = {}) {
  const sessionSupabase = await createClient();
  const { data: { user } } = await sessionSupabase.auth.getUser();
  if (!user) return { error: jsonError('Unauthorized', 401) };

  const { data: roleData } = await sessionSupabase
    .from('user_roles')
    .select('role, can_write')
    .eq('id', user.id)
    .single();

  if (write && roleData?.role !== 'admin' && !roleData?.can_write) {
    return { error: jsonError('쓰기 권한이 필요합니다.', 403) };
  }

  return {
    user,
    roleData,
    adminSupabase: await createAdminClient(),
  };
}

function cellToText(cell) {
  const value = cell?.value;
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value.result != null) return String(value.result).trim();
    if (value.text != null) return String(value.text).trim();
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('').trim();
    if (value.hyperlink && value.text) return String(value.text).trim();
  }
  return String(value).trim();
}

function workbookToPlainSheets(workbook) {
  return workbook.worksheets.map((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values[colNumber - 1] = cellToText(cell);
      });
      rows.push(values);
    });
    return { name: sheet.name, rows };
  });
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function loadWorkbookBufferFromForm(formData) {
  const source = String(formData.get('source') || 'upload');
  if (source === 'nas') {
    const path = String(formData.get('path') || DEFAULT_GLAPS_MASTER_PATH);
    const stream = await getNasClient().createReadStream(path);
    const buffer = await streamToBuffer(stream);
    return { buffer, sourceName: path };
  }

  const file = formData.get('file');
  if (!file || !file.name) throw new Error('업로드 파일이 없습니다.');
  const arrayBuffer = await file.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), sourceName: file.name };
}

async function loadPlainSheetsFromForm(formData) {
  const { buffer, sourceName } = await loadWorkbookBufferFromForm(formData);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return {
    sourceName,
    sourceHash: crypto.createHash('sha256').update(buffer).digest('hex'),
    sheets: workbookToPlainSheets(workbook),
  };
}

function toRouteDbRow(route, { branchId, versionId, userEmail }) {
  return {
    branch_id: branchId,
    version_id: versionId,
    route_code: cleanText(route.routeCode),
    route_name: cleanText(route.routeName),
    start_location_name: cleanText(route.startLocationName),
    waypoint_name: cleanText(route.waypointName),
    waypoint_els_name: cleanText(route.waypointElsName),
    destination_name: cleanText(route.destinationName),
    route_fingerprint: cleanText(route.routeFingerprint),
    review_status: normalizeReviewStatus(route.reviewStatus, 'needs_mapping'),
    review_note: cleanText(route.reviewNote),
    source_sheet: cleanText(route.sourceSheet),
    source_row_number: route.sourceRowNumber || null,
    raw_payload: route.rawPayload || {},
    active: true,
    updated_by: userEmail,
  };
}

function toAliasDbRow(alias, { branchId, versionId, userEmail }) {
  const aliasType = normalizeGlapsAliasType(alias.aliasType, 'waypoint');
  return {
    branch_id: branchId,
    version_id: versionId,
    alias_type: GLAPS_ALIAS_TYPES.has(aliasType) ? aliasType : 'waypoint',
    source_name: cleanText(alias.sourceName),
    els_name: cleanText(alias.elsName),
    glaps_name: cleanText(alias.glapsName),
    glaps_code: cleanText(alias.glapsCode),
    route_code: cleanText(alias.routeCode),
    review_status: normalizeReviewStatus(alias.reviewStatus, 'needs_mapping'),
    review_note: cleanText(alias.reviewNote),
    active: true,
    updated_by: userEmail,
  };
}

function toSheetRowDbRow(sheetRow, { branchId, versionId }) {
  return {
    branch_id: branchId,
    version_id: versionId,
    sheet_name: sheetRow.sheetName || '',
    row_number: sheetRow.rowNumber || 0,
    header_row: Boolean(sheetRow.headerRow),
    row_values: sheetRow.rowValues || [],
    row_payload: sheetRow.rowPayload || {},
  };
}

function routeDbRowFromExisting(row = {}, { branchId, versionId }) {
  return {
    branch_id: branchId,
    version_id: versionId,
    route_code: cleanText(row.route_code),
    route_name: cleanText(row.route_name),
    start_location_name: cleanText(row.start_location_name),
    waypoint_name: cleanText(row.waypoint_name),
    waypoint_els_name: cleanText(row.waypoint_els_name),
    destination_name: cleanText(row.destination_name),
    route_fingerprint: cleanText(row.route_fingerprint),
    review_status: normalizeReviewStatus(row.review_status, 'needs_mapping'),
    review_note: cleanText(row.review_note),
    source_sheet: cleanText(row.source_sheet) || 'WEB',
    source_row_number: row.source_row_number || null,
    raw_payload: {
      ...(row.raw_payload || {}),
      web_protected_from_version: row.version_id || '',
      web_protected_from_id: row.id || '',
    },
    active: true,
    updated_by: row.updated_by,
  };
}

function aliasDbRowFromExisting(row = {}, { branchId, versionId }) {
  return {
    branch_id: branchId,
    version_id: versionId,
    alias_type: GLAPS_ALIAS_TYPES.has(cleanText(row.alias_type)) ? cleanText(row.alias_type) : 'generic',
    source_name: cleanText(row.source_name),
    els_name: cleanText(row.els_name),
    glaps_name: cleanText(row.glaps_name),
    glaps_code: cleanText(row.glaps_code),
    route_code: cleanText(row.route_code),
    review_status: normalizeReviewStatus(row.review_status, 'needs_mapping'),
    review_note: cleanText(row.review_note),
    active: true,
    updated_by: row.updated_by,
  };
}

async function getActiveVersion(adminSupabase, branchId) {
  const { data, error } = await adminSupabase
    .from('glaps_master_versions')
    .select('*')
    .eq('branch_id', branchId)
    .eq('active', true)
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function fetchPagedGlapsRows(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function refreshVersionCounts(adminSupabase, versionId) {
  const [{ count: routeCount }, { count: aliasCount }, { count: sheetRowCount }] = await Promise.all([
    adminSupabase.from('glaps_transport_routes').select('id', { count: 'exact', head: true }).eq('version_id', versionId).eq('active', true),
    adminSupabase.from('glaps_master_aliases').select('id', { count: 'exact', head: true }).eq('version_id', versionId).eq('active', true),
    adminSupabase.from('glaps_master_sheet_rows').select('id', { count: 'exact', head: true }).eq('version_id', versionId),
  ]);
  await adminSupabase
    .from('glaps_master_versions')
    .update({ route_count: routeCount || 0, alias_count: aliasCount || 0, sheet_row_count: sheetRowCount || 0 })
    .eq('id', versionId);
}

async function rememberGlapsUploadResult(adminSupabase, version = {}, uploadLog = {}) {
  if (!version?.id) return;
  const metadata = {
    ...(version.metadata || {}),
    lastUploadResult: {
      ...uploadLog,
      recordedAt: new Date().toISOString(),
    },
  };
  const { error } = await adminSupabase
    .from('glaps_master_versions')
    .update({ metadata })
    .eq('id', version.id);
  if (error) throw error;
}

function buildSheetSummary(rows = []) {
  const summaryMap = new Map();
  rows.forEach((row) => {
    const sheetName = row.sheet_name || '';
    if (!summaryMap.has(sheetName)) {
      summaryMap.set(sheetName, { sheetName, rowCount: 0, headerRows: 0 });
    }
    const item = summaryMap.get(sheetName);
    item.rowCount += 1;
    if (row.header_row) item.headerRows += 1;
  });
  return [...summaryMap.values()];
}

function withTemplateRoutePayload(row = {}, editSource = 'template_upload') {
  const rawPayload = {
    ...(row.rawPayload || {}),
    edit_source: editSource,
  };
  if (row.sourceSheet) rawPayload.template_sheet = row.sourceSheet;
  if (row.sourceRowNumber) rawPayload.template_row_number = row.sourceRowNumber;
  return { ...row, rawPayload };
}

async function fetchRowsByIds(adminSupabase, tableName, versionId, ids = []) {
  const uniqueIds = [...new Set(ids.map(cleanText).filter(Boolean))];
  const rows = [];
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    const { data, error } = await adminSupabase
      .from(tableName)
      .select('*')
      .eq('version_id', versionId)
      .in('id', chunk);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return new Map(rows.map(row => [cleanText(row.id), row]));
}

async function fetchWebProtectedRows(adminSupabase, tableName, versionId) {
  const { data, error } = await adminSupabase
    .from(tableName)
    .select('*')
    .eq('version_id', versionId)
    .eq('active', true)
    .like('updated_by', 'web:%');
  if (error) throw error;
  return data || [];
}

function applyWebProtectedMasterRows(baseRows = [], protectedRows = [], { branchId, versionId, kind }) {
  const keyFn = kind === 'routes' ? routeProtectionKey : aliasProtectionKey;
  const copyFn = kind === 'routes' ? routeDbRowFromExisting : aliasDbRowFromExisting;
  const rows = [...baseRows];
  const indexByKey = new Map();
  rows.forEach((row, index) => {
    const key = keyFn(row);
    if (key && !indexByKey.has(key)) indexByKey.set(key, index);
  });

  let overlaid = 0;
  let appended = 0;
  protectedRows.forEach((row) => {
    const key = keyFn(row);
    const protectedRow = copyFn(row, { branchId, versionId });
    if (key && indexByKey.has(key)) {
      rows[indexByKey.get(key)] = protectedRow;
      overlaid += 1;
      return;
    }
    rows.push(protectedRow);
    if (key) indexByKey.set(key, rows.length - 1);
    appended += 1;
  });

  return {
    rows,
    preserved: protectedRows.length,
    overlaid,
    appended,
  };
}

function webProtectionSummary(result = {}) {
  return {
    preserved: result.preserved || 0,
    overlaid: result.overlaid || 0,
    appended: result.appended || 0,
  };
}

function dedupeRowsByInsertKey(rows = [], keyFn) {
  const seen = new Set();
  const deduped = [];
  let skipped = 0;
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!key) {
      deduped.push(row);
      return;
    }
    if (seen.has(key)) {
      skipped += 1;
      return;
    }
    seen.add(key);
    deduped.push(row);
  });
  return { rows: deduped, skipped };
}

function routeInsertConstraintKey(row = {}) {
  if (row.source_row_number === null || row.source_row_number === undefined) return '';
  return [
    cleanText(row.branch_id),
    cleanText(row.version_id),
    cleanText(row.route_code),
    cleanText(row.source_sheet),
    cleanText(row.source_row_number),
  ].join('|');
}

function aliasInsertConstraintKey(row = {}) {
  return [
    cleanText(row.branch_id),
    cleanText(row.version_id),
    cleanText(row.alias_type),
    cleanText(row.source_name),
    cleanText(row.route_code),
    cleanText(row.glaps_code),
  ].join('|');
}

function hasDbValueChanged(existing = {}, next = {}, fields = []) {
  return fields.some(([dbKey, nextKey = dbKey]) => cleanText(existing[dbKey]) !== cleanText(next[nextKey]));
}

function isRouteTemplateRowChanged(existing = {}, next = {}) {
  if (!existing?.id || existing.active === false) return true;
  return hasDbValueChanged(existing, next, [
    ['route_code'],
    ['route_name'],
    ['start_location_name'],
    ['waypoint_name'],
    ['waypoint_els_name'],
    ['destination_name'],
    ['route_fingerprint'],
    ['review_status'],
    ['review_note'],
  ]);
}

function isAliasTemplateRowChanged(existing = {}, next = {}) {
  if (!existing?.id || existing.active === false) return true;
  return hasDbValueChanged(existing, next, [
    ['alias_type'],
    ['source_name'],
    ['els_name'],
    ['glaps_name'],
    ['glaps_code'],
    ['route_code'],
    ['review_status'],
    ['review_note'],
  ]);
}

function mergeAliasUploadRows(base = {}, next = {}) {
  const baseId = cleanText(base.id);
  const nextId = cleanText(next.id);
  return {
    ...base,
    ...next,
    id: baseId || nextId || undefined,
    els_name: mergeAliasFieldValues([base.els_name, next.els_name]),
    glaps_name: mergeAliasFieldValues([base.glaps_name, next.glaps_name]),
    review_note: mergeAliasFieldValues([base.review_note, next.review_note]),
    review_status: normalizeReviewStatus(
      next.review_status || base.review_status,
      cleanText(next.glaps_code || base.glaps_code) ? 'ready' : 'needs_mapping',
    ),
  };
}

function coalesceAliasUploadRows(rows = []) {
  const byKey = new Map();
  const passthrough = [];
  let mergedDuplicateRows = 0;

  rows.forEach((row) => {
    const key = aliasInsertConstraintKey(row);
    if (!key) {
      passthrough.push(row);
      return;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      return;
    }
    byKey.set(key, mergeAliasUploadRows(existing, row));
    mergedDuplicateRows += 1;
  });

  return {
    rows: [...passthrough, ...byKey.values()],
    mergedDuplicateRows,
  };
}

async function applyRouteTemplateRows(adminSupabase, rows, { branchId, versionId, userEmail, editSource = 'template_upload' }) {
  const actor = buildEditActor(editSource, userEmail);
  const deleteIds = rows.filter(row => row.deleteFlag && row.id).map(row => cleanText(row.id)).filter(Boolean);
  const candidateRows = rows
    .filter(row => !row.deleteFlag && (row.id || row.routeCode || row.routeName))
    .map((row) => {
      const dbRow = toRouteDbRow(withTemplateRoutePayload(row, editSource), { branchId, versionId, userEmail: actor });
      return row.id ? { id: cleanText(row.id), ...dbRow } : dbRow;
    });
  const existingById = await fetchRowsByIds(
    adminSupabase,
    'glaps_transport_routes',
    versionId,
    [...deleteIds, ...candidateRows.map(row => row.id)],
  );
  const upsertRows = [];
  let unchanged = 0;
  let skippedWebProtected = 0;
  candidateRows.forEach((row) => {
    if (!row.id) {
      upsertRows.push(row);
      return;
    }
    const existing = existingById.get(cleanText(row.id));
    if (!isRouteTemplateRowChanged(existing, row)) {
      unchanged += 1;
      return;
    }
    if (isWebEditedRow(existing)) {
      skippedWebProtected += 1;
      return;
    }
    upsertRows.push(row);
  });
  const allowedDeleteIds = deleteIds.filter((id) => {
    if (isWebEditedRow(existingById.get(id))) {
      skippedWebProtected += 1;
      return false;
    }
    return true;
  });

  if (allowedDeleteIds.length > 0) {
    const { error } = await adminSupabase
      .from('glaps_transport_routes')
      .update({ active: false, updated_by: actor })
      .in('id', allowedDeleteIds);
    if (error) throw error;
  }
  if (upsertRows.length > 0) {
    const { error } = await adminSupabase.from('glaps_transport_routes').upsert(upsertRows, { onConflict: 'id' });
    if (error) throw error;
  }
  return { updated: upsertRows.length, deleted: allowedDeleteIds.length, unchanged, skippedWebProtected };
}

async function applyAliasTemplateRows(adminSupabase, rows, { branchId, versionId, userEmail, editSource = 'template_upload' }) {
  const actor = buildEditActor(editSource, userEmail);
  const deleteIds = rows.filter(row => row.deleteFlag && row.id).map(row => cleanText(row.id)).filter(Boolean);
  const candidateRows = rows
    .filter(row => !row.deleteFlag && (row.id || row.sourceName || row.elsName || row.glapsName))
    .map((row) => {
      const dbRow = toAliasDbRow(row, { branchId, versionId, userEmail: actor });
      return row.id ? { id: cleanText(row.id), ...dbRow } : dbRow;
    });
  const existingRows = await fetchPagedGlapsRows(() => adminSupabase
    .from('glaps_master_aliases')
    .select('*')
    .eq('version_id', versionId));
  const existingById = new Map(existingRows.map(row => [cleanText(row.id), row]));
  const existingByConstraintKey = new Map();
  existingRows.forEach((row) => {
    const key = aliasInsertConstraintKey(row);
    if (key && !existingByConstraintKey.has(key)) existingByConstraintKey.set(key, row);
  });
  let matchedExistingByKey = 0;
  const rowsResolvedByConstraint = candidateRows.map((row) => {
    const key = aliasInsertConstraintKey(row);
    const existingByKey = key ? existingByConstraintKey.get(key) : null;
    if (!existingByKey) return row;
    const rowId = cleanText(row.id);
    const existingId = cleanText(existingByKey.id);
    if (rowId && rowId === existingId) return row;
    matchedExistingByKey += 1;
    return mergeAliasUploadRows({ id: existingId, ...existingByKey }, row);
  });
  const coalesced = coalesceAliasUploadRows(rowsResolvedByConstraint);
  const uploadRows = coalesced.rows;
  const upsertRows = [];
  let unchanged = 0;
  let skippedWebProtected = 0;
  uploadRows.forEach((row) => {
    if (!row.id) {
      upsertRows.push(row);
      return;
    }
    const existing = existingById.get(cleanText(row.id));
    if (!isAliasTemplateRowChanged(existing, row)) {
      unchanged += 1;
      return;
    }
    if (isWebEditedRow(existing)) {
      skippedWebProtected += 1;
      return;
    }
    upsertRows.push(row);
  });
  const allowedDeleteIds = deleteIds.filter((id) => {
    if (isWebEditedRow(existingById.get(id))) {
      skippedWebProtected += 1;
      return false;
    }
    return true;
  });

  if (allowedDeleteIds.length > 0) {
    const { error } = await adminSupabase
      .from('glaps_master_aliases')
      .update({ active: false, updated_by: actor })
      .in('id', allowedDeleteIds);
    if (error) throw error;
  }
  if (upsertRows.length > 0) {
    const { error } = await adminSupabase.from('glaps_master_aliases').upsert(upsertRows, { onConflict: 'id' });
    if (error) throw error;
  }
  return {
    updated: upsertRows.length,
    deleted: allowedDeleteIds.length,
    unchanged,
    skippedWebProtected,
    matchedExistingByKey,
    mergedDuplicateRows: coalesced.mergedDuplicateRows,
  };
}

async function findRouteDirectDuplicates(adminSupabase, versionId, dbRow, id = '') {
  const connectionKey = routeMergeGroupKey(dbRow);
  if (!connectionKey) return [];

  let query = adminSupabase
    .from('glaps_transport_routes')
    .select('id, route_code, route_name, start_location_name, waypoint_name, waypoint_els_name, destination_name, route_fingerprint')
    .eq('version_id', versionId)
    .eq('active', true);
  if (id) query = query.neq('id', id);
  const { data, error } = await query;
  if (error) throw error;

  return (data || []).filter(row => routeMergeGroupKey(row) === connectionKey);
}

async function findAliasDirectDuplicates(adminSupabase, versionId, dbRow, id = '') {
  const exactKey = aliasExactDuplicateKey(dbRow);
  if (!duplicateKeyPart(dbRow.alias_type) || !duplicateKeyPart(dbRow.source_name)) return [];

  let query = adminSupabase
    .from('glaps_master_aliases')
    .select('id, alias_type, source_name, els_name, glaps_name, glaps_code, route_code')
    .eq('version_id', versionId)
    .eq('active', true)
    .eq('alias_type', dbRow.alias_type)
    .eq('source_name', dbRow.source_name)
    .eq('route_code', dbRow.route_code || '');
  if (id) query = query.neq('id', id);
  const { data, error } = await query;
  if (error) throw error;

  return (data || []).filter(row => aliasExactDuplicateKey(row) === exactKey);
}

function aliasMergeGroupKey(row = {}) {
  return buildGlapsAliasDuplicateGroupKey(row);
}

function routeMergeGroupKey(row = {}) {
  return buildGlapsRouteDuplicateGroupKey(row);
}

function mergeAliasFieldValues(values = []) {
  const seen = new Set();
  const merged = [];
  values.flatMap(splitGlapsAliasValues).forEach((value) => {
    const key = duplicateKeyPart(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(cleanText(value));
  });
  return merged.join(', ');
}

function aliasMergeSortScore(row = {}) {
  return [
    isWebEditedRow(row) ? '0' : '1',
    cleanText(row.alias_type) === 'generic' ? '1' : '0',
    cleanText(row.created_at),
    cleanText(row.id),
  ].join('|');
}

function routeMergeSortScore(row = {}) {
  return [
    isWebEditedRow(row) ? '0' : '1',
    cleanText(row.created_at),
    cleanText(row.id),
  ].join('|');
}

function buildMergedAliasRow(group = [], actor) {
  const sorted = [...group].sort((a, b) => aliasMergeSortScore(a).localeCompare(aliasMergeSortScore(b)));
  const mergedSourceName = mergeAliasFieldValues(sorted.map(row => row.source_name));
  const survivor = sorted.find(row => cleanText(row.source_name) === mergedSourceName) || sorted[0];
  const loserIds = sorted.map(row => cleanText(row.id)).filter(id => id && id !== cleanText(survivor.id));
  return {
    survivor,
    loserIds,
    update: {
      source_name: mergedSourceName,
      els_name: mergeAliasFieldValues(sorted.map(row => row.els_name)),
      glaps_name: mergeAliasFieldValues(sorted.map(row => row.glaps_name)),
      glaps_code: cleanText(survivor.glaps_code),
      route_code: mergeAliasFieldValues(sorted.map(row => row.route_code)),
      review_status: cleanText(survivor.glaps_code) ? 'ready' : normalizeReviewStatus(survivor.review_status, 'needs_mapping'),
      review_note: mergeAliasFieldValues(sorted.map(row => row.review_note)),
      active: true,
      updated_by: actor,
    },
  };
}

function buildMergedRouteRow(group = [], actor) {
  const sorted = [...group].sort((a, b) => routeMergeSortScore(a).localeCompare(routeMergeSortScore(b)));
  const survivor = sorted[0];
  const loserIds = sorted.map(row => cleanText(row.id)).filter(id => id && id !== cleanText(survivor.id));
  const mergedRouteCode = mergeAliasFieldValues(sorted.map(row => row.route_code));
  return {
    survivor,
    loserIds,
    update: {
      route_code: mergedRouteCode,
      route_name: mergeAliasFieldValues(sorted.map(row => row.route_name)),
      start_location_name: cleanText(survivor.start_location_name),
      waypoint_name: mergeAliasFieldValues(sorted.map(row => row.waypoint_name)),
      waypoint_els_name: mergeAliasFieldValues(sorted.map(row => row.waypoint_els_name || row.waypoint_name)),
      destination_name: cleanText(survivor.destination_name),
      route_fingerprint: cleanText(survivor.route_fingerprint),
      review_status: mergedRouteCode ? 'ready' : normalizeReviewStatus(survivor.review_status, 'needs_mapping'),
      review_note: mergeAliasFieldValues(sorted.map(row => row.review_note)),
      active: true,
      updated_by: actor,
    },
  };
}

async function mergeRouteRowsByConnectionKey(adminSupabase, { version, ids = [], userEmail }) {
  const actor = buildEditActor('web', userEmail);
  const selectedIds = new Set((Array.isArray(ids) ? ids : [ids]).map(cleanText).filter(Boolean));
  const rows = await fetchPagedGlapsRows(() => adminSupabase
    .from('glaps_transport_routes')
    .select('id, route_code, route_name, start_location_name, waypoint_name, waypoint_els_name, destination_name, route_fingerprint, review_status, review_note, updated_by, created_at')
    .eq('version_id', version.id)
    .eq('active', true));

  const selectedGroupKeys = new Set();
  rows.forEach((row) => {
    if (!selectedIds.has(cleanText(row.id))) return;
    const key = routeMergeGroupKey(row);
    if (key) selectedGroupKeys.add(key);
  });
  if (selectedIds.size > 0 && selectedGroupKeys.size === 0) {
    return { success: true, mode: 'routes', action: 'merge_by_key', mergedGroups: 0, mergedRows: 0, deactivatedRows: 0 };
  }

  const grouped = new Map();
  rows.forEach((row) => {
    const key = routeMergeGroupKey(row);
    if (!key) return;
    if (selectedIds.size > 0 && !selectedGroupKeys.has(key)) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  let mergedGroups = 0;
  let mergedRows = 0;
  let deactivatedRows = 0;
  for (const group of grouped.values()) {
    if (group.length < 2) continue;
    const { survivor, loserIds, update } = buildMergedRouteRow(group, actor);
    const { error: updateError } = await adminSupabase
      .from('glaps_transport_routes')
      .update(update)
      .eq('id', survivor.id)
      .eq('version_id', version.id);
    if (updateError) throw updateError;
    if (loserIds.length > 0) {
      const { error: inactiveError } = await adminSupabase
        .from('glaps_transport_routes')
        .update({ active: false, updated_by: actor })
        .eq('version_id', version.id)
        .in('id', loserIds);
      if (inactiveError) throw inactiveError;
    }
    mergedGroups += 1;
    mergedRows += group.length;
    deactivatedRows += loserIds.length;
  }

  await refreshVersionCounts(adminSupabase, version.id);
  return {
    success: true,
    mode: 'routes',
    action: 'merge_by_key',
    mergedGroups,
    mergedRows,
    deactivatedRows,
  };
}

async function mergeAliasRowsByGlapsCode(adminSupabase, { version, ids = [], userEmail }) {
  const actor = buildEditActor('web', userEmail);
  const selectedIds = new Set((Array.isArray(ids) ? ids : [ids]).map(cleanText).filter(Boolean));
  const rows = await fetchPagedGlapsRows(() => adminSupabase
    .from('glaps_master_aliases')
    .select('id, alias_type, source_name, els_name, glaps_name, glaps_code, route_code, review_status, review_note, updated_by, created_at')
    .eq('version_id', version.id)
    .eq('active', true));

  const selectedGroupKeys = new Set();
  rows.forEach((row) => {
    if (!selectedIds.has(cleanText(row.id))) return;
    const key = aliasMergeGroupKey(row);
    if (key) selectedGroupKeys.add(key);
  });
  if (selectedIds.size > 0 && selectedGroupKeys.size === 0) {
    return { success: true, mode: 'aliases', action: 'merge_by_key', mergedGroups: 0, mergedRows: 0, deactivatedRows: 0 };
  }

  const grouped = new Map();
  rows.forEach((row) => {
    const key = aliasMergeGroupKey(row);
    if (!key) return;
    if (selectedIds.size > 0 && !selectedGroupKeys.has(key)) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  let mergedGroups = 0;
  let mergedRows = 0;
  let deactivatedRows = 0;
  for (const group of grouped.values()) {
    if (group.length < 2) continue;
    const { survivor, loserIds, update } = buildMergedAliasRow(group, actor);
    const { error: updateError } = await adminSupabase
      .from('glaps_master_aliases')
      .update(update)
      .eq('id', survivor.id)
      .eq('version_id', version.id);
    if (updateError) throw updateError;
    if (loserIds.length > 0) {
      const { error: inactiveError } = await adminSupabase
        .from('glaps_master_aliases')
        .update({ active: false, updated_by: actor })
        .eq('version_id', version.id)
        .in('id', loserIds);
      if (inactiveError) throw inactiveError;
    }
    mergedGroups += 1;
    mergedRows += group.length;
    deactivatedRows += loserIds.length;
  }

  await refreshVersionCounts(adminSupabase, version.id);
  return {
    success: true,
    mode: 'aliases',
    action: 'merge_by_key',
    mergedGroups,
    mergedRows,
    deactivatedRows,
  };
}

async function handleDirectMutation({ adminSupabase, payload, version, branchId, userEmail }) {
  const mode = cleanText(payload.mode);
  const action = cleanText(payload.action || 'upsert');
  const target = mode === 'route' || mode === 'routes' ? 'routes' : (mode === 'alias' || mode === 'aliases' ? 'aliases' : '');
  if (!target) return { error: jsonError('지원하지 않는 직접수정 대상입니다.', 400) };
  if (!['upsert', 'delete', 'merge_by_key', 'merge_by_glaps_code'].includes(action)) return { error: jsonError('지원하지 않는 직접수정 동작입니다.', 400) };

  const actor = buildEditActor('web', userEmail);
  const row = payload.row || {};
  const id = cleanText(payload.id || row.id);
  if (action === 'merge_by_key' || action === 'merge_by_glaps_code') {
    const result = target === 'routes'
      ? await mergeRouteRowsByConnectionKey(adminSupabase, { version, ids: payload.ids || [], userEmail })
      : await mergeAliasRowsByGlapsCode(adminSupabase, { version, ids: payload.ids || [], userEmail });
    return { result };
  }
  if (action === 'delete') {
    if (!id) return { error: jsonError('삭제할 ID가 없습니다.', 400) };
    const table = target === 'routes' ? 'glaps_transport_routes' : 'glaps_master_aliases';
    const { error } = await adminSupabase.from(table).update({ active: false, updated_by: actor }).eq('id', id).eq('version_id', version.id);
    if (error) throw error;
    await refreshVersionCounts(adminSupabase, version.id);
    return { result: { success: true, mode: target, action, updated: 0, deleted: 1 } };
  }

  if (target === 'routes') {
    const route = directRouteFromPayload(row);
    const dbRow = toRouteDbRow(route, { branchId, versionId: version.id, userEmail: actor });
    const duplicates = await findRouteDirectDuplicates(adminSupabase, version.id, dbRow, id);
    if (duplicates.length > 0) {
      return {
        error: duplicateJsonError(
          '이미 같은 상차지·경유지(ELS)·하차지 연결키가 등록되어 있습니다.',
          summarizeDuplicateRows(duplicates, duplicate => `${duplicate.route_code || '-'} ${duplicate.route_name || ''}`.trim()),
        ),
      };
    }
    const { data, error } = id
      ? await adminSupabase.from('glaps_transport_routes').update(dbRow).eq('id', id).eq('version_id', version.id).select('*').single()
      : await adminSupabase.from('glaps_transport_routes').insert(dbRow).select('*').single();
    if (error) {
      if (isDuplicateConstraintError(error)) {
        return { error: duplicateJsonError('이미 같은 운송경로가 등록되어 있습니다.') };
      }
      throw error;
    }
    await refreshVersionCounts(adminSupabase, version.id);
    return { result: { success: true, mode: target, action, updated: 1, deleted: 0, row: data } };
  }

  const alias = directAliasFromPayload(row);
  const dbRow = toAliasDbRow(alias, { branchId, versionId: version.id, userEmail: actor });
  const duplicates = await findAliasDirectDuplicates(adminSupabase, version.id, dbRow, id);
  if (duplicates.length > 0) {
    return {
      error: duplicateJsonError(
        '이미 같은 매핑항목·ELS 매치코드·최종코드(BP)가 등록되어 있습니다.',
        summarizeDuplicateRows(duplicates, duplicate => `${duplicate.alias_type || '-'} ${duplicate.source_name || ''} ${duplicate.glaps_code || ''}`.trim()),
      ),
    };
  }
  const { data, error } = id
    ? await adminSupabase.from('glaps_master_aliases').update(dbRow).eq('id', id).eq('version_id', version.id).select('*').single()
    : await adminSupabase.from('glaps_master_aliases').insert(dbRow).select('*').single();
  if (error) {
    if (isDuplicateConstraintError(error)) {
      return {
        error: duplicateJsonError(
          '이미 같은 매핑항목·ELS 매치코드·운송경로코드가 등록되어 있습니다. 최종코드(BP)가 다른 후보를 추가하려면 GLAPS 항목매핑 중복후보 SQL을 적용해야 합니다.',
        ),
      };
    }
    throw error;
  }
  await refreshVersionCounts(adminSupabase, version.id);
  return { result: { success: true, mode: target, action, updated: 1, deleted: 0, row: data } };
}

export async function GET(request) {
  const access = await requireGlapsUser();
  if (access.error) return access.error;

  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get('branchId') || DEFAULT_GLAPS_BRANCH_ID;
  const kind = searchParams.get('kind') || 'routes';
  const mode = String(searchParams.get('mode') || '').trim();
  const search = String(searchParams.get('q') || '').trim().toLowerCase();
  const status = String(searchParams.get('status') || '').trim();

  try {
    const version = await getActiveVersion(access.adminSupabase, branchId);
    if (!version) {
      return NextResponse.json({
        setupRequired: false,
        version: null,
        routes: [],
        aliases: [],
        sheetRows: [],
        sheetSummary: [],
        summary: summarizeGlapsRoutes([]),
        matchQuery: getGlapsRouteMatchQuery(),
      });
    }

    if (mode === 'lookup') {
      const [routeRows, aliasRows, sheetRows] = await Promise.all([
        fetchPagedGlapsRows(() => access.adminSupabase
          .from('glaps_transport_routes')
          .select('id, route_code, route_name, start_location_name, waypoint_name, waypoint_els_name, destination_name, route_fingerprint, raw_payload')
          .eq('version_id', version.id)
          .eq('active', true)
          .order('route_code', { ascending: true })),
        fetchPagedGlapsRows(() => access.adminSupabase
          .from('glaps_master_aliases')
          .select('id, alias_type, source_name, els_name, glaps_name, glaps_code, review_note')
          .eq('version_id', version.id)
          .eq('active', true)
          .in('alias_type', GLAPS_LOOKUP_ALIAS_TYPES)
          .order('alias_type', { ascending: true })
          .order('source_name', { ascending: true })),
        fetchPagedGlapsRows(() => access.adminSupabase
          .from('glaps_master_sheet_rows')
          .select('id, sheet_name, row_values, row_payload')
          .eq('version_id', version.id)
          .in('sheet_name', GLAPS_LOOKUP_SHEET_NAMES)
          .order('sheet_name', { ascending: true })
          .order('row_number', { ascending: true })),
      ]);

      return NextResponse.json({
        setupRequired: false,
        mode,
        version: {
          id: version.id,
          source_name: version.source_name,
          imported_at: version.imported_at,
        },
        routes: routeRows || [],
        aliases: aliasRows || [],
        sheetRows: sheetRows || [],
        matchQuery: getGlapsRouteMatchQuery(),
      });
    }

    const [routeRows, aliasRows, sheetRows] = await Promise.all([
      fetchPagedGlapsRows(() => access.adminSupabase
        .from('glaps_transport_routes')
        .select('*')
        .eq('version_id', version.id)
        .eq('active', true)
        .order('route_code', { ascending: true })),
      fetchPagedGlapsRows(() => access.adminSupabase
        .from('glaps_master_aliases')
        .select('*')
        .eq('version_id', version.id)
        .eq('active', true)
        .order('alias_type', { ascending: true })
        .order('source_name', { ascending: true })),
      fetchPagedGlapsRows(() => access.adminSupabase
        .from('glaps_master_sheet_rows')
        .select('*')
        .eq('version_id', version.id)
        .order('sheet_name', { ascending: true })
        .order('row_number', { ascending: true })),
    ]);

    const filterRow = (row) => {
      if (status && row.review_status !== status) return false;
      if (!search) return true;
      return Object.values(row).some(value => String(value || '').toLowerCase().includes(search));
    };
    const filterSheetRow = (row) => {
      if (!search) return true;
      return [
        row.sheet_name,
        row.row_number,
        JSON.stringify(row.row_values || []),
        JSON.stringify(row.row_payload || {}),
      ].some(value => String(value || '').toLowerCase().includes(search));
    };

    const routes = (routeRows || []).filter(filterRow);
    const aliases = (aliasRows || []).filter(filterRow);
    const filteredSheetRows = (sheetRows || []).filter(filterSheetRow);
    const activeRoutes = (routeRows || []).map(row => ({
      reviewStatus: row.review_status,
      routeCode: row.route_code,
    }));

    return NextResponse.json({
      setupRequired: false,
      kind,
      version,
      routes,
      aliases,
      sheetRows: filteredSheetRows,
      sheetSummary: buildSheetSummary(sheetRows || []),
      summary: summarizeGlapsRoutes(activeRoutes),
      matchQuery: getGlapsRouteMatchQuery(),
    });
  } catch (error) {
    if (isMissingGlapsTableError(error)) {
      return NextResponse.json({
        setupRequired: true,
        error: 'GLAPS 마스터 테이블이 아직 적용되지 않았습니다.',
        sqlFile: 'web/supabase_sql/20260523_asan_glaps_master_codes.sql',
        matchQuery: getGlapsRouteMatchQuery(),
      });
    }
    console.error('[asan-glaps-master] GET failed:', error);
    return jsonError(error.message || 'GLAPS 마스터 조회 실패');
  }
}

export async function POST(request) {
  const access = await requireGlapsUser({ write: true });
  if (access.error) return access.error;

  const branchId = DEFAULT_GLAPS_BRANCH_ID;

  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await request.json().catch(() => ({}));
      const version = await getActiveVersion(access.adminSupabase, branchId);
      if (!version) return jsonError('활성 GLAPS 마스터 버전이 없습니다. 먼저 마스터 엑셀을 반영하세요.', 400);
      const mutation = await handleDirectMutation({
        adminSupabase: access.adminSupabase,
        payload,
        version,
        branchId,
        userEmail: access.user.email,
      });
      if (mutation.error) return mutation.error;
      return NextResponse.json(mutation.result);
    }

    const formData = await request.formData();
    const mode = String(formData.get('mode') || 'master');
    const { sourceName, sourceHash, sheets } = await loadPlainSheetsFromForm(formData);

    if (mode === 'master') {
      const parsed = parseGlapsMasterSheets(sheets);
      if (parsed.routes.length === 0) return jsonError('운송경로 시트를 찾지 못했습니다.', 400);

      const previousVersion = await getActiveVersion(access.adminSupabase, branchId);
      const [protectedRouteRows, protectedAliasRows] = previousVersion?.id
        ? await Promise.all([
          fetchWebProtectedRows(access.adminSupabase, 'glaps_transport_routes', previousVersion.id),
          fetchWebProtectedRows(access.adminSupabase, 'glaps_master_aliases', previousVersion.id),
        ])
        : [[], []];

      const { data: version, error: versionError } = await access.adminSupabase
        .from('glaps_master_versions')
        .insert({
          branch_id: branchId,
          source_name: sourceName,
          source_hash: sourceHash,
          source_sheets: parsed.sourceSheets,
          imported_by: access.user.email,
          active: false,
          route_count: parsed.routes.length,
          alias_count: parsed.aliases.length,
          sheet_row_count: parsed.sheetRows.length,
          metadata: {
            routeSheetName: parsed.routeSheetName,
            sheetCount: parsed.sourceSheets.length,
            summary: parsed.summary,
          },
        })
        .select('*')
        .single();
      if (versionError) throw versionError;

      const masterActor = buildEditActor('master', access.user.email);
      const parsedRouteRows = parsed.routes.map(route => toRouteDbRow(withTemplateRoutePayload(route, 'master'), { branchId, versionId: version.id, userEmail: masterActor }));
      const parsedAliasRows = parsed.aliases.map(alias => toAliasDbRow(alias, { branchId, versionId: version.id, userEmail: masterActor }));
      const routeProtection = applyWebProtectedMasterRows(parsedRouteRows, protectedRouteRows, { branchId, versionId: version.id, kind: 'routes' });
      const aliasProtection = applyWebProtectedMasterRows(parsedAliasRows, protectedAliasRows, { branchId, versionId: version.id, kind: 'aliases' });
      const routeInsertRows = dedupeRowsByInsertKey(routeProtection.rows, routeInsertConstraintKey);
      const aliasInsertRows = dedupeRowsByInsertKey(aliasProtection.rows, aliasInsertConstraintKey);
      const routeRows = routeInsertRows.rows;
      const aliasRows = aliasInsertRows.rows;
      const sheetRows = parsed.sheetRows.map(sheetRow => toSheetRowDbRow(sheetRow, { branchId, versionId: version.id }));

      if (routeRows.length > 0) {
        const { error } = await access.adminSupabase.from('glaps_transport_routes').insert(routeRows);
        if (error) throw error;
      }
      if (aliasRows.length > 0) {
        const { error } = await access.adminSupabase.from('glaps_master_aliases').insert(aliasRows);
        if (error) throw error;
      }
      if (sheetRows.length > 0) {
        const { error } = await access.adminSupabase.from('glaps_master_sheet_rows').insert(sheetRows);
        if (error) throw error;
      }
      await refreshVersionCounts(access.adminSupabase, version.id);
      const uploadLog = {
        mode,
        sourceName,
        actor: access.user.email,
        routes: { total: routeRows.length, ...webProtectionSummary(routeProtection) },
        aliases: { total: aliasRows.length, ...webProtectionSummary(aliasProtection) },
        skippedDuplicateRows: {
          routes: routeInsertRows.skipped,
          aliases: aliasInsertRows.skipped,
        },
        webProtectedPreserved: routeProtection.preserved + aliasProtection.preserved,
      };
      await rememberGlapsUploadResult(access.adminSupabase, version, uploadLog);
      await access.adminSupabase
        .from('glaps_master_versions')
        .update({ active: false })
        .eq('branch_id', branchId)
        .eq('active', true);
      const { data: activatedVersion, error: activateError } = await access.adminSupabase
        .from('glaps_master_versions')
        .update({ active: true })
        .eq('id', version.id)
        .select('*')
        .single();
      if (activateError) throw activateError;

      return NextResponse.json({
        success: true,
        version: activatedVersion || { ...version, active: true },
        summary: parsed.summary,
        aliasCount: parsed.aliases.length,
        sheetRowCount: parsed.sheetRows.length,
        webProtection: {
          preserved: routeProtection.preserved + aliasProtection.preserved,
          routes: webProtectionSummary(routeProtection),
          aliases: webProtectionSummary(aliasProtection),
        },
        skippedDuplicateRows: uploadLog.skippedDuplicateRows,
        uploadLog,
      });
    }

    const version = await getActiveVersion(access.adminSupabase, branchId);
    if (!version) return jsonError('활성 GLAPS 마스터 버전이 없습니다. 먼저 마스터 엑셀을 반영하세요.', 400);

    if (mode === 'routes') {
      const rows = parseGlapsRouteTemplateSheets(sheets);
      const result = await applyRouteTemplateRows(access.adminSupabase, rows, {
        branchId,
        versionId: version.id,
        userEmail: access.user.email,
        editSource: 'template_upload',
      });
      await refreshVersionCounts(access.adminSupabase, version.id);
      const uploadLog = { mode, editSource: 'template_upload', actor: access.user.email, ...result };
      await rememberGlapsUploadResult(access.adminSupabase, version, uploadLog);
      return NextResponse.json({ success: true, mode, editSource: 'template_upload', ...result, uploadLog });
    }

    if (mode === 'aliases') {
      const rows = parseGlapsAliasTemplateSheets(sheets);
      const result = await applyAliasTemplateRows(access.adminSupabase, rows, {
        branchId,
        versionId: version.id,
        userEmail: access.user.email,
        editSource: 'template_upload',
      });
      await refreshVersionCounts(access.adminSupabase, version.id);
      const uploadLog = { mode, editSource: 'template_upload', actor: access.user.email, ...result };
      await rememberGlapsUploadResult(access.adminSupabase, version, uploadLog);
      return NextResponse.json({ success: true, mode, editSource: 'template_upload', ...result, uploadLog });
    }

    if (mode === 'all') {
      const routeRows = parseGlapsRouteTemplateSheets(sheets);
      const aliasRows = parseGlapsAliasTemplateSheets(sheets);
      const [routeResult, aliasResult] = await Promise.all([
        applyRouteTemplateRows(access.adminSupabase, routeRows, {
          branchId,
          versionId: version.id,
          userEmail: access.user.email,
          editSource: 'template_upload',
        }),
        applyAliasTemplateRows(access.adminSupabase, aliasRows, {
          branchId,
          versionId: version.id,
          userEmail: access.user.email,
          editSource: 'template_upload',
        }),
      ]);
      await refreshVersionCounts(access.adminSupabase, version.id);
      const uploadLog = {
        mode,
        editSource: 'template_upload',
        actor: access.user.email,
        updated: routeResult.updated + aliasResult.updated,
        deleted: routeResult.deleted + aliasResult.deleted,
        skippedWebProtected: routeResult.skippedWebProtected + aliasResult.skippedWebProtected,
        unchanged: routeResult.unchanged + aliasResult.unchanged,
        routes: routeResult,
        aliases: aliasResult,
      };
      await rememberGlapsUploadResult(access.adminSupabase, version, uploadLog);
      return NextResponse.json({
        success: true,
        mode,
        editSource: 'template_upload',
        updated: routeResult.updated + aliasResult.updated,
        deleted: routeResult.deleted + aliasResult.deleted,
        routes: routeResult,
        aliases: aliasResult,
        uploadLog,
      });
    }

    return jsonError('지원하지 않는 업로드 모드입니다.', 400);
  } catch (error) {
    if (isMissingGlapsTableError(error)) {
      return NextResponse.json({
        setupRequired: true,
        error: 'GLAPS 마스터 테이블이 아직 적용되지 않았습니다.',
        sqlFile: 'web/supabase_sql/20260523_asan_glaps_master_codes.sql',
      }, { status: 503 });
    }
    if (isLegacyAliasSourceConstraintError(error)) {
      return jsonError(
        '현재 DB가 같은 매핑항목·ELS 매치코드를 1개만 허용하는 구버전 제약을 사용 중입니다. 같은 ELS 매치코드에 여러 GLAPS 후보코드를 넣으려면 GLAPS 항목매핑 중복후보 SQL을 적용해야 합니다.',
        409,
        { sqlFile: 'web/supabase_sql/20260527_glaps_alias_duplicate_candidates.sql' },
      );
    }
    console.error('[asan-glaps-master] POST failed:', error);
    return jsonError(error.message || 'GLAPS 마스터 반영 실패');
  }
}
