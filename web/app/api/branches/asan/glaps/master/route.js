import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import { getNasClient } from '@/lib/nas';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import {
  DEFAULT_GLAPS_BRANCH_ID,
  getGlapsRouteMatchQuery,
  parseGlapsAliasTemplateSheets,
  parseGlapsMasterSheets,
  parseGlapsRouteTemplateSheets,
  summarizeGlapsRoutes,
} from '@/utils/glapsMasterData.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_GLAPS_MASTER_PATH = '/아산지점/A_운송실무/GLAPS_마스터코드.xlsx';
const PAGE_LIMIT = 5000;

function isMissingGlapsTableError(error) {
  const message = String(error?.message || error || '');
  return message.includes('glaps_master_versions')
    || message.includes('glaps_transport_routes')
    || message.includes('glaps_master_aliases')
    || message.includes('glaps_master_sheet_rows')
    || message.includes('does not exist')
    || message.includes('schema cache');
}

function jsonError(message, status = 500, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
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
    route_code: route.routeCode || '',
    route_name: route.routeName || '',
    start_location_name: route.startLocationName || '',
    waypoint_name: route.waypointName || '',
    waypoint_els_name: route.waypointElsName || '',
    destination_name: route.destinationName || '',
    route_fingerprint: route.routeFingerprint || '',
    review_status: route.reviewStatus || 'needs_mapping',
    review_note: route.reviewNote || '',
    source_sheet: route.sourceSheet || '',
    source_row_number: route.sourceRowNumber || null,
    raw_payload: route.rawPayload || {},
    active: true,
    updated_by: userEmail,
  };
}

function toAliasDbRow(alias, { branchId, versionId, userEmail }) {
  return {
    branch_id: branchId,
    version_id: versionId,
    alias_type: alias.aliasType || 'waypoint',
    source_name: alias.sourceName || '',
    els_name: alias.elsName || '',
    glaps_name: alias.glapsName || '',
    glaps_code: alias.glapsCode || '',
    route_code: alias.routeCode || '',
    review_status: alias.reviewStatus || 'needs_mapping',
    review_note: alias.reviewNote || '',
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

export async function GET(request) {
  const access = await requireGlapsUser();
  if (access.error) return access.error;

  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get('branchId') || DEFAULT_GLAPS_BRANCH_ID;
  const kind = searchParams.get('kind') || 'routes';
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

    const { data: routeRows, error: routeError } = await access.adminSupabase
      .from('glaps_transport_routes')
      .select('*')
      .eq('version_id', version.id)
      .eq('active', true)
      .order('route_code', { ascending: true })
      .limit(PAGE_LIMIT);
    if (routeError) throw routeError;

    const { data: aliasRows, error: aliasError } = await access.adminSupabase
      .from('glaps_master_aliases')
      .select('*')
      .eq('version_id', version.id)
      .eq('active', true)
      .order('alias_type', { ascending: true })
      .order('source_name', { ascending: true })
      .limit(PAGE_LIMIT);
    if (aliasError) throw aliasError;

    const { data: sheetRows, error: sheetRowError } = await access.adminSupabase
      .from('glaps_master_sheet_rows')
      .select('*')
      .eq('version_id', version.id)
      .order('sheet_name', { ascending: true })
      .order('row_number', { ascending: true })
      .limit(PAGE_LIMIT);
    if (sheetRowError) throw sheetRowError;

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
    const formData = await request.formData();
    const mode = String(formData.get('mode') || 'master');
    const { sourceName, sourceHash, sheets } = await loadPlainSheetsFromForm(formData);

    if (mode === 'master') {
      const parsed = parseGlapsMasterSheets(sheets);
      if (parsed.routes.length === 0) return jsonError('운송경로 시트를 찾지 못했습니다.', 400);

      await access.adminSupabase
        .from('glaps_master_versions')
        .update({ active: false })
        .eq('branch_id', branchId)
        .eq('active', true);

      const { data: version, error: versionError } = await access.adminSupabase
        .from('glaps_master_versions')
        .insert({
          branch_id: branchId,
          source_name: sourceName,
          source_hash: sourceHash,
          source_sheets: parsed.sourceSheets,
          imported_by: access.user.email,
          active: true,
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

      const routeRows = parsed.routes.map(route => toRouteDbRow(route, { branchId, versionId: version.id, userEmail: access.user.email }));
      const aliasRows = parsed.aliases.map(alias => toAliasDbRow(alias, { branchId, versionId: version.id, userEmail: access.user.email }));
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

      return NextResponse.json({
        success: true,
        version,
        summary: parsed.summary,
        aliasCount: parsed.aliases.length,
        sheetRowCount: parsed.sheetRows.length,
      });
    }

    const version = await getActiveVersion(access.adminSupabase, branchId);
    if (!version) return jsonError('활성 GLAPS 마스터 버전이 없습니다. 먼저 마스터 엑셀을 반영하세요.', 400);

    if (mode === 'routes') {
      const rows = parseGlapsRouteTemplateSheets(sheets);
      const deleteIds = rows.filter(row => row.deleteFlag && row.id).map(row => row.id);
      const upsertRows = rows
        .filter(row => !row.deleteFlag && (row.id || row.routeCode || row.routeName))
        .map(row => ({ id: row.id || undefined, ...toRouteDbRow(row, { branchId, versionId: version.id, userEmail: access.user.email }) }));

      if (deleteIds.length > 0) {
        const { error } = await access.adminSupabase.from('glaps_transport_routes').update({ active: false }).in('id', deleteIds);
        if (error) throw error;
      }
      if (upsertRows.length > 0) {
        const { error } = await access.adminSupabase.from('glaps_transport_routes').upsert(upsertRows, { onConflict: 'id' });
        if (error) throw error;
      }
      await refreshVersionCounts(access.adminSupabase, version.id);
      return NextResponse.json({ success: true, mode, updated: upsertRows.length, deleted: deleteIds.length });
    }

    if (mode === 'aliases') {
      const rows = parseGlapsAliasTemplateSheets(sheets);
      const deleteIds = rows.filter(row => row.deleteFlag && row.id).map(row => row.id);
      const upsertRows = rows
        .filter(row => !row.deleteFlag && (row.id || row.sourceName || row.elsName || row.glapsName))
        .map(row => ({ id: row.id || undefined, ...toAliasDbRow(row, { branchId, versionId: version.id, userEmail: access.user.email }) }));

      if (deleteIds.length > 0) {
        const { error } = await access.adminSupabase.from('glaps_master_aliases').update({ active: false }).in('id', deleteIds);
        if (error) throw error;
      }
      if (upsertRows.length > 0) {
        const { error } = await access.adminSupabase.from('glaps_master_aliases').upsert(upsertRows, { onConflict: 'id' });
        if (error) throw error;
      }
      await refreshVersionCounts(access.adminSupabase, version.id);
      return NextResponse.json({ success: true, mode, updated: upsertRows.length, deleted: deleteIds.length });
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
    console.error('[asan-glaps-master] POST failed:', error);
    return jsonError(error.message || 'GLAPS 마스터 반영 실패');
  }
}
