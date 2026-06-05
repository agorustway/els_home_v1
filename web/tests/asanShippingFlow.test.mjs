import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildContainerLookupMapFromRows,
  extractUniqueContainerNos,
  formatContainerLookupDateTime,
  getContainerLookupValue,
  isActualContainerHistoryRow,
  orderContainerLookupTargets,
} from '../utils/containerHistoryResults.mjs';
import {
  buildRecentShippingMonthOptions,
  compareShippingFilterValues,
  filterShippingDisplayHeaders,
  findWorkDateColumnIndex,
  getDefaultShippingMonthKeys,
  getShippingVirtualWindow,
  getShippingSignalTone,
  getVisibleShippingColumns,
  isAnonymousShippingColumn,
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
    assert.match(source, /shipping_sync_lock = threading\.Lock\(\)/);
    assert.match(source, /shipping_sync_lock\.acquire\(blocking=False\)/);
    assert.match(source, /sync_running"\] = True/);
    assert.match(source, /shipping_sync_lock\.release\(\)/);
    assert.doesNotMatch(
      source,
      /source = request\.args\.get\("source", "auto"\)[\s\S]*sync_asan_shipping_python\(force=force, rel_path=rel_path\)/,
      `${rel} GET should not sync before reading DB`,
    );
    assert.match(
      source,
      /def _shipping_rows_query\(normalized_path, headers, search_terms, date_col, months, count=None\):[\s\S]*q = q\.or_\(filters\)/,
      `${rel} comma-separated search should use server-side OR filters`,
    );
    assert.match(source, /def _shipping_sort_value\(value\):/);
    assert.match(
      source,
      /def query_asan_shipping_db\(rel_path, page=1, page_size=5000, search="", sort_key="", sort_dir="asc", date_col="", months=""\):/,
      `${rel} DB query should accept sort and month-filter params`,
    );
    assert.match(source, /sort_idx = headers\.index\(sort_key\) if sort_key in headers else -1/);
    assert.match(source, /def _shipping_fetch_rows_in_chunks\(query_factory, start, end, chunk_size=1000\):/);
    assert.match(source, /query_factory\(count="exact" if total is None else None\)/);
    assert.match(
      source,
      /if sort_idx >= 0:[\s\S]*_shipping_fetch_rows_in_chunks\(query_factory, 0, 9999\)[\s\S]*sortable\.sort\([\s\S]*page_rows = ordered_rows\[start:end \+ 1\]/,
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
    assert.match(source, /def _shipping_apply_month_filter\(q, headers, date_col, months\):/);
    assert.match(source, /date_col = \(.*get\("date_col"\)[\s\S]*months = .*get\("months"\)/);
    assert.match(
      source,
      /query_asan_shipping_db\([\s\S]*date_col=date_col[\s\S]*months=months/,
      `${rel} route should pass date month params into DB query`,
    );
    assert.match(source, /def _shipping_check_supabase_result\(result, action\):/);
    assert.match(source, /def _shipping_count_synced_rows\(normalized_path\):/);
    assert.match(source, /선적관리 행 저장 검증 실패/);
    assert.match(source, /"synced_count": synced_count/);
    assert.match(source, /"meta_row_count": meta\.get\("row_count", 0\)/);
    assert.match(source, /def _shipping_db_data_is_stale_empty\(db_data\):/);
    assert.match(source, /엑셀 fallback 사용/);
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
  assert.match(dbReader, /function applyDateMonthFilter\(query, \{ headers = \[\], dateCol = '', months = \[\] \} = \{\}\)/);
  assert.match(dbReader, /const SUPABASE_RANGE_CHUNK_SIZE = 1000;/);
  assert.match(dbReader, /async function fetchRowsInChunks\(buildQuery, start, end, chunkSize = SUPABASE_RANGE_CHUNK_SIZE\)/);
  assert.match(dbReader, /buildQuery\(\{ count: total == null \? 'exact' : undefined \}\)/);
  assert.match(dbReader, /return \{ query: dateFilter\.query, dateFilter \}/);
  assert.match(dbReader, /date_col: dateFilter\.dateCol/);
  assert.match(dbReader, /months: dateFilter\.months/);
  assert.match(dbReader, /read_path: 'next-direct'/);
});

test('아산 선적관리 화면은 DB 조회를 페이지 단위로 가져온다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );

  assert.match(source, /const SHIPPING_PAGE_SIZE = 100;/);
  assert.match(source, /const MOBILE_RENDER_BATCH_SIZE = 100;/);
  assert.match(source, /const FULL_FILTER_PAGE_SIZE = 10000;/);
  assert.match(source, /page_size: String\(pageSize\)/);
  assert.match(source, /params\.set\('date_col', dateCol\)/);
  assert.match(source, /params\.set\('months', months\.join\(','\)\)/);
  assert.match(source, /function getServerSortParams\(config\)/);
  assert.match(source, /params\.set\('sort_key', sortKey\)/);
  assert.match(source, /applyShippingData\(j\.data, \{ append \}\)/);
  assert.match(source, /const isServerSort = isServerPaged && sortConfig\.key && !isContainerLookupColumn\(sortConfig\.key\);/);
  assert.match(source, /if \(sortConfig\.key && !isServerSort\)/);
  assert.match(source, /else if \(!sortConfig\.key\)/);
  assert.match(source, /sort_key: serverSortParams\.sortKey/);
  assert.match(source, /force: false/);
  assert.doesNotMatch(source, /force: true/);
  assert.match(source, /date_col: dateFilter\.col/);
  assert.match(source, /months: dateFilter\.months \|\| \[\]/);
  assert.match(source, /const shouldLoadFullRowsForFilters = Boolean/);
  assert.match(source, /&& !isMobileTableMode[\s\S]*&& Number\(data\?\.total \|\| 0\) > \(data\?\.data\?\.length \|\| 0\)/);
  assert.match(source, /pageSize: FULL_FILTER_PAGE_SIZE/);
  assert.match(source, /\.\.\.serverDateFilterParams/);
  assert.doesNotMatch(source, /\|\| Boolean\(dateFilter\.col && dateFilter\.months\?\.length > 0\)/);
  assert.match(source, /const handleTableScroll = \(e\) =>/);
  assert.match(source, /if \(isMobileTableMode\) return;/);
  assert.match(source, /remaining < ROW_HEIGHT \* 10/);
  assert.match(source, /onScroll=\{handleTableScroll\}/);
  assert.match(source, /window\.addEventListener\('scroll', handleWindowScroll, \{ passive: true \}\)/);
  assert.match(source, /const \[mobileVisibleLimit, setMobileVisibleLimit\] = useState\(MOBILE_RENDER_BATCH_SIZE\);/);
  assert.match(source, /setMobileVisibleLimit\(MOBILE_RENDER_BATCH_SIZE\);/);
  assert.match(source, /const canRevealMoreMobileRows = isMobileTableMode && mobileVisibleLimit < totalRows;/);
  assert.match(source, /setMobileVisibleLimit\(prev => Math\.min\(totalRows, prev \+ MOBILE_RENDER_BATCH_SIZE\)\)/);
  assert.match(source, /const visibleEnd = isMobileTableMode \? Math\.min\(totalRows, mobileVisibleLimit\) : virtualWindow\.visibleEnd;/);
  assert.match(source, /const visibleRows = processedData\.slice\(visibleStart, visibleEnd\);/);
  assert.match(source, /canRevealMoreMobileRows \|\| canLoadMore/);
  assert.match(source, /onClick=\{handleListMore\}/);
  assert.match(source, /function scheduleShippingIdleTask/);
  assert.match(source, /return scheduleShippingIdleTask\(\(\) => loadSavedContainerLookupResults\(containers\)\)/);
  assert.match(source, /const \[unshippedOnly, setUnshippedOnly\] = useState\(false\);/);
  assert.match(source, /const \[storageOnly, setStorageOnly\] = useState\(false\);/);
  assert.match(source, /const \[confirmedVesselOnly, setConfirmedVesselOnly\] = useState\(false\);/);
  assert.match(source, /getFilterCellValue\(row, '보관소'\)\.includes\('자체보관'\)/);
  assert.match(source, /function hasConfirmedVesselValue\(headers = \[\], row = \[\]\)/);
  assert.match(source, /rows = rows\.filter\(row => hasConfirmedVesselValue\(data\?\.headers \|\| \[\], row\)\);/);
  assert.match(source, /styles\.resultCountText/);
  assert.match(source, /const serverTotalRowsLabel = `\$\{serverTotalRows\.toLocaleString\(\)\}\$\{data\?\.total_is_estimated \? '\+' : ''\}`;/);
  assert.match(source, /전체 \{serverTotalRowsLabel\}건 \/ 조회 \{totalRows\.toLocaleString\(\)\}건/);
  assert.match(source, /\{unshippedOnly \? '필터해제' : '미선적'\}/);
  assert.match(source, /\{storageOnly \? '필터해제' : '자체보관'\}/);
  assert.match(source, /\{confirmedVesselOnly \? '필터해제' : '확정모선'\}/);
  assert.doesNotMatch(source, /import \* as XLSX from 'xlsx'/);
  assert.doesNotMatch(source, /await import\('xlsx'\)/);
  assert.match(source, /fetch\('\/api\/branches\/asan\/export\/view'/);
  assert.match(source, /const blob = await response\.blob\(\);/);
  assert.match(source, /data\.source === 'supabase'[\s\S]*더 보기/);
});

test('아산 페이지는 마지막 메인 탭을 기억해 불필요한 기본 fetch를 줄인다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );

  assert.match(source, /const ASAN_MAIN_TAB_KEY = 'asan_main_tab';/);
  assert.match(source, /const ASAN_PERFORMANCE_TAB_KEY = 'asan_performance_tab';/);
  assert.match(source, /const MAIN_TABS = \['dispatch', 'transport-history', 'shipping', 'performance'\];/);
  assert.match(source, /import dynamic from 'next\/dynamic';/);
  assert.match(source, /const loadAsanShipping = \(\) => import\('\.\/AsanShipping'\);/);
  assert.match(source, /const AsanShipping = dynamic\(loadAsanShipping/);
  assert.match(source, /function scheduleIdlePrefetch/);
  assert.match(source, /function prefetchAsanLoaders/);
  assert.match(source, /onMouseEnter=\{\(\) => prefetchMainTab\('shipping'\)\}/);
  assert.match(source, /localStorage\.setItem\(ASAN_MAIN_TAB_KEY, 'dispatch'\)/);
  assert.match(source, /localStorage\.setItem\(ASAN_MAIN_TAB_KEY, tab\)/);
  assert.match(source, /localStorage\.setItem\(ASAN_PERFORMANCE_TAB_KEY, 'summary-performance'\)/);
  assert.match(source, /const \[activeMainTab, setActiveMainTab\] = useState\(null\);/);
  assert.doesNotMatch(source, /import AsanShipping from '\.\/AsanShipping'/);
  assert.doesNotMatch(source, /import AsanMonthlyPerformance from '\.\/AsanMonthlyPerformance'/);
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
    const schedulerSource = [...source.matchAll(
      /def asan_(?:sync|dispatch_sync|shipping_sync)_scheduler\(\):[\s\S]*?(?=\ndef\s|\n@app\.route|\n# 스케줄러 시작|$)/g,
    )].map(match => match[0]).join('\n');
    assert.match(source, /ASAN_DISPATCH_SYNC_POLL_SECONDS = _env_int\("ASAN_DISPATCH_SYNC_POLL_SECONDS", 60, 15\)/);
    assert.match(source, /ASAN_SHIPPING_SYNC_POLL_SECONDS = _env_int\("ASAN_SHIPPING_SYNC_POLL_SECONDS", 60, 30\)/);
    assert.match(source, /ASAN_DISPATCH_SETTINGS_CACHE_SECONDS = _env_int\("ASAN_DISPATCH_SETTINGS_CACHE_SECONDS", 300, 30\)/);
    assert.match(source, /ASAN_DISPATCH_DASHBOARD_CACHE_URL/);
    assert.match(source, /ASAN_DISPATCH_DASHBOARD_CACHE_TOKEN = os\.environ\.get\("ASAN_DISPATCH_DASHBOARD_CACHE_TOKEN"\) or SUPABASE_KEY/);
    assert.match(source, /def _refresh_asan_dispatch_dashboard_cache_async/);
    assert.match(source, /\/api\/branches\/asan\/dispatch\/dashboard/);
    assert.match(source, /"Authorization": f"Bearer \{ASAN_DISPATCH_DASHBOARD_CACHE_TOKEN\}"/);
    assert.match(source, /body=\{response\.text\[:300\]\}/);
    assert.match(source, /def get_asan_dispatch_settings\(force=False\):/);
    assert.match(source, /dispatch_settings_cache\["loaded_at"\] = now_ts/);
    assert.match(schedulerSource, /asan_(?:sync|dispatch_sync)_scheduler/);
    assert.match(schedulerSource, /asan_shipping_sync_scheduler/);
    assert.doesNotMatch(schedulerSource, /변경 없음/);
    assert.doesNotMatch(schedulerSource, /대상 파일 체크/);
    assert.doesNotMatch(schedulerSource, /체크[: -]+.*캐시/);
  }

  const performanceSource = fs.readFileSync(path.join(repoRoot, 'docker/els-backend/asan_performance.py'), 'utf8');
  assert.match(performanceSource, /ASAN_PERFORMANCE_SYNC_POLL_SECONDS", 300, 60/);
});

test('선적관리 컨테이너 자동조회는 DB 설정과 새벽 스케줄을 사용한다', () => {
  const shipping = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );
  const settingsRoute = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/settings/route.js'),
    'utf8',
  );
  const migration = fs.readFileSync(
    path.join(repoRoot, 'web/supabase_sql/20260519_asan_shipping_container_auto_lookup.sql'),
    'utf8',
  );
  const daemon = fs.readFileSync(path.join(repoRoot, 'elsbot/els_web_runner_daemon.py'), 'utf8');

  assert.match(shipping, /const \[containerAutoLookupEnabled, setContainerAutoLookupEnabled\] = useState\(true\);/);
  assert.match(shipping, /shipping_container_auto_lookup_enabled: checked/);
  assert.match(shipping, /컨테이너 자동조회/);
  assert.match(shipping, /컨테이너이력조회초기화 매일 03:00/);
  assert.match(shipping, /컨테이너 자동조회 03:10/);
  assert.match(shipping, /조건 모든 항목에서 &quot;적하&quot;외 컨테이너 조회/);
  assert.match(settingsRoute, /shipping_container_auto_lookup_enabled/);
  assert.match(settingsRoute, /data\.shipping_container_auto_lookup_enabled !== false/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS shipping_container_auto_lookup_enabled BOOLEAN DEFAULT true/);
  assert.match(daemon, /now\.hour == 3 and now\.minute < 2/);
  assert.match(daemon, /DAILY RESET @ 03:00 KST ENABLED/);
  assert.match(daemon, /MAX_AUTO_LOGIN_ATTEMPTS = 3/);
  assert.match(daemon, /self\.late_worker_min_ready = max\(1, int\(os\.environ\.get\("ELS_LATE_WORKER_MIN_READY", 1\)\)\)/);
  assert.match(daemon, /def mark_auth_failure\(self, message, reason\):[\s\S]*self\.stop_requested\.set\(\)/);

  for (const rel of backendFiles) {
    const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.match(source, /ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_HOUR = _env_int\("ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_HOUR", 3, 0\)/);
    assert.match(source, /ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_MINUTE = _env_int\("ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_MINUTE", 10, 0\)/);
    assert.match(source, /ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_TIMEOUT_SECONDS = _env_int\("ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_TIMEOUT_SECONDS", 3600, 300\)/);
    assert.match(source, /ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_ACQUIRE_TIMEOUT_SECONDS = _env_int\("ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_ACQUIRE_TIMEOUT_SECONDS", 300, 30\)/);
    assert.match(source, /def maybe_run_asan_shipping_container_auto_lookup\(now=None\):/);
    assert.match(source, /maybe_run_asan_shipping_container_auto_lookup\(now\)/);
    assert.match(source, /DB 설정 컬럼 미적용 상태라 자동조회 실행을 보류/);
    assert.match(source, /targets = \[cn for cn in containers if statuses\.get\(cn\) != "적하"\]/);
    assert.match(source, /"stableBatchMode": True/);
    assert.match(source, /"maxBatchWorkers": 1/);
    assert.match(source, /"acquireTimeoutSec": ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_ACQUIRE_TIMEOUT_SECONDS/);
    assert.match(source, /timeout=\(10, ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_TIMEOUT_SECONDS\)/);
    assert.match(source, /failed_count >= ASAN_SHIPPING_CONTAINER_AUTO_LOOKUP_FAIL_LIMIT/);
    assert.match(source, /set_asan_shipping_container_auto_lookup_enabled\(False, reason=reason\)/);
    assert.match(source, /shipping_container_lookup_jobs = \{\}/);
    assert.match(source, /@app\.route\("\/api\/branches\/asan\/shipping\/container-lookup\/jobs", methods=\["GET", "POST", "DELETE"\]\)/);
    assert.match(source, /jobs = list\(shipping_container_lookup_jobs\.values\(\)\)/);
    assert.match(source, /item\.get\("state"\) in \("running", "stopping"\)/);
    assert.match(source, /threading\.Thread\(target=_run_shipping_container_lookup_job/);
    assert.match(source, /lookup_source="asan_shipping_manual_background"/);
  }
});

test('선적관리 대량 컨테이너 조회는 안정 모드로 속도를 낮추고 진행 상태를 오래 유지한다', () => {
  const bot = fs.readFileSync(path.join(repoRoot, 'docker/els-backend/app_bot.py'), 'utf8');
  const lookupRoute = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/shipping/container-lookup/route.js'),
    'utf8',
  );

  assert.match(bot, /def _large_batch_threshold\(\):/);
  assert.match(bot, /return _int_env\("ELS_LARGE_BATCH_THRESHOLD", 100, 1\)/);
  assert.match(bot, /def _is_large_batch\(total, data=None\):/);
  assert.match(bot, /ELS_LARGE_BATCH_ACQUIRE_TIMEOUT_SEC", 300, 30/);
  assert.match(bot, /ELS_LARGE_BATCH_SUBMIT_DELAY_SEC", 2\.0, 0/);
  assert.match(bot, /_int_env\("ELS_LARGE_BATCH_MAX_WORKERS", 1, 1\)/);
  assert.match(bot, /"acquireTimeoutSec": worker_acquire_timeout/);
  assert.match(bot, /urlopen\(req, timeout=single_request_timeout\)/);
  assert.match(bot, /wait_left = submit_delay_sec - \(time\.time\(\) - last_submit_at\)/);
  assert.match(bot, /"워커 대기 시간 초과"/);
  assert.match(bot, /zombie_limit, idle_limit = _progress_recovery_limits\(global_progress\)/);
  assert.doesNotMatch(bot, /elapsed > 300/);

  assert.match(lookupRoute, /containers\.length >= 100/);
  assert.match(lookupRoute, /function getJobsUrl\(\)/);
  assert.match(lookupRoute, /body\.forceStream !== true/);
  assert.match(lookupRoute, /대량 컨테이너 조회는 NAS 백그라운드 작업으로 전환/);
  assert.match(lookupRoute, /background_job: job/);
  assert.match(lookupRoute, /stableBatchMode: true/);
  assert.match(lookupRoute, /maxBatchWorkers: body\.maxBatchWorkers \?\? 1/);
  assert.match(lookupRoute, /acquireTimeoutSec: body\.acquireTimeoutSec \?\? 300/);
  assert.match(lookupRoute, /submitDelaySec: body\.submitDelaySec \?\? 2/);
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
  const lookupJobRoute = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/shipping/container-lookup/jobs/route.js'),
    'utf8',
  );
  const store = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/shipping/container-results/store.js'),
    'utf8',
  );

  assert.match(source, /extractUniqueContainerNos\(data\?\.headers \|\| \[\], processedData\)/);
  assert.match(source, /orderContainerLookupTargets\(tableOrderedContainers, containerLookupResultsRef\.current\)/);
  assert.match(source, /미조회 \$\{missingLookupCount\.toLocaleString\(\)\}건 우선/);
  assert.match(source, /fetch\('\/api\/branches\/asan\/shipping\/container-lookup\/jobs'/);
  assert.match(source, /jobId: job\.id/);
  assert.match(source, /const suffix = jobId \? `\?id=\$\{encodeURIComponent\(jobId\)\}` : '';/);
  assert.match(source, /fetchContainerLookupJob\(session\.jobId \|\| ''\)/);
  assert.match(source, /\/api\/branches\/asan\/shipping\/container-results/);
  assert.match(source, /CONTAINER_LOOKUP_DISPLAY_COLUMNS/);
  assert.match(source, /mergePendingContainerLookupResults\(prev, containers\)/);
  assert.doesNotMatch(source, /조회 대기중/);
  assert.match(source, /styles\.lookupHeader/);
  assert.match(source, /styles\.lookupCell/);
  assert.match(source, /signalTone === 'completed' \? styles\.completedRow : ''/);
  assert.match(source, /DB수정/);
  assert.match(css, /\.tableWrap[\s\S]*overflow-x: auto;[\s\S]*max-width: 100%;/);
  assert.match(css, /\.table \{[\s\S]*width: max-content;[\s\S]*min-width: 100%;/);
  assert.match(css, /\.table th\.lookupHeader[\s\S]*background: #15803d;/);
  assert.match(css, /\.table tr\.completedRow td[\s\S]*background: #f1f5f9;[\s\S]*color: #94a3b8;/);
  assert.match(css, /\.table tr:hover td,[\s\S]*\.table tr:hover td\.lookupCell[\s\S]*background: #dcfce7;/);
  assert.match(store, /branch_shipping_container_lookups/);
  assert.match(route, /saveContainerLookupRows/);
  assert.match(lookupRoute, /saveContainerLookupRows/);
  assert.match(lookupRoute, /RESULT_PARTIAL:[\s\S]*saved_data/);
  assert.match(lookupRoute, /RESULT:[\s\S]*saved_count/);
  assert.match(lookupJobRoute, /container-lookup\/jobs/);
  assert.match(lookupJobRoute, /export async function DELETE/);
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
  assert.match(source, /filterShippingDisplayHeaders\(payload\.headers\)/);
  assert.match(source, /page_key=asan_shipping_default&fallback=asan_shipping_admin_p1/);
  assert.match(source, /\{orderedVisibleColumns\.map\(col =>/);
  assert.match(source, /if \(headers\.length === 0 \|\| allHeaders\.length === 0\) return;/);
  assert.match(css, /\.hiddenLookupChip[\s\S]*background: #e8f7ee;/);
  assert.match(css, /\.hiddenChip[\s\S]*max-width: 78px;[\s\S]*text-overflow: ellipsis;/);
  assert.match(source, /function getHiddenChipLabel\(col\)/);
  assert.match(source, /title="숨긴 컬럼입니다\./);
  assert.doesNotMatch(source, />\s*\{hiddenCols\.size === 0 \? '이곳에 컬럼을 드래그하여 숨길 수 있습니다'/);
});

test('선적관리 숨김 컬럼은 엑셀/이력 컬럼 모두 실제 표시 목록에서 빠진다', () => {
  const headers = ['지역', 'COL1', 'CONTAINER', '이력 구분', 'COLS2', '이력 MOVE TIME'];
  const filteredHeaders = filterShippingDisplayHeaders(headers);
  const order = normalizeShippingColumnOrder(['이력 구분', 'COL1', '지역'], filteredHeaders);

  assert.equal(isAnonymousShippingColumn('COL1'), true);
  assert.equal(isAnonymousShippingColumn('COLS2'), true);
  assert.deepEqual(filteredHeaders, ['지역', 'CONTAINER', '이력 구분', '이력 MOVE TIME']);
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

test('선적관리 사용자 prefs API는 기존 사용자값이 없을 때만 최병훈 P1 fallback을 요청한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/user/prefs/route.js'),
    'utf8',
  );

  assert.match(source, /asan_shipping_admin_p1/);
  assert.match(source, /ownerEmail: 'orakami@gmail\.com'/);
  assert.match(source, /fallbackPageKey: 'asan_shipping_preset_1'/);
  assert.match(source, /if \(data\) return NextResponse\.json\(\{ data: data\.settings \|\| \{\}, source: 'user' \}\);/);
  assert.match(source, /const fallbackSettings = await readAllowedFallbackPrefs\(pageKey, fallbackToken\);/);
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

  assert.match(source, /전체 \{serverTotalRowsLabel\}건 \/ 조회 \{totalRows\.toLocaleString\(\)\}건/);
  assert.match(source, /컨테이너 조회건수 \{containerLookupProgress\.total\.toLocaleString\(\)\}건/);
  assert.match(source, /조회완료 \{containerLookupProgress\.completed\.toLocaleString\(\)\}건/);
  assert.match(source, /조회실패 \{containerLookupProgress\.failed\.toLocaleString\(\)\}건/);
  assert.ok(
    source.indexOf('className={styles.lookupStatusCounts}') < source.indexOf('className={styles.lookupStatusMessage}'),
    'container lookup counts should be rendered before the changing status message',
  );
  assert.match(source, /fetchContainerLookupJob\(session\.jobId \|\| ''\)/);
  assert.match(source, /const LOOKUP_SESSION_KEY = 'asan_shipping_container_lookup_session';/);
  assert.match(source, /function readContainerLookupSession\(\)/);
  assert.match(source, /function writeContainerLookupSession\(session\)/);
  assert.match(source, /const refreshContainerLookupSession = useCallback\(async \(options = \{\}\) =>/);
  assert.match(source, /localStorage\.setItem\(LOOKUP_SESSION_KEY, JSON\.stringify\(next\)\)/);
  assert.match(source, /const lookedUpAt = Date\.parse\(record\.lookedUpAt \|\| ''\);/);
  assert.match(source, /lookedUpAt >= startedAt/);
  assert.match(source, /setInterval\(\(\) => \{\s*refreshContainerLookupSession\(\{ session: activeLookupSession \}\);/);
  assert.match(source, /disabled=\{containerLookupRunning \|\| activeLookupRunning\}/);
  assert.match(source, /const \[containerLookupStopping, setContainerLookupStopping\] = useState\(false\);/);
  assert.match(source, /const handleStopContainerLookup = async \(\) =>/);
  assert.match(source, /containerLookupAbortRef\.current = null/);
  assert.match(source, /method: 'DELETE'[\s\S]*body: JSON\.stringify\(\{ id: session\.jobId \}\)/);
  assert.match(source, /fetch\('\/api\/els\/stop-daemon', \{ method: 'POST' \}\)/);
  assert.match(source, /조회 멈춤/);
  assert.match(source, /조회 중단됨: 완료/);
  assert.match(source, /미조회 \{containerLookupProgress\.remaining\.toLocaleString\(\)\}건/);
  assert.match(source, /job\.errorSummary \|\| null/);
  assert.match(source, /실패 사유: \{containerLookupErrorSummary\.message\}/);
  assert.match(source, /이전 컨테이너 조회가 아직 진행 중입니다/);
  assert.match(css, /\.lookupStatusFailed[\s\S]*color: #dc2626;/);
  assert.match(css, /\.lookupStatusMessage[\s\S]*order: 1;/);
  assert.match(css, /\.stopLookupBtn[\s\S]*color: #be123c;/);
  assert.match(css, /\.lookupStatusErrorDetail[\s\S]*order: 2;/);
});

test('선적관리 컨테이너 이력은 반입/적하 이력구분을 선적완료로 판정한다', () => {
  const headers = ['작업일자', 'CONTAINER'];
  const row = ['2026-05-16', 'TCLU8300912'];

  assert.equal(getShippingSignalTone(headers, row, {
    mainRow: ['TCLU8300912', '1', '수출', '반입', 'HJNC', '2026-05-15 09:00'],
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
  }), 'completed');
  assert.equal(getShippingSignalTone(headers, row, null), 'neutral');
});

test('선적관리 미조회 미선적 판정은 실제 선적관리 날짜 컬럼인 반입일을 작업 기준일로 쓴다', () => {
  const headers = ['픽업', 'CONTAINER', '반입일', '보관소'];
  const row = ['', 'TCLU8300912', '2026-05-16', '청암CY'];

  assert.equal(findWorkDateColumnIndex(headers), 2);
  assert.equal(isShippingUnshippedCandidate(headers, row, null, new Date('2026-05-18T09:00:00')), true);
  assert.equal(isShippingUnshippedCandidate(headers, ['', 'TCLU8300912', '2026-05-19', '청암CY'], null, new Date('2026-05-18T09:00:00')), false);
  assert.equal(getShippingSignalTone(headers, row, {
    mainRow: ['TCLU8300912', '1', '수출', '반출', 'HJNC', '2026-05-16 09:00'],
  }), 'unshipped');
  assert.equal(getShippingSignalTone(headers, row, {
    mainRow: ['TCLU8300912', '1', '수출', '적하', 'HJNC', '2026-05-16 12:00'],
  }), 'completed');
});

test('선적관리 미선적 빠른 필터는 반입/적하 외 이력과 작업일이 지난 미조회 행을 남긴다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );

  assert.match(source, /isShippingUnshippedCandidate\(data\?\.headers \|\| \[\], row, containerLookupResults\[containerNo\]\)/);
  assert.match(source, /title=\{unshippedOnly \? '미선적 필터 적용 중입니다\. 클릭하면 필터를 해제합니다\.' : '미선적 행만 표시합니다\.'\}/);
  assert.equal(isShippingUnshippedCandidate(['작업일자', 'CONTAINER'], ['2026-05-16', 'TCLU8300912'], null, new Date('2026-05-18T09:00:00')), true);
  assert.equal(isShippingUnshippedCandidate(['작업일자', 'CONTAINER'], ['2026-05-19', 'TCLU8300912'], null, new Date('2026-05-18T09:00:00')), false);
  assert.equal(isShippingUnshippedCandidate(['작업일자', 'CONTAINER'], ['2026-05-16', 'TCLU8300912'], {
    mainRow: ['TCLU8300912', '1', '수출', '반출', 'HJNC', '2026-05-16 09:00'],
  }), true);
  assert.equal(isShippingUnshippedCandidate(['작업일자', 'CONTAINER'], ['2026-05-16', 'TCLU8300912'], {
    mainRow: ['TCLU8300912', '1', '수출', '반출', 'HJNC', '2026-05-15 09:00'],
  }), true);
  assert.equal(isShippingUnshippedCandidate(['작업일자', 'CONTAINER'], ['2026-05-16', 'TCLU8300912'], {
    mainRow: ['TCLU8300912', '1', '수출', '적하', 'HJNC', '2026-05-15 23:59'],
  }), false);
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
  assert.match(source, /const fetchSavedContainerLookupResults = useCallback\(async \(containers\) =>/);
  assert.match(source, /for \(let i = 0; i < containers\.length; i \+= CONTAINER_RESULTS_CHUNK_SIZE\)/);
  assert.match(source, /containers\.slice\(i, i \+ CONTAINER_RESULTS_CHUNK_SIZE\)/);
  assert.match(source, /fetchSavedContainerLookupResults\(missingContainers\)/);
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
  assert.match(source, /fetchData\(selectedPath, \{ page: 1, search: searchTerm, quiet, \.\.\.serverSortParams, \.\.\.serverDateFilterParams \}\)/);
  assert.match(source, /value=\{searchInput\}/);
  assert.match(source, /const searchStatusText = searchPending \? '입력 대기' : \(shouldShowSearchRefreshing \? '검색 중' : ''\);/);
  assert.match(source, /styles\.searchStatusHidden/);
  assert.match(source, /onKeyDown=\{e => \{[\s\S]*if \(e\.key === 'Enter'\) setSearchTerm\(searchInput\);/);
  assert.match(css, /\.searchStatus/);
  assert.match(css, /\.searchStatusHidden/);
});

test('선적관리 월 필터는 오늘 기준 최근 6개월 선택지를 만든다', () => {
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
});

test('선적관리 기본 진입은 최근 3개월 작업일 필터를 서버 조건으로 넘긴다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );

  assert.match(source, /const SHIPPING_PAGE_SIZE = 100;/);
  assert.match(source, /const DEFAULT_DATE_FILTER_COL = '작업일';/);
  assert.match(source, /months: getDefaultShippingMonthKeys\(\)/);
  assert.match(source, /params\.set\('date_col', dateCol\)/);
  assert.match(source, /params\.set\('months', months\.join\(','\)\)/);
  assert.deepEqual(getDefaultShippingMonthKeys(new Date(2026, 4, 17), 3), ['2026-05', '2026-04', '2026-03']);
  assert.match(source, /pageSize = options\.pageSize \|\| SHIPPING_PAGE_SIZE/);
  assert.match(source, /const serverDateFilterParams = useMemo/);
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
  assert.match(source, /dateFilter\.months\?\.length > 0/);
  assert.doesNotMatch(source, /type="date"/);
  assert.match(css, /\.monthFilterBtn[\s\S]*height: 28px;[\s\S]*display: inline-flex;[\s\S]*align-items: center;/);
  assert.match(css, /\.quickFilterBtn[\s\S]*height: 28px;[\s\S]*display: inline-flex;[\s\S]*align-items: center;/);
  assert.match(css, /\.resultCountText[\s\S]*border: 0;[\s\S]*background: transparent;/);
});

test('선적관리 빠른 필터 해제 버튼은 hover 설명에 원래 필터명을 표시한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );

  assert.match(source, /title=\{unshippedOnly \? '미선적 필터 적용 중입니다\. 클릭하면 필터를 해제합니다\.' : '미선적 행만 표시합니다\.'\}/);
  assert.match(source, /title=\{storageOnly \? '자체보관 필터 적용 중입니다\. 클릭하면 필터를 해제합니다\.' : '자체보관 행만 표시합니다\.'\}/);
  assert.match(source, /title=\{confirmedVesselOnly \? '확정모선 필터 적용 중입니다\. 클릭하면 필터를 해제합니다\.' : '확정모선 값이 있는 행만 표시합니다\.'\}/);
});

test('선적관리 날짜 필터 컬럼은 실제 날짜값이 있는 컬럼만 후보로 쓴다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );

  assert.match(source, /const DATE_COLUMN_SAMPLE_SIZE = 200;/);
  assert.match(source, /const workDateIdx = findWorkDateColumnIndex\(headers\);/);
  assert.match(source, /idx === workDateIdx \|\| isDateColumn\(h, data\?\.data \|\| \[\], idx\)/);
  assert.match(source, /if \(checked === 0\) return strongDateName;/);
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
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.dateFilterZone[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.dateSelect[\s\S]*min-width: 0;[\s\S]*height: 32px;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.quickFilterGroup,[\s\S]*\.resultCountText \{[\s\S]*width: 100%;[\s\S]*min-width: 0;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.quickFilterGroup \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.quickFilterBtn \{[\s\S]*width: 100%;[\s\S]*min-width: 0;/);
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
  assert.deepEqual(
    orderContainerLookupTargets(['TCLU8300912', 'TRHU5191927', 'MSKU5071276'], {
      TRHU5191927: { mainRow: ['TRHU5191927', '1', '수출', '반입'] },
    }),
    ['TCLU8300912', 'MSKU5071276', 'TRHU5191927'],
  );

  const lookupMap = buildContainerLookupMapFromRows([
    ['TCLU8300912', '2', '수출', '반출', 'OLD', '2026-05-01 08:00'],
    ['TCLU8300912', '1', '수출', '반입', 'HJNC', '2026-05-01 09:00'],
  ], ['TCLU8300912'], '2026-05-16T00:00:00.000Z');

  assert.equal(lookupMap.TCLU8300912.mainRow[1], '1');
  assert.equal(lookupMap.TCLU8300912.mainRow[4], 'HJNC');
  assert.equal(lookupMap.TCLU8300912.lookedUpAt, '2026-05-16T00:00:00.000Z');
});

test('컨테이너 이력 날짜시간은 슬래시 24시간제로 통일한다', () => {
  assert.equal(formatContainerLookupDateTime('2026-05-21 12:31'), '2026/05/21 12:31');
  assert.equal(formatContainerLookupDateTime('2026. 5. 22. 오전 4:56:08'), '2026/05/22 04:56');
  assert.equal(formatContainerLookupDateTime('2026. 5. 22. 오후 4:56:08'), '2026/05/22 16:56');

  const record = {
    mainRow: ['TCLU8300912', '1', '수출', '반입', 'HJNC', '2026-05-21 12:31'],
    lookedUpAt: '2026-05-22 04:56:08',
  };

  assert.equal(getContainerLookupValue(record, '이력 MOVE TIME'), '2026/05/21 12:31');
  assert.equal(getContainerLookupValue(record, '이력 조회시각'), '2026/05/22 04:56');
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
