import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_MONTHLY_PERFORMANCE_EXTRA_MONTHS,
  FIRST_SHEET_TOKEN,
  buildMonthlyPerformanceReport,
  buildMonthlyPerformanceFileSlots,
  buildMonthlyPerformancePeriods,
} from '../utils/asanPerformanceView.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

test('아산 월간실적 기본 파일 슬롯은 기준연도 12개월과 정리기간 3개월을 만든다', () => {
  const periods = buildMonthlyPerformancePeriods(2026, DEFAULT_MONTHLY_PERFORMANCE_EXTRA_MONTHS);
  assert.equal(DEFAULT_MONTHLY_PERFORMANCE_EXTRA_MONTHS, 3);
  assert.equal(periods.length, 15);
  assert.deepEqual(periods[0], { year: 2026, month: 1, period: '2026-01', carryover: false });
  assert.deepEqual(periods[14], { year: 2027, month: 3, period: '2027-03', carryover: true });

  const slots = buildMonthlyPerformanceFileSlots(2026);
  const april = slots.find(slot => slot.period === '2026-04');
  assert.equal(FIRST_SHEET_TOKEN, '__first__');
  assert.equal(april.sheetName, FIRST_SHEET_TOKEN);
  assert.equal(
    april.path,
    '/아산지점/B_총무/C_마감/2026/4월/2026년_실적-4월 컨테이너 운송 마감자료.xlsx',
  );
});

test('아산 월간실적 보고서 표는 거래처별 매출·매입·이익과 이월금액을 도출한다', () => {
  const headers = ['2026년 4월', '글로비스 아산KD', 'col_3', '모비스', 'col_5', '매출합계', '이익율 (%)'];
  const rows = [
    ['매 출'],
    ['순매출', '₩', '1,116,441,400', '₩', '517,692,000', '1,921,067,400', '13.66%'],
    ['순매입', '₩', '959,974,350', '₩', '446,978,900', '1,658,692,350', ''],
    ['매출이익/순매출', '₩', '156,467,050', '₩', '70,713,100', '262,375,050', ''],
    ['매출(계산서)', '₩', '1,125,839,300', '₩', '523,259,200', '1,957,143,600', '13.36%'],
    ['매입(계산서)', '₩', '974,684,400', '₩', '444,959,400', '1,695,660,400', ''],
    ['매출이익(계산서)', '₩', '151,154,900', '₩', '78,299,800', '261,483,200', ''],
    ['이 월'],
    ['매출 (5월이월)', '', '241,185,000', '', '224,096,200', '484,932,800', ''],
    ['매입 (5월이월)', '', '202,534,100', '', '195,513,300', '410,156,300', ''],
  ];

  const report = buildMonthlyPerformanceReport(headers, rows, { period: '2026-04' });
  assert.equal(report.period, '2026-04');
  assert.equal(report.groups[0].name, '글로비스 아산KD');
  assert.equal(report.groups[0].netRevenue, 1116441400);
  assert.equal(report.groups[1].name, '모비스');
  assert.equal(report.groups[1].invoiceProfit, 78299800);
  assert.equal(report.totals.netProfit, 262375050);
  assert.equal(report.totals.invoiceProfit, 261483200);
  assert.equal(report.carryover.revenue, 484932800);
  assert.equal(report.carryover.purchase, 410156300);
  assert.equal(report.carryover.profit, 74776500);
  assert.equal(report.totals.netProfitRate, 13.66);
  assert.equal(report.quality.primaryReady, true);
  assert.equal(report.quality.source, 'normalized');
});

test('아산 월간실적 보고서 표 파서는 원장 헤더 앞 상단 보고서 표도 원본 preview에서 복원한다', () => {
  const ledgerHeaders = ['마감월', '청구처', '청구금액', '하불금액', '손익'];
  const ledgerRows = [
    ['2026-04', '글로비스', '10,000', '8,000', '2,000'],
    ['2026-04', '모비스', '20,000', '17,000', '3,000'],
  ];
  const rawRows = [
    ['2026년 4월', '글로비스 아산KD', 'col_3', '모비스', 'col_5', '매출합계', '이익율 (%)'],
    ['매 출'],
    ['순매출', '₩', '1,116,441,400', '₩', '517,692,000', '1,921,067,400', '13.66%'],
    ['순매입', '₩', '959,974,350', '₩', '446,978,900', '1,658,692,350', ''],
    ['매출이익/순매출', '₩', '156,467,050', '₩', '70,713,100', '262,375,050', ''],
    ['매출(계산서)', '₩', '1,125,839,300', '₩', '523,259,200', '1,957,143,600', '13.36%'],
    ['매입(계산서)', '₩', '974,684,400', '₩', '444,959,400', '1,695,660,400', ''],
    ['매출이익(계산서)', '₩', '151,154,900', '₩', '78,299,800', '261,483,200', ''],
    ['이 월'],
    ['매출 (5월이월)', '', '241,185,000', '', '224,096,200', '484,932,800', ''],
    ['매입 (5월이월)', '', '202,534,100', '', '195,513,300', '410,156,300', ''],
    ['마감월', '청구처', '청구금액', '하불금액', '손익'],
  ];

  const report = buildMonthlyPerformanceReport(ledgerHeaders, ledgerRows, { period: '2026-04', rawRows });
  assert.equal(report.quality.source, 'raw-preview');
  assert.equal(report.quality.primaryReady, true);
  assert.equal(report.groups[0].name, '글로비스 아산KD');
  assert.equal(report.totals.netRevenue, 1921067400);
  assert.equal(report.totals.netPurchase, 1658692350);
  assert.equal(report.carryover.profit, 74776500);
});

test('아산 월간실적 보고서 표 파서는 부분 표를 총액 기준으로 승격하지 않는다', () => {
  const headers = ['2026년 4월', '글로비스 아산KD', '매출합계'];
  const rows = [
    ['이 월'],
    ['매출 (5월이월)', '241,185,000', '484,932,800'],
  ];

  const report = buildMonthlyPerformanceReport(headers, rows, { period: '2026-04' });
  assert.equal(report.hasReportRows, true);
  assert.equal(report.quality.primaryReady, false);
  assert.equal(report.carryover.revenue, 484932800);
});

test('아산 월간실적 Next 라우트는 Supabase monthly 조회와 NAS 백엔드 동기화를 제공한다', () => {
  const route = read('web/app/api/branches/asan/performance/monthly/route.js');
  const dbReader = read('web/lib/asan-branch-db.js');
  assert.match(route, /queryAsanMonthlyPerformanceFromSupabase/);
  assert.match(route, /queryAsanMonthlyPerformanceDashboardFromSupabase/);
  assert.match(route, /dashboard/);
  assert.match(route, /\/api\/branches\/asan\/performance\/monthly/);
  assert.match(route, /source === 'status'/);
  assert.match(route, /dynamic = 'force-dynamic'/);
  assert.match(dbReader, /dataset_type', 'monthly'/);
  assert.match(dbReader, /queryAsanMonthlyPerformanceDashboardFromSupabase/);
  assert.match(dbReader, /scopeKey: `year:\$\{state\.baseYear\}:extra:\$\{state\.extraMonths\}`/);
  assert.match(dbReader, /compactPerformanceDashboardSummary\(mergeMonthlySummaries\(metas, monthlyFileSlots\), 'monthly'\)/);
  assert.match(dbReader, /keepDaily = type === 'monthly'/);
  assert.match(dbReader, /buildMonthlyPerformanceFileSlots/);
  assert.match(dbReader, /currentSnapshotId/);
  assert.match(dbReader, /usesDiffCurrent/);
  assert.match(dbReader, /rowsQuery = rowsQuery\.eq\('is_current', true\)\.in\('file_path'/);
  assert.match(dbReader, /row_data/);
  assert.match(dbReader, /monthlyFileSlots/);
  assert.match(dbReader, /monthlyReports/);
  assert.match(dbReader, /isMonthlyReportPrimaryReady/);
  assert.match(dbReader, /const hasPrimaryReport = isMonthlyReportPrimaryReady\(report\)/);
  assert.doesNotMatch(dbReader, /period === sourcePeriod\)[\s\S]*continue/);
  assert.match(dbReader, /breakdowns: mergeBreakdowns\(metas, totalRevenue\)/);
  assert.match(dbReader, /strategicSegments: mergeStrategicSegments\(metas, totalRevenue\)/);
  assert.match(dbReader, /vehiclePerformance: mergeVehiclePerformance\(metas, totalRevenue\)/);
  assert.match(dbReader, /metricWithSourcePeriod/);
  assert.match(dbReader, /const dailyKey = `\$\{sourcePeriod\}::\$\{date\}`/);
  assert.match(dbReader, /period: sourcePeriod/);
  assert.match(dbReader, /workPeriod: date\.slice\(0, 7\)/);
  assert.match(dbReader, /dateKey: `\$\{sourcePeriod\}::\$\{metric\.date \|\| ''\}`/);
  assert.match(dbReader, /bucket\.daily = mergeInlineSeries\(bucket\.daily, metricWithSourcePeriod\(segment, sourcePeriod\)\.daily, 'dateKey'\)/);
  assert.match(dbReader, /bucket\.daily = mergeInlineSeries\(bucket\.daily, metricWithSourcePeriod\(vehicle, sourcePeriod\)\.daily, 'dateKey'\)/);
  assert.match(dbReader, /carrierSet: new Set\(\)/);
  assert.match(dbReader, /String\(vehicle\.carriers \|\| vehicle\.carrier/);
  assert.match(dbReader, /finalized\.carriers = Array\.from\(item\.carrierSet/);
  assert.match(dbReader, /\.filter\(item => \['own_direct', 'external_carrier'\]\.includes\(item\.key\)\)/);
  assert.match(dbReader, /carryover/);
  assert.match(dbReader, /daily/);
});

test('아산 월간실적 NAS Core는 여러 월 파일을 첫 번째 시트 기준으로 백그라운드 동기화한다', () => {
  const backend = read('docker/els-backend/asan_performance.py');
  assert.match(backend, /DEFAULT_ASAN_MONTHLY_PERFORMANCE_BASE_DIR/);
  assert.match(backend, /FIRST_SHEET_TOKEN = "__first__"/);
  assert.match(backend, /def _monthly_periods/);
  assert.match(backend, /extra_months=3/);
  assert.match(backend, /ASAN_MONTHLY_PERFORMANCE_AUTO_SYNC_ENABLED/);
  assert.match(backend, /ASAN_MONTHLY_PERFORMANCE_ACTIVE_POLL_SECONDS", 60, 30/);
  assert.match(backend, /ASAN_MONTHLY_PERFORMANCE_STALE_POLL_SECONDS", 120, 60/);
  assert.match(backend, /ASAN_MONTHLY_PERFORMANCE_SYNC_START_HOUR", 0, 0/);
  assert.match(backend, /"start_hour": monthly_auto_start_hour/);
  assert.match(backend, /def _monthly_focus_slot/);
  assert.match(backend, /def _monthly_existing_slots\(enabled_slots\):/);
  assert.match(backend, /def _monthly_auto_scheduler/);
  assert.match(backend, /existing_slots = _monthly_existing_slots\(enabled_slots\)/);
  assert.match(backend, /scan_slots = existing_slots or enabled_slots/);
  assert.match(backend, /latest_enabled_key = _monthly_slot_key\(focus_slot\)/);
  assert.match(backend, /for slot in reversed\(scan_slots\):/);
  assert.match(backend, /"files_only": True/);
  assert.match(backend, /@app\.route\("\/api\/branches\/asan\/performance\/monthly", methods=\["GET", "POST"\]\)/);
  assert.match(backend, /"--dataset-type", "monthly"/);
  assert.match(backend, /"--diff-current"/);
  assert.match(backend, /"--source-year"/);
  assert.match(backend, /"--source-month"/);
  assert.match(backend, /_refresh_dashboard_snapshots_async\("monthly"\)/);
  assert.match(backend, /payload\["monthly_auto_status"\] = _monthly_auto_status\(\)/);
  assert.match(backend, /월간실적 NAS 동기화/);
});

test('아산 월간실적 직접 주입 스크립트는 monthly dataset과 파일월 fallback을 지원한다', () => {
  const importer = read('web/scripts/import-asan-annual-performance.mjs');
  assert.match(importer, /--dataset-type <annual\|monthly>/);
  assert.match(importer, /datasetType: args\['dataset-type'\] \|\| 'annual'/);
  assert.match(importer, /sourceYear/);
  assert.match(importer, /sourceMonth/);
  assert.match(importer, /fallbackPeriod/);
  assert.match(importer, /summary\.sourcePeriod/);
  assert.match(importer, /datasetType === 'monthly'/);
  assert.match(importer, /summary\.currentSelectionMode = 'is_current'/);
  assert.match(importer, /const importer = useDiffCurrentImport \? importExcelStreaming : importExcelSnapshotStreaming/);
  assert.match(importer, /monthlyReport/);
  assert.match(importer, /buildMonthlyPerformanceReport/);
  assert.match(importer, /rawPreviewRows/);
  assert.match(importer, /function finalizeSeries\(map, roundItem/);
  assert.ok(importer.indexOf('function finalizeSeries(map, roundItem') < importer.indexOf('function finalizeBreakdowns'));
  assert.match(importer, /daily: finalizeSeries\(daily/);
  assert.match(importer, /daily: new Map\(\)/);
  assert.match(importer, /rounded\.daily = finalizeSeries\(segment\.daily/);
  assert.match(importer, /rounded\.daily = finalizeSeries\(vehicle\.daily/);
  assert.match(importer, /carriers: new Set\(\)/);
  assert.match(importer, /if \(carrier\) vehicle\.carriers\.add\(carrier\)/);
  assert.match(importer, /carriers: Array\.from\(vehicle\.carriers\)/);
  assert.match(importer, /rounded\.daily = finalizeSeries\(item\.daily/);
  assert.match(importer, /label: 'ELS직계약차량'/);
  assert.match(importer, /label: '외부\/타운송사'/);
  assert.doesNotMatch(importer, /직계약 전체/);
  assert.doesNotMatch(importer, /ELS솔루션 명의 전체/);
  assert.match(importer, /FIRST_SHEET_TOKEN/);
});

test('아산 월간실적 화면은 파일 설정 저장 후 자동 동기화와 이월 월 슬롯을 제공한다', () => {
  const component = read('web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js');
  const page = read('web/app/(main)/employees/branches/asan/page.js');
  const dbReader = read('web/lib/asan-branch-db.js');
  assert.match(page, /const loadAsanMonthlyPerformance = \(\) => import\('\.\/AsanMonthlyPerformance'\);/);
  assert.match(page, /const AsanMonthlyPerformance = dynamic\(loadAsanMonthlyPerformance/);
  assert.match(page, /activePerformanceTab === 'monthly-performance' && \(\s*<AsanMonthlyPerformance/);
  assert.match(page, /searchHandoff=\{performanceSearchHandoff\?\.target === 'monthly-performance' \? performanceSearchHandoff : null\}/);
  assert.match(component, /월간실적/);
  assert.match(component, /\/api\/branches\/asan\/performance\/monthly/);
  assert.match(component, /params\.set\('dashboard', '1'\)/);
  assert.match(component, /activeTab === 'table' \|\| append \|\| Boolean\(options\.search\) \|\| Boolean\(options\.sortKey\)/);
  assert.match(component, /const searchEffectReadyRef = useRef\(false\)/);
  assert.match(component, /\[baseYear, extraMonths, activeTab\]\); \/\/ eslint-disable-line react-hooks\/exhaustive-deps/);
  assert.doesNotMatch(component, /\[fetchData\]\);/);
  assert.match(component, /setShowSettings\(true\)}>설정<\/button>/);
  assert.match(component, /월간실적 파일 설정/);
  assert.match(component, /NAS 동기화/);
  assert.match(component, /fetchSyncStatus/);
  assert.match(component, /source: 'status'/);
  assert.match(component, /syncWasRunningRef/);
  assert.match(component, /function summarizeMonthlySlots/);
  assert.match(component, /settingsSlotSummary/);
  assert.match(component, /settingsPreviewSummary/);
  assert.match(component, /function normalizeSlot\(slot, baseYear = DEFAULT_MONTHLY_BASE_YEAR\)/);
  assert.match(component, /const basisYear = Number\.isFinite\(parsedBaseYear\) \? parsedBaseYear : DEFAULT_MONTHLY_BASE_YEAR/);
  assert.match(component, /typeof slot\.carryover === 'boolean'/);
  assert.match(component, /sheetName: slot\.sheetName \?\? slot\.sheet_name \?\? FIRST_SHEET_TOKEN/);
  assert.match(component, /normalizeSlot\(\{ \.\.\.slot, \.\.\.patch \}, baseYear\)/);
  assert.match(component, /저장 후 동기화/);
  assert.match(component, /saveSettingsAndSync/);
  assert.doesNotMatch(component, /월별 파일 공간/);
  assert.match(component, /기준연도 12개월 \+ 정리기간 파일을 월별로 연결합니다/);
  assert.match(component, /읽을 시트는 기본값이 첫 번째 시트입니다/);
  assert.match(component, /표 제목 행은 엑셀에서 컬럼명이 있는 줄 번호/);
  assert.match(component, /현재 파일 공간/);
  assert.match(component, /기준연도 구간/);
  assert.match(component, /정리기간 구간/);
  assert.match(component, /월 파일 경로/);
  assert.match(component, /읽을 시트/);
  assert.match(component, /표 제목 행/);
  assert.match(component, /<option value=\{FIRST_SHEET_TOKEN\}>첫 번째 시트<\/option>/);
  assert.match(component, /<option value="custom">시트명 직접 입력<\/option>/);
  assert.match(component, /placeholder="자동"/);
  assert.match(component, /비워두면 자동으로 찾습니다/);
  assert.match(component, /월 파일명 찾기/);
  assert.match(component, /연도\/정리기간으로 월 목록 다시 만들기/);
  assert.match(component, /formatReportTitle/);
  assert.match(component, /아산매출보고서/);
  assert.match(component, /IN\/OUT-BOUND/);
  assert.match(component, /단위 : 원/);
  assert.match(component, /이월/);
  assert.doesNotMatch(component, /보고서 표 없음 · 원장 기준 분석 중/);
  assert.match(component, /REPORT_ALL_KEY/);
  assert.match(component, /if \(period === REPORT_ALL_KEY\) return '매출보고서'/);
  assert.match(component, /selectedReportPeriod === REPORT_ALL_KEY \? '매출보고서'/);
  assert.match(component, /aggregateMonthlyReports/);
  assert.doesNotMatch(component, /월별·일별 트리/);
  assert.doesNotMatch(component, /dailyTreePanel/);
  assert.doesNotMatch(component, /dailyTreeHead/);
  assert.doesNotMatch(component, /expandedDailyMonths/);
  assert.match(component, /세분화 분석/);
  assert.match(component, /dimensionPanel/);
  assert.match(component, /매출/);
  assert.match(component, /청구처별/);
  assert.match(component, /작업지별/);
  assert.match(component, /지급처별/);
  assert.match(component, /청구픽업별/);
  assert.match(component, /포트별/);
  assert.match(component, /이월구분별/);
  assert.match(component, /선적별/);
  assert.match(component, /이월\(청구처기준\)/);
  assert.match(component, /계산서/);
  assert.doesNotMatch(component, /key: 'category'/);
  assert.doesNotMatch(component, /key: 'route'/);
  assert.doesNotMatch(component, /key: 'contract'/);
  assert.doesNotMatch(component, /key: 'billing_pickup'/);
  assert.match(component, /isHiddenDimensionColumn/);
  assert.match(component, /compact\.includes\('odcy'\)/);
  assert.match(component, /compact\.includes\('노선'\)/);
  assert.match(component, /compact\.includes\('계약'\)/);
  assert.match(component, /dedupedByLabel\.set\(key, section\)/);
  assert.match(component, /extra_\$\{idx\}_/);
  assert.match(component, /buildReportDimensionSections/);
  assert.match(component, /buildCarryoverDimensionSection/);
  assert.doesNotMatch(component, /운송사\(명의\)별/);
  assert.match(component, /carryoverClientItemsFromReport/);
  assert.match(component, /dimensionDiagram/);
  assert.match(component, /expandedDimensionKeys/);
  assert.match(component, /visibleDimensionItems/);
  assert.match(component, /selectDimensionSection/);
  assert.match(component, /activeDimensionExpanded \? `전체/);
  assert.match(component, /openDetailSearch\(\[item\.name\], 'and'\)/);
  assert.match(component, /분석 기준/);
  assert.match(component, /shortMonthLabel/);
  assert.match(component, /monthWeeks/);
  assert.match(component, /monthDays/);
  assert.match(component, /shortWeekOptionLabel/);
  assert.match(component, /shortDayOptionLabel/);
  assert.match(component, /ANALYSIS_SCOPE_WEEK/);
  assert.match(component, /buildWeekBuckets/);
  assert.match(component, /availableWeeks/);
  assert.match(component, /const monthSelectDisabled = analysisScope === ANALYSIS_SCOPE_ALL \|\| !availableMonths\.length/);
  assert.match(component, /const weekSelectDisabled = analysisScope !== ANALYSIS_SCOPE_WEEK \|\| !monthWeeks\.length/);
  assert.match(component, /const daySelectDisabled = analysisScope !== ANALYSIS_SCOPE_DAY \|\| !monthDays\.length/);
  assert.match(component, /요일별 카드/);
  assert.match(component, /buildWeekdayCards/);
  assert.match(component, /class MonthlyAnalysisErrorBoundary extends React\.Component/);
  assert.match(component, /resetKey=\{analysisResetKey\}/);
  assert.match(component, /function safeObjectList\(value\)/);
  assert.match(component, /const monthly = safeObjectList\(summary\.monthly\)/);
  assert.match(component, /const daily = safeObjectList\(summary\.daily\)/);
  assert.match(component, /const monthlyReports = safeObjectList\(summary\.monthlyReports\)/);
  assert.match(component, /if \(!item \|\| typeof item !== 'object'\) return false/);
  assert.match(component, /function metricSeries\(item = \{\}, field\)/);
  assert.match(component, /metricSeries\(item, 'monthly'\)\.find/);
  assert.match(component, /metricSeries\(item, 'daily'\)\.find/);
  assert.match(component, /return null;\s*\}\s*if \(scope === ANALYSIS_SCOPE_DAY\)/);
  assert.doesNotMatch(component, /return metricSeries\(item, 'monthly'\)\.find\(metric => metric\.period === selectedWeek\?\.period\)/);
  assert.match(component, /const activeAnalysisMonthValue = availableMonths\.some/);
  assert.match(component, /scopeMetricList\(segmentItems, analysisScope, activeAnalysisMonthValue, activeAnalysisDay, activeAnalysisWeek/);
  assert.match(component, /changeAnalysisScope/);
  assert.match(component, /disabled=\{monthSelectDisabled\}/);
  assert.match(component, /disabled=\{weekSelectDisabled\}/);
  assert.match(component, /disabled=\{daySelectDisabled\}/);
  assert.match(component, /MonthlyLedgerFlowChart/);
  assert.match(component, /<h3>누적<\/h3>/);
  assert.match(component, /scopeFlowItems/);
  assert.match(component, /aggregateFlowByYear\(scopedMonthly\)/);
  assert.match(component, /scopeLabel: `\$\{item\.year\}년`/);
  assert.match(component, /analysisScope === ANALYSIS_SCOPE_MONTH/);
  assert.match(component, /monthWeeks\s*\.filter\(isMetricActive\)/);
  assert.match(component, /activeAnalysisWeek\?\.dateSet\?\.has\(item\.scopeKey\)/);
  assert.match(component, /return scopedDaily\.map\(item =>/);
  assert.doesNotMatch(component, /isSelected: item\.scopeKey === activeAnalysisDayValue/);
  assert.doesNotMatch(component, /highlightKey=\{analysisScope === ANALYSIS_SCOPE_DAY \? activeAnalysisDayValue : ''\}/);
  assert.match(component, /scopeFlowBasisLabel/);
  assert.match(component, /analysisScope === ANALYSIS_SCOPE_ALL \? '연도'/);
  assert.match(component, /scopeFlowUnitLabel = analysisScope === ANALYSIS_SCOPE_ALL \? '년'/);
  assert.match(component, /axisLabels\.map/);
  assert.match(component, /gridTemplateColumns: `repeat\(\$\{Math\.max\(1, series\.length\)\}, minmax\(0, 1fr\)\)`/);
  assert.match(component, /avgRevenue/);
  assert.match(component, /monthlyTrendRevenueAvgLine/);
  assert.match(component, /monthlyTrendGraph/);
  assert.match(component, /monthlyTrendDataLabel/);
  assert.match(component, /monthlyTrendAvgBadge/);
  assert.match(component, /pointLabels\.map/);
  assert.match(component, /analysisScopeLead/);
  assert.match(component, /MetricDonut/);
  assert.match(component, /실적 인포그래픽/);
  assert.doesNotMatch(component, /월간 실적 인포그래픽/);
  assert.doesNotMatch(component, /최고 청구월/);
  assert.match(component, /선택 기준 성과 흐름/);
  assert.doesNotMatch(component, /dailyTreeMonthlySeed/);
  assert.match(component, /구성·차량 성과/);
  assert.match(component, /ELS직계약차량/);
  assert.match(component, /외부\/타운송사/);
  assert.match(component, /차량 TOP10/);
  assert.match(component, /vehiclePurchaseItems = \[\.\.\.scopedVehicleItems\]\.sort/);
  assert.match(component, /safeNumber\(b\.purchase\) - safeNumber\(a\.purchase\)/);
  assert.match(component, /visibleVehicles = vehiclePurchaseItems\.slice\(0, 10\)/);
  assert.match(component, /vehicleMax = Math\.max\(1, \.\.\.vehiclePurchaseItems\.map\(item => Math\.abs\(safeNumber\(item\.purchase\)\)\)\)/);
  assert.match(component, /vehicleCarrierLabel/);
  assert.match(component, /vehicleDisplayName\(vehicle\)/);
  assert.match(component, /운송사\/차량번호/);
  assert.match(component, /vehicleInsightHead/);
  assert.match(component, /매입액 기준/);
  assert.match(component, /<span>매입액<\/span>/);
  assert.match(component, /metricWidth\(vehicle\.purchase, vehicleMax\)/);
  assert.match(component, /formatPerformanceAmount\(vehicle\.purchase\)/);
  assert.match(component, /<span>건수<\/span>/);
  assert.match(component, /<small>\{safeNumber\(vehicle\.rowCount\)\.toLocaleString\('ko-KR'\)\}건<\/small>/);
  assert.doesNotMatch(component, /formatPerformanceAmount\(vehicle\.profit\)/);
  assert.doesNotMatch(component, /손익·건수/);
  assert.match(component, /scopedVehicleItems/);
  assert.match(component, /visibleVehicles/);
  assert.doesNotMatch(component, /showAllVehicles/);
  assert.doesNotMatch(component, /setShowAllVehicles/);
  assert.match(component, /reportTableReady/);
  assert.doesNotMatch(component, /보고서 표 없음 · 원장 기준 분석 중/);
  assert.match(component, /이월금액/);
  assert.match(component, /selectedReportPeriod/);
  assert.match(component, /2027-03/);
  assert.match(component, /buildMonthlyPerformanceFileSlots/);
  const css = read('web/app/(main)/employees/branches/asan/annualPerformance.module.css');
  assert.match(css, /\.tableArea\s*{[\s\S]*height: clamp\(260px, calc\(100dvh - 290px\), 700px\)/);
  assert.match(css, /\.tableArea\s*{[\s\S]*overflow: hidden/);
  assert.match(css, /\.tableScroll\s*{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.tableScroll\s*{[\s\S]*scrollbar-gutter: stable both-edges/);
  assert.match(css, /\.tableScroll::-webkit-scrollbar\s*{[\s\S]*height: 12px/);
  assert.match(css, /\.tableScroll::-webkit-scrollbar-thumb\s*{[\s\S]*background: #94a3b8/);
  assert.match(css, /\.monthlyReportScroll\s*{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.vehicleInsightRows\s*{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.summarySourceRows\s*{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.carryoverClientRows\s*{[\s\S]*scrollbar-gutter: stable both-edges/);
  assert.match(css, /\.dataTable\s*{[\s\S]*width: max-content/);
  assert.match(component, /placeholder="검색어 또는 금액 \(\, ; 로 조건 추가\)"/);
  assert.match(component, /하나라도 포함/);
  assert.match(component, /모두 포함/);
  assert.match(component, /title="클릭하여 정렬"/);
  assert.match(dbReader, /split\(\/\[;,，；\]\+\//);
  assert.match(dbReader, /function performanceSearchValuesFromRow/);
  assert.match(dbReader, /collectPerformanceSearchValues\(row\.row_data, values\)/);
  assert.match(dbReader, /rowMatchesPerformanceSearch\(mapped, search, searchMode\)/);
  assert.match(dbReader, /PERFORMANCE_SEARCH_SCAN_BATCH_SIZE = 1000/);
  assert.match(dbReader, /async function scanPerformanceSearchRows/);
  assert.match(dbReader, /buildOrderedQuery/);
  assert.match(dbReader, /buildBaseOrdered = buildQuery \? \(\) => orderQuery\(buildQuery\(\)\) : null/);
  assert.match(dbReader, /buildOrderedQuery: buildBaseOrdered/);
  assert.match(dbReader, /if \(shouldFilter\) \{[\s\S]*scanPerformanceSearchRows/);
  assert.match(dbReader, /total: paged\.total \?\? fallbackTotal/);
  assert.match(dbReader, /replace\(PERFORMANCE_SEARCH_COMPACT_RE/g);
  assert.match(css, /\.analytics\s*{[\s\S]*grid-template-columns: repeat\(auto-fit/);
  assert.match(css, /minmax\(min\(100%, 640px\), 1fr\)/);
  assert.doesNotMatch(css, /\.dailyTreeHead/);
  assert.doesNotMatch(css, /\.dailyTreePanel/);
  assert.doesNotMatch(css, /\.dailyTree\s*{/);
  assert.match(css, /\.dimensionPanel\s*{[\s\S]*width: 100%/);
  assert.match(css, /\.dimensionRows\s*{[\s\S]*width: 100%/);
  assert.match(css, /\.dimensionRows\s*{[\s\S]*scrollbar-gutter: stable both-edges/);
  assert.match(css, /\.monthlySettingsGuide/);
  assert.match(css, /\.monthlySettingsSummary\s*{[\s\S]*grid-template-columns: repeat\(3/);
  assert.match(css, /\.monthlySettingsHeader\s*{[\s\S]*grid-template-columns: 96px minmax\(320px, 1fr\) minmax\(150px, 180px\) 88px 110px/);
  assert.match(css, /\.monthlySettingsRow\s*{[\s\S]*grid-template-columns: 96px minmax\(320px, 1fr\) minmax\(150px, 180px\) 88px 110px/);
  assert.match(css, /\.sheetControl\s*{[\s\S]*display: grid/);
  assert.match(css, /\.sheetNameInput/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.monthlySettingsSummary\s*{[\s\S]*grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.monthlySettingsHeader\s*{[\s\S]*display: none/);
  assert.match(css, /\.weekdayPanel\s*{[\s\S]*order: 62/);
  assert.match(css, /\.weekdayCard i/);
  assert.match(css, /\.dimensionPanel\s*{[\s\S]*order: 61/);
  assert.match(css, /\.analysisScopePanel\s*{[\s\S]*order: 5/);
  assert.match(css, /\.analysisScopeLead\s*{[\s\S]*display: flex/);
  assert.match(css, /\.analysisScopeSelects\s*{[\s\S]*grid-template-columns: repeat\(3/);
  assert.match(css, /\.analysisScopeSelects\s*{[\s\S]*width: min\(100%, 720px\)/);
  assert.match(css, /\.analysisScopeSelects select:disabled\s*{[\s\S]*background: #f1f5f9/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.analysisScopeTitle\s*{[\s\S]*flex: 0 0 auto/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.analysisScopeTitle\s*{[\s\S]*width: 100%/);
  assert.match(css, /\.monthlyTrendPanel\s*{[\s\S]*order: 8/);
  assert.match(css, /\.panelHeaderTitleButton\s*{[\s\S]*cursor: pointer/);
  assert.match(css, /\.analysisScopeButtons button:disabled/);
  assert.match(css, /\.monthlyTrendGraph\s*{[\s\S]*position: relative/);
  assert.match(css, /\.monthlyTrendSvg\s*{[\s\S]*width: 100%/);
  assert.match(css, /\.monthlyTrendAxis\s*{[\s\S]*display: grid/);
  assert.match(css, /\.monthlyTrendStats\s*{[\s\S]*grid-template-columns: repeat\(auto-fit/);
  assert.match(css, /\.monthlyTrendRevenueAvgLine/);
  assert.match(css, /\.monthlyTrendPurchaseAvgLine/);
  assert.match(css, /\.monthlyTrendProfitAvgLine/);
  assert.match(css, /\.monthlyTrendDataLabel/);
  assert.match(css, /\.monthlyTrendAvgBadge/);
  assert.match(css, /\.monthlyTrendPointActive/);
  assert.match(css, /\.monthlyInfographicGrid/);
  assert.match(css, /\.metricDonut/);
  assert.match(css, /\.monthlyTrendProfitLine/);
  assert.match(css, /@media \(min-width: 1240px\)[\s\S]*\.dimensionPanel\s*{[\s\S]*grid-column: span 1/);
  assert.match(css, /\.compositionCardBody\s*{[\s\S]*display: flex/);
  assert.match(css, /\.segmentInsightGrid/);
  assert.match(css, /\.vehicleInsightHead/);
  assert.match(css, /\.vehicleInsightRow/);
  assert.match(css, /\.vehicleInsightHead span:nth-child\(2\),\s*\.vehicleInsightRow strong\s*{[\s\S]*text-align: right/);
  assert.match(css, /grid-template-columns: 26px minmax\(180px, 1\.05fr\) minmax\(140px, 1fr\) 110px 88px/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.tableArea\s*{[\s\S]*height: clamp\(300px, calc\(100dvh - 170px\), 580px\)/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.vehicleInsightHead,\s*\.vehicleInsightRow\s*{[\s\S]*min-width: 580px/);
  assert.doesNotMatch(css, /\.dailyMonthRow/);
  assert.match(css, /\.dimensionRows/);
});
