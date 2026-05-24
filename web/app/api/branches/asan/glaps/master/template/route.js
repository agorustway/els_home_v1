import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import {
  DEFAULT_GLAPS_BRANCH_ID,
  GLAPS_ALIAS_TEMPLATE_HEADERS,
  GLAPS_ROUTE_TEMPLATE_HEADERS,
} from '@/utils/glapsMasterData.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGE_SIZE = 1000;

function isMissingGlapsTableError(error) {
  const message = String(error?.message || error || '');
  return message.includes('glaps_master_versions')
    || message.includes('glaps_transport_routes')
    || message.includes('glaps_master_aliases')
    || message.includes('does not exist')
    || message.includes('schema cache');
}

async function requireReadUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Response('Unauthorized', { status: 401 }) };
  return { user, adminSupabase: await createAdminClient() };
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

function styleWorksheet(sheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5673' } };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(sheet.columnCount).letter}1` };
  sheet.columns.forEach((column) => {
    const maxLen = Math.max(10, ...column.values.map(value => String(value || '').length));
    column.width = Math.min(42, maxLen + 3);
  });
}

function editSourceLabel(updatedBy = '') {
  const source = String(updatedBy || '').split(':')[0];
  if (source === 'web') return '웹수정';
  if (source === 'template_upload') return '업로드수정';
  if (source === 'master') return '마스터반영';
  return updatedBy ? '기존수정' : '';
}

function routeToTemplateRow(row = {}) {
  return [
    row.id || '',
    row.route_code || '',
    row.route_name || '',
    row.start_location_name || '',
    row.waypoint_name || '',
    row.waypoint_els_name || '',
    row.destination_name || '',
    row.review_status || '',
    row.review_note || '',
    editSourceLabel(row.updated_by),
    row.updated_at || '',
    '',
  ];
}

function aliasToTemplateRow(row = {}) {
  return [
    row.id || '',
    row.alias_type || '',
    row.source_name || '',
    row.els_name || '',
    row.glaps_name || '',
    row.glaps_code || '',
    row.route_code || '',
    row.review_status || '',
    row.review_note || '',
    editSourceLabel(row.updated_by),
    row.updated_at || '',
    '',
  ];
}

export async function GET(request) {
  const access = await requireReadUser();
  if (access.error) return access.error;

  const { searchParams } = new URL(request.url);
  const requestedKind = searchParams.get('kind') || 'routes';
  const kind = ['routes', 'aliases', 'all'].includes(requestedKind) ? requestedKind : 'routes';
  const branchId = searchParams.get('branchId') || DEFAULT_GLAPS_BRANCH_ID;

  try {
    const version = await getActiveVersion(access.adminSupabase, branchId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ELS Solution';
    workbook.created = new Date();

    if (kind === 'routes' || kind === 'all') {
      const sheet = workbook.addWorksheet('운송경로_수정양식');
      sheet.addRow(GLAPS_ROUTE_TEMPLATE_HEADERS);
      if (version) {
        const data = await fetchPagedGlapsRows(() => access.adminSupabase
          .from('glaps_transport_routes')
          .select('*')
          .eq('version_id', version.id)
          .eq('active', true)
          .order('route_code', { ascending: true }));
        data.forEach(row => sheet.addRow(routeToTemplateRow(row)));
      }
      styleWorksheet(sheet);
    }

    if (kind === 'aliases' || kind === 'all') {
      const sheet = workbook.addWorksheet('항목매핑_수정양식');
      sheet.addRow(GLAPS_ALIAS_TEMPLATE_HEADERS);
      if (version) {
        const data = await fetchPagedGlapsRows(() => access.adminSupabase
          .from('glaps_master_aliases')
          .select('*')
          .eq('version_id', version.id)
          .eq('active', true)
          .order('alias_type', { ascending: true })
          .order('source_name', { ascending: true }));
        data.forEach(row => sheet.addRow(aliasToTemplateRow(row)));
      }
      styleWorksheet(sheet);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const suffix = kind === 'all' ? '전체' : (kind === 'aliases' ? '항목매핑' : '운송경로');
    const encodedName = encodeURIComponent(`GLAPS_${suffix}_수정양식.xlsx`);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      },
    });
  } catch (error) {
    if (isMissingGlapsTableError(error)) {
      return NextResponse.json({
        setupRequired: true,
        error: 'GLAPS 마스터 테이블이 아직 적용되지 않았습니다.',
        sqlFile: 'web/supabase_sql/20260523_asan_glaps_master_codes.sql',
      }, { status: 503 });
    }
    console.error('[asan-glaps-master-template] failed:', error);
    return new Response(error.message || 'GLAPS 수정양식 생성 실패', { status: 500 });
  }
}
