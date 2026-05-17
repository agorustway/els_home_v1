import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAsanDashboardPeriods,
  buildAsanDashboardScope,
  buildSelectableAsanDashboardPeriods,
  toSortedChartEntries,
} from '../utils/asanDashboardView.mjs';

const headers = ['구분', '화주', '작업지', '고객사(국가)', '라인(선사명)', 'TYPE', '오더(계)', '배차', '아산', '부산'];

const sourceItems = [
  {
    target_date: '2026-05-18',
    headers,
    data: [
      ['수출', '글로비스', '글로비스1공장', '고객A', 'HMM', '40HC', '10', '10', '이지 6', '신승 4'],
      ['수입', '모비스', '모비스천안', '고객B', 'ONE', '20FT', '3', '3', '대신 3', ''],
    ],
  },
  {
    target_date: '2026-05-19',
    headers,
    data: [
      ['수출', '글로비스', '글로비스1공장', '고객A', 'HMM', '40HC', '7', '7', '이지 7', ''],
    ],
  },
  {
    target_date: '2026-05-25',
    headers,
    data: [
      ['수입', '현대제철', 'KCC글라스', '고객C', 'MSC', '20FT', '5', '5', '동원 5', ''],
    ],
  },
];

test('아산 현황판 기간 스냅샷은 선택일, 주간, 월별, 전체 총량을 나눠 계산한다', () => {
  const periods = buildAsanDashboardPeriods({
    sourceItems,
    viewType: 'integrated',
    viewMode: 'customer',
    activeDate: '2026-05-18',
  });

  assert.deepEqual(periods.map((period) => period.key), ['daily', 'weekly', 'monthly', 'total']);
  assert.equal(periods.find((period) => period.key === 'daily').scope.total, 13);
  assert.equal(periods.find((period) => period.key === 'weekly').scope.total, 20);
  assert.equal(periods.find((period) => period.key === 'monthly').scope.total, 25);
  assert.equal(periods.find((period) => period.key === 'total').scope.total, 25);
});

test('아산 현황판 고객사별 비중 집계를 제공한다', () => {
  const scope = buildAsanDashboardScope({
    rows: sourceItems.flatMap((item) => item.data),
    headers,
    viewType: 'integrated',
    viewMode: 'customer',
  });

  const customerRows = toSortedChartEntries(scope.chartAggs['고객사']);
  assert.equal(customerRows[0].name, '고객A');
  assert.equal(customerRows[0].total, 17);
  assert.equal(scope.pieAggs.direction['수출'], 17);
  assert.equal(scope.pieAggs.container['20FT'], 8);
});

test('아산 현황판 실행사 기준은 지역 칸의 업체명과 대수를 읽는다', () => {
  const periods = buildAsanDashboardPeriods({
    sourceItems,
    viewType: 'integrated',
    viewMode: 'dispatcher',
    activeDate: '2026-05-18',
  });

  const daily = periods.find((period) => period.key === 'daily').scope;
  const weekly = periods.find((period) => period.key === 'weekly').scope;
  const companyRows = toSortedChartEntries(weekly.chartAggs['업체명']);

  assert.equal(daily.total, 13);
  assert.equal(weekly.total, 20);
  assert.equal(companyRows[0].name, '이지');
  assert.equal(companyRows[0].total, 13);
});

test('아산 현황판 선택형 기간 카드는 일별, 주별, 월별 옵션과 전기간 메트릭을 제공한다', () => {
  const dashboard = buildSelectableAsanDashboardPeriods({
    sourceItems,
    viewType: 'integrated',
    viewMode: 'customer',
    selectedDay: '2026-05-19',
  });

  const daily = dashboard.periods.find((period) => period.key === 'daily');
  const weekly = dashboard.periods.find((period) => period.key === 'weekly');
  const monthly = dashboard.periods.find((period) => period.key === 'monthly');

  assert.equal(dashboard.options.dates.length, 3);
  assert.equal(dashboard.options.weeks.length, 2);
  assert.equal(daily.selectedKey, '2026-05-19');
  assert.equal(weekly.scope.total, 20);
  assert.equal(monthly.scope.orderTotal, 25);
  assert.equal(monthly.scope.sheetDispatchTotal, 25);
  assert.equal(monthly.scope.mismatchTotal, 0);
  assert.equal(daily.previousScope.total, 13);
});
