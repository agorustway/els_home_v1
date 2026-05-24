import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import {
  DEFAULT_GLAPS_BRANCH_ID,
  GLAPS_ALIAS_TEMPLATE_HEADERS,
  GLAPS_REVIEW_STATUS_LABELS,
  GLAPS_ROUTE_TEMPLATE_HEADERS,
} from '@/utils/glapsMasterData.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGE_SIZE = 1000;
const TEMPLATE_HEADER_ROW_NUMBER = 3;
const ROUTE_ALIAS_TYPES = new Set(['start', 'waypoint', 'destination']);

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

function isTemplateVisibleAlias(row = {}) {
  return !ROUTE_ALIAS_TYPES.has(String(row.alias_type || '').trim());
}

function applyRowCellStyle(sheet, rowNumber, lastColumnNumber, style) {
  for (let col = 1; col <= lastColumnNumber; col += 1) {
    const cell = sheet.getCell(rowNumber, col);
    if (style.font) cell.font = style.font;
    if (style.fill) cell.fill = style.fill;
    if (style.alignment) cell.alignment = style.alignment;
  }
}

function styleWorksheet(sheet, { headerRowNumber = 1, titleRowNumber = null, noteRowNumber = null } = {}) {
  const lastColumnNumber = sheet.columnCount;
  sheet.views = [{
    state: 'frozen',
    ySplit: headerRowNumber,
    topLeftCell: `A${headerRowNumber + 1}`,
    activeCell: `A${headerRowNumber + 1}`,
    activePane: 'bottomLeft',
  }];
  if (titleRowNumber) {
    const titleRow = sheet.getRow(titleRowNumber);
    titleRow.height = 24;
    applyRowCellStyle(sheet, titleRowNumber, lastColumnNumber, {
      font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } },
      alignment: { vertical: 'middle', horizontal: 'left' },
    });
  }
  if (noteRowNumber) {
    const noteRow = sheet.getRow(noteRowNumber);
    noteRow.height = 22;
    applyRowCellStyle(sheet, noteRowNumber, lastColumnNumber, {
      font: { bold: true, color: { argb: 'FF334155' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } },
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true },
    });
  }
  applyRowCellStyle(sheet, headerRowNumber, lastColumnNumber, {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5673' } },
    alignment: { vertical: 'middle', horizontal: 'center' },
  });
  sheet.autoFilter = { from: `A${headerRowNumber}`, to: `${sheet.getColumn(lastColumnNumber).letter}${headerRowNumber}` };
  sheet.columns.forEach((column) => {
    const values = (column.values || []).slice(headerRowNumber);
    const maxLen = Math.max(10, ...values.map(value => String(value || '').length));
    column.width = Math.min(42, maxLen + 3);
  });
}

function addTemplateHeader(sheet, { title, note, headers }) {
  sheet.addRow([title]);
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.addRow([note]);
  sheet.mergeCells(2, 1, 2, headers.length);
  sheet.addRow(headers);
}

function addGuideWorksheet(workbook) {
  const sheet = workbook.addWorksheet('설명서');
  sheet.addRow(['구분', '시트', '컬럼명', '입력방법', '비고']);
  [
    ['공통', '전체', 'ID', '기존 행은 그대로 둡니다. 새 행 추가 시 비워둡니다.', 'ID가 있으면 기존 행 수정, 비어 있으면 신규 추가'],
    ['공통', '전체', '매칭상태', '확정 / 조정필요 / 코드없음 중 하나를 입력합니다.', '영문 ready / needs_mapping / missing_route_code도 인식'],
    ['공통', '전체', '조정안내', '검수 메모를 자유 입력합니다.', '업로드 시 DB에 반영'],
    ['공통', '전체', '수정출처', '참고용입니다. 수정하지 않아도 됩니다.', '웹수정 / 업로드수정 / 마스터반영 표시'],
    ['공통', '전체', '수정일시', '참고용입니다. 수정하지 않아도 됩니다.', '업로드 반영 기준 아님'],
    ['공통', '전체', '삭제(Y)', '삭제할 행만 Y를 입력합니다. 행을 지우는 것은 삭제로 처리하지 않습니다.', 'Y 외 값은 삭제로 보지 않음'],
    ['마스터코드', '원본 코드시트', 'ELS코드1~N', '수기 별칭은 컬럼 위치와 무관하게 헤더명으로 읽습니다. 한 칸에 여러 값을 넣을 때는 쉼표 또는 줄바꿈으로 구분합니다.', '새 코드 시트 추가 시 파서 연결 필요'],
    ['운송경로', '운송경로_수정양식', '운송경로코드', 'GLAPS 기존 운송경로코드를 입력합니다.', '새 코드를 만들지 말고 원장 코드를 사용'],
    ['운송경로', '운송경로_수정양식', '운송경로명', 'GLAPS 운송경로명을 입력합니다.', '참고/검색용'],
    ['운송경로', '운송경로_수정양식', '상차지', '배차 상세의 상차지와 매칭될 값을 입력합니다.', '예: 부산신항, 의왕ICD'],
    ['운송경로', '운송경로_수정양식', '경유지', 'GLAPS 원장 작업지명을 입력합니다.', '원본명 보존용'],
    ['운송경로', '운송경로_수정양식', '경유지(ELS)', '우리 배차판 작업지명과 맞출 값을 입력합니다.', '상세배차 매칭 핵심'],
    ['운송경로', '운송경로_수정양식', '하차지(선적)', '배차 상세의 하차지/선적과 매칭될 값을 입력합니다.', '예: 부산신항, 광양항'],
    ['항목매핑', '항목매핑_수정양식', '항목', 'port / line / container_type / carrier / consignee / generic 중 하나를 입력합니다.', '운송경로의 상차지/경유지/하차지는 운송경로 시트에서 수정'],
    ['항목매핑', '항목매핑_수정양식', '원본명', '배차판에서 들어오는 값을 입력합니다.', '예: 40HC, CMA, INKAT'],
    ['항목매핑', '항목매핑_수정양식', 'ELS명', '우리 기준 이름 또는 별칭을 입력합니다.', '검색/매칭 보조'],
    ['항목매핑', '항목매핑_수정양식', 'GLAPS명', 'GLAPS 원장 명칭을 입력합니다.', '참고/검색용'],
    ['항목매핑', '항목매핑_수정양식', 'GLAPS코드', 'GLAPS 업로드에 들어갈 기존 코드를 입력합니다.', '임의 생성 금지'],
  ].forEach(row => sheet.addRow(row));
  sheet.views = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2', activeCell: 'A2', activePane: 'bottomLeft' }];
  applyRowCellStyle(sheet, 1, 5, {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } },
    alignment: { vertical: 'middle', horizontal: 'center' },
  });
  sheet.autoFilter = { from: 'A1', to: 'E1' };
  [12, 22, 18, 54, 34].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.eachRow((row) => {
    row.alignment = { vertical: 'middle', wrapText: true };
  });
}

function editSourceLabel(updatedBy = '') {
  const source = String(updatedBy || '').split(':')[0];
  if (source === 'web') return '웹수정';
  if (source === 'template_upload') return '업로드수정';
  if (source === 'master') return '마스터반영';
  return updatedBy ? '기존수정' : '';
}

function reviewStatusLabel(status = '') {
  return GLAPS_REVIEW_STATUS_LABELS[status] || status || '';
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
    reviewStatusLabel(row.review_status),
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
    reviewStatusLabel(row.review_status),
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
  const requestedKind = searchParams.get('kind') || 'all';
  const kind = ['routes', 'aliases', 'all'].includes(requestedKind) ? requestedKind : 'routes';
  const branchId = searchParams.get('branchId') || DEFAULT_GLAPS_BRANCH_ID;

  try {
    const version = await getActiveVersion(access.adminSupabase, branchId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ELS Solution';
    workbook.created = new Date();
    workbook.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
    addGuideWorksheet(workbook);

    if (kind === 'routes' || kind === 'all') {
      const sheet = workbook.addWorksheet('운송경로_수정양식');
      addTemplateHeader(sheet, {
        title: 'GLAPS 운송경로 수정양식',
        note: '상세배차 매칭 기준: 상차지 + 경유지(ELS) + 하차지(선적). 기존 GLAPS 운송경로코드를 도출하기 위한 원장 보정용입니다.',
        headers: GLAPS_ROUTE_TEMPLATE_HEADERS,
      });
      if (version) {
        const data = await fetchPagedGlapsRows(() => access.adminSupabase
          .from('glaps_transport_routes')
          .select('*')
          .eq('version_id', version.id)
          .eq('active', true)
          .order('route_code', { ascending: true }));
        data.forEach(row => sheet.addRow(routeToTemplateRow(row)));
      }
      styleWorksheet(sheet, {
        headerRowNumber: TEMPLATE_HEADER_ROW_NUMBER,
        titleRowNumber: 1,
        noteRowNumber: 2,
      });
    }

    if (kind === 'aliases' || kind === 'all') {
      const sheet = workbook.addWorksheet('항목매핑_수정양식');
      addTemplateHeader(sheet, {
        title: 'GLAPS 항목매핑 수정양식',
        note: '포트/선사/컨테이너/운송사/컨샤이니 등 상세배차 값과 GLAPS 기존 코드를 연결하는 보정용입니다.',
        headers: GLAPS_ALIAS_TEMPLATE_HEADERS,
      });
      if (version) {
        const data = await fetchPagedGlapsRows(() => access.adminSupabase
          .from('glaps_master_aliases')
          .select('*')
          .eq('version_id', version.id)
          .eq('active', true)
          .order('alias_type', { ascending: true })
          .order('source_name', { ascending: true }));
        data.filter(isTemplateVisibleAlias).forEach(row => sheet.addRow(aliasToTemplateRow(row)));
      }
      styleWorksheet(sheet, {
        headerRowNumber: TEMPLATE_HEADER_ROW_NUMBER,
        titleRowNumber: 1,
        noteRowNumber: 2,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const suffix = kind === 'all' ? '전체' : (kind === 'aliases' ? '항목매핑' : '운송경로');
    const encodedName = encodeURIComponent(kind === 'all' ? 'GLAPS_수정양식.xlsx' : `GLAPS_${suffix}_수정양식.xlsx`);

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
