import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import {
  DEFAULT_GLAPS_BRANCH_ID,
  GLAPS_ALIAS_TEMPLATE_HEADERS,
  GLAPS_REVIEW_STATUS_LABELS,
  GLAPS_ROUTE_TEMPLATE_HEADERS,
  formatGlapsAliasType,
  getGlapsRouteShipperCode,
} from '@/utils/glapsMasterData.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PAGE_SIZE = 1000;
const TEMPLATE_HEADER_ROW_NUMBER = 3;
const ROUTE_ALIAS_TYPES = new Set(['start', 'waypoint', 'destination']);
const ROUTE_PROTECTED_TEMPLATE_COLUMNS = new Set(['ID', '운송경로명', '경유지', '수정출처', '수정일시']);
const ROUTE_KEY_TEMPLATE_COLUMNS = new Set(['화주사코드', '운송경로코드']);
const ALIAS_PROTECTED_TEMPLATE_COLUMNS = new Set([
  'ID',
  'GLAPS 디스크립션(설명)',
  'GLAPS명',
  'GLAPS코드',
  '수정출처',
  '수정일시',
]);
const ALIAS_KEY_TEMPLATE_COLUMNS = new Set(['최종코드(BP)']);
const PROTECTED_CELL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
const PROTECTED_HEADER_FONT = { bold: true, color: { argb: 'FF334155' } };
const PROTECTED_CELL_FONT = { color: { argb: 'FF475569' } };
const KEY_CELL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
const KEY_HEADER_FONT = { bold: true, color: { argb: 'FF14532D' } };
const KEY_CELL_FONT = { bold: true, color: { argb: 'FF14532D' } };

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

function applyProtectedColumnStyle(sheet, headerRowNumber, protectedColumns = new Set()) {
  if (!protectedColumns.size) return;
  const headerRow = sheet.getRow(headerRowNumber);
  for (let col = 1; col <= sheet.columnCount; col += 1) {
    const header = String(headerRow.getCell(col).value || '').trim();
    if (!protectedColumns.has(header)) continue;
    const headerCell = headerRow.getCell(col);
    headerCell.fill = PROTECTED_CELL_FILL;
    headerCell.font = PROTECTED_HEADER_FONT;
    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const cell = sheet.getCell(rowNumber, col);
      cell.fill = PROTECTED_CELL_FILL;
      cell.font = PROTECTED_CELL_FONT;
    }
  }
}

function applyKeyColumnStyle(sheet, headerRowNumber, keyColumns = new Set()) {
  if (!keyColumns.size) return;
  const headerRow = sheet.getRow(headerRowNumber);
  for (let col = 1; col <= sheet.columnCount; col += 1) {
    const header = String(headerRow.getCell(col).value || '').trim();
    if (!keyColumns.has(header)) continue;
    const headerCell = headerRow.getCell(col);
    headerCell.fill = KEY_CELL_FILL;
    headerCell.font = KEY_HEADER_FONT;
    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const cell = sheet.getCell(rowNumber, col);
      cell.fill = KEY_CELL_FILL;
      cell.font = KEY_CELL_FONT;
    }
  }
}

function styleWorksheet(sheet, {
  headerRowNumber = 1,
  titleRowNumber = null,
  noteRowNumber = null,
  protectedColumns = new Set(),
  keyColumns = new Set(),
} = {}) {
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
  applyProtectedColumnStyle(sheet, headerRowNumber, protectedColumns);
  applyKeyColumnStyle(sheet, headerRowNumber, keyColumns);
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
    ['공통', '전체', '검수메모', '매칭 키가 아닙니다. 출처/용도/확인 사유/기본값 표시를 남깁니다.', '검색·필터·작업자 인수인계용'],
    ['공통', '전체', '수정출처', '참고용입니다. 수정하지 않아도 됩니다.', '웹수정 / 업로드수정 / 마스터반영 표시'],
    ['공통', '전체', '수정일시', '참고용입니다. 수정하지 않아도 됩니다.', '업로드 반영 기준 아님'],
    ['공통', '전체', '삭제(Y)', '삭제할 행만 Y를 입력합니다. 행을 지우는 것은 삭제로 처리하지 않습니다.', 'Y 외 값은 삭제로 보지 않음'],
    ['공통', '전체', '회색 음영', '회색 칸은 GLAPS 실제 업로드/원장 기준값입니다. 일반 수정 대상이 아닙니다.', 'ELS 매치코드/ELS 디스크립션/검수메모 중심으로 보정'],
    ['공통', '전체', '초록 키 칸', 'GLAPS에서 확인한 핵심 코드값을 입력/수정하는 칸입니다.', '화주사코드, 운송경로코드, 최종코드(BP)'],
    ['공통', '화면', '요약 카드', '운송경로/확정/조정필요/코드없음/원본시트 카드는 클릭 시 해당 목록으로 이동합니다.', '어떤 행을 봐야 하는지 찾는 필터 버튼'],
    ['마스터코드', '원본 코드시트', 'ELS코드1~N', '수기 별칭은 컬럼 위치와 무관하게 헤더명으로 읽습니다. 한 칸에 여러 값을 넣을 때는 쉼표 또는 줄바꿈으로 구분합니다.', '새 코드 시트 추가 시 파서 연결 필요'],
    ['운송경로', '운송경로_수정양식', '화주사코드', '초록 키 칸입니다. 상세배차 화주와 GLAPS 운송경로 원장을 연결할 화주사코드를 입력합니다.', '운송경로 매칭 키'],
    ['운송경로', '운송경로_수정양식', '운송경로코드', '초록 키 칸입니다. GLAPS에서 찾은 운송경로코드를 입력/수정합니다.', '중복검출/병합 기준'],
    ['운송경로', '중복검출/병합', '운송경로코드', '운송경로코드가 같은 행만 중복검출/병합 대상입니다. 상차지/경유지/하차지는 중복 기준이 아닙니다.', '같은 값은 1개로, 다른 값은 쉼표로 합침'],
    ['운송경로', '운송경로_수정양식', '운송경로명', '회색 보호칸입니다. GLAPS 운송경로명을 유지합니다.', '참고/검색용'],
    ['운송경로', '운송경로_수정양식', '상차지', '배차 상세의 상차지와 매칭될 값을 입력합니다.', '예: 부산신항, 의왕ICD'],
    ['운송경로', '운송경로_수정양식', '경유지', '회색 보호칸입니다. GLAPS 원장 작업지명을 유지합니다.', '배차판 매칭은 경유지(ELS)로 보정'],
    ['운송경로', '운송경로_수정양식', '경유지(ELS)', '우리 배차판 작업지명과 맞출 값을 입력합니다.', '상세배차 매칭 핵심'],
    ['운송경로', '운송경로_수정양식', '하차지(선적)', '배차 상세의 하차지/선적과 매칭될 값을 입력합니다.', '예: 부산신항, 광양항'],
    ['항목매핑', '항목매핑_수정양식', '매핑항목', '코드가 어느 GLAPS 컬럼에 쓰이는지 정하는 종류입니다. 포트 / 선사 / 컨테이너규격 / 운송사 / 컨샤이니 / 기타 중 하나를 입력합니다.', '영문 port / line / container_type / carrier / consignee / generic도 인식'],
    ['항목매핑', '항목매핑_수정양식', 'ELS 매치코드', '배차판에서 들어오는 짧은 코드값을 입력합니다.', '예: 40HC, CMA, INKAT'],
    ['항목매핑', '항목매핑_수정양식', 'ELS 디스크립션(설명)', '우리 기준 설명 또는 별칭을 입력합니다.', '검색/매칭 보조'],
    ['항목매핑', '항목매핑_수정양식', 'GLAPS 디스크립션(설명)', '회색 보호칸입니다. GLAPS 원장 설명을 유지합니다.', '참고/검색용'],
    ['항목매핑', '항목매핑_수정양식', '최종코드(BP)', '초록 키 칸입니다. GLAPS에서 찾은 최종코드 또는 운송사 BP 값을 입력/수정합니다.', '중복검출/병합 기준'],
    ['항목매핑', '중복검출/병합', '매핑항목+최종코드(BP)', '매핑항목과 최종코드(BP)가 모두 같은 행만 중복검출/병합 대상입니다. 검수메모는 중복 기준이 아닙니다.', '같은 값은 1개로, 다른 ELS 매치코드/설명은 쉼표로 합침'],
    ['항목매핑', '항목매핑_수정양식', '검수메모', '실출하지코드/운송사코드 같은 원본 출처나 기본/default/우선 같은 선택 기준을 적습니다.', '코드 매칭 조건에는 사용하지 않음'],
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
    getGlapsRouteShipperCode(row),
    row.start_location_name || '',
    row.waypoint_els_name || '',
    row.destination_name || '',
    row.waypoint_name || '',
    row.route_name || '',
    row.route_code || '',
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
    formatGlapsAliasType(row.alias_type) || row.alias_type || '',
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
        note: '상세배차 매칭 기준: 화주사코드 + 상차지 + 경유지(ELS) + 하차지(선적). 기존 GLAPS 운송경로코드를 도출하기 위한 원장 보정용입니다.',
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
        protectedColumns: ROUTE_PROTECTED_TEMPLATE_COLUMNS,
        keyColumns: ROUTE_KEY_TEMPLATE_COLUMNS,
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
        protectedColumns: ALIAS_PROTECTED_TEMPLATE_COLUMNS,
        keyColumns: ALIAS_KEY_TEMPLATE_COLUMNS,
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
