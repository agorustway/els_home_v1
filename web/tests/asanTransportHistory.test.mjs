import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTransportHistoryFilterValues,
  buildTransportHistoryRowsPage,
  makeTransportHistoryMetaItem,
  normalizeTransportHistoryHeaders,
  normalizeTransportHistoryDay,
  normalizeTransportHistoryMonth,
  normalizeTransportHistoryYear,
} from '../utils/asanTransportHistory.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

test('아산 운송내역 헤더는 출차시간을 청구금액으로 통합한다', () => {
  const headers = normalizeTransportHistoryHeaders(['일자', '컨테이너', '출차시간', '비고']);

  assert.deepEqual(headers, ['일자', '컨테이너', '청구금액', '비고']);
});

test('아산 운송내역 메타 응답은 data 없이 행수와 원본 헤더를 보존한다', () => {
  const item = makeTransportHistoryMetaItem({
    target_month: '2026-06-01',
    sheet_name: '6월',
    headers: ['일자', '청구금액'],
    source_headers: ['일자', '출차시간'],
    data: [['2026-06-01', '120000']],
    row_count: 1,
    valid_row_count: 1,
  });

  assert.equal(item.meta_only, true);
  assert.equal(item.row_count, 1);
  assert.equal(item.valid_row_count, 1);
  assert.deepEqual(item.data, []);
  assert.deepEqual(item.source_headers, ['일자', '출차시간']);
});

test('아산 운송내역 월 파라미터는 월 첫날로 정규화한다', () => {
  assert.equal(normalizeTransportHistoryMonth('2026-06'), '2026-06-01');
  assert.equal(normalizeTransportHistoryMonth('2026-06-18'), '2026-06-01');
  assert.equal(normalizeTransportHistoryMonth('bad'), '');
});

test('아산 운송내역 연도 파라미터는 4자리 연도만 허용한다', () => {
  assert.equal(normalizeTransportHistoryYear('2026'), '2026');
  assert.equal(normalizeTransportHistoryYear('2027'), '2027');
  assert.equal(normalizeTransportHistoryYear('26'), '');
  assert.equal(normalizeTransportHistoryYear('bad'), '');
});

test('아산 운송내역 일자 파라미터는 실제 날짜만 허용한다', () => {
  assert.equal(normalizeTransportHistoryDay('2026-06-03'), '2026-06-03');
  assert.equal(normalizeTransportHistoryDay('2026-6-3'), '2026-06-03');
  assert.equal(normalizeTransportHistoryDay('2026-02-30'), '');
  assert.equal(normalizeTransportHistoryDay('2026-06'), '');
});

test('아산 운송내역 전체 보기 페이지는 기본으로 최신 날짜순 정렬하고 SEQ를 다시 부여한다', () => {
  const page = buildTransportHistoryRowsPage([
    {
      target_month: '2026-02-01',
      sheet_name: '2월',
      headers: ['SEQ', '작업일자', '업체명'],
      data: [
        ['99', '2026-02-02', 'B'],
        ['98', '2026-02-01', 'A'],
      ],
    },
    {
      target_month: '2026-01-01',
      sheet_name: '1월',
      headers: ['SEQ', '작업일자', '업체명'],
      data: [
        ['97', '2026-01-05', 'C'],
      ],
    },
  ], { limit: 2, offset: 0 });

  assert.deepEqual(page.headers, ['SEQ', '작업일자', '업체명']);
  assert.equal(page.total, 3);
  assert.equal(page.has_more, true);
  assert.deepEqual(page.data.map(row => row[0]), ['1', '2']);
  assert.deepEqual(page.data.map(row => row[1]), ['2026-02-02', '2026-02-01']);
});

test('아산 운송내역 전체 보기 페이지는 일별 필터를 적용하고 SEQ를 다시 부여한다', () => {
  const page = buildTransportHistoryRowsPage([
    {
      target_month: '2026-06-01',
      sheet_name: '6월',
      headers: ['SEQ', '작업일자', '업체명', 'CONTAINER'],
      data: [
        ['10', '2026-06-03', 'KCC', 'SEGU4996444'],
        ['11', '2026-06-04', 'ELS', 'TCNU8552871'],
        ['12', '2026.06.03', 'KCP', 'TLLU4718815'],
      ],
    },
  ], { limit: 100, offset: 0, date: '2026-06-03', dateColumn: '작업일자' });

  assert.equal(page.total, 2);
  assert.deepEqual(page.data.map(row => row[0]), ['1', '2']);
  assert.deepEqual(page.data.map(row => row[2]), ['KCC', 'KCP']);
});

test('아산 운송내역 전체 보기 페이지는 기간 필터를 적용한다', () => {
  const page = buildTransportHistoryRowsPage([
    {
      target_month: '2026-06-01',
      sheet_name: '6월',
      headers: ['SEQ', '작업일자', '업체명'],
      data: [
        ['1', '2026-06-01', 'A'],
        ['2', '2026-06-03', 'B'],
        ['3', '2026-06-05', 'C'],
      ],
    },
  ], { limit: 100, offset: 0, dateFrom: '2026-06-04', dateTo: '2026-06-02', dateColumn: '작업일자' });

  assert.equal(page.total, 1);
  assert.deepEqual(page.data[0], ['1', '2026-06-03', 'B']);
});

test('아산 운송내역 전체 보기 페이지는 검색과 offset을 적용한다', () => {
  const page = buildTransportHistoryRowsPage([
    {
      target_month: '2026-01-01',
      sheet_name: '1월',
      headers: ['SEQ', '작업일자', '업체명'],
      data: [
        ['1', '2026-01-01', 'KCC'],
        ['2', '2026-01-02', 'ELS'],
        ['3', '2026-01-03', 'KCC'],
      ],
    },
  ], { limit: 1, offset: 1, search: 'KCC' });

  assert.equal(page.total, 2);
  assert.equal(page.has_more, false);
  assert.deepEqual(page.data[0], ['2', '2026-01-01', 'KCC']);
});

test('아산 운송내역 전체 보기 페이지는 전체 원장 기준 컬럼 필터를 적용한다', () => {
  const records = [{
    target_month: '2026-06-01',
    sheet_name: '6월',
    headers: ['SEQ', '작업일자', '업체명', 'LINE'],
    data: [
      ['1', '2026-06-01', 'A', 'YML'],
      ['2', '2026-06-02', 'B', 'ZIM'],
      ['3', '2026-06-03', 'C', 'YML'],
    ],
  }];

  const page = buildTransportHistoryRowsPage(records, {
    limit: 1,
    offset: 0,
    columnFilters: { LINE: ['YML'] },
  });

  assert.equal(page.total, 2);
  assert.deepEqual(page.data[0], ['1', '2026-06-03', 'C', 'YML']);
  assert.equal(page.has_more, true);
});

test('아산 운송내역 필터값은 현재 페이지가 아니라 전체 원장 기준으로 계산한다', () => {
  const records = [{
    target_month: '2026-06-01',
    sheet_name: '6월',
    headers: ['SEQ', '작업일자', '업체명', 'LINE'],
    data: [
      ['1', '2026-06-01', 'A', 'YML'],
      ['2', '2026-06-02', 'B', 'ZIM'],
      ['3', '2026-06-03', 'C', 'WHL'],
      ['4', '2026-06-04', 'A', 'YJC'],
    ],
  }];

  const result = buildTransportHistoryFilterValues(records, {
    column: 'LINE',
    columnFilters: { 업체명: ['A'], LINE: ['YML'] },
  });

  assert.deepEqual(result.values, ['YJC', 'YML']);
  assert.equal(result.total, 2);
});

test('아산 운송내역 Next API는 배차판처럼 meta/date/full/rows 모드를 제공한다', () => {
  const route = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/transport-history/route.js'),
    'utf8',
  );

  assert.match(route, /getTransportHistoryQueryMode/);
  assert.match(route, /mode === 'rows'/);
  assert.match(route, /mode === 'filter-values'/);
  assert.match(route, /buildTransportHistoryFilterValues/);
  assert.match(route, /parseTransportHistoryColumnFilters/);
  assert.match(route, /searchParams\.get\('filters'\)/);
  assert.match(route, /buildTransportHistoryRowsPage/);
  assert.match(route, /normalizeTransportHistoryDay/);
  assert.match(route, /dateColumn/);
  assert.match(route, /date: day/);
  assert.match(route, /dateFrom/);
  assert.match(route, /dateTo/);
  assert.match(route, /TRANSPORT_HISTORY_META_SELECT/);
  assert.match(route, /TRANSPORT_HISTORY_ROWS_SELECT/);
  assert.match(route, /\.from\('branch_transport_history'\)/);
  assert.match(route, /mode === 'meta' \? TRANSPORT_HISTORY_META_SELECT : TRANSPORT_HISTORY_ROWS_SELECT/);
  assert.match(route, /\.gte\('target_month', `\$\{year\}-01-01`\)/);
  assert.match(route, /\.lt\('target_month', `\$\{Number\(year\) \+ 1\}-01-01`\)/);
  const metaSelectLine = route.split('\n').find(line => line.includes('const TRANSPORT_HISTORY_META_SELECT')) || '';
  const metaSelectFields = metaSelectLine.match(/'([^']+)'/)?.[1].split(',') || [];
  assert.equal(metaSelectFields.includes('data'), false);
});

test('아산 운송내역은 시트가 나뉘어도 DB target_month 누적 원장을 웹에서 조회한다', () => {
  const route = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/transport-history/route.js'),
    'utf8',
  );
  const sql = fs.readFileSync(
    path.join(repoRoot, 'web/supabase_sql/20260603_asan_transport_history.sql'),
    'utf8',
  );
  const core = fs.readFileSync(
    path.join(repoRoot, 'docker/els-backend/app_core.py'),
    'utf8',
  );
  const ui = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanTransportHistory.js'),
    'utf8',
  );

  assert.match(sql, /target_month DATE NOT NULL/);
  assert.match(sql, /CONSTRAINT branch_transport_history_scope_key UNIQUE \(branch_id, target_month, sheet_name\)/);
  assert.match(core, /on_conflict="branch_id,target_month,sheet_name"/);
  assert.match(core, /target_month = _resolve_transport_history_sheet_month\(sheet_name, source_year\)/);
  assert.match(route, /\.from\('branch_transport_history'\)/);
  assert.match(route, /\.order\('target_month', \{ ascending: true \}\)/);
  assert.match(route, /query = query\.eq\('target_month', month\)/);
  assert.match(ui, /\/api\/branches\/asan\/transport-history\?mode=meta/);
  assert.match(ui, /\/api\/branches\/asan\/transport-history\?\$\{params\.toString\(\)\}/);
  assert.match(ui, /mode: 'rows'/);
  assert.match(ui, /year: selectedYear/);
  assert.doesNotMatch(route, /api\/nas\/files/);
});

test('아산 운송내역 동기화는 NAS 백엔드 상태와 POST를 프록시한다', () => {
  const route = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/transport-history/sync/route.js'),
    'utf8',
  );

  assert.match(route, /\/api\/branches\/asan\/transport-history\/sync/);
  assert.match(route, /export async function GET\(\)/);
  assert.match(route, /export async function POST\(\)/);
  assert.match(route, /cache: 'no-store'/);
});

test('아산 운송내역 SQL은 서비스롤 전용과 메타 조회 인덱스를 갖는다', () => {
  const sql = fs.readFileSync(
    path.join(repoRoot, 'web/supabase_sql/20260603_asan_transport_history.sql'),
    'utf8',
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.branch_transport_history/);
  assert.match(sql, /target_month DATE NOT NULL/);
  assert.match(sql, /row_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /valid_row_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /transport_history_path TEXT/);
  assert.match(sql, /idx_branch_transport_history_meta_lookup/);
  assert.match(sql, /ALTER TABLE public\.branch_transport_history ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.branch_transport_history FROM anon, authenticated/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.branch_transport_history TO service_role/);
});

test('아산 운송내역 NAS Core는 2026_수출리스트를 배차판 동기화 방식으로 적재한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'docker/els-backend/app_core.py'),
    'utf8',
  );

  assert.match(source, /ASAN_TRANSPORT_HISTORY_DEFAULT_PATH = "\/아산지점\/2026_수출리스트\.xlsx"/);
  assert.match(source, /transport_history_sync_gate = StableFileSyncGate/);
  assert.match(source, /def sync_asan_transport_history_python\(force=False, phase="all", preserve_quick=False\):/);
  assert.match(source, /sync_asan_transport_history_manual_python/);
  assert.match(source, /def _request_transport_history_sync_cancel/);
  assert.match(source, /def _restart_asan_transport_history_manual_after_current/);
  assert.match(source, /AsanTransportHistorySyncCancelled/);
  assert.match(source, /phase="quick"/);
  assert.match(source, /phase="adjacent"/);
  assert.match(source, /phase="rest"/);
  assert.match(source, /status\.get\("quick_done"\)/);
  assert.match(source, /_transport_history_month_in_primary/);
  assert.match(source, /_transport_history_month_in_adjacent/);
  assert.match(source, /branch_transport_history/);
  assert.match(source, /_normalize_transport_history_headers/);
  assert.match(source, /"출차시간": "청구금액"/);
  assert.match(source, /@app\.route\("\/api\/branches\/asan\/transport-history\/sync", methods=\["GET", "POST"\]\)/);
});

test('아산 상위 탭은 배차판 옆에 운송내역을 둔다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );

  assert.match(source, /const MAIN_TABS = \['dispatch', 'transport-history', 'shipping', 'performance'\];/);
  assert.match(source, /const AsanTransportHistory = dynamic/);
  assert.match(source, /배차판[\s\S]*운송내역[\s\S]*선적관리/);
  assert.match(source, /activeMainTab === 'transport-history' && <AsanTransportHistory \/>/);
});

test('아산 운송내역 화면은 현황판 없이 현재 선택 시트 테이블만 관리한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanTransportHistory.js'),
    'utf8',
  );

  assert.match(source, /TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH = '\/아산지점\/2026_수출리스트\.xlsx'/);
  assert.match(source, /\/api\/branches\/asan\/transport-history\?mode=meta/);
  assert.match(source, /\/api\/branches\/asan\/transport-history\/sync/);
  assert.match(source, /loadNasFolder\('\/아산지점'\)/);
  assert.match(source, /className=\{styles\.browseBtn\}[\s\S]*찾기/);
  assert.match(source, /setDraftPath\(file\.path\)/);
  assert.match(source, /NAS 동기화/);
  assert.match(source, /현재 선택 시트/);
  assert.doesNotMatch(source, /현황판/);
});

test('아산 운송내역 화면은 전체/연도/자동로딩과 선적관리형 테이블 도구를 제공한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanTransportHistory.js'),
    'utf8',
  );

  assert.match(source, /const ALL_RECORD_KEY = '__all__'/);
  assert.match(source, /const ALL_PAGE_SIZE = 100/);
  assert.match(source, /const SEARCH_DEBOUNCE_MS = 1000/);
  assert.match(source, /const SEARCH_CLEAR_DEBOUNCE_MS = 250/);
  assert.doesNotMatch(source, /String\(currentYear \+ 1\)/);
  assert.match(source, /metaRecords\.map\(recordYear\)/);
  assert.match(source, /const \[metaReady, setMetaReady\] = useState\(false\)/);
  assert.match(source, /selectedYearHasMeta/);
  assert.match(source, /activeKey !== ALL_RECORD_KEY \|\| !metaReady \|\| !selectedYear/);
  assert.match(source, /function areColumnFiltersEqual\(a = \{\}, b = \{\}\)/);
  assert.match(source, /areArraysEqual\(prev, next\) \? prev : next/);
  assert.match(source, /areSetsEqual\(prev, next\) \? prev : next/);
  assert.match(source, /areColumnFiltersEqual\(prev, next\) \? prev : next/);
  assert.match(source, /<span>전체<\/span>/);
  assert.match(source, /formatMonthLabel\(record\.target_month\)/);
  assert.doesNotMatch(source, /record\.sheet_name\}\s*<\/span>[\s\S]*formatMonthLabel\(record\.target_month\)/);
  assert.match(source, /P1 저장/);
  assert.match(source, /P2 저장/);
  assert.match(source, /const DEFAULT_PREF_PAGE_KEY = 'asan_transport_history_default'/);
  assert.match(source, /layoutPrefsLoadedRef/);
  assert.match(source, /page_key=\$\{DEFAULT_PREF_PAGE_KEY\}/);
  assert.match(source, /body: JSON\.stringify\(\{ page_key: DEFAULT_PREF_PAGE_KEY, settings \}\)/);
  assert.match(source, /hiddenColsZone/);
  assert.match(source, /filterDropdown/);
  assert.match(source, /serverFilterOptions/);
  assert.match(source, /mode: 'filter-values'/);
  assert.match(source, /loadServerFilterValues\(nextColumn\)/);
  assert.match(source, /setFilterDropdown\(null\)/);
  assert.match(source, /params\.set\('filters', JSON\.stringify\(serverFilters\)\)/);
  assert.match(source, /draggable/);
  assert.match(source, /loadMoreRows/);
  assert.match(source, /handleTableScroll/);
  assert.match(source, /onScroll=\{handleTableScroll\}/);
  assert.match(source, /다음 100건/);
  assert.doesNotMatch(source, /onClick=\{\(\) => loadAllRows\(\{ reset: false/);
  assert.ok(
    source.indexOf('const rows = activeRecord?.data || [];') < source.indexOf('const loadMoreRows = useCallback'),
    '무한스크롤 콜백은 rows 선언 이후에 정의되어야 한다',
  );
  assert.match(source, /if \(!headers\.length\) return \[\]/);
  assert.doesNotMatch(source, /<div className=\{styles\.transportToolbar\}>/);
  assert.match(source, /transportSearchInput/);
  assert.match(source, /const \[searchInput, setSearchInput\] = useState\(''\)/);
  assert.match(source, /setSearch\(searchInput\.trim\(\)\)/);
  assert.match(source, /onCompositionStart=\{\(\) => setIsComposingSearch\(true\)\}/);
  assert.match(source, /transportSearchStatus/);
  assert.match(source, /transportActionRow/);
  assert.match(source, /transportActionBtn/);
  assert.match(source, /syncGate\.running && !syncGate\.quickDone/);
  assert.match(source, /1순위 재동기화/);
  assert.match(source, /dateFilter/);
  assert.match(source, /aria-label="연도 선택"/);
  assert.match(source, /value=\{dateFilter\.mode\}/);
  assert.match(source, /<option value="day">하루<\/option>/);
  assert.match(source, /<option value="range">기간<\/option>/);
  assert.match(source, /type="date"/);
  assert.match(source, /params\.set\('date'/);
  assert.match(source, /params\.set\('date_from'/);
  assert.match(source, /params\.set\('date_to'/);
  assert.match(source, /params\.set\('date_col'/);
  assert.match(source, /transportInlineDateTabs/);
  assert.match(source, /CONTAINER_LOOKUP_DISPLAY_COLUMNS/);
  assert.match(source, /const TRANSPORT_LOOKUP_HEADERS = \[/);
  assert.match(source, /'이력 선사'/);
  assert.match(source, /'이력 차량번호'/);
  assert.match(source, /'이력 SIZE'/);
  assert.match(source, /extractUniqueContainerNos/);
  assert.match(source, /orderContainerLookupTargets/);
  assert.match(source, /mergePendingContainerLookupResults/);
  assert.match(source, /container-results/);
  assert.match(source, /container-lookup\/jobs/);
  assert.match(source, /컨테이너 조회/);
  assert.match(source, /const LOOKUP_SESSION_KEY = 'asan_transport_history_container_lookup_session'/);
  assert.match(source, /function readContainerLookupSession\(\)/);
  assert.match(source, /function writeContainerLookupSession\(session\)/);
  assert.match(source, /function createLookupSession\(\{ path, containers, status \}\)/);
  assert.match(source, /const refreshContainerLookupSession = useCallback\(async \(options = \{\}\) =>/);
  assert.match(source, /job = await fetchContainerLookupJob\(session\?\.jobId \|\| ''\)/);
  assert.match(source, /기존 백그라운드 컨테이너 조회가 아직 진행 중입니다/);
  assert.match(source, /이전 컨테이너 조회가 아직 진행 중입니다/);
  assert.match(source, /disabled=\{containerLookupRunning \|\| activeLookupRunning \|\| loadingTable \|\| !processedRows\.length\}/);
  assert.match(source, /조회 멈춤/);
  assert.match(source, /method: 'DELETE'[\s\S]*body: JSON\.stringify\(\{ id: jobId \}\)/);
  assert.match(source, /isIso6346Valid/);
  assert.match(source, /isInvalidTransportContainerValue/);
  assert.match(source, /ISO 6346 오류/);
  assert.match(source, /invalidContainerCell/);
  assert.match(source, /hiddenLookupChip/);
  assert.match(source, /lookupHeader/);
  assert.match(source, /lookupCell/);
  assert.match(source, /function isDispatchTimeHeader\(column\)/);
  assert.match(source, /return text === '배차시간'/);
  assert.match(source, /function formatTransportTimeValue\(value\)/);
  assert.match(source, /padStart\(2, '0'\).*:\$\{match\[2\]\}/);
  assert.match(source, /formatTransportCellValue\(column, row\[index\]\)/);
});

test('아산지점 큰 테이블 검색은 입력 후 잠시 기다렸다가 적용한다', () => {
  const dispatchSource = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const transportSource = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanTransportHistory.js'),
    'utf8',
  );
  const glapsSource = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanGlapsMaster.js'),
    'utf8',
  );
  const monthlySource = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js'),
    'utf8',
  );
  const annualSource = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js'),
    'utf8',
  );

  assert.match(dispatchSource, /const ASAN_TABLE_SEARCH_DEBOUNCE_MS = 700/);
  assert.match(dispatchSource, /setTimeout\(\(\) => setSearchTerm\(searchInput\), ASAN_TABLE_SEARCH_DEBOUNCE_MS\)/);
  assert.match(transportSource, /const SEARCH_DEBOUNCE_MS = 1000/);
  assert.match(transportSource, /const timer = window\.setTimeout\(\(\) => \{\s*setSearch\(searchInput\.trim\(\)\);/);
  assert.match(glapsSource, /const GLAPS_MASTER_SEARCH_DEBOUNCE_MS = 700/);
  assert.match(glapsSource, /searchInput\.trim\(\) \? GLAPS_MASTER_SEARCH_DEBOUNCE_MS : GLAPS_MASTER_REFRESH_DEBOUNCE_MS/);
  assert.match(monthlySource, /const SEARCH_DEBOUNCE_MS = 700/);
  assert.match(annualSource, /const SEARCH_DEBOUNCE_MS = 700/);
});

test('아산 운송내역 설정 저장은 transport_history_path 컬럼 미적용 상태에서도 에러를 피한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/settings/route.js'),
    'utf8',
  );

  assert.match(source, /TRANSPORT_HISTORY_SETTINGS_DEFAULT_PATH = '\/아산지점\/2026_수출리스트\.xlsx'/);
  assert.match(source, /isTransportHistoryPathColumnMissing/);
  assert.match(source, /transport_history_path_unpersisted/);
  assert.match(source, /retryPayload/);
});

test('아산 운송내역 SQL은 기본 경로와 기존 오입력 경로를 아산지점 직하로 보정한다', () => {
  const baseSql = fs.readFileSync(
    path.join(repoRoot, 'web/supabase_sql/20260603_asan_transport_history.sql'),
    'utf8',
  );
  const fixSql = fs.readFileSync(
    path.join(repoRoot, 'web/supabase_sql/20260603_asan_transport_history_path_fix.sql'),
    'utf8',
  );

  assert.match(baseSql, /DEFAULT '\/아산지점\/2026_수출리스트\.xlsx'/);
  assert.match(fixSql, /transport_history_path = '\/아산지점\/2026_수출리스트\.xlsx'/);
  assert.match(fixSql, /\/아산지점\/A_운송실무\/2026_수출리스트\.xlsx/);
});
