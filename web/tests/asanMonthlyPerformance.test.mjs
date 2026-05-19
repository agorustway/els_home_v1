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
});

test('아산 월간실적 Next 라우트는 Supabase monthly 조회와 NAS 백엔드 동기화를 제공한다', () => {
  const route = read('web/app/api/branches/asan/performance/monthly/route.js');
  const dbReader = read('web/lib/asan-branch-db.js');
  assert.match(route, /queryAsanMonthlyPerformanceFromSupabase/);
  assert.match(route, /\/api\/branches\/asan\/performance\/monthly/);
  assert.match(route, /source === 'status'/);
  assert.match(route, /dynamic = 'force-dynamic'/);
  assert.match(dbReader, /dataset_type', 'monthly'/);
  assert.match(dbReader, /buildMonthlyPerformanceFileSlots/);
  assert.match(dbReader, /currentSnapshotId/);
  assert.match(dbReader, /usesDiffCurrent/);
  assert.match(dbReader, /query = query\.eq\('is_current', true\)\.in\('file_path'/);
  assert.match(dbReader, /row_data/);
  assert.match(dbReader, /monthlyFileSlots/);
  assert.match(dbReader, /monthlyReports/);
  assert.match(dbReader, /breakdowns: mergeBreakdowns\(metas, totalRevenue\)/);
  assert.match(dbReader, /strategicSegments: mergeStrategicSegments\(metas, totalRevenue\)/);
  assert.match(dbReader, /vehiclePerformance: mergeVehiclePerformance\(metas, totalRevenue\)/);
  assert.match(dbReader, /carryover/);
  assert.match(dbReader, /daily/);
});

test('아산 월간실적 NAS Core는 여러 월 파일을 첫 번째 시트 기준으로 백그라운드 동기화한다', () => {
  const backend = read('docker/els-backend/asan_performance.py');
  assert.match(backend, /DEFAULT_ASAN_MONTHLY_PERFORMANCE_BASE_DIR/);
  assert.match(backend, /FIRST_SHEET_TOKEN = "__first__"/);
  assert.match(backend, /def _monthly_periods/);
  assert.match(backend, /extra_months=3/);
  assert.match(backend, /@app\.route\("\/api\/branches\/asan\/performance\/monthly", methods=\["GET", "POST"\]\)/);
  assert.match(backend, /"--dataset-type", "monthly"/);
  assert.match(backend, /"--diff-current"/);
  assert.match(backend, /"--source-year"/);
  assert.match(backend, /"--source-month"/);
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
  assert.match(importer, /function finalizeSeries\(map, roundItem/);
  assert.ok(importer.indexOf('function finalizeSeries(map, roundItem') < importer.indexOf('function finalizeBreakdowns'));
  assert.match(importer, /daily: finalizeSeries\(daily/);
  assert.match(importer, /FIRST_SHEET_TOKEN/);
});

test('아산 월간실적 화면은 파일 설정 저장 후 자동 동기화와 이월 월 슬롯을 제공한다', () => {
  const component = read('web/app/(main)/employees/branches/asan/AsanMonthlyPerformance.js');
  const page = read('web/app/(main)/employees/branches/asan/page.js');
  assert.match(page, /import AsanMonthlyPerformance/);
  assert.match(page, /activePerformanceTab === 'monthly-performance' && <AsanMonthlyPerformance \/>/);
  assert.match(component, /월간실적/);
  assert.match(component, /\/api\/branches\/asan\/performance\/monthly/);
  assert.match(component, /파일 설정/);
  assert.match(component, /NAS 동기화/);
  assert.match(component, /fetchSyncStatus/);
  assert.match(component, /source: 'status'/);
  assert.match(component, /syncWasRunningRef/);
  assert.match(component, /저장 후 동기화/);
  assert.match(component, /saveSettingsAndSync/);
  assert.doesNotMatch(component, /월별 파일 공간/);
  assert.match(component, /formatReportTitle/);
  assert.match(component, /아산매출보고서/);
  assert.match(component, /IN\/OUT-BOUND/);
  assert.match(component, /단위 : 원/);
  assert.match(component, /이월/);
  assert.match(component, /매출보고서 표 미감지/);
  assert.match(component, /REPORT_ALL_KEY/);
  assert.match(component, /if \(period === REPORT_ALL_KEY\) return '매출보고서'/);
  assert.match(component, /selectedReportPeriod === REPORT_ALL_KEY \? '매출보고서'/);
  assert.match(component, /aggregateMonthlyReports/);
  assert.match(component, /월별·일별 트리/);
  assert.match(component, /dailyTreeHead/);
  assert.match(component, /<span>청구<\/span>/);
  assert.match(component, /<span>하불<\/span>/);
  assert.match(component, /expandedDailyMonths/);
  assert.match(component, /세분화 분석/);
  assert.match(component, /청구처별/);
  assert.match(component, /운송사\(명의\)별/);
  assert.match(component, /청구픽업별/);
  assert.match(component, /포트별/);
  assert.match(component, /dimensionDiagram/);
  assert.match(component, /openDetailSearch\(\[item\.name\], 'and'\)/);
  assert.match(component, /월간 실적 인포그래픽/);
  assert.match(component, /최고 청구월/);
  assert.match(component, /구성 분석/);
  assert.match(component, /차량 성과 TOP/);
  assert.match(component, /reportTableReady/);
  assert.match(component, /매출보고서 표 미감지/);
  assert.match(component, /이월금액/);
  assert.match(component, /selectedReportPeriod/);
  assert.match(component, /2027-03/);
  assert.match(component, /buildMonthlyPerformanceFileSlots/);
  const css = read('web/app/(main)/employees/branches/asan/annualPerformance.module.css');
  assert.match(css, /\.tableArea\s*{[\s\S]*height: calc\(100vh - 212px\)/);
  assert.match(css, /\.tableScroll\s*{[\s\S]*max-height: calc\(100vh - 292px\)/);
  assert.match(css, /\.dailyTreeHead/);
  assert.match(css, /\.dailyTree\s*{[\s\S]*max-width: 680px/);
  assert.match(css, /\.dimensionRows\s*{[\s\S]*max-width: 780px/);
  assert.match(css, /\.monthlySummaryPanel/);
  assert.match(css, /\.monthlyInfographicGrid/);
  assert.match(css, /\.reportNoticePanel/);
  assert.match(css, /\.segmentInsightGrid/);
  assert.match(css, /\.vehicleInsightRow/);
  assert.match(css, /\.dailyMonthRow/);
  assert.match(css, /\.dimensionRows/);
});
