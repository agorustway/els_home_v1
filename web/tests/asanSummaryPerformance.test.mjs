import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAsanPerformanceExecutiveSummary,
  mergePerformanceSeries,
} from '../utils/asanPerformanceSummary.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

test('아산 종합실적 API는 연간/월간 Supabase 요약을 합산한다', () => {
  const route = read('app/api/branches/asan/performance/summary/route.js');
  assert.match(route, /queryAsanAnnualPerformanceFromSupabase/);
  assert.match(route, /queryAsanMonthlyPerformanceFromSupabase/);
  assert.match(route, /Promise\.all/);
  assert.match(route, /buildAsanPerformanceExecutiveSummary/);
  assert.match(route, /aggregate', 'all'/);
  assert.match(route, /page_size', '1'/);
});

test('아산 종합실적 화면은 사장 관점 핵심 KPI와 상세 탭 이동을 제공한다', () => {
  const page = read('app/(main)/employees/branches/asan/page.js');
  const component = read('app/(main)/employees/branches/asan/AsanSummaryPerformance.js');
  const css = read('app/(main)/employees/branches/asan/annualPerformance.module.css');

  assert.match(page, /import AsanSummaryPerformance/);
  assert.match(page, /activePerformanceTab === 'summary-performance' && \(/);
  assert.match(page, /onOpenAnnual=\{\(\) => switchPerformanceTab\('annual-performance'\)\}/);
  assert.match(page, /onOpenMonthly=\{\(\) => switchPerformanceTab\('monthly-performance'\)\}/);

  assert.match(component, /\/api\/branches\/asan\/performance\/summary/);
  assert.match(component, /아산 종합 실적 지휘판/);
  assert.match(component, /연간\+월간 합산/);
  assert.match(component, /통합 매출/);
  assert.match(component, /통합 손익/);
  assert.match(component, /손익률/);
  assert.match(component, /매입률/);
  assert.match(component, /최근월/);
  assert.match(component, /경영 판단/);
  assert.match(component, /계약\/차량 집중도/);
  assert.match(component, /데이터 신뢰/);
  assert.match(component, /상세는 월간실적/);
  assert.match(component, /openAnnual/);
  assert.match(component, /openMonthly/);
  assert.match(component, /ExecutiveFlowDiagram/);
  assert.match(component, /ExecutiveTrendChart/);
  assert.match(component, /ExecutiveYearMatrix/);
  assert.match(component, /ExecutiveSourceTable/);

  assert.match(css, /\.summaryExecutive/);
  assert.match(css, /\.summaryKpiGrid/);
  assert.match(css, /\.summaryFlowDiagram/);
  assert.match(css, /\.summaryTrendSvg/);
  assert.match(css, /\.summaryYearMatrix/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.summaryKpiGrid/);
});

test('종합실적 합산 유틸은 연간과 월간의 같은 기간을 더하고 경영 신호를 만든다', () => {
  const summary = buildAsanPerformanceExecutiveSummary({
    annual: {
      total: 11,
      synced_at: '2026-05-19T01:00:00Z',
      summary: {
        totalRevenue: 1000,
        totalPurchase: 820,
        totalProfit: 180,
        analysisRows: 10,
        monthly: [
          { period: '2026-03', year: 2026, month: 3, revenue: 400, purchase: 330, profit: 70, rowCount: 4 },
          { period: '2026-04', year: 2026, month: 4, revenue: 600, purchase: 490, profit: 110, rowCount: 6 },
        ],
        strategicSegments: [
          { key: 'own_direct', label: 'ELS직계약차량', revenue: 700, purchase: 560, profit: 140, rowCount: 7 },
        ],
        vehiclePerformance: [
          { vehicleNo: '12가3456', revenue: 500, purchase: 430, profit: 70, rowCount: 5 },
        ],
      },
    },
    monthly: {
      total: 7,
      synced_at: '2026-05-19T02:00:00Z',
      summary: {
        totalRevenue: 300,
        totalPurchase: 240,
        totalProfit: 60,
        analysisRows: 7,
        monthly: [
          { period: '2026-04', year: 2026, month: 4, revenue: 300, purchase: 240, profit: 60, rowCount: 7 },
        ],
        strategicSegments: [
          { key: 'external_carrier', label: '외부/타운송사', revenue: 300, purchase: 240, profit: 60, rowCount: 7 },
        ],
        vehiclePerformance: [
          { vehicleNo: '34나7890', revenue: 300, purchase: 240, profit: 60, rowCount: 7 },
        ],
      },
    },
  });

  assert.equal(summary.totalRevenue, 1300);
  assert.equal(summary.totalPurchase, 1060);
  assert.equal(summary.totalProfit, 240);
  assert.equal(summary.profitRate, 18.46);
  assert.equal(summary.purchaseRate, 81.54);
  assert.equal(summary.monthly.find(item => item.period === '2026-04').revenue, 900);
  assert.equal(summary.yearly.find(item => item.year === 2026).profit, 240);
  assert.equal(summary.latestMonth.period, '2026-04');
  assert.equal(summary.previousMonth.period, '2026-03');
  assert.equal(summary.sourceMix.annual.revenue, 1000);
  assert.equal(summary.sourceMix.monthly.revenue, 300);
  assert.equal(summary.strategicSegments.length, 2);
  assert.equal(summary.vehiclePerformance[0].vehicleNo, '12가3456');
  assert.ok(summary.executiveSignals.some(item => item.title === '최근월 방향'));
  assert.ok(summary.executiveSignals.some(item => item.title === '계약/차량 집중도'));
});

test('종합실적 시리즈 병합은 기간 정렬과 비중 계산을 안정적으로 수행한다', () => {
  const series = mergePerformanceSeries([
    [{ period: '2026-02', revenue: 200, purchase: 120, profit: 80, rowCount: 2 }],
    [{ period: '2026-01', revenue: 100, purchase: 70, profit: 30, rowCount: 1 }],
    [{ period: '2026-02', revenue: 50, purchase: 40, profit: 10, rowCount: 1 }],
  ], {
    keyOf: item => item.period,
    seedOf: item => ({ period: item.period, year: Number(item.period.slice(0, 4)), month: Number(item.period.slice(5, 7)) }),
    totalRevenue: 350,
  });

  assert.deepEqual(series.map(item => item.period), ['2026-01', '2026-02']);
  assert.equal(series[1].revenue, 250);
  assert.equal(series[1].profitRate, 36);
  assert.equal(series[1].revenueShare, 71.43);
});
