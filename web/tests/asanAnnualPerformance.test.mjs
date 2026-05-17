import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ANNUAL_PERFORMANCE_PATH,
  formatPerformanceAmount,
  getPerformanceChartMax,
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
  assert.match(source, /proxyToBackend\(req, '\/api\/branches\/asan\/performance\/annual'\)/);
  assert.match(source, /dynamic = 'force-dynamic'/);
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

test('아산 연간실적 Supabase SQL은 누적 원장과 현재 조회 인덱스를 만든다', () => {
  const sql = read('web/supabase_sql/20260517_asan_annual_performance.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS branch_performance_files/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS branch_performance_rows/);
  assert.match(sql, /is_current BOOLEAN NOT NULL DEFAULT true/);
  assert.match(sql, /WHERE is_current = true/);
  assert.match(sql, /ALTER TABLE branch_performance_rows ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE branch_performance_rows TO service_role/);
});

test('아산 연간실적 화면은 분석/테이블 탭, 파일 선택, 제목행 설정을 제공한다', () => {
  const component = read('web/app/(main)/employees/branches/asan/AsanAnnualPerformance.js');
  const page = read('web/app/(main)/employees/branches/asan/page.js');
  assert.match(page, /annual-performance/);
  assert.match(component, /\/api\/branches\/asan\/performance\/annual/);
  assert.match(component, /분석/);
  assert.match(component, /테이블/);
  assert.match(component, /파일 설정/);
  assert.match(component, /제목행/);
  assert.match(component, /header_row/);
  assert.equal(DEFAULT_ANNUAL_PERFORMANCE_PATH, '/B_총무/C_마감/합계연간실적/합계연간실적.xlsx');
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
