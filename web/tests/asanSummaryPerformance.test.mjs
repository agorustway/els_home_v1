import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAsanPerformanceExecutiveSummary,
  buildScopedAsanPerformanceSummary,
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
  assert.match(component, /전체/);
  assert.match(component, /연도별/);
  assert.match(component, /월별/);
  assert.match(component, /일별/);
  assert.match(component, /yearSelectEnabled = scopeMode === 'year'/);
  assert.match(component, /monthSelectEnabled = scopeMode === 'month'/);
  assert.match(component, /daySelectEnabled = scopeMode === 'day'/);
  assert.match(component, /disabled=\{!yearSelectEnabled\}/);
  assert.match(component, /disabled=\{!monthSelectEnabled\}/);
  assert.match(component, /disabled=\{!daySelectEnabled\}/);
  assert.match(component, /buildScopedAsanPerformanceSummary/);
  assert.match(component, /통합 매출/);
  assert.match(component, /통합 손익/);
  assert.match(component, /선택 범위 합산 구조/);
  assert.match(component, /청록 막대 = 매출/);
  assert.match(component, /파란 선 = 손익/);
  assert.match(component, /연도별 매출·손익 흐름/);
  assert.match(component, /월별 매출·손익 흐름/);
  assert.match(component, /일별 매출·손익 흐름/);
  assert.match(component, /그래프 단위/);
  assert.match(component, /2026년처럼 진행 중인 연도/);
  assert.match(component, /ELS직계약차량/);
  assert.match(component, /외부\/타운송사/);
  assert.match(component, /손익률/);
  assert.match(component, /매입률/);
  assert.match(component, /최근월/);
  assert.match(component, /경영 판단/);
  assert.match(component, /수익성·차량 구성·청구처\/지급처 마진/);
  assert.match(component, /계약\/차량 집중도/);
  assert.doesNotMatch(component, /선택 범위의 방향·수익성·집중도·데이터 신뢰/);
  assert.doesNotMatch(component, /<button[^>]*>\s*월간실적\s*<\/button>/);
  assert.doesNotMatch(component, /<button[^>]*>\s*연간실적\s*<\/button>/);
  assert.match(component, /상세는 월간실적/);
  assert.match(component, /openAnnual/);
  assert.match(component, /openMonthly/);
  assert.match(component, /ExecutiveFlowDiagram/);
  assert.match(component, /ExecutiveTrendChart/);
  assert.match(component, /ExecutiveYearMatrix/);
  assert.match(component, /ExecutiveSourceTable/);
  assert.match(component, /\{\s*\.\.\.\(summary\?\.sourceMix\?\.annual \|\| \{\}\), label: '연간실적'/);
  assert.match(component, /\{\s*\.\.\.\(summary\?\.sourceMix\?\.monthly \|\| \{\}\), label: '월간실적'/);

  assert.match(css, /\.summaryExecutive/);
  assert.match(css, /\.summaryScopePanel/);
  assert.match(css, /\.summaryScopeSelects select:disabled/);
  assert.match(css, /\.summaryScopeDisabled span/);
  assert.match(css, /\.summaryKpiGrid/);
  assert.match(css, /\.summaryFlowDiagram/);
  assert.match(css, /\.summaryFormulaStrip/);
  assert.match(css, /\.summaryTrendSvg/);
  assert.match(css, /\.summaryYearMatrix/);
  assert.match(css, /\.summaryYearActive/);
  assert.match(css, /\.summarySegmentSplitGrid/);
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
        daily: [
          { date: '2026-04-10', period: '2026-04', revenue: 100, purchase: 80, profit: 20, rowCount: 1 },
        ],
        strategicSegments: [
          {
            key: 'own_direct',
            label: 'ELS직계약차량',
            revenue: 700,
            purchase: 560,
            profit: 140,
            rowCount: 7,
            monthly: [{ period: '2026-04', revenue: 600, purchase: 480, profit: 120, rowCount: 6 }],
            daily: [{ date: '2026-04-10', period: '2026-04', revenue: 100, purchase: 80, profit: 20, rowCount: 1 }],
            topClients: [{ label: '글로비스', revenue: 300, purchase: 240, profit: 60, rowCount: 3 }],
          },
        ],
        breakdowns: [
          {
            column: '청구처',
            items: [
              { label: '고마진화주', revenue: 200, purchase: 120, profit: 80, rowCount: 2, monthly: [{ period: '2026-04', revenue: 200, purchase: 120, profit: 80, rowCount: 2 }], daily: [{ date: '2026-04-10', period: '2026-04', revenue: 80, purchase: 40, profit: 40, rowCount: 1 }] },
              { label: '저마진화주', revenue: 300, purchase: 294, profit: 6, rowCount: 3, monthly: [{ period: '2026-04', revenue: 300, purchase: 294, profit: 6, rowCount: 3 }], daily: [{ date: '2026-04-10', period: '2026-04', revenue: 20, purchase: 19, profit: 1, rowCount: 1 }] },
            ],
          },
          {
            column: '지급처',
            items: [
              { label: '고마진지급처', revenue: 220, purchase: 110, profit: 110, rowCount: 2, monthly: [{ period: '2026-04', revenue: 220, purchase: 110, profit: 110, rowCount: 2 }], daily: [{ date: '2026-04-10', period: '2026-04', revenue: 90, purchase: 45, profit: 45, rowCount: 1 }] },
              { label: '저마진지급처', revenue: 180, purchase: 176, profit: 4, rowCount: 2, monthly: [{ period: '2026-04', revenue: 180, purchase: 176, profit: 4, rowCount: 2 }], daily: [{ date: '2026-04-10', period: '2026-04', revenue: 10, purchase: 9, profit: 1, rowCount: 1 }] },
            ],
          },
        ],
        vehiclePerformance: [
          {
            vehicleNo: '12가3456',
            revenue: 500,
            purchase: 430,
            profit: 70,
            rowCount: 5,
            monthly: [{ period: '2026-04', revenue: 500, purchase: 430, profit: 70, rowCount: 5 }],
            daily: [{ date: '2026-04-10', period: '2026-04', revenue: 100, purchase: 80, profit: 20, rowCount: 1 }],
          },
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
        daily: [
          { date: '2026-04-10', period: '2026-04', revenue: 40, purchase: 30, profit: 10, rowCount: 1 },
        ],
        strategicSegments: [
          {
            key: 'external_carrier',
            label: '외부/타운송사',
            revenue: 300,
            purchase: 240,
            profit: 60,
            rowCount: 7,
            monthly: [{ period: '2026-04', revenue: 300, purchase: 240, profit: 60, rowCount: 7 }],
            daily: [{ date: '2026-04-10', period: '2026-04', revenue: 40, purchase: 30, profit: 10, rowCount: 1 }],
          },
        ],
        breakdowns: [
          {
            column: '청구처',
            items: [
              { label: '월간고마진화주', revenue: 100, purchase: 60, profit: 40, rowCount: 1, monthly: [{ period: '2026-04', revenue: 100, purchase: 60, profit: 40, rowCount: 1 }], daily: [{ date: '2026-04-10', period: '2026-04', revenue: 40, purchase: 20, profit: 20, rowCount: 1 }] },
            ],
          },
          {
            column: '운송사',
            items: [
              { label: '월간운송사', revenue: 100, purchase: 90, profit: 10, rowCount: 1, monthly: [{ period: '2026-04', revenue: 100, purchase: 90, profit: 10, rowCount: 1 }], daily: [{ date: '2026-04-10', period: '2026-04', revenue: 40, purchase: 35, profit: 5, rowCount: 1 }] },
            ],
          },
        ],
        vehiclePerformance: [
          {
            vehicleNo: '34나7890',
            revenue: 300,
            purchase: 240,
            profit: 60,
            rowCount: 7,
            monthly: [{ period: '2026-04', revenue: 300, purchase: 240, profit: 60, rowCount: 7 }],
            daily: [{ date: '2026-04-10', period: '2026-04', revenue: 40, purchase: 30, profit: 10, rowCount: 1 }],
          },
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
  assert.equal(summary.daily.find(item => item.date === '2026-04-10').revenue, 140);
  assert.equal(summary.yearly.find(item => item.year === 2026).profit, 240);
  assert.equal(summary.latestMonth.period, '2026-04');
  assert.equal(summary.previousMonth.period, '2026-03');
  assert.equal(summary.sourceMix.annual.revenue, 1000);
  assert.equal(summary.sourceMix.monthly.revenue, 300);
  assert.equal(summary.strategicSegments.length, 2);
  assert.equal(summary.strategicSegments[0].topClients[0].label, '글로비스');
  assert.equal(summary.breakdowns.find(item => item.column === '청구처').items.length, 3);
  assert.equal(summary.vehiclePerformance[0].vehicleNo, '12가3456');
  assert.ok(summary.scopeOptions.yearly.some(item => item.label === '2026년 4월까지'));
  assert.ok(summary.executiveSignals.some(item => item.title === 'ELS/외부 집중도' && item.value.includes('ELS')));
  assert.ok(summary.executiveSignals.some(item => item.title === '고마진 청구처'));
  assert.ok(summary.executiveSignals.some(item => item.title === '고마진 지급처'));
  assert.ok(summary.executiveSignals.some(item => item.title === '저마진 청구처'));
  assert.ok(summary.executiveSignals.some(item => item.title === '저마진 지급처'));
  assert.ok(!summary.executiveSignals.some(item => item.title === '최근월 방향'));
  assert.ok(!summary.executiveSignals.some(item => item.title === '데이터 신뢰'));
  assert.ok(!summary.executiveSignals.some(item => item.title === '저마진 차량'));

  const scopedMonth = buildScopedAsanPerformanceSummary(summary, { mode: 'month', month: '2026-04' });
  assert.equal(scopedMonth.totalRevenue, 900);
  assert.equal(scopedMonth.sourceMix.annual.revenue, 600);
  assert.equal(scopedMonth.sourceMix.monthly.revenue, 300);
  assert.equal(scopedMonth.trendBasis, '월별');
  assert.deepEqual(scopedMonth.trendItems.map(item => item.period), ['2026-03', '2026-04']);
  assert.equal(scopedMonth.trendItems.find(item => item.period === '2026-04').isSelected, true);
  assert.equal(scopedMonth.strategicSegments[0].label, 'ELS직계약차량');
  assert.equal(scopedMonth.vehiclePerformance.length, 2);
  assert.ok(scopedMonth.executiveSignals.some(item => item.title === '저마진 지급처'));

  const scopedYear = buildScopedAsanPerformanceSummary(summary, { mode: 'year', year: '2026' });
  assert.equal(scopedYear.trendBasis, '연도별');
  assert.deepEqual(scopedYear.trendItems.map(item => item.year), [2026]);
  assert.equal(scopedYear.trendItems[0].isSelected, true);

  const scopedDay = buildScopedAsanPerformanceSummary(summary, { mode: 'day', dayKey: '2026-04::2026-04-10' });
  assert.equal(scopedDay.totalRevenue, 140);
  assert.equal(scopedDay.sourceMix.annual.revenue, 100);
  assert.equal(scopedDay.sourceMix.monthly.revenue, 40);
  assert.equal(scopedDay.trendBasis, '일별');
  assert.equal(scopedDay.trendItems.find(item => item.date === '2026-04-10').isSelected, true);
  assert.equal(scopedDay.scope.label, '2026-04-10');
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
