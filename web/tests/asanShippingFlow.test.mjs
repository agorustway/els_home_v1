import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildContainerLookupMapFromRows,
  extractUniqueContainerNos,
  isActualContainerHistoryRow,
} from '../utils/containerHistoryResults.mjs';
import {
  buildRecentShippingMonthOptions,
  compareShippingFilterValues,
  findWorkDateColumnIndex,
  getDefaultShippingMonthKeys,
  getShippingVirtualWindow,
  getShippingSignalTone,
  getVisibleShippingColumns,
  isShippingUnshippedCandidate,
  mergePendingContainerLookupResults,
  normalizeShippingFilterValue,
  normalizeShippingColumnOrder,
  reconcileShippingLayoutPrefs,
} from '../utils/asanShippingView.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const backendFiles = [
  'docker/els-backend/app.py',
  'docker/els-backend/app_core.py',
];

test('아산 선적관리 백엔드는 조회 GET과 동기화 POST를 분리한다', () => {
  for (const rel of backendFiles) {
    const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');

    assert.match(
      source,
      /@app\.route\("\/api\/branches\/asan\/shipping", methods=\["GET", "POST"\]\)/,
      `${rel} route should accept GET and POST`,
    );
    assert.match(
      source,
      /if request\.method == "POST":[\s\S]*sync_asan_shipping_python\(force=bool\(force\), rel_path=rel_path\)/,
      `${rel} POST should run NAS to Supabase sync`,
    );
    assert.doesNotMatch(
      source,
      /source = request\.args\.get\("source", "auto"\)[\s\S]*sync_asan_shipping_python\(force=force, rel_path=rel_path\)/,
      `${rel} GET should not sync before reading DB`,
    );
    assert.match(
      source,
      /search_terms = _shipping_search_terms\(search\)[\s\S]*q = q\.or_\(filters\)/,
      `${rel} comma-separated search should use server-side OR filters`,
    );
    assert.match(source, /def _shipping_sort_value\(value\):/);
    assert.match(
      source,
      /def query_asan_shipping_db\(rel_path, page=1, page_size=5000, search="", sort_key="", sort_dir="asc"\):/,
      `${rel} DB query should accept sort params`,
    );
    assert.match(source, /sort_idx = headers\.index\(sort_key\) if sort_key in headers else -1/);
    assert.match(
      source,
      /if sort_idx >= 0:[\s\S]*range\(0, 9999\)[\s\S]*sortable\.sort\([\s\S]*page_rows = ordered_rows\[start:end \+ 1\]/,
      `${rel} should sort the full DB result before slicing the requested page`,
    );
    assert.match(
      source,
      /ordered_rows = \(\[item for _, item in sortable\] \+ blanks\) if sort_desc else \(blanks \+ \[item for _, item in sortable\]\)/,
      `${rel} should put blank sort values first on ascending sort`,
    );
    assert.match(
      source,
      /sort_key = \(.*get\("sort_key"\)[\s\S]*query_asan_shipping_db\([\s\S]*sort_key=sort_key[\s\S]*sort_dir=sort_dir/,
      `${rel} route should pass sort params into DB query`,
    );
  }
});

test('아산 선적관리 Next 라우트는 POST를 NAS 백엔드로 프록시한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/shipping/route.js'),
    'utf8',
  );
  const dbReader = fs.readFileSync(
    path.join(repoRoot, 'web/lib/asan-branch-db.js'),
    'utf8',
  );

  assert.match(source, /queryAsanShippingFromSupabase/);
  assert.match(source, /source !== 'excel'[\s\S]*queryAsanShippingFromSupabase\(url\.searchParams\)/);
  assert.match(source, /export async function POST\(req\)/);
  assert.match(source, /proxyToBackend\(req, '\/api\/branches\/asan\/shipping'\)/);
  assert.match(dbReader, /branch_shipping_files/);
  assert.match(dbReader, /branch_shipping_rows/);
  assert.match(dbReader, /read_path: 'next-direct'/);
});

test('아산 선적관리 화면은 DB 조회를 페이지 단위로 가져온다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );

  assert.match(source, /const SHIPPING_PAGE_SIZE = 100;/);
  assert.match(source, /const FULL_FILTER_PAGE_SIZE = 10000;/);
  assert.match(source, /page_size: String\(pageSize\)/);
  assert.match(source, /function getServerSortParams\(config\)/);
  assert.match(source, /params\.set\('sort_key', sortKey\)/);
  assert.match(source, /applyShippingData\(j\.data, \{ append \}\)/);
  assert.match(source, /const isServerSort = isServerPaged && sortConfig\.key && !isContainerLookupColumn\(sortConfig\.key\);/);
  assert.match(source, /if \(sortConfig\.key && !isServerSort\)/);
  assert.match(source, /sort_key: serverSortParams\.sortKey/);
  assert.match(source, /const shouldLoadFullRowsForFilters = Boolean/);
  assert.match(source, /pageSize: FULL_FILTER_PAGE_SIZE/);
  assert.match(source, /const handleTableScroll = \(e\) =>/);
  assert.match(source, /remaining < ROW_HEIGHT \* 10/);
  assert.match(source, /onScroll=\{handleTableScroll\}/);
  assert.match(source, /const \[unshippedOnly, setUnshippedOnly\] = useState\(false\);/);
  assert.match(source, /const \[storageOnly, setStorageOnly\] = useState\(false\);/);
  assert.match(source, /getFilterCellValue\(row, '보관소'\)\.includes\('자체보관'\)/);
  assert.match(source, /styles\.resultCountText/);
  assert.match(source, /전체 \{serverTotalRows\.toLocaleString\(\)\}건 \/ 조회 \{totalRows\.toLocaleString\(\)\}건/);
  assert.match(source, /\{unshippedOnly \? '필터해제' : '미선적'\}/);
  assert.match(source, /\{storageOnly \? '필터해제' : '자체보관'\}/);
  assert.doesNotMatch(source, /import \* as XLSX from 'xlsx'/);
  assert.match(source, /await import\('xlsx'\)/);
  assert.match(source, /data\.source === 'supabase'[\s\S]*더 보기/);
});

test('아산 페이지는 마지막 메인 탭을 기억해 불필요한 기본 fetch를 줄인다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );

  assert.match(source, /const ASAN_MAIN_TAB_KEY = 'asan_main_tab';/);
  assert.match(source, /const ASAN_PERFORMANCE_TAB_KEY = 'asan_performance_tab';/);
  assert.match(source, /const MAIN_TABS = \['dispatch', 'shipping', 'performance'\];/);
  assert.match(source, /localStorage\.getItem\(ASAN_MAIN_TAB_KEY\)/);
  assert.match(source, /localStorage\.setItem\(ASAN_MAIN_TAB_KEY, tab\)/);
  assert.match(source, /saved === 'annual-performance' \? 'performance' : saved/);
  assert.match(source, /const \[activeMainTab, setActiveMainTab\] = useState\(null\);/);
});

test('선적관리 엑셀 삭제 행은 현재 조회에서 지우기 전 archive 테이블에 남긴다', () => {
  for (const rel of backendFiles) {
    const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');

    assert.match(source, /def _archive_removed_asan_shipping_rows\(normalized_path, new_payload, removed_file_modified_at\):/);
    assert.match(source, /branch_shipping_row_archive/);
    assert.match(
      source,
      /archived_count = _archive_removed_asan_shipping_rows\(normalized_path, payload, file_modified_at\)[\s\S]*branch_shipping_rows"\)\.delete\(\)/,
      `${rel} should archive removed rows before replacing current shipping rows`,
    );
    assert.match(source, /"archive_reason": "deleted_from_excel"/);
  }
});

test('선적관리 삭제 이력은 1년, 조회 이력은 6개월 보존 후 정리하고 현재 원장은 건드리지 않는다', () => {
  for (const rel of backendFiles) {
    const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');

    assert.match(source, /SHIPPING_ARCHIVE_RETENTION_DAYS = 365/);
    assert.match(source, /SHIPPING_LOOKUP_RETENTION_DAYS = 180/);

    const cleanupMatch = source.match(
      /def cleanup_asan_shipping_history_retention[\s\S]*?def maybe_cleanup_asan_shipping_history/,
    );
    assert.ok(cleanupMatch, `${rel} should define history retention cleanup`);
    const cleanupBlock = cleanupMatch[0];

    assert.match(
      cleanupBlock,
      /from_\("branch_shipping_row_archive"\)\.delete\(\)\.lt\("archived_at", archive_cutoff\)/,
      `${rel} should delete old archived shipping rows by archived_at`,
    );
    assert.match(
      cleanupBlock,
      /from_\("branch_shipping_container_lookups"\)\.delete\(\)\.lt\("looked_up_at", lookup_cutoff\)/,
      `${rel} should delete old container lookup rows by looked_up_at`,
    );
    assert.doesNotMatch(
      cleanupBlock,
      /from_\("branch_shipping_rows"\)\.delete\(\)/,
      `${rel} retention cleanup must not delete current shipping rows`,
    );

    const schedulerMatch = source.match(
      /def asan_shipping_sync_scheduler\(\):[\s\S]*?threading\.Thread/,
    );
    assert.ok(schedulerMatch, `${rel} should define the shipping sync scheduler`);
    assert.match(
      schedulerMatch[0],
      /now = datetime\.now\(KST\)[\s\S]*maybe_cleanup_asan_shipping_history\(now\)[\s\S]*sync_asan_shipping_python\(\)/,
      `${rel} should run retention cleanup from the scheduler before sync`,
    );
  }
});

test('아산 NAS 파일 동기화 스케줄러는 기본 주기와 로그를 저부하 기준으로 유지한다', () => {
  for (const rel of backendFiles) {
    const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.match(source, /ASAN_DISPATCH_SYNC_POLL_SECONDS = _env_int\("ASAN_DISPATCH_SYNC_POLL_SECONDS", 60, 15\)/);
    assert.match(source, /ASAN_SHIPPING_SYNC_POLL_SECONDS = _env_int\("ASAN_SHIPPING_SYNC_POLL_SECONDS", 60, 30\)/);
    assert.match(source, /ASAN_DISPATCH_SETTINGS_CACHE_SECONDS = _env_int\("ASAN_DISPATCH_SETTINGS_CACHE_SECONDS", 300, 30\)/);
    assert.match(source, /def get_asan_dispatch_settings\(force=False\):/);
    assert.match(source, /dispatch_settings_cache\["loaded_at"\] = now_ts/);
    assert.doesNotMatch(source, /변경 없음/);
    assert.doesNotMatch(source, /대상 파일 체크/);
    assert.doesNotMatch(source, /체크[: -]+.*캐시/);
  }

  const performanceSource = fs.readFileSync(path.join(repoRoot, 'docker/els-backend/asan_performance.py'), 'utf8');
  assert.match(performanceSource, /ASAN_PERFORMANCE_SYNC_POLL_SECONDS", 300, 60/);
});

test('선적관리 조회 이력은 최신값/보존기간 인덱스를 가진다', () => {
  const migration = fs.readFileSync(
    path.join(repoRoot, 'web/supabase_sql/20260516_asan_shipping_lookup_retention_indexes.sql'),
    'utf8',
  );

  assert.match(
    migration,
    /idx_branch_shipping_container_lookups_latest[\s\S]*branch_id, file_path, container_no, looked_up_at DESC/,
  );
  assert.match(migration, /idx_branch_shipping_container_lookups_retention[\s\S]*looked_up_at/);
  assert.match(migration, /idx_branch_shipping_row_archive_retention[\s\S]*archived_at/);
});

test('선적관리 화면은 필터된 컨테이너 조회 결과를 초록색 이력 컬럼으로 붙인다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );
  const route = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/shipping/container-results/route.js'),
    'utf8',
  );
  const lookupRoute = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/shipping/container-lookup/route.js'),
    'utf8',
  );
  const store = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/shipping/container-results/store.js'),
    'utf8',
  );

  assert.match(source, /extractUniqueContainerNos\(data\?\.headers \|\| \[\], processedData\)/);
  assert.match(source, /fetch\('\/api\/branches\/asan\/shipping\/container-lookup'/);
  assert.match(source, /savedPayload\?\.saved_data/);
  assert.match(source, /fetch\('\/api\/branches\/asan\/shipping\/container-results'/);
  assert.match(source, /CONTAINER_LOOKUP_DISPLAY_COLUMNS/);
  assert.match(source, /mergePendingContainerLookupResults\(prev, containers\)/);
  assert.doesNotMatch(source, /조회 대기중/);
  assert.match(source, /styles\.lookupHeader/);
  assert.match(source, /styles\.lookupCell/);
  assert.match(source, /signalTone === 'completed' \? styles\.completedRow : ''/);
  assert.match(source, /DB수정/);
  assert.match(css, /\.table th\.lookupHeader[\s\S]*background: #15803d;/);
  assert.match(css, /\.table tr\.completedRow td[\s\S]*background: #f1f5f9;[\s\S]*color: #94a3b8;/);
  assert.match(css, /\.table tr:hover td,[\s\S]*\.table tr:hover td\.lookupCell[\s\S]*background: #dcfce7;/);
  assert.match(store, /branch_shipping_container_lookups/);
  assert.match(route, /saveContainerLookupRows/);
  assert.match(lookupRoute, /saveContainerLookupRows/);
  assert.match(lookupRoute, /RESULT_PARTIAL:[\s\S]*saved_data/);
  assert.match(lookupRoute, /RESULT:[\s\S]*saved_count/);
});

test('선적관리 액션바는 모바일 줄바꿈을 지원하고 이력 요소를 뒤쪽에 둔다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );
  const viewUtils = fs.readFileSync(
    path.join(repoRoot, 'web/utils/asanShippingView.mjs'),
    'utf8',
  );

  assert.match(
    viewUtils,
    /return \[\.\.\.excelCols, \.\.\.lookupCols, \.\.\.extraLookupCols\]/,
    'lookup columns should be appended after Excel columns',
  );
  assert.match(
    source,
    /className=\{styles\.syncBtn\}[\s\S]*NAS 동기화[\s\S]*className=\{styles\.lookupBtn\}[\s\S]*컨테이너 조회/,
    'container lookup action should appear after NAS sync',
  );
  assert.match(css, /\.actionRow[\s\S]*flex-wrap: wrap;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.actionGroup[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(source, /const orderedVisibleColumns = useMemo/);
  assert.match(source, /getVisibleShippingColumns\(colOrder, allHeaders, hiddenCols\)/);
  assert.match(source, /\{orderedVisibleColumns\.map\(col =>/);
  assert.match(source, /if \(headers\.length === 0 \|\| allHeaders\.length === 0\) return;/);
  assert.match(css, /\.hiddenLookupChip[\s\S]*background: #e8f7ee;/);
  assert.match(css, /\.hiddenChip[\s\S]*max-width: 78px;[\s\S]*text-overflow: ellipsis;/);
  assert.match(source, /function getHiddenChipLabel\(col\)/);
  assert.match(source, /title="숨긴 컬럼입니다\./);
  assert.doesNotMatch(source, />\s*\{hiddenCols\.size === 0 \? '이곳에 컬럼을 드래그하여 숨길 수 있습니다'/);
});

test('선적관리 숨김 컬럼은 엑셀/이력 컬럼 모두 실제 표시 목록에서 빠진다', () => {
  const headers = ['지역', 'CONTAINER', '이력 구분', '이력 MOVE TIME'];
  const order = normalizeShippingColumnOrder(['이력 구분', '지역'], headers);

  assert.deepEqual(order, ['지역', 'CONTAINER', '이력 구분', '이력 MOVE TIME']);
  assert.deepEqual(
    getVisibleShippingColumns(order, headers, new Set(['CONTAINER', '이력 구분'])),
    ['지역', '이력 MOVE TIME'],
  );
});

test('선적관리 레이아웃은 엑셀 제목 변경만 인덱스로 매칭하고 삭제/추가는 실제 헤더 기준으로 반영한다', () => {
  const renamed = reconcileShippingLayoutPrefs({
    order: ['지역', 'CONTAINER', '비고'],
    hiddenCols: ['비고'],
    sourceHeaders: ['지역', 'CONTAINER', '비고', '이력 구분'],
    currentHeaders: ['권역', '컨테이너번호', '메모', '이력 구분'],
  });

  assert.deepEqual(renamed.colOrder, ['권역', '컨테이너번호', '메모', '이력 구분']);
  assert.deepEqual(Array.from(renamed.hiddenCols), ['메모']);

  const deleted = reconcileShippingLayoutPrefs({
    order: ['지역', 'CONTAINER', '삭제열'],
    hiddenCols: ['삭제열'],
    sourceHeaders: ['지역', 'CONTAINER', '삭제열', '이력 구분'],
    currentHeaders: ['지역', 'CONTAINER', '이력 구분'],
  });

  assert.deepEqual(deleted.colOrder, ['지역', 'CONTAINER', '이력 구분']);
  assert.deepEqual(Array.from(deleted.hiddenCols), []);

  const added = reconcileShippingLayoutPrefs({
    order: ['지역', 'CONTAINER'],
    hiddenCols: [],
    sourceHeaders: ['지역', 'CONTAINER', '이력 구분'],
    currentHeaders: ['지역', 'CONTAINER', '신규열', '이력 구분'],
  });

  assert.deepEqual(added.colOrder, ['지역', 'CONTAINER', '신규열', '이력 구분']);
});

test('선적관리 화면은 전체/조회 건수와 컨테이너 조회 완료/실패 건수를 구분해 표시한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );

  assert.match(source, /전체 \{serverTotalRows\.toLocaleString\(\)\}건 \/ 조회 \{totalRows\.toLocaleString\(\)\}건/);
  assert.match(source, /컨테이너 조회건수 \{containerLookupProgress\.total\.toLocaleString\(\)\}건/);
  assert.match(source, /조회완료 \{containerLookupProgress\.completed\.toLocaleString\(\)\}건/);
  assert.match(source, /조회실패 \{containerLookupProgress\.failed\.toLocaleString\(\)\}건/);
  assert.match(source, /summarizeContainerLookupProgress\(receivedRows, containers/);
  assert.match(css, /\.lookupStatusFailed[\s\S]*color: #dc2626;/);
});

test('선적관리 컨테이너 이력은 작업일 포함 이후 MOVE TIME 기준으로 완료/미선적을 판정한다', () => {
  const headers = ['작업일자', 'CONTAINER'];
  const row = ['2026-05-16', 'TCLU8300912'];

  assert.equal(getShippingSignalTone(headers, row, {
    mainRow: ['TCLU8300912', '1', '수출', '반입', 'HJNC', '2026-05-16 09:00'],
  }), 'completed');
  assert.equal(getShippingSignalTone(headers, row, {
    mainRow: ['TCLU8300912', '1', '수출', '적하', 'HJNC', '2026-05-17 09:00'],
  }), 'completed');
  assert.equal(getShippingSignalTone(headers, row, {
    mainRow: ['TCLU8300912', '1', '수출', '양하', 'HJNC', '2026-05-17 09:00'],
  }), 'unshipped');
  assert.equal(getShippingSignalTone(headers, row, {
    mainRow: ['TCLU8300912', '1', '수출', '반출', 'HJNC', '2026-05-16 09:00'],
  }), 'unshipped');
  assert.equal(getShippingSignalTone(headers, row, {
    mainRow: ['TCLU8300912', '1', '수출', '적하', 'HJNC', '2026-05-15 23:59'],
  }), 'open');
  assert.equal(getShippingSignalTone(headers, row, null), 'neutral');
});

test('선적관리 미선적 판정은 실제 선적관리 날짜 컬럼인 반입일을 작업 기준일로 쓴다', () => {
  const headers = ['픽업', 'CONTAINER', '반입일', '보관소'];
  const row = ['', 'TCLU8300912', '2026-05-16', '청암CY'];

  assert.equal(findWorkDateColumnIndex(headers), 2);
  assert.equal(getShippingSignalTone(headers, row, {
    mainRow: ['TCLU8300912', '1', '수출', '반출', 'HJNC', '2026-05-16 09:00'],
  }), 'unshipped');
  assert.equal(getShippingSignalTone(headers, row, {
    mainRow: ['TCLU8300912', '1', '수출', '적하', 'HJNC', '2026-05-16 12:00'],
  }), 'completed');
});

test('선적관리 미선적 빠른 필터는 작업일 이후 비완료 이력만 남긴다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );

  assert.match(source, /isShippingUnshippedCandidate\(data\?\.headers \|\| \[\], row, containerLookupResults\[containerNo\]\)/);
  assert.match(source, /title="이력 데이터가 없거나, 작업일 포함 이후 MOVE TIME이 있고 이력구분이 반입\/적하가 아닌 행만 표시합니다"/);
  assert.equal(isShippingUnshippedCandidate(['작업일자', 'CONTAINER'], ['2026-05-16', 'TCLU8300912'], null), true);
  assert.equal(isShippingUnshippedCandidate(['작업일자', 'CONTAINER'], ['2026-05-16', 'TCLU8300912'], {
    mainRow: ['TCLU8300912', '1', '수출', '반출', 'HJNC', '2026-05-16 09:00'],
  }), true);
  assert.equal(isShippingUnshippedCandidate(['작업일자', 'CONTAINER'], ['2026-05-16', 'TCLU8300912'], {
    mainRow: ['TCLU8300912', '1', '수출', '적하', 'HJNC', '2026-05-16 09:00'],
  }), false);
});

test('선적관리 컨테이너 조회 준비 상태는 기존 미선적 판정을 덮어쓰지 않는다', () => {
  const prev = {
    TCLU8300912: {
      containerNo: 'TCLU8300912',
      mainRow: ['TCLU8300912', '1', '수출', '반출', 'HJNC', '2026-05-16 09:00'],
      resultRows: [],
      lookedUpAt: '2026-05-16T00:00:00.000Z',
    },
  };
  const merged = mergePendingContainerLookupResults(prev, ['TCLU8300912', 'MSKU5071276']);

  assert.equal(merged.TCLU8300912, prev.TCLU8300912);
  assert.equal(merged.MSKU5071276.pending, true);
  assert.equal(merged.MSKU5071276.mainRow, null);
  assert.equal(getShippingSignalTone(['작업일자', 'CONTAINER'], ['2026-05-16', 'TCLU8300912'], merged.TCLU8300912), 'unshipped');
});

test('선적관리 가상 스크롤은 필터 후 행 수가 줄어도 빈 화면 시작점을 만들지 않는다', () => {
  const windowState = getShippingVirtualWindow({
    scrollTop: 28000,
    rowHeight: 28,
    viewportHeight: 280,
    totalRows: 3,
    overscan: 12,
  });

  assert.equal(windowState.visibleStart, 0);
  assert.equal(windowState.visibleEnd, 3);
  assert.equal(windowState.topSpacerHeight, 0);

  const emptyState = getShippingVirtualWindow({
    scrollTop: 28000,
    rowHeight: 28,
    viewportHeight: 280,
    totalRows: 0,
    overscan: 12,
  });
  assert.equal(emptyState.visibleStart, 0);
  assert.equal(emptyState.visibleEnd, 0);
  assert.equal(emptyState.topSpacerHeight, 0);
});

test('선적관리 컨테이너 조회 저장은 기존 결과를 지우고 최신 결과로 덮어쓴다', () => {
  const store = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/shipping/container-results/store.js'),
    'utf8',
  );

  assert.match(store, /deleteExistingContainerLookupRows/);
  assert.match(store, /\.from\(TABLE\)[\s\S]*\.delete\(\)[\s\S]*\.in\('container_no', targets\)/);
  assert.match(store, /await deleteExistingContainerLookupRows\(\{[\s\S]*filePath: normalizedPath[\s\S]*containers: targets/);
});

test('선적관리 컨테이너 조회 실패 응답은 기존 저장값을 삭제하지 않는다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/shipping/container-lookup/route.js'),
    'utf8',
  );
  const resultBlockIndex = source.indexOf("if (line.startsWith('RESULT:'))");
  const failureGuardIndex = source.indexOf('if (!payload.ok)', resultBlockIndex);
  const saveIndex = source.indexOf('const saved = await saveRowsSafely', resultBlockIndex);

  assert.ok(resultBlockIndex >= 0);
  assert.ok(failureGuardIndex > resultBlockIndex);
  assert.ok(saveIndex > failureGuardIndex);
  assert.match(source.slice(failureGuardIndex, saveIndex), /send\(`\$\{line\}\\n`\);[\s\S]*return;/);
});

test('선적관리 컬럼 필터는 보이지 않는 빈값을 하나로 묶고 빈값을 상단 정렬한다', () => {
  const values = ['2026-05-15', '\u200b', '', '\ufeff', '청암CY'];
  const unique = Array.from(new Set(values.map(normalizeShippingFilterValue)))
    .sort((a, b) => compareShippingFilterValues(a, b, 'asc'));

  assert.deepEqual(unique, ['', '2026-05-15', '청암CY']);
  assert.equal(compareShippingFilterValues('', '2026-05-15', 'asc') < 0, true);
  assert.equal(compareShippingFilterValues('', '2026-05-15', 'desc') > 0, true);
});

test('선적관리 컬럼 필터 드롭다운 항목은 헤더 흰 글자색을 상속받지 않는다', () => {
  const css = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );

  assert.match(css, /\.dropdown[\s\S]*color: #0f172a;/);
});

test('선적관리 저장 이력은 컨테이너가 많아도 URL 길이 제한을 피하도록 청크로 읽는다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );

  assert.match(source, /const CONTAINER_RESULTS_CHUNK_SIZE = 150;/);
  assert.match(source, /for \(let i = 0; i < missingContainers\.length; i \+= CONTAINER_RESULTS_CHUNK_SIZE\)/);
  assert.match(source, /missingContainers\.slice\(i, i \+ CONTAINER_RESULTS_CHUNK_SIZE\)/);
});

test('선적관리 검색은 입력 완료 시간을 기다린 뒤 DB 전체 조건 검색을 갱신한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );

  assert.match(source, /const SEARCH_DEBOUNCE_MS = 1000;/);
  assert.match(source, /const SEARCH_BUSY_VISIBLE_DELAY_MS = 350;/);
  assert.match(source, /const \[searchInput, setSearchInput\] = useState\(''\);/);
  assert.match(source, /const \[showSearchRefreshing, setShowSearchRefreshing\] = useState\(false\);/);
  assert.match(source, /const fetchRequestIdRef = useRef\(0\);/);
  assert.match(source, /if \(isComposingSearch\) return undefined;/);
  assert.match(source, /setTimeout\(\(\) => \{\s*setSearchTerm\(searchInput\);/);
  assert.match(source, /setTimeout\(\(\) => \{\s*setShowSearchRefreshing\(true\);[\s\S]*SEARCH_BUSY_VISIBLE_DELAY_MS/);
  assert.match(source, /if \(requestId !== fetchRequestIdRef\.current\) return;/);
  assert.match(source, /fetchData\(selectedPath, \{ page: 1, search: searchTerm, quiet, \.\.\.serverSortParams \}\)/);
  assert.match(source, /value=\{searchInput\}/);
  assert.match(source, /const searchStatusText = searchPending \? '입력 대기' : \(shouldShowSearchRefreshing \? '검색 중' : ''\);/);
  assert.match(source, /styles\.searchStatusHidden/);
  assert.match(source, /onKeyDown=\{e => \{[\s\S]*if \(e\.key === 'Enter'\) setSearchTerm\(searchInput\);/);
  assert.match(css, /\.searchStatus/);
  assert.match(css, /\.searchStatusHidden/);
});

test('선적관리 월 필터는 오늘 기준 최근 6개월과 기본 3개월을 만든다', () => {
  const options = buildRecentShippingMonthOptions(new Date(2026, 4, 17), 6);

  assert.deepEqual(options.map(option => option.key), [
    '2026-05',
    '2026-04',
    '2026-03',
    '2026-02',
    '2026-01',
    '2025-12',
  ]);
  assert.deepEqual(options.map(option => option.label), [
    '26년 5월',
    '26년 4월',
    '26년 3월',
    '26년 2월',
    '26년 1월',
    '25년 12월',
  ]);
  assert.deepEqual(getDefaultShippingMonthKeys(new Date(2026, 4, 17)), [
    '2026-05',
    '2026-04',
    '2026-03',
  ]);
});

test('선적관리 날짜 필터 바는 월 다중선택 버튼과 조회 건수 텍스트를 정렬한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );

  assert.match(source, /buildRecentShippingMonthOptions\(\)/);
  assert.match(source, /getDefaultShippingMonthKeys\(\)/);
  assert.match(source, /dateFilter\.months\?\.length > 0/);
  assert.doesNotMatch(source, /type="date"/);
  assert.match(css, /\.monthFilterBtn[\s\S]*height: 28px;[\s\S]*display: inline-flex;[\s\S]*align-items: center;/);
  assert.match(css, /\.quickFilterBtn[\s\S]*height: 28px;[\s\S]*display: inline-flex;[\s\S]*align-items: center;/);
  assert.match(css, /\.resultCountText[\s\S]*border: 0;[\s\S]*background: transparent;/);
});

test('선적관리 날짜 필터 컬럼은 실제 날짜값이 있는 컬럼만 후보로 쓴다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );

  assert.match(source, /const DATE_COLUMN_SAMPLE_SIZE = 200;/);
  assert.match(source, /headers\.filter\(\(h, idx\) => isDateColumn\(h, data\?\.data \|\| \[\], idx\)\)/);
  assert.match(source, /if \(checked === 0\) return false;/);
  assert.match(source, /dateValues >= 2 \|\| dateValues \/ checked >= 0\.2/);
  assert.doesNotMatch(source, /DATE_COL_KEYWORDS = \[[^\]]*'선적'/);
});

test('선적관리 모바일 상단과 월 선택 영역은 한 화면 폭 안에서 정렬된다', () => {
  const css = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );

  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.topSummaryRow[\s\S]*flex: 0 0 auto;[\s\S]*width: 100%;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.title[\s\S]*line-height: 1\.2;[\s\S]*border-bottom: 1px solid #e2e8f0;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.rightControls[\s\S]*flex: 0 0 auto;[\s\S]*width: 100%;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.dateFilterZone[\s\S]*grid-template-columns: 76px minmax\(0, 1fr\);/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.dateSelect[\s\S]*min-width: 0;[\s\S]*height: 32px;/);
});

test('선적관리 테이블은 필터/정렬 조회 중 행이 비면 조회중 안내를 표시한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );

  assert.match(source, /const tableIsRefreshing = Boolean\(searchRefreshing \|\| loadingMore \|\| shouldLoadFullRowsForFilters\);/);
  assert.match(source, /visibleRows\.length === 0[\s\S]*tableIsRefreshing \? '데이터를 불러오는 중입니다\.\.\.' : '조건에 맞는 자료가 없습니다\.'/);
  assert.match(css, /\.tableMessageCell/);
});

test('아산 페이지 로딩 메시지는 같은 문구와 폰트 기준을 사용한다', () => {
  const page = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const shipping = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );
  const annual = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js'),
    'utf8',
  );
  const dispatchCss = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/dispatch.module.css'),
    'utf8',
  );
  const shippingCss = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );
  const annualCss = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/annualPerformance.module.css'),
    'utf8',
  );

  for (const source of [page, shipping, annual]) {
    assert.match(source, /데이터를 불러오는 중입니다\.\.\./);
  }
  for (const css of [dispatchCss, shippingCss, annualCss]) {
    assert.match(css, /font-size: 0\.86rem/);
    assert.match(css, /font-weight: 800/);
    assert.match(css, /color: #64748b/);
  }
});

test('컨테이너 조회 유틸은 필터 결과의 컨테이너와 No 1 메인 행을 고른다', () => {
  const headers = ['DATE', 'CONTAINER', 'CUSTOMER'];
  const rows = [
    ['2026-04-30', 'TCLU8300912', 'A'],
    ['2026-04-30', 'bad', 'B'],
    ['2026-04-30', 'TRHU5191927', 'C'],
    ['2026-04-30', 'TCLU8300912', 'D'],
  ];

  assert.deepEqual(extractUniqueContainerNos(headers, rows), ['TCLU8300912', 'TRHU5191927']);

  const lookupMap = buildContainerLookupMapFromRows([
    ['TCLU8300912', '2', '수출', '반출', 'OLD', '2026-05-01 08:00'],
    ['TCLU8300912', '1', '수출', '반입', 'HJNC', '2026-05-01 09:00'],
  ], ['TCLU8300912'], '2026-05-16T00:00:00.000Z');

  assert.equal(lookupMap.TCLU8300912.mainRow[1], '1');
  assert.equal(lookupMap.TCLU8300912.mainRow[4], 'HJNC');
  assert.equal(lookupMap.TCLU8300912.lookedUpAt, '2026-05-16T00:00:00.000Z');
});

test('컨테이너 조회 저장 유틸은 실제 이력 행만 결과로 인정한다', () => {
  assert.equal(isActualContainerHistoryRow(['TCLU8300912', '1', '수출', '반입']), true);
  assert.equal(isActualContainerHistoryRow(['TCLU8300912', 'ERROR', '워커 대기 시간 초과']), false);
  assert.equal(isActualContainerHistoryRow(['TCLU8300912', 'NODATA', '내역 없음']), false);

  const lookupMap = buildContainerLookupMapFromRows([
    ['TCLU8300912', 'ERROR', '워커 대기 시간 초과'],
    ['TRHU5191927', 'NODATA', '내역 없음'],
    ['MSKU5071276', '1', '수입', '반출', '부산', '2026-05-16 10:00'],
  ], ['TCLU8300912', 'TRHU5191927', 'MSKU5071276'], '2026-05-16T00:00:00.000Z');

  assert.deepEqual(Object.keys(lookupMap), ['MSKU5071276']);
  assert.equal(lookupMap.MSKU5071276.mainRow[1], '1');
});
