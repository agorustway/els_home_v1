import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ANNUAL_PERFORMANCE_PATH,
  formatPerformanceCellValue,
  formatPerformanceAmount,
  getPerformanceChartMax,
  normalizeAnnualPerformanceRow,
  parsePerformanceDateParts,
  normalizePerformancePath,
  normalizePerformanceColumnOrder,
  reconcilePerformanceLayoutPrefs,
} from '../utils/asanPerformanceView.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

test('아산 연간실적 Next 라우트는 NAS 백엔드로 프록시한다', () => {
  const source = read('web/app/api/branches/asan/performance/annual/route.js');
  const monthlyRoute = read('web/app/api/branches/asan/performance/monthly/route.js');
  const dbReader = read('web/lib/asan-branch-db.js');
  const annualPagedRowsSource = dbReader.slice(
    dbReader.indexOf('async function getAnnualPagedRows'),
    dbReader.indexOf('function mergeAnnualSummaries'),
  );
  assert.match(source, /queryAsanAnnualPerformanceFromSupabase/);
  assert.match(source, /queryAsanAnnualPerformanceDashboardFromSupabase/);
  assert.match(source, /dashboard/);
  assert.match(monthlyRoute, /queryAsanMonthlyPerformanceDashboardFromSupabase/);
  assert.match(monthlyRoute, /dashboard/);
  assert.match(source, /source === 'status'/);
  assert.match(source, /source !== 'excel'[\s\S]*queryAsanAnnualPerformanceFromSupabase\(url\.searchParams\)/);
  assert.match(source, /proxyToBackend\(req, '\/api\/branches\/asan\/performance\/annual'\)/);
  assert.match(source, /dynamic = 'force-dynamic'/);
  assert.doesNotMatch(source, /source !== 'excel'[\s\S]*if \(!process\.env\.ELS_BACKEND_URL\)/);
  assert.doesNotMatch(monthlyRoute, /source !== 'excel'[\s\S]*if \(!process\.env\.ELS_BACKEND_URL\)/);
  assert.match(dbReader, /branch_performance_files/);
  assert.match(dbReader, /branch_performance_rows/);
  assert.match(dbReader, /source: 'supabase-empty'/);
  assert.match(dbReader, /search_mode/);
  assert.match(dbReader, /shouldAggregateAnnualPerformance/);
  assert.match(dbReader, /queryAsanAnnualPerformanceAggregateFromSupabase/);
  assert.match(dbReader, /DASHBOARD_SNAPSHOT_TABLE = 'branch_performance_dashboard_snapshots'/);
  assert.match(dbReader, /queryAsanAnnualPerformanceDashboardFromSupabase/);
  assert.match(dbReader, /withDashboardSnapshot/);
  assert.match(dbReader, /normalizeSnapshotPayload/);
  assert.match(dbReader, /compactPerformanceDashboardSummary/);
  assert.match(dbReader, /delete compact\.weekly/);
  assert.match(dbReader, /delete compact\.sourceFiles/);
  assert.match(dbReader, /ANNUAL_SOURCE_FILE_HEADER/);
  assert.match(dbReader, /annual\.allCurrentSnapshots/);
  assert.match(dbReader, /currentSnapshotIds/);
  assert.match(dbReader, /const allMetasHaveSnapshot = snapshotIds\.length === metas\.length/);
  assert.match(dbReader, /orderBySnapshot/);
  assert.match(dbReader, /\.order\('snapshot_id', \{ ascending: true \}\)[\s\S]*\.order\('row_index', \{ ascending: true \}\)/);
  assert.equal(annualPagedRowsSource.includes(".order('year_value'"), false);
  assert.match(dbReader, /String\(mode \|\| ''\)\.toLowerCase\(\) === 'and'/);
  assert.match(dbReader, /nextQuery\.ilike\('search_text'/);
  assert.match(dbReader, /split\(\/\[;,，；\]\+\//);
  assert.match(dbReader, /replace\(\/\[;,，；\\\\\]\//);
  assert.match(dbReader, /function rowMatchesPerformanceSearch/);
  assert.match(dbReader, /PERFORMANCE_SEARCH_SCAN_BATCH_SIZE = 1000/);
  assert.match(dbReader, /PERFORMANCE_SEARCH_SCAN_MAX_ROWS = 600000/);
  assert.match(dbReader, /async function scanPerformanceSearchRows/);
  assert.match(dbReader, /buildOrderedQuery/);
  assert.match(annualPagedRowsSource, /buildBaseOrdered = buildQuery \? \(\) => orderQuery\(buildQuery\(\)\) : null/);
  assert.match(annualPagedRowsSource, /buildOrderedQuery: buildBaseOrdered/);
  assert.match(dbReader, /replace\(PERFORMANCE_SEARCH_COMPACT_RE/);
  assert.match(dbReader, /function performanceSearchTermParts/);
  assert.match(dbReader, /tokens\.length > 1\) return tokens\.every/);
  assert.match(dbReader, /function performanceSearchValuesFromRow/);
  assert.match(dbReader, /collectPerformanceSearchValues\(row\.row_data, values\)/);
  assert.match(dbReader, /collectPerformanceSearchValues\(row\.row_values, values\)/);
  assert.match(dbReader, /rowMatchesPerformanceSearch\(mapped, search, searchMode\)/);
  assert.match(dbReader, /row_data,row_values,row_index,file_path,sheet_name,year_value,month_value,snapshot_id/);
  assert.match(annualPagedRowsSource, /if \(shouldFilter\) \{/);
  assert.match(annualPagedRowsSource, /scanPerformanceSearchRows/);
  assert.match(dbReader, /totalEstimated/);
  assert.match(dbReader, /total_is_estimated/);
  assert.match(dbReader, /total: paged\.total \?\? fallbackTotal/);
  assert.match(dbReader, /total: paged\.total \?\? meta\.current_row_count \?\? 0/);
});

test('아산 연간실적 백엔드는 원장 행을 삭제하지 않고 current 상태만 전환한다', () => {
  const source = read('docker/els-backend/asan_performance.py');
  assert.match(source, /@app\.route\("\/api\/branches\/asan\/performance\/annual", methods=\["GET", "POST"\]\)/);
  assert.match(source, /branch_performance_rows/);
  assert.match(source, /"is_current": False/);
  assert.match(source, /"removed_from_excel"/);
  assert.doesNotMatch(source, /from_\("branch_performance_rows"\)\.delete\(/);
});

test('아산 연간실적 파일 탐색은 NAS 아산지점 공유 루트 후보까지 확인한다', () => {
  const source = read('docker/els-backend/asan_performance.py');
  assert.match(source, /ASAN_VOLUME_BRANCH_ROOTS = \("아산지점",\)/);
  assert.match(source, /root \/ branch_root \/ normalized\.lstrip\("\/"\)/);
  assert.match(source, /"checked_paths": _performance_candidate_paths\(rel_path\)/);
});

test('아산 연간실적 기본 조회는 Supabase 원장만 읽고 빈 DB는 동기화 대기로 응답한다', () => {
  const source = read('docker/els-backend/asan_performance.py');
  const dbReader = read('web/lib/asan-branch-db.js');
  assert.match(source, /request\.args\.get\("source", "supabase"\)/);
  assert.match(source, /_empty_supabase_data/);
  assert.match(source, /"source": "supabase-empty"/);
  assert.match(source, /if source != "excel":/);
  assert.match(source, /if source == "status":/);
  assert.match(source, /_start_background_sync/);
  assert.match(source, /body\.get\("async", False\)/);
  assert.match(source, /def _attach_sync_status/);
  assert.match(source, /payload\["sync_status"\] = _sync_status\(\)/);
  assert.match(source, /def _sync_only_data/);
  assert.match(source, /"sync_only": True/);
  assert.match(source, /\.select\("row_values,row_index"\)/);
  assert.doesNotMatch(source, /\.select\("row_values,row_index", count="exact"\)/);
  assert.match(dbReader, /fallbackTotal: search \? 0 : meta\.current_row_count \|\| meta\.row_count \|\| 0/);
  assert.match(dbReader, /currentSnapshotId/);
  assert.match(dbReader, /\.eq\('snapshot_id', currentSnapshotId\)/);
  assert.match(dbReader, /else \{\s*query = query\.eq\('is_current', true\);/);
  assert.doesNotMatch(dbReader, /branch_performance_rows'\)\s*\.select\('row_values,row_index', \{ count: 'exact' \}\)/);
});

test('아산 연간실적 운영 동기화는 장시간 작업 타임아웃을 피하도록 구성한다', () => {
  const component = read('web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js');
  const backend = read('docker/els-backend/asan_performance.py');
  const annualRouteSource = backend.slice(
    backend.indexOf('@app.route("/api/branches/asan/performance/annual"'),
  );
  const annualAsyncPostBlock = annualRouteSource.slice(
    annualRouteSource.indexOf('if run_async:'),
    annualRouteSource.indexOf('sync_result = _sync(force=bool(force)'),
  );
  const dockerfileCore = read('docker/els-backend/Dockerfile.core');
  const nginx = read('docker/els-gateway/nginx.conf');
  assert.match(component, /async: true/);
  assert.match(component, /params\.set\('dashboard', '1'\)/);
  assert.match(component, /activeTab === 'table' \|\| append \|\| Boolean\(options\.search\) \|\| Boolean\(options\.sortKey\)/);
  assert.match(component, /const searchEffectReadyRef = useRef\(false\)/);
  assert.match(component, /\[selectedPath, sheetName, headerRow, activeTab\]\); \/\/ eslint-disable-line react-hooks\/exhaustive-deps/);
  assert.doesNotMatch(component, /\[selectedPath, sheetName, headerRow, fetchData\]/);
  assert.match(component, /setInterval\(async \(\) => \{/);
  assert.match(component, /동기화 진행중/);
  assert.match(component, /fetchSyncStatus/);
  assert.match(component, /source: 'status'/);
  assert.match(component, /syncWasRunningRef/);
  assert.match(component, /nextPayload\.sync_only/);
  assert.match(backend, /ASAN_PERFORMANCE_SYNC_ENABLED/);
  assert.match(backend, /ASAN_PERFORMANCE_SYNC_START_HOUR", 0, 0/);
  assert.match(backend, /sync_start_hour <= now\.hour <= sync_end_hour/);
  assert.match(backend, /ASAN_PERFORMANCE_ALLOW_CORE_SYNC/);
  assert.match(backend, /ASAN_PERFORMANCE_EXTERNAL_SYNC_ENABLED/);
  assert.match(backend, /ASAN_PERFORMANCE_ALLOW_EXCEL_FALLBACK/);
  assert.match(backend, /external_repo_root/);
  assert.match(backend, /subprocess\.Popen/);
  assert.match(backend, /"--db-path"/);
  assert.match(backend, /"--summary-only"/);
  assert.match(backend, /external-summary-only/);
  assert.match(backend, /external-snapshot-import/);
  assert.match(backend, /ASAN_PERFORMANCE_SNAPSHOT_REFRESH_URL/);
  assert.match(backend, /_refresh_dashboard_snapshots_async\("annual"\)/);
  assert.match(backend, /if not allow_core_sync and not external_sync_enabled:/);
  assert.match(backend, /run_async = True/);
  assert.match(annualAsyncPostBlock, /_sync_only_data/);
  assert.doesNotMatch(annualAsyncPostBlock, /_query\(/);
  assert.match(backend, /core 메모리 보호를 위해 비활성화/);
  assert.match(backend, /cache\.pop\(normalized_path, None\)/);
  assert.match(backend, /gc\.collect\(\)/);
  assert.doesNotMatch(backend, /cache\[normalized_path\] = \{"mtime": mtime_ts/);
  assert.match(dockerfileCore, /nodejs npm util-linux/);
  assert.match(nginx, /location ~ \^\/api\/\(logs\|debug\|vehicle-tracking\|branches\|off-days\|vectorize\)/);
  assert.match(nginx, /proxy_read_timeout 900s/);
});

test('아산 연간실적 Supabase SQL은 누적 원장과 현재 조회 인덱스를 만든다', () => {
  const sql = read('web/supabase_sql/20260517_asan_annual_performance.sql');
  const lookupIndexSql = read('web/supabase_sql/20260517_asan_performance_current_lookup_index.sql');
  const snapshotIndexSql = read('web/supabase_sql/20260517_asan_performance_snapshot_row_index.sql');
  const recoverSql = read('web/supabase_sql/20260517_asan_performance_recover_staged_snapshot.sql');
  const analyticsSql = read('web/supabase_sql/20260517_asan_performance_rebuild_analytics_workbench_summary.sql');
  const vehicleScopeSql = read('web/supabase_sql/20260518_asan_performance_vehicle_scope_summary.sql');
  const dashboardSnapshotSql = read('web/supabase_sql/20260521_asan_performance_dashboard_snapshots.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS branch_performance_files/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS branch_performance_rows/);
  assert.match(sql, /is_current BOOLEAN NOT NULL DEFAULT true/);
  assert.match(sql, /WHERE is_current = true/);
  assert.match(sql, /ALTER TABLE branch_performance_rows ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE branch_performance_rows TO service_role/);
  assert.match(lookupIndexSql, /idx_branch_performance_rows_current_lookup/);
  assert.match(lookupIndexSql, /INCLUDE \(id, source_row_hash, snapshot_id\)/);
  assert.match(snapshotIndexSql, /idx_branch_performance_rows_snapshot_row_index/);
  assert.match(snapshotIndexSql, /ON branch_performance_rows\(snapshot_id, row_index\)/);
  assert.match(recoverSql, /change_status = 'staged_current'/);
  assert.match(recoverSql, /'currentSnapshotId'/);
  assert.match(recoverSql, /snapshot-replace-recovered/);
  assert.match(analyticsSql, /ledger-workbench-20260518-scope-vehicle/);
  assert.match(analyticsSql, /strategicSegments/);
  assert.match(analyticsSql, /own_direct/);
  assert.match(analyticsSql, /vehiclePerformance/);
  assert.match(analyticsSql, /vehicle_monthly/);
  assert.match(analyticsSql, /weekly/);
  assert.match(analyticsSql, /weekday/);
  assert.match(analyticsSql, /ledgerValidation/);
  assert.match(vehicleScopeSql, /ledger-workbench-20260518-scope-vehicle/);
  assert.match(vehicleScopeSql, /vehiclePerformance/);
  assert.match(vehicleScopeSql, /영업넘버/);
  assert.match(dashboardSnapshotSql, /CREATE TABLE IF NOT EXISTS branch_performance_dashboard_snapshots/);
  assert.match(dashboardSnapshotSql, /UNIQUE\(branch_id, dashboard_type, scope_key\)/);
  assert.match(dashboardSnapshotSql, /ALTER TABLE branch_performance_dashboard_snapshots ENABLE ROW LEVEL SECURITY/);
  assert.match(dashboardSnapshotSql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE branch_performance_dashboard_snapshots TO service_role/);
});

test('아산 연간실적 직접 주입 스크립트는 삭제 없이 current 전환 후 신규 스냅샷을 넣는다', () => {
  const source = read('web/scripts/import-asan-annual-performance.mjs');
  const runner = read('scripts/import-asan-annual-performance.sh');
  assert.match(source, /ExcelJS\.stream\.xlsx\.WorkbookReader/);
  assert.doesNotMatch(source, /XLSX\.utils\.sheet_to_json/);
  assert.match(source, /confirm-large-import/);
  assert.match(source, /file_modified_at_unchanged/);
  assert.match(source, /readPerformanceMeta/);
  assert.match(source, /importExcelSnapshotStreaming/);
  assert.match(source, /importExcelStreaming/);
  assert.match(source, /streamExcelRows/);
  assert.match(source, /diff-current/);
  assert.match(source, /staged_current/);
  assert.match(source, /bootstrap-snapshot/);
  assert.match(source, /snapshot-replace/);
  assert.match(source, /currentSnapshotId/);
  assert.match(source, /retire-previous-current/);
  assert.match(source, /summary-only/);
  assert.match(source, /!args\.force && !args\['summary-only'\]/);
  assert.match(source, /summarizeExcelStreaming/);
  assert.match(source, /currentSelectionMode/);
  assert.match(source, /breakdowns/);
  assert.match(source, /BREAKDOWN_COLUMN_PRIORITY = \['매출', '지역', '청구픽업', '픽업'/);
  assert.match(source, /breakdownPriority/);
  assert.match(source, /\.sort\(\(a, b\) => breakdownPriority\(a\.header\) - breakdownPriority\(b\.header\)/);
  assert.match(source, /\.slice\(0, 12\)/);
  assert.match(source, /addBreakdownRow\(breakdowns, breakdownCandidates, row, revenue, purchase, profit, year, month, workDateInfo\(headers, row\)\)/);
  assert.match(source, /rounded\.monthly = finalizeSeries\(item\.monthly/);
  assert.match(source, /createAdvancedAccumulator/);
  assert.match(source, /strategicSegments/);
  assert.match(source, /vehiclePerformance/);
  assert.match(source, /own_direct/);
  assert.match(source, /ELS직계약차량/);
  assert.match(source, /외부\/타운송사/);
  assert.doesNotMatch(source, /직계약 전체/);
  assert.doesNotMatch(source, /ELS솔루션 명의 전체/);
  assert.match(source, /weekly/);
  assert.match(source, /weekday/);
  assert.match(source, /branch_performance_files/);
  assert.match(source, /branch_performance_rows/);
  assert.match(source, /is_current: false/);
  assert.match(source, /superseded_by_excel/);
  assert.match(source, /removed_from_excel/);
  assert.match(source, /duplicate_current_retired/);
  assert.match(source, /\/volume2\/아산지점\/B_총무\/C_마감\/합계연간실적\/합계연간실적\.xlsx/);
  assert.match(source, /--dry-run/);
  assert.doesNotMatch(source, /\.from\([^)]*\)\.delete\(/);
  assert.match(runner, /els-asan-annual-performance-sync\.lock/);
  assert.match(runner, /ASAN_PERFORMANCE_CHUNK_SIZE:-100/);
  assert.match(runner, /nice -n/);
  assert.match(runner, /ionice/);
  assert.match(runner, /--confirm-large-import/);
});

test('아산 연간실적 숫자 컬럼 판정은 대용량 행 수가 아니라 샘플 행 수를 기준으로 한다', () => {
  const script = read('web/scripts/import-asan-annual-performance.mjs');
  const backend = read('docker/els-backend/asan_performance.py');
  assert.match(script, /const sampleRows = rows\.slice\(0, 2000\)/);
  assert.match(script, /const total = Math\.max\(1, sampleRows\.length\)/);
  assert.match(script, /'하불'/);
  assert.match(script, /'booking'/);
  assert.match(backend, /sample_rows = rows\[:2000\]/);
  assert.match(backend, /total = max\(1, len\(sample_rows\)\)/);
  assert.match(backend, /"하불"/);
  assert.match(backend, /"booking"/);
  assert.match(backend, /date_match = compact_match or re\.match/);
  assert.match(backend, /1\[0-2\]\|0\?\[1-9\]/);
});

test('아산 연간실적 화면은 분석/테이블 탭, 파일 선택, 제목행 설정을 제공한다', () => {
  const component = read('web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js');
  const page = read('web/app/(main)/employees/branches/asan/page.js');
  const dbReader = read('web/lib/asan-branch-db.js');
  const exportUtil = read('web/utils/asanPerformanceTableExport.mjs');
  assert.match(page, /실적관리/);
  assert.match(page, /종합실적/);
  assert.match(page, /월간실적/);
  assert.match(page, /연간실적/);
  assert.match(page, /activeMainTab === 'performance'/);
  assert.match(page, /activePerformanceTab === 'annual-performance' && \(\s*<AsanAnnualPerformance/);
  assert.doesNotMatch(page, /searchHandoff=\{performanceSearchHandoff\?\.target === 'annual-performance'/);
  assert.match(component, /export default function AsanAnnualPerformance\(\{ searchHandoff = null \}\)/);
  assert.match(component, /appliedSearchHandoffRef/);
  assert.doesNotMatch(page, /activeMainTab === 'annual-performance' && <AsanAnnualPerformance \/>/);
  assert.match(component, /\/api\/branches\/asan\/performance\/annual/);
  assert.match(component, /분석/);
  assert.match(component, /테이블/);
  assert.match(component, /styles\.annualAnalytics/);
  assert.match(component, /연간 성과 리포트/);
  assert.doesNotMatch(component, /손익/);
  assert.doesNotMatch(component, /손익률/);
  assert.match(component, /ANALYSIS_VIEWS/);
  assert.doesNotMatch(component, /10년 흐름/);
  assert.doesNotMatch(component, /analysisView === 'flow'/);
  assert.match(component, /연도×월/);
  assert.match(component, /계약\/차량/);
  assert.match(component, /label: '요일'/);
  assert.doesNotMatch(component, /주차·요일/);
  assert.doesNotMatch(component, /주차별 금액\/건수/);
  assert.match(component, /검증·근거/);
  assert.match(component, /이익 구조/);
  assert.match(component, /ScopeControls/);
  assert.match(component, /const isCustomScope = mode === 'custom'/);
  assert.match(component, /disabled=\{!isCustomScope\}/);
  assert.match(component, /LedgerFlowChart/);
  assert.match(component, /marketFlowChartWrap/);
  assert.doesNotMatch(component, /preserveAspectRatio="none"/);
  assert.match(component, /marketMarkerLabel/);
  assert.match(component, /최고 이익월/);
  assert.match(component, /analysisView === 'overview' && \(\s*<>\s*<LedgerFlowChart/);
  assert.ok(
    component.indexOf('<ScopeControls') < component.indexOf('className={styles.analysisTabs}')
      && component.indexOf('className={styles.analysisTabs}') < component.indexOf('<LedgerFlowChart'),
    '분석섹션 탭은 조사범위 바로 아래, 장기 흐름 차트 위에 고정 배치해야 합니다.'
  );
  assert.match(component, /조사범위/);
  assert.match(component, /매출 평균/);
  assert.match(component, /매입 평균/);
  assert.match(component, /scopeMode/);
  assert.match(component, /scopedMonthly/);
  assert.match(component, /recent24/);
  assert.match(component, /최근 24개월/);
  assert.match(component, /최근 3년/);
  assert.doesNotMatch(component, /최근 36개월/);
  assert.doesNotMatch(component, /최근 연도/);
  assert.doesNotMatch(component, /currentYear/);
  assert.match(component, /scopeUnavailable/);
  assert.match(component, /scopePerformanceItem\(item, scopeBounds, scopedTotals\.revenue\)/);
  assert.match(component, /activeBreakdownNeedsRefresh/);
  assert.match(component, /evidenceBasisLabel/);
  assert.match(component, /구간별 월별 근거 갱신 필요/);
  assert.doesNotMatch(component, /fallbackActiveItems/);
  assert.doesNotMatch(component, /전체기간 기준 · 월별 근거 갱신 필요/);
  assert.match(component, /vehiclePerformance/);
  assert.match(component, /차량별 이익/);
  assert.match(component, /영업넘버 기준/);
  assert.doesNotMatch(component, /scopedMonthly\.slice\(-12\)/);
  assert.match(component, /buildScopedTimeFlow\(scopedMonthly, scopeBounds\)/);
  assert.match(component, /aggregateMonthlyByBucket\(selectedSegment\.monthly \|\| \[\], scopedTimeFlow\.bucket\)/);
  assert.match(component, /timeFlowItems/);
  assert.match(component, /scopedTimeFlow\.label/);
  assert.match(component, /scopedTimeFlow\.countLabel/);
  assert.match(component, /선택범위 성과 흐름/);
  assert.doesNotMatch(component, /월별 성과 흐름/);
  assert.doesNotMatch(component, /연도별 매출·매입·손익/);
  assert.doesNotMatch(component, /성과 경보/);
  assert.match(component, /매출/);
  assert.match(component, /timeFlowHeaderRow/);
  assert.match(component, /MiniTrendChart/);
  assert.match(component, /trendAvgRevenueLine/);
  assert.match(component, /trendAvgProfitLine/);
  assert.match(component, /trendAvgLabel/);
  assert.match(component, /이익 최저/);
  assert.match(component, /trendSummaryGrid/);
  assert.match(component, /평균 이익률/);
  assert.match(component, /최고 매출월/);
  assert.match(component, /YearMonthHeatmap/);
  assert.match(component, /onSelectPeriod=\{period => openDetailSearch\(\[period\], 'and'\)\}/);
  assert.match(component, /EvidenceHelp/);
  assert.match(component, /search_mode/);
  assert.match(component, /AND 검색/);
  assert.match(component, /downloadPerformanceTableExcel/);
  assert.match(component, /tableLoading/);
  assert.match(component, /조회중 \(빅데이터 검색 느림\)/);
  assert.match(component, /엑셀 생성중/);
  assert.match(component, /title: '아산 연간실적 테이블'/);
  assert.match(dbReader, /function isPerformanceExportRequest/);
  assert.match(dbReader, /exportRequested \? 50000 : 5000/);
  assert.match(dbReader, /maxSortRows: exportRequested \? 49999 : 19999/);
  assert.match(exportUtil, /PERFORMANCE_TABLE_EXPORT_PAGE_SIZE = 50000/);
  assert.match(exportUtil, /\/api\/branches\/asan\/export\/view/);
  assert.match(component, /placeholder="검색어 또는 금액 \(\, ; 로 조건 추가\)"/);
  assert.match(component, /하나라도 포함/);
  assert.match(component, /모두 포함/);
  assert.match(component, /title="클릭하여 정렬"/);
  assert.match(component, /totalRowsLabel/);
  assert.match(component, /payload\?\.total_is_estimated/);
  assert.match(component, /ELS솔루션은 외부 운송사와 분리/);
  assert.match(component, /label: '계약\/차량'/);
  assert.doesNotMatch(component, /label: '직계약\/차량'/);
  assert.doesNotMatch(component, /공헌도 매트릭스/);
  assert.doesNotMatch(component, /overviewEvidenceSections/);
  assert.match(component, /계약\/명의 세그먼트/);
  assert.match(component, /SegmentEvidenceTable/);
  assert.match(component, /styles\.evidenceTableHead/);
  assert.match(component, /<span>항목<\/span>/);
  assert.match(component, /<span>매출<\/span>/);
  assert.match(component, /<span>매입<\/span>/);
  assert.match(component, /formatPerformanceAmount\(item\.purchase\)/);
  assert.match(component, /formatPerformanceAmount\(item\.profit\)/);
  assert.match(component, /\['청구처', selectedSegment\.topClients/);
  assert.match(component, /\{label\} 근거/);
  assert.match(component, /저마진 주의/);
  assert.ok(
    component.indexOf('<h3>고마진 항목</h3>') < component.indexOf('<h3>저마진 주의</h3>')
      && component.indexOf('<h3>저마진 주의</h3>') < component.indexOf('<h3>손실 항목</h3>'),
    '개요 포트폴리오 순서는 고마진 항목, 저마진 주의, 손실 항목이어야 합니다.'
  );
  assert.match(component, /WeekdayPerformanceDiagram/);
  assert.match(component, /요일별 매출·이익 지도/);
  assert.match(component, /weekdaySummaryGrid/);
  assert.match(component, /weekdayRevenueRibbon/);
  assert.match(component, /매출 분포/);
  assert.match(component, /이익 기여/);
  assert.match(component, /건수 비중/);
  assert.match(component, /buildWeekdaySeries/);
  assert.match(component, /scopedWeekday/);
  assert.match(component, /건당 매출/);
  assert.match(component, /setShowSettings\(true\)}>설정<\/button>/);
  assert.match(component, /연간실적 파일 설정/);
  assert.match(component, /제목행/);
  assert.match(component, /header_row/);
  assert.match(component, /readPerformanceJson/);
  assert.match(component, /source: 'supabase'/);
  assert.match(component, /aggregate: 'all'/);
  assert.match(component, /annualFileCount/);
  const css = read('web/app/(main)/employees/branches/asan/annualPerformance.module.css');
  assert.match(css, /\.annualAnalytics\s*{[\s\S]*flex-direction: column/);
  assert.match(css, /\.annualAnalytics\s*{[\s\S]*align-items: stretch/);
  assert.match(css, /\.annualAnalytics > \*\s*{[\s\S]*width: 100%/);
  assert.match(css, /\.marketFlowChartWrap/);
  assert.match(css, /\.analytics > \*\s*{[\s\S]*flex: 0 0 auto/);
  assert.match(css, /\.container\s*{[\s\S]*overflow: visible/);
  assert.match(css, /\.analytics\s*{[\s\S]*overflow: visible/);
  assert.match(css, /\.evidenceTableHead,\s*\.evidenceTableRow\s*{[\s\S]*grid-template-columns: minmax\(160px, 1fr\) 84px 84px 84px 60px/);
  assert.match(css, /\.evidenceTable\s*{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.marketFlowPanel\s*{[\s\S]*min-height: 0/);
  assert.match(css, /\.marketFlowChartWrap\s*{[\s\S]*height: 250px/);
  assert.match(css, /\.marketFlowSvg\s*{[\s\S]*width: 100%/);
  assert.match(css, /\.marketMarkerLabel\s*{[\s\S]*paint-order: stroke/);
  assert.match(css, /\.marketMarker_revenue,\s*\.marketMarker_profit,\s*\.marketMarker_recent/);
  assert.match(css, /\.trendSummaryGrid\s*{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.trendAvgRevenueLine,\s*\.trendAvgProfitLine\s*{[\s\S]*stroke-dasharray: 6 5/);
  assert.match(css, /\.trendMarkerLabel,\s*\.trendAvgLabel\s*{[\s\S]*paint-order: stroke/);
  assert.match(css, /\.trendRevenueArea/);
  assert.match(css, /\.trendLossPoint/);
  assert.match(css, /\.weekdaySummaryGrid\s*{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.weekdayRevenueRibbon\s*{[\s\S]*grid-template-columns: 76px minmax\(0, 1fr\)/);
  assert.match(css, /\.weekdayRevenueRibbon span\s*{[\s\S]*text-overflow: ellipsis/);
  assert.match(css, /\.weekdayDiagram\s*{[\s\S]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.weekdayColumnStage\s*{[\s\S]*min-height: 150px/);
  assert.match(css, /\.weekdayColumnFill\s*{[\s\S]*height: var\(--weekday-bar-height, 30%\)/);
  assert.match(css, /\.timeFlowHeaderRow,\s*\.timeFlowRow\s*{[\s\S]*grid-template-columns: 86px repeat\(3, minmax\(118px, 1fr\)\) 62px/);
  assert.match(css, /\.timeFlowRow > div\s*{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 88px/);
  assert.match(css, /\.tableArea\s*{[\s\S]*height: clamp\(260px, calc\(100dvh - 290px\), 700px\)/);
  assert.match(css, /\.tableBusyNotice/);
  assert.match(css, /\.tableArea\s*{[\s\S]*overflow: hidden/);
  assert.match(css, /\.tableScroll\s*{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.tableScroll\s*{[\s\S]*scrollbar-gutter: stable both-edges/);
  assert.match(css, /\.tableScroll::-webkit-scrollbar\s*{[\s\S]*height: 12px/);
  assert.match(css, /\.tableScroll::-webkit-scrollbar-thumb\s*{[\s\S]*background: #94a3b8/);
  assert.match(css, /\.monthlyReportScroll\s*{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.vehicleInsightRows\s*{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.vehicleProfitTable\s*{[\s\S]*scrollbar-gutter: stable both-edges/);
  assert.match(css, /\.summarySourceRows\s*{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.heatmap\s*{[\s\S]*scrollbar-gutter: stable both-edges/);
  assert.match(css, /\.carryoverClientRows\s*{[\s\S]*scrollbar-gutter: stable both-edges/);
  assert.match(css, /\.dataTable\s*{[\s\S]*width: max-content/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.analysisTabs\s*{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.marketFlowSvg\s*{[\s\S]*width: 100%/);
  assert.match(css, /\.vehicleProfitHead,\s*\.vehicleProfitRow\s*{[\s\S]*72px 68px/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.monthHeaderRow,\s*\.monthRow\s*{[\s\S]*min-width: 560px/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.timeFlowHeaderRow,\s*\.timeFlowRow\s*{[\s\S]*min-width: 720px/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.tableArea\s*{[\s\S]*height: clamp\(300px, calc\(100dvh - 170px\), 580px\)/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.dataTable\s*{[\s\S]*min-width: max\(100%, 900px\)/);
  assert.equal(DEFAULT_ANNUAL_PERFORMANCE_PATH, '/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx');
  assert.equal(
    normalizePerformancePath('/B_총무/C_마감/합계연간실적/합계연간실적.xlsx'),
    '/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx',
  );
});

test('연간실적 컬럼 레이아웃은 제목 변경만 인덱스로 복구하고 추가/삭제는 현재 헤더 기준으로 반영한다', () => {
  const current = ['거래처명', '매출액', '매입액', '비고'];
  const reconciled = reconcilePerformanceLayoutPrefs({
    order: ['거래처', '매출', '매입'],
    hiddenCols: ['매입'],
    sourceHeaders: ['거래처', '매출', '매입', '비고'],
    currentHeaders: current,
  });
  assert.deepEqual(reconciled.colOrder, current);
  assert.equal(reconciled.hiddenCols.has('매입액'), true);

  const withAddedColumn = reconcilePerformanceLayoutPrefs({
    order: ['거래처', '매출', '매입'],
    hiddenCols: ['매입'],
    sourceHeaders: ['거래처', '매출', '매입'],
    currentHeaders: current,
  });
  assert.deepEqual(withAddedColumn.colOrder, current);
  assert.equal(withAddedColumn.hiddenCols.size, 0);
});

test('연간실적 표시 유틸은 금액 축약과 차트 최대값을 안정적으로 계산한다', () => {
  assert.equal(formatPerformanceAmount(123456789), '1.2억원');
  assert.equal(formatPerformanceAmount(-5400000), '-540만원');
  assert.equal(getPerformanceChartMax([{ revenue: 100, purchase: 220, profit: -30 }]), 220);
  assert.deepEqual(normalizePerformanceColumnOrder(['B'], ['A', 'B', 'C']), ['B', 'A', 'C']);
});

test('연간실적 표시 유틸은 엑셀 날짜 시리얼과 금액 표시를 정규화한다', () => {
  assert.equal(formatPerformanceCellValue('마감월', '2015-01-01T00:00:00'), '2015-01');
  assert.equal(formatPerformanceCellValue('작업일자', '42006'), '2015-01-02');
  assert.deepEqual(parsePerformanceDateParts('2022-10'), { year: 2022, month: 10, day: 1 });
  assert.deepEqual(parsePerformanceDateParts('2022-11-15'), { year: 2022, month: 11, day: 15 });
  assert.deepEqual(parsePerformanceDateParts('202512'), { year: 2025, month: 12, day: 1 });
  assert.equal(parsePerformanceDateParts('202213'), null);
  assert.equal(formatPerformanceCellValue('청구', '440000'), '440,000');
  assert.deepEqual(
    normalizeAnnualPerformanceRow(['마감월', '작업일자', '청구', '하불'], ['42005', '2015-01-02T00:00:00', '440000', '420000']),
    ['2015-01', '2015-01-02', '440,000', '420,000'],
  );
});
