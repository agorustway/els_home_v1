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
  const dbReader = read('web/lib/asan-branch-db.js');
  assert.match(source, /queryAsanAnnualPerformanceFromSupabase/);
  assert.match(source, /source !== 'excel'[\s\S]*queryAsanAnnualPerformanceFromSupabase\(url\.searchParams\)/);
  assert.match(source, /proxyToBackend\(req, '\/api\/branches\/asan\/performance\/annual'\)/);
  assert.match(source, /dynamic = 'force-dynamic'/);
  assert.match(dbReader, /branch_performance_files/);
  assert.match(dbReader, /branch_performance_rows/);
  assert.match(dbReader, /source: 'supabase-empty'/);
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
  assert.match(source, /_start_background_sync/);
  assert.match(source, /body\.get\("async", False\)/);
  assert.match(source, /def _attach_sync_status/);
  assert.match(source, /payload\["sync_status"\] = _sync_status\(\)/);
  assert.match(dbReader, /fallbackTotal: search \? 0 : meta\.current_row_count \|\| meta\.row_count \|\| 0/);
  assert.match(dbReader, /currentSnapshotId/);
  assert.match(dbReader, /\.eq\('snapshot_id', currentSnapshotId\)/);
  assert.doesNotMatch(dbReader, /branch_performance_rows'\)\s*\.select\('row_values,row_index', \{ count: 'exact' \}\)/);
});

test('아산 연간실적 운영 동기화는 장시간 작업 타임아웃을 피하도록 구성한다', () => {
  const component = read('web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js');
  const nginx = read('docker/els-gateway/nginx.conf');
  assert.match(component, /async: true/);
  assert.match(component, /setInterval\(\(\) => \{/);
  assert.match(component, /동기화 진행중/);
  assert.match(nginx, /location ~ \^\/api\/\(logs\|debug\|vehicle-tracking\|branches\|off-days\|vectorize\)/);
  assert.match(nginx, /proxy_read_timeout 900s/);
});

test('아산 연간실적 Supabase SQL은 누적 원장과 현재 조회 인덱스를 만든다', () => {
  const sql = read('web/supabase_sql/20260517_asan_annual_performance.sql');
  const lookupIndexSql = read('web/supabase_sql/20260517_asan_performance_current_lookup_index.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS branch_performance_files/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS branch_performance_rows/);
  assert.match(sql, /is_current BOOLEAN NOT NULL DEFAULT true/);
  assert.match(sql, /WHERE is_current = true/);
  assert.match(sql, /ALTER TABLE branch_performance_rows ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE branch_performance_rows TO service_role/);
  assert.match(lookupIndexSql, /idx_branch_performance_rows_current_lookup/);
  assert.match(lookupIndexSql, /INCLUDE \(id, source_row_hash, snapshot_id\)/);
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
  assert.match(source, /breakdowns/);
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
});

test('아산 연간실적 화면은 분석/테이블 탭, 파일 선택, 제목행 설정을 제공한다', () => {
  const component = read('web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js');
  const page = read('web/app/(main)/employees/branches/asan/page.js');
  assert.match(page, /실적관리/);
  assert.match(page, /종합실적/);
  assert.match(page, /월간실적/);
  assert.match(page, /연간실적/);
  assert.match(page, /activeMainTab === 'performance'/);
  assert.match(page, /activePerformanceTab === 'annual-performance' && <AsanAnnualPerformance \/>/);
  assert.doesNotMatch(page, /activeMainTab === 'annual-performance' && <AsanAnnualPerformance \/>/);
  assert.match(component, /\/api\/branches\/asan\/performance\/annual/);
  assert.match(component, /분석/);
  assert.match(component, /테이블/);
  assert.match(component, /월별 추세/);
  assert.match(component, /건당 매출/);
  assert.match(component, /파일 설정/);
  assert.match(component, /제목행/);
  assert.match(component, /header_row/);
  assert.match(component, /readPerformanceJson/);
  assert.match(component, /source: 'supabase'/);
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
  assert.equal(formatPerformanceCellValue('청구', '440000'), '440,000');
  assert.deepEqual(
    normalizeAnnualPerformanceRow(['마감월', '작업일자', '청구', '하불'], ['42005', '2015-01-02T00:00:00', '440000', '420000']),
    ['2015-01', '2015-01-02', '440,000', '420,000'],
  );
});
