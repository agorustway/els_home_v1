import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../app/(main)/employees/vehicle-tracking/page.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../app/(main)/employees/vehicle-tracking/tracking.module.css', import.meta.url), 'utf8');
const tripsRouteSource = readFileSync(new URL('../app/api/vehicle-tracking/trips/route.js', import.meta.url), 'utf8');

test('모바일 운행 상세현황은 데스크탑 표 대신 카드형 위치/로그 목록을 제공한다', () => {
  assert.ok(pageSource.includes('mobileLocationTimeline'), 'mobile location timeline should be rendered');
  assert.ok(pageSource.includes('mobileLocationCard'), 'mobile location cards should be rendered');
  assert.ok(pageSource.includes('desktopLocationTable'), 'desktop location table should remain for wide screens');
  assert.ok(pageSource.includes('mobileLogList'), 'mobile log list should be rendered');
  assert.ok(cssSource.includes('.desktopLocationTable'), 'desktop location table should have a mobile hide rule');
  assert.ok(cssSource.includes('display: none !important;'), 'desktop tables should be hidden on mobile');
});

test('갤럭시24 폭에서는 상세 패널이 전체 화면 모바일 레이아웃을 사용한다', () => {
  assert.ok(cssSource.includes('height: 100dvh'), 'detail overlay should occupy full dynamic viewport height');
  assert.ok(cssSource.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'metrics should wrap to two columns');
  assert.ok(cssSource.includes('grid-template-columns: 1fr'), 'detail form should become single column');
  assert.ok(cssSource.includes('min-height: 42px'), 'mobile form controls should be finger-friendly');
});

test('기록/교육 모바일 결과 목록은 팝업이 아니라 본문 안에 표시한다', () => {
  assert.ok(pageSource.includes('await fetchRecords(1);'), 'record search should refresh the first inline page');
  assert.ok(pageSource.includes('styles.recordsTableSection'), 'records and education should use the inline table section');
  assert.ok(!pageSource.includes('운행 기록 목록'), 'records tab should not expose a separate popup button');
  assert.ok(!pageSource.includes('교육 이수 목록'), 'education tab should not expose a separate popup button');
  assert.ok(pageSource.includes('data-label="최종위치"'), 'mobile record cards should have readable labels');
  assert.ok(pageSource.includes('data-label="교육"'), 'mobile education cards should have readable labels');
  assert.ok(cssSource.includes('.recordsTableSection'), 'inline records table should have mobile-specific styling');
  assert.match(cssSource, /\.recordsTableSection\s*\{[\s\S]*?position:\s*static !important;/, 'inline records list should not be fixed');
});

test('관제 통계 카드는 실행 버튼처럼 떠오르지 않는다', () => {
  const hoverBlock = cssSource.match(/\.statCard:hover\s*\{[^}]*\}/)?.[0] || '';
  assert.ok(hoverBlock.includes('transform: none;'), 'stat cards should not move on hover');
  assert.ok(!hoverBlock.includes('translateY'), 'stat hover should not use translateY');
  assert.ok(cssSource.includes('.summaryGrid'), 'records summary should use stable summary cards');
  assert.ok(cssSource.includes('min-width: 118px'), 'mobile date inputs should keep enough width for full dates');
});

test('상세/기록 화면은 운행거리와 최고속도 중심으로 표시한다', () => {
  assert.ok(pageSource.includes('const getTripMaxSpeed'), 'trip max speed helper should exist');
  assert.ok(pageSource.includes('<span>최고속도</span>'), 'detail metrics should show max speed');
  assert.ok(pageSource.includes('<th style={{ width: \'90px\' }}>운행거리</th>'), 'record table should expose distance as its own column');
  assert.ok(pageSource.includes('<th style={{ width: \'90px\' }}>최고속도</th>'), 'record table should expose max speed as its own column');
  assert.ok(pageSource.includes('data-label="운행거리"'), 'mobile record cards should show distance label');
  assert.ok(pageSource.includes('data-label="최고속도"'), 'mobile record cards should show max speed label');
  assert.ok(pageSource.includes('{getTripMaxSpeed(trip)}'), 'record rows should use max speed fallback helper');
  assert.ok(!pageSource.includes('최종위치(속도)'), 'final location should not hide distance and speed in one column');
  assert.ok(!pageSource.includes('평균속도'), 'average speed should not be displayed');
});

test('운행기록 API는 위치 포인트가 부족해도 기존 거리/최고속도 저장값을 0으로 덮지 않는다', () => {
  assert.ok(tripsRouteSource.includes('function pickPositiveMetric'), 'API should have a positive metric fallback helper');
  assert.ok(tripsRouteSource.includes('const stats = list.length > 0 ? computeReliableRouteStats(list, trip) : null'), 'API should skip zero stats when there are no location points');
  assert.match(tripsRouteSource, /pickPositiveMetric\(trip\.distance_km, trip\.route_distance_km\)/, 'distance should fall back to stored trip values');
  assert.match(tripsRouteSource, /pickPositiveMetric\(trip\.max_speed, trip\.maxSpeed\)/, 'max speed should fall back to stored trip values');
});

test('운행기록과 교육이수는 서버 페이지 단위로 1차 목록을 로딩한다', () => {
  assert.ok(pageSource.includes('const RECORDS_PAGE_SIZE_OPTIONS = [20, 50, 100]'), 'page size options should be explicit');
  assert.ok(pageSource.includes('const DEFAULT_RECORDS_PAGE_SIZE = 20'), 'first page should load 20 rows by default');
  assert.ok(pageSource.includes("params.set('page', String(pageOverride))"), 'record request should include page');
  assert.ok(pageSource.includes("params.set('page_size', String(recordsPageSize))"), 'record request should include page size');
  assert.ok(pageSource.includes("if (activeTab === 'education') params.set('education_only', '1')"), 'education tab should request education-only records');
  assert.ok(pageSource.includes('<RecordsPagination />'), 'records and education should render pagination controls');
  assert.ok(cssSource.includes('.paginationBar'), 'pagination should have desktop styling');
  assert.ok(cssSource.includes('.recordsTableSection .paginationControls'), 'pagination should have mobile styling');
});

test('운행기록 API는 count와 range로 페이지 조회하고 교육 탭은 이수 로그 보유 운행만 조회한다', () => {
  assert.match(tripsRouteSource, /const page = Math\.max\(1, Number\.parseInt\(searchParams\.get\('page'\)/, 'API should parse page');
  assert.match(tripsRouteSource, /const pageSize = Math\.min\(100, Math\.max\(10, Number\.parseInt/, 'API should clamp page size');
  assert.ok(tripsRouteSource.includes(".select(selectColumns, { count: 'exact' })"), 'API should request total count');
  assert.ok(tripsRouteSource.includes('.range(rangeFrom, rangeTo)'), 'API should use server-side range pagination');
  assert.ok(tripsRouteSource.includes("vehicle_trip_logs!inner(id)"), 'education-only query should use inner relation');
  assert.ok(tripsRouteSource.includes(".eq('vehicle_trip_logs.field_name', 'safety_education')"), 'education-only query should filter safety education logs');
  assert.ok(tripsRouteSource.includes('pageSize,'), 'API response should include page size metadata');
});
