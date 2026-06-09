import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildAsanDashboardBasisDiffSummary,
  buildAsanDashboardCachePayload,
  buildAsanDashboardDataFromCache,
  buildAsanDashboardFinancialForecast,
  buildAsanDashboardPeriods,
  buildAsanDashboardScope,
  buildAsanDashboardTimeline,
  buildAsanDashboardViewerPayload,
  buildAsanDashboardWeekdayComparison,
  buildSelectableAsanDashboardPeriods,
  getActualDispatchQty,
  getDispatchAssignedQty,
  getDispatchPlannedQty,
  toSortedChartEntries,
} from '../utils/asanDashboardView.mjs';
import {
  DISPATCH_DETAIL_HEADERS,
  DISPATCH_DETAIL_PORT_HEADER,
  buildDispatchDetailLines,
  detailLineToRow,
} from '../utils/asanDispatchDetailLines.mjs';
import {
  diffDispatchChangeLines,
  diffDispatchMemoOnlyChanges,
  filterMemoOnlyDispatchChangeEvents,
  makeDispatchChangeSnapshotLine,
} from '../utils/asanDispatchChangeEvents.mjs';
import {
  buildGlapsDispatchRouteFingerprints,
} from '../utils/glapsMasterData.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const routeUnitPrice = {
  scope: { month: '2026-05' },
  summary: { periodEnd: '2026-05' },
  groups: [
    {
      salesItem: '글로비스',
      category: '수출',
      workSite: '글로비스1공장',
      pickup: '부산',
      billingPickup: '부산',
      shipment: '',
      type: '40HC',
      billTo: '고객A',
      payTo: '신승',
      carrier: '신승',
      revenueAmount: 100000,
      purchaseAmount: 80000,
      unitRevenue: 100000,
      unitPurchase: 80000,
    },
    {
      salesItem: '글로비스',
      category: '수출',
      workSite: '글로비스1공장',
      pickup: '아산',
      billingPickup: '아산',
      shipment: '',
      type: '40HC',
      billTo: '고객A',
      payTo: '이지',
      carrier: '이지',
      revenueAmount: 100000,
      purchaseAmount: 80000,
      unitRevenue: 100000,
      unitPurchase: 80000,
    },
    {
      salesItem: '모비스',
      category: '수입',
      workSite: '모비스천안',
      pickup: '의왕ICD',
      billingPickup: '의왕ICD',
      shipment: '',
      type: '20FT',
      billTo: '고객B',
      payTo: '대신',
      carrier: '대신',
      revenueAmount: 50000,
      purchaseAmount: 42000,
      unitRevenue: 50000,
      unitPurchase: 42000,
    },
    {
      salesItem: '현대제철',
      category: '수입',
      workSite: 'KCC글라스',
      pickup: '아산',
      billingPickup: '아산',
      shipment: '',
      type: '20FT',
      billTo: '고객C',
      payTo: '동원',
      carrier: '동원',
      revenueAmount: 60000,
      purchaseAmount: 52000,
      unitRevenue: 60000,
      unitPurchase: 52000,
    },
  ],
};

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

test('아산 현황판 캐시는 원장 없이 기간 집계를 복원한다', () => {
  const cachePayload = buildAsanDashboardCachePayload({
    sourceItems,
    viewType: 'integrated',
  });
  const dashboardData = buildAsanDashboardDataFromCache({
    cachePayload,
    viewType: 'integrated',
    viewMode: 'customer',
    selectedDay: '2026-05-18',
  });

  assert.equal(cachePayload.version, 1);
  assert.equal(dashboardData.activeScope.total, 13);
  assert.equal(dashboardData.periods.find((period) => period.key === 'weekly').scope.total, 20);
  assert.equal(dashboardData.periods.find((period) => period.key === 'monthly').scope.total, 25);
  assert.equal(dashboardData.timeline.length, 2);
  assert.ok(dashboardData.basisDiff.periods.some((period) => period.key === 'daily'));

  const monthlyDashboardData = buildAsanDashboardDataFromCache({
    cachePayload,
    viewType: 'integrated',
    viewMode: 'customer',
    selectedDay: '2026-05-18',
    selectedMonth: '05',
    activePeriod: 'monthly',
  });
  const totalDashboardData = buildAsanDashboardDataFromCache({
    cachePayload,
    viewType: 'integrated',
    viewMode: 'customer',
    selectedDay: '2026-05-18',
    activePeriod: 'total',
  });

  assert.equal(monthlyDashboardData.activeScope.total, 25);
  assert.equal(totalDashboardData.activeScope.total, 25);
});

test('아산 현황판 예측 손익은 최신 구간단가와 부곡 의왕 fallback을 적용한다', () => {
  const forecast = buildAsanDashboardFinancialForecast({
    sourceItems,
    viewType: 'integrated',
    routeUnitPrice,
    selectedDay: '2026-05-18',
    activePeriod: 'daily',
  });

  const daily = forecast.periods.find((period) => period.key === 'daily');
  const weekly = forecast.periods.find((period) => period.key === 'weekly');
  const monthly = forecast.periods.find((period) => period.key === 'monthly');
  assert.equal(daily.qty, 13);
  assert.equal(daily.revenue, 1_165_000);
  assert.equal(daily.purchase, 941_000);
  assert.equal(daily.profit, 224_000);
  assert.equal(daily.averageFallbackQty, 3);
  assert.equal(weekly.revenue, 1_865_000);
  assert.equal(monthly.revenue, 2_165_000);
  assert.equal(forecast.sourcePeriod, '2026-05');

  const missingPickupForecast = buildAsanDashboardFinancialForecast({
    sourceItems: [{
      target_date: '2026-05-18',
      headers,
      data: [['수입', '모비스', '모비스천안', '고객B', 'ONE', '20FT', '3', '3', '', '']],
    }],
    viewType: 'integrated',
    routeUnitPrice,
    selectedDay: '2026-05-18',
    activePeriod: 'daily',
  });
  const missingPickupDaily = missingPickupForecast.periods.find((period) => period.key === 'daily');
  assert.equal(missingPickupDaily.revenue, 150_000);
  assert.equal(missingPickupDaily.purchase, 126_000);
  assert.equal(missingPickupDaily.fallbackPickupQty, 3);
});

test('아산 현황판 뷰어 스냅샷은 첫 화면용 완성 모델만 담는다', () => {
  const cachePayload = buildAsanDashboardCachePayload({
    sourceItems,
    viewType: 'integrated',
  });
  const viewerPayload = buildAsanDashboardViewerPayload({
    cachePayload,
    viewType: 'integrated',
    activeDate: '2026-05-18',
    viewerPolicyVersion: 'test-viewer-policy',
  });

  assert.equal(viewerPayload.payloadKind, 'dashboard-viewer');
  assert.equal(viewerPayload.viewerPolicyVersion, 'test-viewer-policy');
  assert.equal(viewerPayload.selection.day, '2026-05-18');
  assert.equal(viewerPayload.selection.activePeriod, 'daily');
  assert.equal(viewerPayload.modes.customer.activeScope.total, 13);
  assert.equal(viewerPayload.modes.dispatcher.activeScope.total, 13);
  assert.equal(viewerPayload.modes.customer.periods.find((period) => period.key === 'daily').options.length, 1);
  assert.equal(viewerPayload.modes.customer.timeline.length, 2);
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
  assert.equal(scope.pieAggs.region['아산'], 21);
  assert.equal(scope.pieAggs.region['부산'], 4);
  assert.equal(scope.feuTotal, 42);
});

test('아산 현황판 모비스 고객사 구분표는 국가명으로 집계한다', () => {
  const mobisHeaders = ['구분', '화주', '작업지', '고객사', '국가명', '라인(선사명)', 'TYPE', '계', '배차', '아산'];
  const scope = buildAsanDashboardScope({
    rows: [
      ['수출', '모비스AS', '모비스아산', '', 'KOREA', 'ONE', '40HC', '2', '2', '이지 2'],
      ['수출', '모비스AS', '모비스천안', '', 'USA', 'ONE', '20FT', '3', '3', '대신 3'],
      ['수출', '모비스AS', '모비스천안', '', 'USA', 'ONE', '20FT', '1', '1', '대신 1'],
    ],
    headers: mobisHeaders,
    viewType: 'mobis',
    viewMode: 'customer',
  });

  const customerRows = toSortedChartEntries(scope.chartAggs['고객사']);
  assert.equal(customerRows[0].name, 'USA');
  assert.equal(customerRows[0].total, 4);
  assert.equal(customerRows[1].name, 'KOREA');
  assert.equal(customerRows[1].total, 2);
  assert.equal(scope.chartAggs['고객사'].미분류, undefined);

  const integratedScope = buildAsanDashboardScope({
    rows: [
      ['수출', '모비스AS', '모비스아산', '', 'KOREA', 'ONE', '40HC', '2', '2', '이지 2'],
      ['수출', '모비스AS', '모비스천안', '', 'USA', 'ONE', '20FT', '3', '3', '대신 3'],
    ],
    headers: mobisHeaders,
    viewType: 'integrated',
    viewMode: 'customer',
  });
  assert.equal(integratedScope.chartAggs['고객사'].USA.total, 3);
  assert.equal(integratedScope.chartAggs['고객사'].KOREA.total, 2);
  assert.equal(integratedScope.chartAggs['고객사'].미분류, undefined);
});

test('모비스 CODE는 상세배차 포트(DIST)로 표시하고 국가 집계는 유지한다', () => {
  const mobisHeaders = ['구분', '화주', '담당자', '운송사', '선적', '작업지', '포트(CODE)', 'TYPE', '수량', '도착항', '선사명', '국가', '부산'];
  const row = ['수출', '모비스AS', '강주희', 'ELS', '센터', '모비스천안', 'USSAV', '40HC', '1', '시드니', 'CMA', '호주', '이지1'];
  const detailLines = buildDispatchDetailLines({
    headers: mobisHeaders,
    rows: [row],
    workDate: '2026-05-26',
  });
  const portIdx = DISPATCH_DETAIL_HEADERS.indexOf(DISPATCH_DETAIL_PORT_HEADER);
  const scope = buildAsanDashboardScope({
    rows: [row],
    headers: mobisHeaders,
    viewType: 'mobis',
    viewMode: 'customer',
  });

  assert.notEqual(portIdx, -1);
  assert.equal(detailLines[0].port, 'USSAV');
  assert.equal(detailLines[0].customer, '호주 시드니');
  assert.equal(detailLineToRow(detailLines[0])[portIdx], 'USSAV');
  assert.equal(toSortedChartEntries(scope.chartAggs['고객사'])[0].name, '호주');
});

test('아산 현황판 FEU는 20FT 기준으로 TYPE별 환산한다', () => {
  const scope = buildAsanDashboardScope({
    rows: [
      ['수출', '글로비스', '40피트작업지', '고객A', 'HMM', '40FT', '1', '1', '이지 1', ''],
      ['수출', '글로비스', '40피트오타', '고객A', 'HMM', '4OHC', '1', '1', '이지 1', ''],
      ['수입', '모비스', '20피트작업지', '고객B', 'ONE', '20FT', '1', '1', '대신 1', ''],
      ['수출', '글로비스', '45피트작업지', '고객C', 'HMM', '45FT', '1', '1', '이지 1', ''],
    ],
    headers,
    viewType: 'integrated',
    viewMode: 'customer',
  });

  assert.equal(scope.total, 4);
  assert.equal(scope.feuTotal, 7.25);
});

test('아산 현황판 상차지별 비율은 지역 배차 칸을 집계한다', () => {
  const scope = buildAsanDashboardScope({
    rows: sourceItems.flatMap((item) => item.data),
    headers,
    viewType: 'integrated',
    viewMode: 'customer',
  });

  assert.deepEqual(scope.pieAggs.region, { 아산: 21, 부산: 4 });
});

test('아산 현황판 실행사 파싱은 업체명과 수량이 붙은 지역칸도 읽는다', () => {
  const scope = buildAsanDashboardScope({
    rows: [
      ['수출', '글로비스', '글로비스1포장장', '고객A', 'HMM', '40HC', '14', '14', '대신10,자차3.이지5', 'CSS1'],
      ['수출', '모비스AS', '모비스천안', '고객B', 'ONE', '40HC', '오배차', '0', '보송1', ''],
    ],
    headers,
    viewType: 'integrated',
    viewMode: 'dispatcher',
  });

  const companyRows = toSortedChartEntries(scope.chartAggs['업체명']);
  assert.equal(scope.total, 19);
  assert.equal(scope.pieAggs.region['아산'], 18);
  assert.equal(scope.pieAggs.region['부산'], 1);
  assert.equal(companyRows[0].name, '대신');
  assert.equal(companyRows[0].total, 10);
  assert.equal(scope.chartAggs['업체명'].이지.total, 5);
  assert.equal(scope.chartAggs['업체명'].자차.total, 3);
  assert.equal(scope.chartAggs['업체명'].CSS.total, 1);
  assert.equal(scope.chartAggs['업체명'].보송, undefined);
});

test('아산 배차량은 배차 컬럼 오류 시 지역 배차칸 합계로 보정한다', () => {
  const row = ['수출', '글로비스', '글로비스KD센터2포장장', '고객A', 'HMM', '40HC', '7', '#VALUE!', '대신2', '자차3,이지2'];
  const scope = buildAsanDashboardScope({
    rows: [row],
    headers,
    viewType: 'integrated',
    viewMode: 'customer',
  });

  assert.equal(getDispatchAssignedQty(row, headers), 7);
  assert.equal(scope.orderTotal, 7);
  assert.equal(scope.sheetDispatchTotal, 7);
  assert.equal(scope.mismatchTotal, 0);
});

test('아산 배차량은 배차예정 수량을 실제 배차에서 제외한다', () => {
  const plannedHeaders = ['구분', '화주', '작업지', '고객사(국가)', '라인(선사명)', 'TYPE', '오더(계)', '배차', '배차예정', '아산', '부산'];
  const row = ['수출', '글로비스', '글로비스KD센터2포장장', '고객A', 'HMM', '40HC', '80', '80', '대기2', '이지50', '자차28'];
  const scope = buildAsanDashboardScope({
    rows: [row],
    headers: plannedHeaders,
    viewType: 'integrated',
    viewMode: 'customer',
  });

  assert.equal(getDispatchPlannedQty(row, plannedHeaders), 2);
  assert.equal(getDispatchAssignedQty(row, plannedHeaders), 78);
  assert.equal(getActualDispatchQty(row, plannedHeaders, '80'), 78);
  assert.equal(scope.orderTotal, 80);
  assert.equal(scope.sheetDispatchTotal, 78);
  assert.equal(scope.mismatchTotal, 2);
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

test('아산 현황판 기준차이 패널은 고객사 오더와 실행사 지역 합계 차이를 찾는다', () => {
  const diffSummary = buildAsanDashboardBasisDiffSummary({
    sourceItems: [
      {
        target_date: '2026-05-18',
        headers,
        data: [
          ['수출', '글로비스', '글로비스1공장', '고객A', 'HMM', '40HC', '10', '10', '이지 6,대신 5', ''],
          ['수출', '글로비스', '글로비스2공장', '고객B', 'HMM', '40HC', '8', '8', '이지 8', ''],
        ],
      },
    ],
    viewType: 'integrated',
    selectedDay: '2026-05-18',
  });

  const daily = diffSummary.periods.find((period) => period.key === 'daily');
  assert.equal(daily.customerTotal, 18);
  assert.equal(daily.dispatcherTotal, 19);
  assert.equal(daily.diff, 1);
  assert.equal(diffSummary.issues[0].title, '글로비스1공장');
  assert.equal(diffSummary.issues[0].reason, '오더와 지역칸 합계 차이');
  assert.equal(diffSummary.issues[0].search, '글로비스1공장');
});

test('아산 현황판 기준차이 패널은 오더가 문자인 행을 원인에서 제외한다', () => {
  const diffSummary = buildAsanDashboardBasisDiffSummary({
    sourceItems: [
      {
        target_date: '2026-05-18',
        headers,
        data: [
          ['수출', '모비스AS', '모비스천안', '고객B', 'ONE', '40HC', '오배차', '0', '보송1', ''],
          ['수출', '모비스AS', '정상작업지', '고객B', 'ONE', '40HC', '2', '2', '보송2', ''],
        ],
      },
    ],
    viewType: 'integrated',
    selectedDay: '2026-05-18',
  });

  const daily = diffSummary.periods.find((period) => period.key === 'daily');
  assert.equal(daily.customerTotal, 2);
  assert.equal(daily.dispatcherTotal, 2);
  assert.equal(diffSummary.issues.length, 0);
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
  assert.equal(weekly.title, '5/18(월)~5/24(일) (05월 4주차)');
  assert.equal(weekly.scope.total, 20);
  assert.equal(monthly.scope.orderTotal, 25);
  assert.equal(monthly.scope.sheetDispatchTotal, 25);
  assert.equal(monthly.scope.mismatchTotal, 0);
  assert.equal(daily.previousScope.total, 13);
});

test('아산 현황판 주별과 월별 카드는 기본값으로 지난주와 지난달을 선택한다', () => {
  const extendedItems = [
    {
      target_date: '2026-04-30',
      headers,
      data: [
        ['수출', '글로비스', '4월작업지', '고객A', 'HMM', '40HC', '30', '30', '이지 30', ''],
      ],
    },
    ...sourceItems,
    {
      target_date: '2026-06-02',
      headers,
      data: [
        ['수출', '글로비스', '6월작업지', '고객D', 'HMM', '40HC', '2', '2', '이지 2', ''],
      ],
    },
  ];

  const dashboard = buildSelectableAsanDashboardPeriods({
    sourceItems: extendedItems,
    viewType: 'integrated',
    viewMode: 'customer',
    selectedDay: '2026-06-02',
  });

  const weekly = dashboard.periods.find((period) => period.key === 'weekly');
  const monthly = dashboard.periods.find((period) => period.key === 'monthly');

  assert.equal(weekly.selectedKey, '2026-05-25_2026-05-31');
  assert.equal(weekly.scope.total, 5);
  assert.equal(monthly.selectedKey, '2026-05');
  assert.equal(monthly.scope.total, 25);
});

test('아산 현황판 일자별 추세는 영업일만 대상으로 전일 대비 증감을 계산한다', () => {
  const timeline = buildAsanDashboardTimeline({
    sourceItems,
    viewType: 'integrated',
    viewMode: 'customer',
    todayKey: '2026-05-19',
  });

  assert.deepEqual(timeline.map((item) => item.date), ['2026-05-18', '2026-05-19']);
  assert.equal(timeline[0].total, 13);
  assert.equal(timeline[0].delta, 0);
  assert.equal(timeline[1].total, 7);
  assert.equal(timeline[1].delta, -6);
});

test('아산 현황판 일자별 추세는 주말과 공휴일을 제외한다', () => {
  const timeline = buildAsanDashboardTimeline({
    sourceItems: [
      {
        target_date: '2026-05-04',
        headers,
        data: [
          ['수출', '글로비스', '평일작업지', '고객A', 'HMM', '40HC', '10', '10', '이지 10', ''],
        ],
      },
      {
        target_date: '2026-05-05',
        headers,
        data: [
          ['수출', '글로비스', '공휴일작업지', '고객A', 'HMM', '40HC', '99', '99', '이지 99', ''],
        ],
      },
      {
        target_date: '2026-05-09',
        headers,
        data: [
          ['수출', '글로비스', '토요일작업지', '고객A', 'HMM', '40HC', '88', '88', '이지 88', ''],
        ],
      },
      {
        target_date: '2026-05-11',
        headers,
        data: [
          ['수출', '글로비스', '평일작업지', '고객A', 'HMM', '40HC', '15', '15', '이지 15', ''],
        ],
      },
    ],
    viewType: 'integrated',
    viewMode: 'customer',
    todayKey: '2026-05-11',
  });

  assert.deepEqual(timeline.map((item) => item.date), ['2026-05-04', '2026-05-11']);
  assert.equal(timeline[1].delta, 5);
});

test('아산 현황판 일자별 추세는 현충일 토요일을 월요일 대체휴일로 보지 않는다', () => {
  const timeline = buildAsanDashboardTimeline({
    sourceItems: [
      {
        target_date: '2026-06-05',
        headers,
        data: [
          ['수출', '글로비스', '평일작업지', '고객A', 'HMM', '40HC', '85', '85', '이지 85', ''],
        ],
      },
      {
        target_date: '2026-06-08',
        headers,
        data: [
          ['수출', '글로비스', '월요일작업지', '고객A', 'HMM', '40HC', '87', '87', '이지 87', ''],
        ],
      },
    ],
    viewType: 'integrated',
    viewMode: 'customer',
    todayKey: '2026-06-08',
  });

  assert.deepEqual(timeline.map((item) => item.date), ['2026-06-05', '2026-06-08']);
  assert.equal(timeline.at(-1).total, 87);
  assert.equal(timeline.at(-1).delta, 2);
});

test('아산 현황판 일자별 추세는 오늘 이후 사전기입 데이터를 제외한다', () => {
  const timeline = buildAsanDashboardTimeline({
    sourceItems,
    viewType: 'integrated',
    viewMode: 'customer',
    todayKey: '2026-05-18',
  });

  assert.deepEqual(timeline.map((item) => item.date), ['2026-05-18']);
  assert.equal(timeline[0].total, 13);
});

test('아산 현황판 요일별 비교는 월간 일평균과 주간 실제 오더를 제공한다', () => {
  const comparison = buildAsanDashboardWeekdayComparison({
    sourceItems,
    viewType: 'integrated',
    weekKey: '2026-05-18_2026-05-24',
    monthKey: '2026-05',
  });

  const mondayMonth = comparison.month.buckets.find((bucket) => bucket.label === '월');
  const tuesdayWeek = comparison.week.buckets.find((bucket) => bucket.label === '화');

  assert.equal(mondayMonth.total, 13);
  assert.equal(mondayMonth.count, 1);
  assert.equal(mondayMonth.average, 13);
  assert.equal(mondayMonth.breakdown['글로비스1공장'], 10);
  assert.equal(tuesdayWeek.total, 7);
  assert.equal(tuesdayWeek.count, 1);
  assert.equal(comparison.week.fullLabel, '5/18(월)~5/24(일) (05월 4주차)');
});

test('아산 현황판 모바일 기간 카드는 한 줄씩 세로 배치한다', () => {
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dashboard.module.css'),
    'utf8',
  );

  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.periodGrid\s*{[\s\S]*grid-template-columns: 1fr;/);
  assert.match(css, /\.periodCard\s*{[\s\S]*min-height: auto;/);
});

test('아산 배차판 모바일 합계바는 데스크탑 flex-basis를 제거한다', () => {
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dispatch.module.css'),
    'utf8',
  );

  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.summaryRight\s*{[\s\S]*flex: 0 0 auto;[\s\S]*width: 100%;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.summaryLeft\s*{[\s\S]*flex: 0 0 auto;[\s\S]*width: 100%;/);
});

test('아산 현황판 요일별 패널은 누적 줄에서 주간과 월간을 선택한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/AsanDashboard.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dashboard.module.css'),
    'utf8',
  );

  assert.match(source, /className=\{`\$\{styles\.weekdayChooser\}/);
  assert.match(source, /aria-label="요일별 작업지 비중 주간 선택"/);
  assert.match(source, /aria-label="요일별 작업지 비중 월 선택"/);
  assert.match(source, /const valueFormatter = mode === 'week' \? formatQty : formatDecimal;/);
  assert.match(source, /주간 실적/);
  assert.match(source, /월간 평균/);
  assert.match(source, /주간 실적 \{formatQty\(weekTotal\)\}/);
  assert.match(source, /월기준 주간평균합 \{formatDecimal\(monthAverageTotal\)\}/);
  assert.match(source, /누적 \{formatQty\(monthTotal\)\}/);
  assert.match(source, /onSelect\?\.\('weekly', event\.target\.value\)/);
  assert.match(source, /onSelect\?\.\('monthly', event\.target\.value\)/);
  assert.match(css, /\.weekdayChooser select\s*{[\s\S]*opacity: 0;/);
  assert.match(css, /\.weekdayChooser small\s*{[\s\S]*color: #94a3b8;/);
});

test('아산 현황판 모바일 날짜 시작점은 기준 전환과 배차판 검색 버튼을 제공한다', () => {
  const dashboardSource = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/AsanDashboard.js'),
    'utf8',
  );
  const pageSource = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dashboard.module.css'),
    'utf8',
  );

  assert.match(dashboardSource, /onOpenDailyGrid = null/);
  assert.match(dashboardSource, /onViewTypeChange = null/);
  assert.match(dashboardSource, /className=\{styles\.mobileScopeActionBar\}/);
  assert.match(dashboardSource, /className=\{styles\.mobileDateActionBar\}/);
  assert.match(dashboardSource, /통합현황/);
  assert.match(dashboardSource, /글로비스 KD 외/);
  assert.match(dashboardSource, /모비스 AS/);
  assert.match(dashboardSource, /onClick=\{\(\) => onViewTypeChange\(type\)\}/);
  assert.match(dashboardSource, /고객사 기준/);
  assert.match(dashboardSource, /실행사 기준/);
  assert.match(dashboardSource, /배차판 검색/);
  assert.match(dashboardSource, /title="고객사\(화주\) 기준"/);
  assert.match(dashboardSource, /title="실행사\(협력업체\) 기준"/);
  assert.match(dashboardSource, /handleViewModeChange\('customer'\)/);
  assert.match(dashboardSource, /handleViewModeChange\('dispatcher'\)/);
  assert.doesNotMatch(dashboardSource, /mobileDateActionPrimary/);
  assert.match(pageSource, /const handleOpenDailyGrid = useCallback/);
  assert.match(pageSource, /const topBarRef = useRef\(null\);/);
  assert.match(pageSource, /onOpenDailyGrid=\{handleOpenDailyGrid\}/);
  assert.match(pageSource, /onViewTypeChange=\{setViewType\}/);
  assert.match(pageSource, /setMainView\('grid'\)/);
  assert.match(pageSource, /function resetScrollChainToTop\(target\)/);
  assert.match(pageSource, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
  assert.match(pageSource, /function scheduleScrollReset\(getTarget\)/);
  assert.match(pageSource, /function scrollDateTabHorizontally\(tabsEl, tabEl\)/);
  assert.match(pageSource, /tabsEl\.scrollTo\(\{ left: targetLeft, behavior: 'smooth' \}\)/);
  assert.match(pageSource, /scrollDateTabHorizontally\(tabsRef\.current, el\)/);
  assert.doesNotMatch(pageSource, /inline: 'center', block: 'nearest'/);
  assert.match(pageSource, /resetScrollChainToTop\(containerRef\.current\)/);
  assert.match(pageSource, /\(topBarRef\.current \|\| containerRef\.current\)\?\.scrollIntoView\(\{ behavior: 'auto', block: 'start' \}\)/);
  assert.match(pageSource, /const pageWrapperRef = useRef\(null\);/);
  assert.match(pageSource, /return scheduleScrollReset\(\(\) => pageWrapperRef\.current\);/);
  assert.match(pageSource, /<div ref=\{pageWrapperRef\} className=\{styles\.pageWrapper\}>/);
  assert.match(css, /\.mobileDateActionBar,[\s\S]*\.mobileScopeActionBar\s*{[\s\S]*display: none;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.mobileDateActionBar,[\s\S]*\.mobileScopeActionBar\s*{[\s\S]*display: grid;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.mobileScopeActionBar\s*{[\s\S]*background: #f8fafc;/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(css, /mobileDateActionPrimary/);
});

test('아산 전체 탭 기간 선택지는 유효 오더 없는 날짜만 제외하고 미래 정상 날짜는 허용한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dispatch.module.css'),
    'utf8',
  );

  assert.match(source, /const todayKey = useMemo\(\(\) => getTodayKey\(\), \[\]\);/);
  assert.match(source, /const validItems = \(data \|\| \[\]\)\.filter\(item => hasValidOrderRows\(item, viewType\)\);/);
  assert.doesNotMatch(source, /validItems = \(data \|\| \[\]\)\.filter\(item => item\.target_date <= todayKey/);
  assert.match(source, /dates: validItems\.map\(item => item\.target_date\)/);
  assert.match(source, /const months = \[\.\.\.new Set\(validItems\.map/);
  assert.match(source, /validItems\.forEach\(\(item\) =>/);
  assert.match(source, /const eligibleItems = data\.filter\(item => hasValidOrderRows\(item, viewType\)\);/);
  assert.match(source, /const shortWeekLabel = weekLabel\.replace/);
  assert.match(source, /shortLabel: shortWeekLabel/);
  assert.match(source, /const periodMode = !isAllTab \? 'daily' : \(allTabWeek \? 'weekly' : \(allTabMonth \? 'monthly' : 'total'\)\);/);
  assert.match(source, /activePeriodMode=\{periodMode\}/);
  assert.match(source, /const dashboardSelectedWeek = isAllTab \? allTabWeek\?\.key \|\| '' : '';/);
  assert.match(source, /selectedWeek=\{dashboardSelectedWeek\}/);
  assert.match(source, /\['daily', '일별'\]/);
  assert.match(source, /\['weekly', '주별'\]/);
  assert.match(source, /\['monthly', '월별'\]/);
  assert.match(source, /\['total', '전체'\]/);
  assert.match(source, /periodOptions\.weeks\.map\(week =>/);
  assert.match(source, /periodOptions\.months\.map\(month =>/);
  assert.match(css, /\.periodPickerBar\s*{[\s\S]*display: flex;/);
  assert.match(css, /\.periodModeGroup\s*{[\s\S]*display: inline-flex;/);
  assert.match(css, /\.periodPickerBar\s*{[\s\S]*justify-content: flex-start;/);
  assert.match(css, /\.periodSelectWrap\s*{[\s\S]*flex: 0 0 240px;/);
  assert.match(css, /\.periodSelect\s*{[\s\S]*max-width: 240px;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.periodModeGroup\s*{[\s\S]*grid-template-columns: repeat\(4, 1fr\);/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.periodSelectWrap\s*{[\s\S]*flex: 0 0 auto;[\s\S]*min-height: 0;/);
});

test('아산 현황판은 첫 화면 viewer cache를 우선 쓰고 없을 때만 전체 원장을 보강 조회한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const dashboardSource = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/AsanDashboard.js'),
    'utf8',
  );
  const apiSource = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/dispatch/dashboard/route.js'),
    'utf8',
  );
  const forecastApiSource = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/dispatch/forecast/route.js'),
    'utf8',
  );
  const sql = fs.readFileSync(
    path.join(webRoot, 'supabase_sql/20260602_asan_dispatch_dashboard_cache.sql'),
    'utf8',
  );
  const viewerSql = fs.readFileSync(
    path.join(webRoot, 'supabase_sql/20260609_asan_dispatch_dashboard_view_cache.sql'),
    'utf8',
  );

  assert.match(dashboardSource, /buildAsanDashboardDataFromCache/);
  assert.match(dashboardSource, /dashboardCache = null/);
  assert.match(dashboardSource, /dashboardViewer = null/);
  assert.match(dashboardSource, /dashboardForecast = null/);
  assert.match(dashboardSource, /dashboardForecastLoading = false/);
  assert.match(dashboardSource, /function getViewerDashboardData/);
  assert.match(dashboardSource, /payloadKind !== 'dashboard-viewer'/);
  assert.match(dashboardSource, /if \(viewerData\) return mergeForecast\(viewerData\);/);
  assert.match(dashboardSource, /financialForecast: dashboardForecast/);
  assert.match(dashboardSource, /activePeriodMode = 'daily'/);
  assert.match(dashboardSource, /selectedWeek = ''/);
  assert.match(dashboardSource, /activePeriod: activePeriodKey/);
  assert.match(dashboardSource, /const activeScope = selectablePeriods\.periods\.find\(\(period\) => period\.key === activePeriodKey\)\?\.scope \|\| fallbackScope;/);
  assert.match(dashboardSource, /cachePayload: dashboardCache/);
  assert.match(source, /const \[dashboardCacheState, setDashboardCacheState\] = useState/);
  assert.match(source, /const \[dashboardForecastState, setDashboardForecastState\] = useState/);
  assert.match(source, /fetchDashboardCache/);
  assert.match(source, /fetchDashboardForecast/);
  assert.match(source, /\/api\/branches\/asan\/dispatch\/dashboard\?\$\{params\.toString\(\)\}/);
  assert.match(source, /\/api\/branches\/asan\/dispatch\/forecast\?\$\{params\.toString\(\)\}/);
  assert.match(source, /scope = 'initial'/);
  assert.match(source, /scope: 'initial'/);
  assert.match(source, /scope: 'full', background: true/);
  assert.match(source, /const nextViewer = r\.ok && j\.ok \? j\.viewer\?\.payload \|\| null : null;/);
  assert.match(source, /background && !nextPayload && !nextViewer/);
  assert.match(source, /const dashboardCachePayload = dashboardCacheState\.viewType === viewType \? dashboardCacheState\.payload : null;/);
  assert.match(source, /const dashboardViewerPayload = dashboardCacheState\.viewType === viewType \? dashboardCacheState\.viewer : null;/);
  assert.match(source, /const dashboardForecastPayload = dashboardForecastState\.key === dashboardForecastKey \? dashboardForecastState\.payload : null;/);
  assert.match(source, /const dashboardNeedsFullData = useMemo\(\(\) => \(/);
  assert.match(source, /mainView === 'dashboard'[\s\S]*dashboardCacheChecked[\s\S]*!dashboardCachePayload[\s\S]*!dashboardViewerPayload[\s\S]*item\?\.meta_only && hasValidOrderRows\(item, viewType\)/);
  assert.match(source, /if \(dashboardNeedsFullData\) \{[\s\S]*ensureDispatchFullLoaded\(\);[\s\S]*return;[\s\S]*\}/);
  assert.match(source, /dashboardCache=\{dashboardCachePayload\}/);
  assert.match(source, /dashboardViewer=\{dashboardViewerPayload\}/);
  assert.match(source, /dashboardForecast=\{dashboardForecastPayload\}/);
  assert.match(apiSource, /DASHBOARD_CACHE_TABLE = 'branch_dispatch_dashboard_cache'/);
  assert.match(apiSource, /DASHBOARD_VIEW_CACHE_TABLE = 'branch_dispatch_dashboard_view_cache'/);
  assert.match(apiSource, /DASHBOARD_CACHE_POLICY_VERSION = 'holiday-policy-20260608'/);
  assert.match(apiSource, /DASHBOARD_VIEWER_POLICY_VERSION = 'viewer-snapshot-20260609'/);
  assert.doesNotMatch(apiSource, /queryAsanAnnualRouteUnitPriceFromSupabase/);
  assert.doesNotMatch(apiSource, /loadLatestRouteUnitPrice/);
  assert.match(apiSource, /financial: payload\.financial/);
  assert.match(apiSource, /\$\{viewType\}\|\$\{DASHBOARD_CACHE_POLICY_VERSION\}\|/);
  assert.match(apiSource, /readDashboardViewerCache/);
  assert.match(apiSource, /prepareDashboardViewerForResponse/);
  assert.match(apiSource, /viewerHit: true/);
  assert.match(apiSource, /writeDashboardViewerCache/);
  assert.match(apiSource, /buildAsanDashboardViewerPayload/);
  assert.match(apiSource, /hasRefreshAccess/);
  assert.match(apiSource, /process\.env\.ASAN_DISPATCH_DASHBOARD_CACHE_TOKEN/);
  assert.match(apiSource, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(apiSource, /allowedTokens\.includes\(bearer\)/);
  assert.match(apiSource, /authorization/);
  assert.match(apiSource, /loadDispatchItemsForSignature/);
  assert.match(apiSource, /loadDispatchItems\(request, viewType, 'meta'\)/);
  assert.match(apiSource, /data\.source_signature !== currentSignature/);
  assert.match(apiSource, /refreshed: true/);
  assert.match(apiSource, /scope = searchParams\.get\('scope'\) === 'initial' \? 'initial' : 'full'/);
  assert.match(apiSource, /weekKeys: compactKeys\(\[currentWeekKey, defaultWeekKey/);
  assert.match(apiSource, /monthKeys: compactKeys\(\[currentMonth\?\.key \|\| '', defaultMonthKey/);
  assert.match(apiSource, /makeInitialDashboardPayload/);
  assert.match(apiSource, /payloadScope: 'initial'/);
  assert.match(apiSource, /prepareDashboardCacheForResponse/);
  assert.match(apiSource, /buildAsanDashboardCachePayload/);
  assert.match(forecastApiSource, /queryAsanAnnualRouteUnitPriceFromSupabase/);
  assert.match(forecastApiSource, /buildAsanDashboardFinancialForecast/);
  assert.match(forecastApiSource, /\/api\/branches\/asan\/dispatch/);
  assert.match(forecastApiSource, /mode: 'full'/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.branch_dispatch_dashboard_cache/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.branch_dispatch_dashboard_cache FROM anon, authenticated;/);
  assert.match(viewerSql, /CREATE TABLE IF NOT EXISTS public\.branch_dispatch_dashboard_view_cache/);
  assert.match(viewerSql, /CONSTRAINT branch_dispatch_dashboard_view_cache_unique UNIQUE \(branch_id, view_type, snapshot_key\)/);
  assert.match(viewerSql, /REVOKE ALL ON TABLE public\.branch_dispatch_dashboard_view_cache FROM anon, authenticated;/);
  assert.match(viewerSql, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.branch_dispatch_dashboard_view_cache TO service_role;/);
});

test('아산 현황판 추세 돋보기는 포인트 위치에 따라 위아래 배치를 바꾼다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/AsanDashboard.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dashboard.module.css'),
    'utf8',
  );

  assert.match(source, /const getLensTransform = \(point\) =>/);
  assert.match(source, /point\.y < 105 \? '14px' : 'calc\(-100% - 16px\)'/);
  assert.match(source, /onPointerDown=\{handlePointerMove\}/);
  assert.match(source, /cursorX: clampLensCoord\(x, padLeft, width - padRight\)/);
  assert.match(source, /cursorY: clampLensCoord\(y, padTop, baselineY\)/);
  assert.match(source, /hoverPoint\.cursorX \?\? hoverPoint\.x/);
  assert.match(source, /transform: getLensTransform\(\{/);
  assert.match(source, /className=\{styles\.trendLensMetric\}/);
  assert.match(source, /className=\{getPointToneClass\(hoverPoint\)\}/);
  assert.match(css, /\.trendSvg\s*{[\s\S]*touch-action: none;/);
  assert.match(css, /\.trendLens b\.trendLensUp\s*{[\s\S]*color: #dc2626;[\s\S]*background: #fee2e2;/);
  assert.match(css, /\.trendLens b\.trendLensDown\s*{[\s\S]*color: #2563eb;[\s\S]*background: #dbeafe;/);
});

test('아산 현황판 도넛 범례는 항목별 점유율을 함께 표시한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/AsanDashboard.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dashboard.module.css'),
    'utf8',
  );

  assert.match(source, /className=\{styles\.piePct\}>\{getPct\(value, total\)\}%/);
  assert.match(source, /<small>\{getPct\(value, total\)\}%<\/small>/);
  assert.match(css, /\.piePct\s*{[\s\S]*color: #94a3b8;[\s\S]*font-variant-numeric: tabular-nums;/);
  assert.match(css, /\.splitMeta b small\s*{[\s\S]*color: #94a3b8;[\s\S]*font-weight: 900;/);
});

test('아산 배차 날짜 탭은 유효 오더 없는 날짜를 비활성화한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dispatch.module.css'),
    'utf8',
  );

  assert.match(source, /import \{ buildAsanDashboardScope, getActualDispatchQty \} from '@\/utils\/asanDashboardView\.mjs';/);
  assert.match(source, /function hasValidOrderRows\(item, viewType\)/);
  assert.match(source, /const summaryOrder = calcSummary\(item\.headers \|\| \[\], item\.data \|\| \[\], viewType\)\?\.order \|\| 0;/);
  assert.match(source, /valid_row_count/);
  assert.match(source, /buildAsanDashboardScope\(\{/);
  assert.match(source, /viewMode: 'customer'/);
  assert.match(source, /function findDefaultValidTabIndex\(items = \[\], viewType, today = getTodayKey\(\)\)/);
  assert.match(source, /function pickDispatchActiveIndex\(items = \[\], viewType, preferredTargetDate = '', today = getTodayKey\(\)\)/);
  assert.match(source, /const \{ silent = false, preserveActiveDate = false \} = options;/);
  assert.match(source, /preferredTargetDate === '__all__'/);
  assert.match(source, /ensureDispatchFullLoaded/);
  assert.match(source, /dispatchFullLoadedRef/);
  assert.match(source, /dispatchDateLoadedKeysRef/);
  assert.match(source, /activeItem\?\.meta_only/);
  assert.match(source, /전체 기간 자료를 불러오는 중입니다\./);
  assert.match(source, /disabled=\{!hasRows\}/);
  assert.match(source, /styles\.dateTabDisabled/);
  assert.match(source, /title=\{!hasRows \? '유효 오더 없음' : undefined\}/);
  assert.match(source, /const visibleDateTabs = useMemo\(\(\) => \{/);
  assert.match(source, /const limit = Math\.min\(QUICK_DATE_TAB_LIMIT, data\.length\);/);
  assert.match(source, /data\.slice\(start, start \+ limit\)\.map\(\(item, offset\) => \(\{ item, idx: start \+ offset \}\)\)/);
  assert.match(source, /onClick=\{\(\) => selectDailyDate\(item\.target_date\)\}/);
  assert.match(source, /data-tab-index=\{idx\}/);
  assert.match(source, /hasValidOrderRows\(data\[activeTab\], viewType\)/);
  assert.match(source, /for \(let i = items\.length - 1; i >= 0; i -= 1\)/);
  assert.match(css, /\.dateTabDisabled,[\s\S]*cursor: not-allowed;/);
  assert.match(css, /\.dateTabsMeta\s*{[\s\S]*white-space: nowrap;/);
});

test('아산 배차 검색/필터 합계는 실제 표시 행 기준으로 맞춘다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dashboard.module.css'),
    'utf8',
  );

  assert.match(source, /function parseOrderQty\(value\)/);
  assert.match(source, /if \(!\/\^-\?\\d\+\(\?:\\\.\\d\+\)\?\$\/\.test\(text\)\) return 0;/);
  assert.match(source, /indices\.push\(row\.origIdx \?\? ri\);/);
  assert.match(source, /const hasActiveFilter = searchResult\.indices !== null/);
  assert.match(source, /displayRows\.map\(\(item\) => item\.row\)/);
  assert.match(source, /필터 오더량/);
  assert.match(css, /\.basisDiffChipActive\s*{[\s\S]*background: #e0f2fe;[\s\S]*border-color: #38bdf8;/);
});

test('GLAPS 운송경로 후보는 광양 하차지를 KRKAN 코드로 확장한다', () => {
  const keys = buildGlapsDispatchRouteFingerprints({
    shipperCode: 'KR10',
    startLocationName: '광양항',
    waypointElsName: '글로비스KD센터3포장',
    destinationName: '광양',
  });

  assert.ok(keys.includes('KR10|KRKAN|글로비스KD센터3포장|KRKAN'));
});

test('아산 배차판은 GLAPS 검수용 상세배차내역 탭을 제공한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dispatch.module.css'),
    'utf8',
  );
  const util = fs.readFileSync(
    path.join(webRoot, 'utils/asanDispatchDetailLines.mjs'),
    'utf8',
  );
  const changeUtil = fs.readFileSync(
    path.join(webRoot, 'utils/asanDispatchChangeEvents.mjs'),
    'utf8',
  );
  const confirmationApi = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/dispatch/confirmation/route.js'),
    'utf8',
  );
  const changeApi = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/dispatch/change-events/route.js'),
    'utf8',
  );
  const detailOverrideApi = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/dispatch/detail-override/route.js'),
    'utf8',
  );
  const webCellApi = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/dispatch/web-cell/route.js'),
    'utf8',
  );
  const actorNameApi = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/dispatch/actorName.js'),
    'utf8',
  );
  const confirmationSql = fs.readFileSync(
    path.join(webRoot, 'supabase_sql/20260524_asan_dispatch_confirmations.sql'),
    'utf8',
  );
  const changeSql = fs.readFileSync(
    path.join(webRoot, 'supabase_sql/20260524_asan_dispatch_change_events.sql'),
    'utf8',
  );
  const glapsMasterSource = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/AsanGlapsMaster.js'),
    'utf8',
  );

  assert.match(source, /buildDispatchDetailLines/);
  assert.match(source, /DISPATCH_DETAIL_HEADERS\.map/);
  assert.match(source, /GLAPS_START_LOCATION_OPTIONS\.filter\(Boolean\)\.map/);
  assert.match(source, /detailStartOverrides/);
  assert.match(source, /detailBillingStartOverrides/);
  assert.match(source, /detailBkgOverrides/);
  assert.match(source, /BKG_CONFIRM_SOURCE_OPTIONS/);
  assert.match(source, /syncStatusPrefix/);
  assert.match(source, /확인 중\|저장 중/);
  assert.match(source, /BKG_WEB_CELL_LOCK_FIELDS/);
  assert.match(source, /dispatchConfirmationMap/);
  assert.match(source, /getWebCellLockMessage/);
  assert.match(source, /previousValue/);
  assert.match(source, /buildDispatchChangeDiffTooltip/);
  assert.match(source, /빈 BKG2\/3 칸만 추가 입력/);
  assert.match(source, /createBrowserSupabaseClient/);
  assert.match(source, /getDetailAuthHeaders/);
  assert.match(source, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(source, /!confirmationResponse\.ok/);
  assert.match(source, /!overrideResponse\.ok/);
  assert.match(source, /changeDetailConfirmation/);
  assert.match(source, /saveDetailStartOverride/);
  assert.match(source, /saveDetailBkgOverride/);
  assert.match(source, /saveDetailBkgManualInput/);
  assert.match(source, /saveDetailFlagOverride/);
  assert.match(source, /DETAIL_DG_OVERRIDE_FIELD_KEY = 'dg'/);
  assert.match(source, /DETAIL_RF_OVERRIDE_FIELD_KEY = 'rf'/);
  assert.match(source, /DETAIL_LEGACY_DG_RF_OVERRIDE_FIELD_KEY = 'dg_rf'/);
  assert.match(source, /detailBkgSourceBadge/);
  assert.match(source, /detailBkgPickButton/);
  assert.match(source, /detailBkgSelectedCell/);
  assert.doesNotMatch(source, /<select[\s\S]*BKG_CONFIRM_SOURCE_OPTIONS\.map/);
  assert.match(source, /const specialShipperCode = resolveGlapsSpecialShipperCode\(glapsSpecialConsigneeRules/);
  assert.match(source, /const lineShipperCode = specialShipperCode \|\| getGlapsAliasCode\(glapsShipperCodeMap, line\.shipper\)/);
  assert.match(source, /shipperCode: lineShipperCode/);
  assert.match(source, /routeShipperCode \|\| lineShipperCode/);
  assert.match(source, /getGlapsRouteShipperCode/);
  assert.doesNotMatch(source, /detailCarrierOverrides/);
  assert.match(source, /detailIssueFilter/);
  assert.match(source, /searchedDetailLines/);
  assert.match(source, /glapsDetailLookup/);
  assert.match(source, /buildGlapsRouteFingerprint/);
  assert.match(source, /buildGlapsAliasCodeMap/);
  assert.match(source, /buildGlapsAliasCodeMapForTypes/);
  assert.match(source, /buildGlapsDispatchRouteFingerprintsWithAliasMaps/);
  assert.match(source, /getGlapsRouteLocationPrimaryCode/);
  assert.match(source, /function resolveGlapsRouteLocationCode/);
  assert.match(source, /buildGlapsAliasCodeOptionsMap/);
  assert.match(source, /isGlapsDefaultAlias/);
  assert.match(source, /splitGlapsAliasValues/);
  assert.match(source, /\[alias\.source_name, alias\.els_name, alias\.glaps_name, alias\.glaps_code\]/);
  assert.match(source, /carrier: buildGlapsAliasCodeMap\(glapsDetailLookup\.aliases \|\| \[\], 'carrier'\)/);
  assert.match(source, /portOptions: buildGlapsAliasCodeOptionsMap\(glapsDetailLookup\.aliases \|\| \[\], 'port'\)/);
  assert.match(source, /routeLocation: buildGlapsAliasCodeMapForTypes\(glapsDetailLookup\.aliases \|\| \[\], \['start', 'destination', 'port'\]\)/);
  assert.match(source, /waypoint: buildGlapsAliasCodeMapForTypes\(glapsDetailLookup\.aliases \|\| \[\], \['waypoint'\]\)/);
  assert.match(source, /consignee: buildGlapsAliasCodeMap\(glapsDetailLookup\.aliases \|\| \[\], 'consignee'\)/);
  assert.match(source, /resolveGlapsSpecialConsigneeCode/);
  assert.match(source, /glapsDetailLookup\.specialRules/);
  assert.match(source, /resolveGlapsSpecialShipperCode/);
  assert.match(source, /shipperName = ''/);
  assert.match(source, /\[waypointName, waypointElsName, shipperName\]/);
  assert.match(source, /waypoint_els_name \|\| rule\.waypointElsName/);
  assert.match(source, /shipperName: line\.shipper/);
  assert.match(source, /waypointElsName: line\.workplace \|\| glapsRoute\?\.waypoint_els_name \|\| ''/);
  assert.match(source, /code === 'KR10'/);
  assert.match(source, /code === 'B000034432'/);
  assert.match(source, /const glapsSpecialConsigneeCode = resolveGlapsSpecialConsigneeCode\(glapsSpecialConsigneeRules/);
  assert.match(source, /const glapsConsigneeCode = glapsSpecialConsigneeCode \|\| getGlapsAliasCode\(glapsAliasMaps\.consignee, line\.customer\)/);
  assert.match(source, /orderType: buildGlapsSheetCodeMap\(glapsDetailLookup\.sheetRows \|\| \[\], '수출입코드', '수출입구분', '코드'\)/);
  assert.match(source, /GLAPS_TRANSPORT_SERVICE_FALLBACKS/);
  assert.match(source, /buildGlapsTransportServiceCodeMap\(glapsDetailLookup\.sheetRows \|\| \[\]\)/);
  assert.match(source, /inferGlapsTransportServiceCode\(glapsAliasMaps\.transportService, line\.direction\)/);
  assert.match(source, /5010001/);
  assert.match(source, /5020001/);
  assert.match(source, /6032001/);
  assert.match(source, /buildGlapsShipperCodeMap/);
  assert.match(source, /getGlapsRoutePayload/);
  assert.match(source, /getGlapsRouteWaypointCode/);
  assert.doesNotMatch(source, /const glapsWorkplaceCode = getGlapsRoutePayload\(glapsRoute, \['경유지코드', '작업지\(하차지\)코드', '경유지\(ELS\)', '경유지'\]\)/);
  assert.match(source, /glapsRoute\?\.waypoint_els_name/);
  assert.match(source, /focusDetailGridInput/);
  assert.match(source, /const carrierCode = getGlapsAliasCode\(glapsAliasMaps\.carrier, 'ELS'\)/);
  assert.match(source, /getGlapsAliasDefaultCode\(glapsAliasMaps\.portOptions, line\.port, portCodeOverride\)/);
  assert.match(source, /glapsPortCodeOptions,/);
  assert.match(source, /fieldKey: DETAIL_START_OVERRIDE_FIELD_KEY/);
  assert.match(source, /fieldKey: DETAIL_BILLING_START_OVERRIDE_FIELD_KEY/);
  assert.match(source, /function buildDetailBillingStartOptions/);
  assert.match(source, /const billingStartOptions = buildDetailBillingStartOptions\(billingStartValue, glapsBillingStartLocationOptions\)/);
  assert.match(source, /saveDetailBillingStartOverride\(line, event\.target\.value\)/);
  assert.match(source, /fieldKey: DETAIL_PORT_OVERRIDE_FIELD_KEY/);
  assert.match(source, /fieldKey,/);
  assert.match(source, /header === '포트코드' && \(line\.glapsPortCodeOptions \|\| \[\]\)\.length > 1/);
  assert.match(source, /header === DISPATCH_DETAIL_DG_HEADER \|\| header === DISPATCH_DETAIL_RF_HEADER/);
  assert.match(source, /normalizeDispatchRfValue\(line\.rfFlag \?\? line\.dgRfFlag, line\.containerType\)/);
  assert.match(source, /normalizeDispatchDgValue\(line\.dgFlag\)/);
  assert.match(source, /formatGlapsPortOptionLabel/);
  assert.match(source, /return code \? `\$\{code\}\$\{defaultMark\}` : option\.label \|\| '';/);
  assert.match(source, /function detailColumnClass\(header\)/);
  assert.match(source, /styles\.detailStartColumn/);
  assert.match(source, /styles\.detailStartInput/);
  assert.match(source, /styles\.detailPortCandidateCell/);
  assert.doesNotMatch(source, /glapsPortCode: glapsPortCode \|\| line\.port/);
  assert.doesNotMatch(source, /glapsStartLocationCode[\s\S]*\|\| billingStartLocation/);
  assert.match(source, /DETAIL_ISSUE_GROUPS\.map/);
  assert.match(source, /group: 'missing'/);
  assert.match(source, /detailIssueGroupLabel/);
  assert.doesNotMatch(source, /DETAIL_CARRIER_CODE_DATALIST_ID/);
  assert.match(source, /mainView === 'detail'/);
  assert.match(source, /mainView === 'detail-change'/);
  assert.match(source, /DISPATCH_CHANGE_DETAIL_HEADERS/);
  assert.match(source, /DISPATCH_CHANGE_HEADERS/);
  assert.match(source, /detailChangeRows/);
  assert.match(source, /detailChangeEvents/);
  assert.match(source, /detailStateRefreshToken/);
  assert.match(source, /detailStateLoading/);
  assert.match(source, /glapsLookupLoading/);
  assert.match(source, /setDetailStateRefreshToken\(token => token \+ 1\)/);
  assert.match(source, /if \(loading \|\| refreshing \|\| detailStateLoading \|\| glapsLookupLoading\) return undefined/);
  assert.match(source, /const timer = setTimeout\(syncChanges, 500\)/);
  assert.match(source, /confirmDetailChangeEvents/);
  assert.match(source, /일괄확인/);
  assert.match(source, /확인완료/);
  assert.match(source, /최종수량/);
  assert.match(source, /makeDispatchChangeSnapshotLine/);
  assert.match(source, /confirmationActorName/);
  assert.match(source, /상세배차내역/);
  assert.match(source, /배차변동내역/);
  assert.match(source, /mobileHiddenFuncBtn/);
  assert.match(source, /배차확정/);
  assert.match(source, /배차확정취소/);
  assert.match(source, /상세배차수량/);
  assert.match(source, /label: '상차지'/);
  assert.match(source, /label: '운송사코드'/);
  assert.match(source, /label: '컨샤이니'/);
  assert.match(source, /label: '수정'/);
  assert.match(source, /downloadCurrentScreenWorkbook/);
  assert.match(source, /\/api\/branches\/asan\/export\/view/);
  assert.match(source, /detailDisplayRowToExportRow/);
  assert.match(source, /setDetailRowValue\(row, '수정일시', changeUpdatedAt\)/);
  assert.match(source, /detailChangeDisplayValues/);
  assert.match(source, /buildGlapsUploadRowsFromDetailRows/);
  assert.match(source, /GLAPS_UPLOAD_HEADERS/);
  assert.match(source, /GLAPS_UPLOAD_SHEET_NAME/);
  assert.match(source, /extraSheets: \[\{/);
  assert.match(source, /timeFormat: 'compact'/);
  assert.match(source, /textHeaders: \['배차요청일자'\]/);
  assert.match(source, /mainView === 'detail' \? DISPATCH_DETAIL_HEADERS : DISPATCH_CHANGE_HEADERS/);
  assert.match(source, /detailRowsForDisplay\.map\(detailDisplayRowToExportRow\)/);
  assert.match(source, /detailChangeRows\.map\(\(\{ values \}\) => values\)/);
  assert.match(source, /skipDeleted: mainView === 'detail-change'/);
  assert.match(source, /detailLineFromChangeValues/);
  assert.match(source, /buildDetailChangeDisplayValues/);
  assert.match(source, /updateDetailChangeDraft/);
  assert.match(source, /saveDetailChangeValues/);
  assert.doesNotMatch(source, /현재값저장/);
  assert.match(source, /setDetailRowValue\(draft, '상차지'/);
  assert.match(source, /const nextValues = setDetailRowValue\(rawValues, DISPATCH_DETAIL_BILLING_START_HEADER, inputEvent\.target\.value\)/);
  assert.match(source, /setDetailRowValue\(draft, 'BKG확정'/);
  assert.match(source, /setDetailRowValue\(rawValues, header, inputEvent\.target\.value\)/);
  assert.match(source, /BKG_CONFIRM_SOURCE_OPTIONS\.includes\(header\)/);
  assert.match(source, /detailPostConfirmOverrideCell/);
  assert.match(source, /배차확정 후 상차지 변경/);
  assert.match(source, /배차확정 후 포트코드 변경/);
  assert.match(source, /배차확정 후 \$\{header\} 변경/);
  assert.match(source, /canEditDetailStartLocation/);
  assert.match(source, /function getDisplayChangedHeaderSet\(event = \{\}\)/);
  assert.doesNotMatch(source, /change_type === 'add'[\s\S]*DISPATCH_DETAIL_HEADERS\.filter/);
  assert.match(source, /const editDisabled = detailChangeSaving;/);
  assert.match(source, /disabled=\{detailOverrideSetupRequired \|\| !detailScope\}/);
  assert.match(source, /const isDisabledBkg = detailConfirmationLocked \|\| detailOverrideSetupRequired \|\| !detailScope \|\| !bkgValue;/);
  assert.doesNotMatch(source, /DETAIL_CHANGE_EDITABLE_HEADERS/);
  assert.match(source, /detailChangedRow/);
  assert.match(source, /detailChangeDeleteRow/);
  assert.match(source, /isConfirmedEvent \? styles\.detailChangeConfirmedRow : ''/);
  assert.match(source, /const DAILY_DISPLAY_LIMIT = Number\.MAX_SAFE_INTEGER;/);
  assert.match(source, /const effectiveDisplayLimit = periodMode === 'daily' \? DAILY_DISPLAY_LIMIT : displayLimit;/);
  assert.match(source, /displayRows\.slice\(0, effectiveDisplayLimit\)/);
  assert.match(source, /detailRowsForDisplay\.slice\(0, effectiveDisplayLimit\)/);
  assert.match(source, /detailChangeRows\.slice\(0, effectiveDisplayLimit\)/);
  assert.match(source, /detailHeaderFilters/);
  assert.match(source, /detailHeaderSorts/);
  assert.match(source, /DEFAULT_DETAIL_HEADER_SORTS/);
  assert.match(source, /compareDispatchDetailRowsBySort/);
  assert.match(source, /compareDispatchChangeRowsBySort/);
  assert.match(source, /toggleDetailHeaderFilterValue/);
  assert.match(source, /toggleDetailHeaderFilterAll/);
  assert.match(source, /applyDetailHeaderSort/);
  assert.match(source, /clearDetailHeaderSort/);
  assert.match(source, /정렬초기화/);
  assert.match(source, /내림차순/);
  assert.match(source, /오름차순/);
  assert.match(source, /전체취소/);
  assert.match(source, /전체선택/);
  assert.match(source, /data-detail-header-filter-root="true"/);
  assert.match(source, /detailRowMatchesHeaderFilters\(detailLineToRow\(line\), DISPATCH_DETAIL_HEADERS, activeFilters\)/);
  assert.match(source, /detailRowMatchesHeaderFilters\(values, DISPATCH_CHANGE_HEADERS, activeFilters\)/);
  assert.match(source, /compareDispatchDetailRowsBySort\(a, b, DISPATCH_DETAIL_HEADERS, activeSort\)/);
  assert.match(source, /setDetailRowValue\(editableValues, '수정일시', eventChangedAt\)/);
  assert.match(source, /detailChangeRowsBase\.length > 0/);
  assert.match(source, /변경건/);
  assert.match(source, /onMasterChanged=\{handleGlapsMasterChanged\}/);
  assert.match(detailOverrideApi, /'dg'/);
  assert.match(detailOverrideApi, /'rf'/);
  assert.match(detailOverrideApi, /'dg_rf'/);
  assert.match(detailOverrideApi, /'billing_start_location'/);
  assert.match(util, /DISPATCH_DETAIL_BILLING_START_HEADER = '상차지\(청구\)'/);
  assert.match(util, /DISPATCH_DETAIL_DG_HEADER = 'DG'/);
  assert.match(util, /DISPATCH_DETAIL_RF_HEADER = 'RF'/);
  assert.match(util, /inferDispatchDgFlag/);
  assert.match(util, /inferDispatchRfFlag/);
  assert.match(changeUtil, /rfFlag: \(line\.rfFlag \?\? line\.dgRfFlag\) \|\| ''/);
  assert.match(css, /\.detailDgRfCell/);
  assert.match(glapsMasterSource, /onMasterChanged = null/);
  assert.match(glapsMasterSource, /onMasterChanged\?\.\(\)/);
  assert.match(source, /변동 없음/);
  assert.match(source, /확정 이후 추가\/삭제\/변경 이벤트가 감지되면 최신 변동순으로 표시합니다/);
  assert.match(source, /visibleCols\.map\(ci => headers\[ci\]\)/);
  assert.match(source, /displayRows\.map\(\(\{ row \}\) => visibleCols\.map/);
  assert.doesNotMatch(source, /GLAPS코드 기존 코드 도출 검수용 상세 라인/);
  assert.match(util, /'BKG확정'/);
  assert.match(util, /'오더구분코드'/);
  assert.match(util, /'화주사코드'/);
  assert.match(util, /'반출지\(출발\)코드'/);
  assert.match(util, /'작업지\(하차지\)코드'/);
  assert.match(util, /'반입지\(도착\)코드'/);
  assert.match(util, /'운송서비스코드'/);
  assert.match(util, /'운송사코드'/);
  assert.match(util, /'컨샤이니'/);
  assert.match(util, /'수정일시'/);
  assert.match(util, /modifiedCount/);
  assert.match(util, /'운송경로'/);
  assert.match(util, /'운송경로코드'/);
  assert.match(util, /'포트코드'/);
  assert.match(util, /'라인코드'/);
  assert.match(util, /'타입코드'/);
  assert.match(util, /carrierMissingCount/);
  assert.match(util, /consigneeMissingCount/);
  assert.match(util, /routePartMissingCount/);
  assert.match(changeUtil, /DERIVED_GLAPS_HEADERS/);
  assert.match(changeUtil, /TRANSPORT_CHANGE_HEADERS/);
  assert.match(changeUtil, /MEMO_ONLY_HEADERS/);
  assert.match(changeUtil, /AUTO_REFRESH_MEMO_HEADERS/);
  assert.match(changeUtil, /DISPATCH_CHANGE_SCHEMA_VERSION/);
  assert.match(changeUtil, /mergeDispatchMemoOnlyPayload/);
  assert.match(changeUtil, /makeDispatchMemoSignature/);
  assert.match(changeUtil, /filterMemoOnlyDispatchChangeEvents/);
  assert.match(changeUtil, /filterNeutralizedDispatchChangeEvents/);
  assert.match(changeUtil, /makeDispatchNeutralPairKey/);
  assert.match(changeUtil, /diffDispatchMemoOnlyChanges/);
  assert.match(changeUtil, /getDispatchChangeDiffHeaders/);
  assert.match(changeUtil, /const rowFingerprint = makeRowFingerprint\(headerMap, rowContext\)/);
  assert.match(css, /\.detailTable th\s*{[\s\S]*background: #1f5673;/);
  assert.match(css, /\.detailBkgConfirmControl/);
  assert.match(css, /\.detailBkgSourceBadge/);
  assert.match(css, /\.detailBkgSourceStale/);
  assert.match(css, /\.detailMemoDiffCell/);
  assert.match(css, /\.detailBkgMemoDiffCell/);
  assert.match(css, /\.detailBkgPickButtonActive/);
  assert.match(css, /\.detailBkgSelectedCell/);
  assert.match(css, /\.mobileHiddenFuncBtn\s*{[\s\S]*display: none;/);
  assert.match(css, /\.detailConfirmButton/);
  assert.match(css, /\.detailChangePanel/);
  assert.match(css, /\.detailChangeTypeCell/);
  assert.match(css, /\.detailChangeDiffCell/);
  assert.match(css, /\.detailChangeDiffCell\s*{[\s\S]*background: #fef3c7 !important;[\s\S]*box-shadow: none;/);
  assert.match(css, /\.detailPortCandidateCell\s*{[\s\S]*background: #fef3c7;[\s\S]*box-shadow: none;/);
  assert.match(css, /\.detailDgRfCell \.detailPortSelect\s*{[\s\S]*font-weight: 400 !important;/);
  assert.match(css, /\.detailSummaryBar/);
  assert.match(css, /\.detailSummaryTop/);
  assert.match(css, /\.detailChangeConfirmedRow \.detailChangeDiffCell/);
  assert.match(css, /\.detailChangeDeleteRow td\s*{[\s\S]*background: #e5e7eb !important;/);
  assert.match(css, /\.detailLockedRow td\s*{[\s\S]*background: #f1f5f9 !important;/);
  assert.match(css, /\.detailChangeConfirmedRow td\s*{[\s\S]*background: #f1f5f9 !important;/);
  assert.match(css, /\.detailLockedRow input:disabled,[\s\S]*\.detailChangeConfirmedRow button:disabled\s*{[\s\S]*background: #e2e8f0;/);
  assert.match(css, /\.detailChangeTypeWrap/);
  assert.match(css, /\.detailChangeUnconfirmButton/);
  assert.match(css, /\.webCellLockedTd/);
  assert.match(css, /\.detailChangeInput/);
  assert.match(css, /\.detailComboInput\s*{[\s\S]*border: 1px solid transparent;/);
  assert.match(css, /\.detailTable thead th\s*{[\s\S]*position: sticky;[\s\S]*top: 0;/);
  assert.match(css, /\.detailFilterDropdown\s*{[\s\S]*max-height: 300px;/);
  assert.match(css, /\.detailHeaderSortControls/);
  assert.match(css, /\.detailSortControlActive/);
  assert.doesNotMatch(css, /\.detailSortActions/);
  assert.match(css, /\.detailFilterOption\s*{[\s\S]*grid-template-columns: 16px minmax\(92px, 1fr\) auto;/);
  assert.match(css, /\.detailStartColumn,\s*\n\.detailStartCell\s*{[\s\S]*width: 92px;[\s\S]*max-width: 92px;/);
  assert.match(css, /\.detailStartInput\s*{[\s\S]*text-overflow: ellipsis;/);
  assert.match(css, /\.detailPortCandidateCell\s*{[\s\S]*background: #fef3c7;/);
  assert.match(css, /\.detailBkgConfirmInput\s*{[\s\S]*border: 1px solid transparent;/);
  assert.match(css, /\.webCellEditableTd\s*{[\s\S]*padding: 0 !important;/);
  assert.match(css, /\.detailChangeInlinePanel/);
  assert.match(css, /\.detailIssueGroup\s*{/);
  assert.match(css, /\.detailIssueGroupLabel\s*{/);
  assert.match(css, /\.detailIssueButtonActive\s*{[\s\S]*background: #fff7ed;/);
  assert.match(css, /\.detailManualRow\s*{[\s\S]*background: #fff7ed !important;/);
  assert.match(util, /인천항국제여객터미널/);
  assert.match(util, /if \(normalizedRegion === '부곡'\) return '의왕ICD';/);
  assert.match(confirmationApi, /branch_dispatch_confirmations/);
  assert.match(confirmationApi, /branch_dispatch_confirmation_history/);
  assert.match(confirmationApi, /branch_dispatch_detail_snapshots/);
  assert.match(confirmationApi, /ensureConfirmationSnapshot/);
  assert.match(confirmationApi, /snapshot_lines/);
  assert.match(confirmationApi, /getCurrentUserActorName/);
  assert.match(confirmationApi, /decorateConfirmation/);
  assert.match(confirmationApi, /bearerToken/);
  assert.match(confirmationApi, /getUser\(bearerToken\)/);
  assert.match(detailOverrideApi, /branch_dispatch_detail_overrides/);
  assert.match(detailOverrideApi, /decorateActorFields\(access\.adminSupabase, row, \['created_by', 'updated_by'\]\)/);
  assert.match(detailOverrideApi, /confirmed_bkg/);
  assert.match(detailOverrideApi, /start_location/);
  assert.match(detailOverrideApi, /glaps_port_code/);
  assert.match(detailOverrideApi, /bearerToken/);
  assert.match(detailOverrideApi, /getUser\(bearerToken\)/);
  assert.match(webCellApi, /branch_dispatch_confirmations/);
  assert.match(webCellApi, /hasActiveDispatchConfirmation/);
  assert.match(webCellApi, /previousValue/);
  assert.match(webCellApi, /BKG_LOCK_FIELDS/);
  assert.match(webCellApi, /isCompatibleWebCellRowContext/);
  assert.match(webCellApi, /allowMissing: false/);
  assert.match(webCellApi, /배차확정 이후 기존 BKG 값은 수정할 수 없습니다/);
  assert.match(changeApi, /branch_dispatch_detail_change_events/);
  assert.match(changeApi, /branch_dispatch_detail_change_history/);
  assert.match(changeApi, /diffDispatchChangeLines/);
  assert.match(changeApi, /confirm_all/);
  assert.match(changeApi, /bulk_confirmed/);
  assert.match(changeApi, /unconfirmEvents/);
  assert.match(changeApi, /action === 'unconfirm'/);
  assert.match(changeApi, /insertMemoOnlyHistory/);
  assert.match(changeApi, /memo_changed/);
  assert.match(changeApi, /diffDispatchMemoOnlyChanges/);
  assert.match(changeApi, /mergeDispatchMemoOnlyPayload/);
  assert.match(changeApi, /filterMemoOnlyDispatchChangeEvents/);
  assert.match(changeApi, /filterNeutralizedDispatchChangeEvents/);
  assert.match(changeApi, /existing\.event_status === 'confirmed'/);
  assert.match(changeApi, /hasSupportedCurrentLineSchema/);
  assert.match(changeApi, /currentLineSchemaVersion/);
  assert.match(changeApi, /확인완료된 변동은 확인취소 후 수정할 수 있습니다/);
  assert.match(changeApi, /eventMatchesRequestedScope/);
  assert.match(changeApi, /query\.in\('dispatch_type', \[payload\.dispatchType, 'integrated'\]\)/);
  assert.match(changeApi, /\.filter\(row => eventMatchesRequestedScope\(row, payload\)\)/);
  assert.match(source, /confirmDetailChangeEvents\(\s*\(detailChangeEvents \|\| \[\]\)/);
  assert.match(source, /unconfirmDetailChangeEvents/);
  assert.match(source, /확인취소/);
  assert.match(source, /getDispatchChangedHeaderSet/);
  assert.match(source, /getDetailMemoDiffSet/);
  assert.match(source, /isDetailBkgConfirmStale/);
  assert.match(source, /makeDispatchMemoSignature\(line\.rowValues\)/);
  assert.doesNotMatch(source, /추가취소쌍/);
  assert.match(source, /confirmedBaseTotal: Math\.max\(0, detailSummary\.total - quantityDelta\)/);
  assert.match(source, /finalTotal: detailSummary\.total/);
  assert.match(changeUtil, /diffDispatchChangeLines/);
  assert.match(changeUtil, /DISPATCH_CHANGE_HEADERS/);
  assert.match(actorNameApi, /profiles/);
  assert.match(actorNameApi, /user_roles/);
  assert.match(actorNameApi, /allowFallback: false/);
  assert.match(actorNameApi, /fallbackActorName/);
  assert.match(confirmationSql, /CREATE TABLE IF NOT EXISTS public\.branch_dispatch_confirmations/);
  assert.match(confirmationSql, /CREATE TABLE IF NOT EXISTS public\.branch_dispatch_detail_overrides/);
  assert.match(changeSql, /CREATE TABLE IF NOT EXISTS public\.branch_dispatch_detail_snapshots/);
  assert.match(changeSql, /CREATE TABLE IF NOT EXISTS public\.branch_dispatch_detail_change_events/);
  assert.match(changeSql, /CREATE TABLE IF NOT EXISTS public\.branch_dispatch_detail_change_history/);
  assert.match(changeSql, /event_order BIGINT GENERATED BY DEFAULT AS IDENTITY/);
});

test('배차변동은 부킹 단독 변경을 추가삭제 이벤트가 아니라 셀 강조용 메모 변경으로만 본다', () => {
  const baseLine = {
    lineNo: 1,
    workDate: '2026-06-01',
    direction: '수출',
    shipper: '글로비스',
    startLocation: '부산신항',
    workplace: 'KCC글라스',
    destination: '부산신항',
    customer: 'KAGA',
    port: 'USSAV',
    line: 'ONE',
    containerType: '40HC',
    company: '자차',
    dispatchTime: '13:00',
    bkg1: 'OLD-BKG',
    sourceRowIndex: 1,
    sourceRegion: '부산',
    rawCompany: '자차',
    sourceUnitIndex: 1,
  };
  const before = [makeDispatchChangeSnapshotLine(baseLine, 'line-1')];
  const after = [makeDispatchChangeSnapshotLine({ ...baseLine, bkg1: 'NEW-BKG' }, 'line-1')];

  assert.deepEqual(diffDispatchChangeLines(before, after), []);
  const memoChanges = diffDispatchMemoOnlyChanges(before, after);
  assert.equal(memoChanges.length, 1);
  assert.deepEqual(memoChanges[0].diffHeaders, ['BKG1']);

  const beforeValues = detailLineToRow(baseLine);
  const afterValues = detailLineToRow({ ...baseLine, bkg1: 'NEW-BKG' });
  const pseudoEvents = [
    { eventKey: 'delete-bkg', changeType: 'delete', editablePayload: { rowValues: beforeValues } },
    { eventKey: 'add-bkg', changeType: 'add', editablePayload: { rowValues: afterValues } },
  ];
  assert.deepEqual(filterMemoOnlyDispatchChangeEvents(pseudoEvents), []);
});

test('아산지점은 GLAPS 마스터 원장 화면과 DB 적용 SQL을 제공한다', () => {
  const pageSource = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const masterSource = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/AsanGlapsMaster.js'),
    'utf8',
  );
  const masterCss = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/glapsMaster.module.css'),
    'utf8',
  );
  const dispatchCss = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dispatch.module.css'),
    'utf8',
  );
  const apiSource = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/glaps/master/route.js'),
    'utf8',
  );
  const templateSource = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/glaps/master/template/route.js'),
    'utf8',
  );
  const sql = fs.readFileSync(
    path.join(webRoot, 'supabase_sql/20260523_asan_glaps_master_codes.sql'),
    'utf8',
  );
  const specialRuleSql = fs.readFileSync(
    path.join(webRoot, 'supabase_sql/20260601_glaps_special_start_location_rules.sql'),
    'utf8',
  );
  const duplicateSql = fs.readFileSync(
    path.join(webRoot, 'supabase_sql/20260527_glaps_alias_duplicate_candidates.sql'),
    'utf8',
  );
  const util = fs.readFileSync(
    path.join(webRoot, 'utils/glapsMasterData.mjs'),
    'utf8',
  );
  const duplicateUtil = fs.readFileSync(
    path.join(webRoot, 'utils/glapsDuplicateGroups.mjs'),
    'utf8',
  );

  assert.match(pageSource, /loadAsanGlapsMaster/);
  assert.match(pageSource, /GLAPS코드/);
  assert.match(pageSource, /const MAIN_TABS = \['dispatch', 'transport-history', 'shipping', 'performance'\];/);
  assert.doesNotMatch(pageSource, /activeMainTab === 'glaps-master'/);
  assert.match(pageSource, /mainView === 'glaps-master'/);
  assert.match(pageSource, /AsanGlapsMaster refreshToken=\{glapsMasterRefreshToken\}/);
  assert.match(pageSource, /buildGlapsDispatchRouteFingerprints/);
  assert.match(pageSource, /buildGlapsContainerIsoCodeMap/);
  assert.match(pageSource, /splitGlapsAliasValues/);
  assert.match(pageSource, /glaps\/master\?mode=lookup/);
  assert.match(pageSource, /glapsLookupLoadedTokenRef/);
  assert.match(pageSource, /glapsLookupLoadedTokenRef\.current === lookupToken/);
  assert.match(masterSource, /refreshToken = 0/);
  assert.match(masterSource, /\[fetchData, refreshToken\]/);
  assert.match(masterSource, /DEFAULT_GLAPS_MASTER_PATH/);
  assert.match(masterSource, /legacyMasterPanelOpen/);
  assert.match(masterSource, /masterNasPath/);
  assert.match(masterSource, /formData\.set\('path', path\)/);
  assert.match(masterSource, /마스터 반영\(레거시\)/);
  assert.match(masterSource, /NAS 마스터 반영/);
  assert.match(masterSource, /NAS 파일 위치/);
  assert.match(masterSource, /마스터 업로드/);
  assert.match(masterSource, /수정양식 내보내기/);
  assert.match(masterSource, /수정양식 업로드/);
  assert.match(masterSource, /postWorkbook\(\{ mode: 'all', file \}\)/);
  assert.match(masterSource, /uploadProtectionText/);
  assert.match(masterSource, /WEB수정 보호/);
  assert.match(masterSource, /WEB수정 \S*건 보존/);
  assert.match(masterSource, /원장 중복행/);
  assert.match(masterSource, /ELS 매치코드/);
  assert.match(masterSource, /ELS 디스크립션\(설명\)/);
  assert.match(masterSource, /GLAPS 디스크립션\(설명\)/);
  assert.match(masterSource, /최종코드\(BP\)/);
  assert.match(masterSource, /매핑항목\(용도\)/);
  assert.match(masterSource, /검수메모\(참고\)/);
  assert.match(masterSource, /fieldGuide/);
  assert.match(masterSource, /검수메모가 항목을 말하면 매핑항목으로 승격/);
  assert.match(masterSource, /formatGlapsAliasType/);
  assert.match(masterSource, /renderInlineEditorRow/);
  assert.match(masterSource, /inlineEditorFieldForColumn/);
  assert.match(masterSource, /handleInlineEditorKeyDown/);
  assert.doesNotMatch(masterSource, /className=\{styles\.editorPanel\}/);
  const routeStartColumn = masterSource.indexOf("{ key: 'start_location_name'");
  const routeNameColumn = masterSource.indexOf("{ key: 'route_name'");
  const routeCodeColumn = masterSource.indexOf("{ key: 'route_code'");
  assert.ok(routeStartColumn >= 0 && routeNameColumn > routeStartColumn);
  assert.ok(routeCodeColumn > routeNameColumn);
  assert.match(masterSource, /ROUTE_ALIAS_TYPES/);
  assert.match(masterSource, /styles\.protectedCell/);
  assert.match(masterSource, /styles\.keyCell/);
  assert.match(masterSource, /\{ key: 'route_code'[\s\S]*className: styles\.keyCell/);
  assert.match(masterSource, /\{ key: 'glaps_code'[\s\S]*className: styles\.keyCell/);
  assert.doesNotMatch(masterSource, /원본명/);
  assert.doesNotMatch(masterSource, /현재 수정양식/);
  assert.doesNotMatch(masterSource, /전체 수정양식/);
  assert.match(masterSource, /beginNewRow/);
  assert.match(masterSource, /beginEditRow/);
  assert.match(masterSource, /deleteRow/);
  assert.match(masterSource, /tableFilters/);
  assert.match(masterSource, /tableSort/);
  assert.match(masterSource, /tableFilterOptions/);
  assert.match(masterSource, /tableFilterKey/);
  assert.match(masterSource, /toggleTableSort/);
  assert.match(masterSource, /visibleTableRows/);
  assert.match(masterSource, /const GLAPS_MASTER_PAGE_SIZE = 100;/);
  assert.match(masterSource, /masterDisplayLimit/);
  assert.match(masterSource, /visibleLimitedRows/);
  assert.match(masterSource, /visibleTableRows\.slice\(0, masterDisplayLimit\)/);
  assert.match(masterSource, /\+100건 더 보기/);
  assert.match(masterSource, /setMasterDisplayLimit\(limit => limit \+ GLAPS_MASTER_PAGE_SIZE\)/);
  assert.match(masterSource, /openRouteStatus/);
  assert.match(masterSource, /openSheetRows/);
  assert.match(masterSource, /운송경로 전체/);
  assert.match(masterSource, /화주사코드/);
  assert.match(masterSource, /경유지코드/);
  assert.match(masterSource, /getGlapsRouteWaypointCode/);
  assert.match(masterSource, /const waypointCode = getGlapsRouteWaypointCode\(row\)/);
  assert.match(masterSource, /routeKeyCell/);
  assert.match(masterSource, /routeNameCell/);
  assert.match(masterCss, /\.table th\.routeKeyCell/);
  assert.match(masterCss, /\.table td\.routeNameCell/);
  assert.match(masterSource, /원장 행 확인/);
  assert.match(masterSource, /buildDuplicateInfo/);
  assert.match(masterSource, /buildGlapsDuplicateInfo/);
  assert.match(masterSource, /duplicateOnly/);
  assert.match(masterSource, /중복검출/);
  assert.match(duplicateUtil, /운송경로코드 중복/);
  assert.match(duplicateUtil, /매핑항목\+최종코드\(BP\) 중복/);
  assert.match(duplicateUtil, /buildGlapsAliasDuplicateGroupKey/);
  assert.match(masterSource, /const duplicateMessages = duplicateOnly \? \(duplicateInfo\.byId\.get\(row\.id\) \|\| \[\]\) : \[\]/);
  assert.match(masterSource, /selectedRowIds/);
  assert.match(masterSource, /selectableVisibleRowIds/);
  assert.match(masterSource, /필터선택/);
  assert.match(masterSource, /선택해제/);
  assert.match(masterSource, /일괄수정/);
  assert.match(masterSource, /action: 'bulk_update'/);
  assert.match(masterSource, /mergeDuplicateRows/);
  assert.match(masterSource, /merge_by_key/);
  assert.match(masterSource, /선택병합/);
  assert.match(masterSource, /일괄병합/);
  assert.match(masterSource, /styles\.duplicateRow/);
  assert.match(masterSource, /className=\{`\$\{styles\.sortButton\}/);
  assert.match(masterSource, /className=\{styles\.filterRow\}/);
  assert.match(masterSource, /<select/);
  assert.match(masterSource, /<option value="">전체<\/option>/);
  assert.match(masterSource, /aria-label=\{`\$\{column\.label\} 필터`\}/);
  assert.match(masterSource, /sourceLabel/);
  assert.match(masterSource, /웹수정 1건 반영 완료/);
  assert.match(masterSource, /원본시트/);
  assert.match(masterSource, /특이적용건/);
  assert.match(masterSource, /EMPTY_SPECIAL_RULE_EDITOR/);
  assert.match(masterSource, /specialRuleToEditorValues/);
  assert.match(masterSource, /SPECIAL_RULE_TYPE_OPTIONS/);
  assert.match(masterSource, /경유지\(GLAPS\)/);
  assert.match(masterSource, /경유지\(ELS\)/);
  assert.match(masterSource, /적용항목/);
  assert.match(masterSource, /적용값/);
  assert.match(masterSource, /상차지·상차지\(청구\) 예외/);
  assert.match(pageSource, /GLAPS_SPECIAL_RULE_TYPES/);
  assert.match(pageSource, /START_LOCATION: 'start_location'/);
  assert.match(pageSource, /BILLING_START_LOCATION: 'billing_start_location'/);
  assert.match(pageSource, /resolveGlapsSpecialStartLocation/);
  assert.match(pageSource, /resolveGlapsSpecialBillingStartLocation/);
  assert.match(pageSource, /const routeStartValues = \[route\.start_location_name, billingStart\]/);
  assert.match(pageSource, /const requestedBillingStartLocation = explicitBillingStartLocation \|\| specialBillingStartLocation \|\| startLocation/);
  assert.match(pageSource, /const routeBillingStartLocation = getGlapsRouteBillingStartLocation\(glapsRoute\)/);
  assert.match(pageSource, /explicitBillingStartLocation \|\| specialBillingStartLocation \|\| routeBillingStartLocation \|\| startLocation/);
  assert.match(masterSource, /sheetRows/);
  assert.match(masterSource, /matchQuery/);
  assert.match(util, /상세배차\.화주사코드 = route\.화주사코드/);
  assert.match(util, /상세배차\.상차지\(청구 우선\) = route\.billing_start_location_name \|\| route\.start_location_name/);
  assert.match(util, /buildGlapsMasterSheetRows/);
  assert.match(util, /buildGlapsAliasesFromCodeSheets/);
  assert.match(util, /export function splitGlapsAliasValues/);
  assert.match(util, /cleanGlapsText\(alias\.glapsCode\)/);
  assert.match(apiSource, /glaps_master_sheet_rows/);
  assert.match(apiSource, /glaps_special_consignee_rules/);
  assert.match(apiSource, /DEFAULT_SPECIAL_CONSIGNEE_RULES/);
  assert.match(apiSource, /default-n084-hyundai-steel-shipper/);
  assert.match(apiSource, /default-n084-hyundai-steel-start-busan/);
  assert.match(apiSource, /default-n084-hyundai-steel-billing-start-krbnp/);
  assert.match(apiSource, /현대제철 경유지 화주사코드 우선적용/);
  assert.match(apiSource, /현대제철 컨테이너 상차지 부산신항 우선적용/);
  assert.match(apiSource, /현대제철 청구 상차지 KRBNP 우선적용/);
  assert.match(apiSource, /start_location_name/);
  assert.match(apiSource, /normalizeSpecialConsigneeRuleRow/);
  assert.match(apiSource, /waypoint_els_name/);
  assert.match(apiSource, /fetchSpecialConsigneeRules/);
  assert.match(apiSource, /handleSpecialConsigneeRuleMutation/);
  assert.match(apiSource, /specialRules/);
  assert.match(apiSource, /parseGlapsMasterSheets/);
  assert.match(apiSource, /DEFAULT_GLAPS_MASTER_PATH = '\/아산지점\/A_운송실무\/GLAPS_마스터코드\.xlsx'/);
  assert.match(apiSource, /fetchPagedGlapsRows/);
  assert.match(apiSource, /mode === 'lookup'/);
  assert.match(apiSource, /GLAPS_LOOKUP_ALIAS_TYPES/);
  assert.match(apiSource, /GLAPS_LOOKUP_SHEET_NAMES/);
  assert.match(apiSource, /\.select\('id, route_code, route_name, start_location_name, waypoint_name, waypoint_els_name, destination_name, route_fingerprint, raw_payload'\)/);
  assert.match(apiSource, /withRouteDerivedFields/);
  assert.match(apiSource, /\.select\('id, alias_type, source_name, els_name, glaps_name, glaps_code, review_note'\)/);
  assert.match(apiSource, /\.in\('alias_type', GLAPS_LOOKUP_ALIAS_TYPES\)/);
  assert.match(apiSource, /\.in\('sheet_name', GLAPS_LOOKUP_SHEET_NAMES\)/);
  assert.match(apiSource, /contentType\.includes\('application\/json'\)/);
  assert.match(apiSource, /handleDirectMutation/);
  assert.match(apiSource, /isDuplicateConstraintError/);
  assert.match(apiSource, /code === '23505'/);
  assert.match(apiSource, /findRouteDirectDuplicates/);
  assert.match(apiSource, /findAliasDirectDuplicates/);
  assert.match(apiSource, /routeMergeGroupKey/);
  assert.match(apiSource, /mergeRouteRowsByConnectionKey/);
  assert.match(apiSource, /mergeAliasRowsByGlapsCode/);
  assert.match(apiSource, /aliasMergeGroupKey/);
  assert.match(apiSource, /mergeAliasFieldValues/);
  assert.match(apiSource, /action === 'merge_by_key'/);
  assert.match(apiSource, /normalizeDirectBulkPatch/);
  assert.match(apiSource, /bulkUpdateDirectRows/);
  assert.match(apiSource, /action === 'bulk_update'/);
  assert.match(apiSource, /duplicateJsonError/);
  assert.match(apiSource, /이미 같은 매핑항목·ELS 매치코드·최종코드\(BP\)가 등록되어 있습니다/);
  assert.match(apiSource, /template_upload/);
  assert.match(apiSource, /function withRequiredInsertDefaults/);
  assert.match(apiSource, /function updateRowsById/);
  assert.match(apiSource, /crypto\.randomUUID\(\)/);
  assert.match(apiSource, /normalized\.created_at = now/);
  assert.match(apiSource, /normalized\.updated_at = now/);
  assert.match(apiSource, /normalized\.imported_at = now/);
  assert.match(apiSource, /insertRows\.map\(row => withRequiredInsertDefaults\(row\)\)/);
  assert.match(apiSource, /updateRowsById\(adminSupabase, 'glaps_master_aliases', updateRows\)/);
  assert.match(apiSource, /insert\(withRequiredInsertDefaults\(dbRow\)\)/);
  assert.match(apiSource, /insert\(routeRows\.map\(row => withRequiredInsertDefaults\(row\)\)\)/);
  assert.match(apiSource, /insert\(aliasRows\.map\(row => withRequiredInsertDefaults\(row\)\)\)/);
  assert.match(apiSource, /insert\(sheetRows\.map\(row => withRequiredInsertDefaults\(row, \{ updatedAt: false \}\)\)\)/);
  assert.match(apiSource, /buildEditActor\('web'/);
  assert.match(apiSource, /isWebEditedRow/);
  assert.match(apiSource, /skippedWebProtected/);
  assert.match(apiSource, /fetchWebProtectedRows/);
  assert.match(apiSource, /applyWebProtectedMasterRows/);
  assert.match(apiSource, /dedupeRowsByInsertKey/);
  assert.match(apiSource, /routeInsertConstraintKey/);
  assert.match(apiSource, /aliasInsertConstraintKey/);
  assert.match(apiSource, /skippedDuplicateRows/);
  assert.match(apiSource, /active: false/);
  assert.match(apiSource, /activatedVersion/);
  assert.match(apiSource, /rememberGlapsUploadResult/);
  assert.match(apiSource, /lastUploadResult/);
  assert.match(apiSource, /webProtection/);
  assert.match(apiSource, /\.range\(from, from \+ PAGE_SIZE - 1\)/);
  assert.match(apiSource, /fetchRowsByIds/);
  assert.match(apiSource, /isRouteTemplateRowChanged/);
  assert.match(apiSource, /isAliasTemplateRowChanged/);
  assert.match(apiSource, /existingByConstraintKey/);
  assert.match(apiSource, /coalesceAliasUploadRows/);
  assert.match(apiSource, /matchedExistingByKey/);
  assert.match(apiSource, /mergedDuplicateRows/);
  assert.doesNotMatch(apiSource, /function omitBlankId/);
  assert.doesNotMatch(apiSource, /upsertRows\.map\(withRequiredId\)/);
  assert.match(apiSource, /existingById\.get\(cleanText\(row\.id\)\)/);
  assert.match(templateSource, /GLAPS_ROUTE_TEMPLATE_HEADERS/);
  assert.match(templateSource, /getGlapsRouteWaypointCode/);
  assert.match(templateSource, /GLAPS_REVIEW_STATUS_LABELS/);
  assert.match(templateSource, /ROUTE_PROTECTED_TEMPLATE_COLUMNS/);
  assert.match(templateSource, /ROUTE_KEY_TEMPLATE_COLUMNS/);
  assert.match(templateSource, /ALIAS_PROTECTED_TEMPLATE_COLUMNS/);
  assert.match(templateSource, /ALIAS_KEY_TEMPLATE_COLUMNS/);
  assert.match(templateSource, /applyKeyColumnStyle/);
  assert.match(templateSource, /applyProtectedColumnStyle/);
  assert.match(templateSource, /회색 칸은 GLAPS 실제 업로드\/원장 기준값/);
  assert.match(templateSource, /ELS 매치코드/);
  assert.match(templateSource, /ELS 디스크립션/);
  assert.match(templateSource, /최종코드\(BP\)/);
  assert.match(templateSource, /매칭 키가 아닙니다/);
  assert.match(templateSource, /초록 키 칸/);
  assert.match(templateSource, /요약 카드/);
  assert.match(templateSource, /운송경로코드가 같은 행/);
  assert.match(templateSource, /매핑항목과 최종코드\(BP\)가 모두 같은 행/);
  assert.match(templateSource, /코드 매칭 조건에는 사용하지 않음/);
  assert.doesNotMatch(templateSource, /원본명/);
  assert.match(templateSource, /addGuideWorksheet/);
  assert.match(templateSource, /addTemplateHeader/);
  assert.match(templateSource, /function applyRowCellStyle/);
  assert.match(templateSource, /function reviewStatusLabel/);
  assert.match(templateSource, /ROUTE_ALIAS_TYPES/);
  assert.match(templateSource, /function isTemplateVisibleAlias/);
  assert.match(templateSource, /data\.filter\(isTemplateVisibleAlias\)/);
  assert.match(templateSource, /reviewStatusLabel\(row\.review_status\)/);
  assert.match(templateSource, /확정 \/ 조정필요 \/ 코드없음/);
  assert.match(templateSource, /행을 지우는 것은 삭제로 처리하지 않습니다/);
  assert.match(templateSource, /포트 \/ 선사 \/ 컨테이너규격 \/ 운송사 \/ 컨샤이니 \/ 기타/);
  assert.match(templateSource, /영문 port \/ line \/ container_type \/ carrier \/ consignee \/ generic도 인식/);
  assert.match(templateSource, /GLAPS 운송경로 수정양식/);
  assert.match(templateSource, /GLAPS 항목매핑 수정양식/);
  assert.match(templateSource, /topLeftCell: 'A2'/);
  assert.match(templateSource, /activeCell: 'A2'/);
  assert.match(templateSource, /activeCell: `A\$\{headerRowNumber \+ 1\}`/);
  assert.match(templateSource, /activePane: 'bottomLeft'/);
  assert.doesNotMatch(templateSource, /getRow\(headerRowNumber\)\.fill/);
  assert.doesNotMatch(templateSource, /sheet\.getRow\(1\)\.fill/);
  assert.match(templateSource, /설명서/);
  assert.match(templateSource, /GLAPS_수정양식\.xlsx/);
  assert.match(templateSource, /kind === 'all'/);
  assert.match(templateSource, /GLAPS_ALIAS_TEMPLATE_HEADERS/);
  assert.doesNotMatch(masterCss, /\.protectedField/);
  assert.match(masterCss, /\.inlineEditInput/);
  assert.match(masterCss, /\.inlineEditRow/);
  assert.match(masterCss, /\.table td\.protectedCell/);
  assert.match(masterCss, /\.table td\.keyCell/);
  assert.match(masterCss, /\.sortButton/);
  assert.match(masterCss, /\.filterRow th/);
  assert.match(masterCss, /\.filterRow select/);
  assert.match(masterCss, /\.tableMeta/);
  assert.match(masterCss, /\.tableWrap\s*{[\s\S]*height: auto;[\s\S]*max-height: clamp\(300px, calc\(100vh - 360px\), 760px\);[\s\S]*overflow: auto;[\s\S]*scrollbar-gutter: stable;/);
  assert.match(masterCss, /\.table th\s*{[\s\S]*padding: 5px 8px;[\s\S]*line-height: 1\.15;/);
  assert.match(masterCss, /\.filterRow th\s*{[\s\S]*top: 26px;[\s\S]*padding: 3px 5px;/);
  assert.match(masterCss, /\.table td\s*{[\s\S]*padding: 4px 8px;[\s\S]*line-height: 1\.18;/);
  assert.match(masterCss, /\.table td:has\(\.rowActions\)\s*{[\s\S]*padding: 0 6px;/);
  assert.match(masterCss, /\.inlineEditInput\s*{[\s\S]*height: 24px;/);
  assert.match(masterCss, /\.rowActions button\s*{[\s\S]*height: 24px;/);
  assert.match(masterCss, /\.statusPill\s*{[\s\S]*height: 20px;/);
  assert.match(masterCss, /\.duplicateButton/);
  assert.match(masterCss, /\.duplicateRow td/);
  assert.match(masterCss, /\.mergeButton/);
  assert.match(masterCss, /\.selectButton/);
  assert.match(masterCss, /\.bulkEditButton/);
  assert.match(masterCss, /\.bulkEditPanel/);
  assert.match(masterCss, /\.legacyMasterButton/);
  assert.match(masterCss, /\.legacyMasterPanel/);
  assert.match(masterCss, /\.fieldGuide/);
  assert.match(masterCss, /\.metricCardActive/);
  assert.match(masterCss, /\.duplicateRow td\.keyCell/);
  assert.match(masterCss, /\.rowSelectCheckbox/);
  assert.match(masterCss, /#fff1f2/);
  assert.match(masterCss, /#e11d48/);
  assert.match(masterCss, /\.tableFooter/);
  assert.match(masterCss, /\.loadMoreButton/);
  assert.doesNotMatch(pageSource, /dynamicHeight/);
  assert.doesNotMatch(pageSource, /style=\{\{ height: dynamicHeight \}\}/);
  assert.doesNotMatch(dispatchCss, /height:\s*calc\(100vh - 250px\)/);
  assert.match(dispatchCss, /\.container\s*{[\s\S]*overflow: visible;/);
  assert.match(dispatchCss, /\.tableWrap\s*{[\s\S]*overflow: visible;[\s\S]*flex: 0 0 auto;/);
  assert.match(dispatchCss, /\.tableScroll\s*{[\s\S]*overflow: auto;[\s\S]*flex: 0 1 auto;[\s\S]*height: auto;[\s\S]*max-height: clamp\(360px, calc\(100dvh - 300px\), 980px\);[\s\S]*scrollbar-gutter: stable;/);
  assert.match(dispatchCss, /\.pageWrapper\s*{[\s\S]*min-height: auto;/);
  assert.match(dispatchCss, /\.contentArea\s*{[\s\S]*flex: 0 0 auto;[\s\S]*min-height: 0;/);
  assert.match(dispatchCss, /\.table th,[\s\S]*\.table td\s*{[\s\S]*height: 24px;[\s\S]*font-size: 0\.76rem;[\s\S]*line-height: 1\.18;/);
  assert.match(dispatchCss, /\.table th\s*{[\s\S]*background: #1f5673;[\s\S]*padding: 2px 6px;/);
  assert.match(dispatchCss, /\.table td\s*{[\s\S]*padding: 2px 6px;/);
  assert.match(dispatchCss, /\.detailTable td\s*{[\s\S]*height: 24px;/);
  assert.match(dispatchCss, /\.detailTable td:has\(\.detailSelect\),[\s\S]*\.detailTable td:has\(\.detailBkgPickButton\)\s*{[\s\S]*padding: 0 !important;/);
  assert.match(dispatchCss, /\.detailSelect,\s*\n\.detailComboInput\s*{[\s\S]*height: 24px;/);
  assert.match(dispatchCss, /\.detailBkgSourceBadge,\s*\n\.detailBkgConfirmInput\s*{[\s\S]*height: 24px;/);
  assert.match(dispatchCss, /\.detailBkgPickButton\s*{[\s\S]*min-height: 24px;/);
  assert.match(dispatchCss, /\.webCellInput\s*{[\s\S]*height: 24px;/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.glaps_master_versions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.glaps_transport_routes/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.glaps_master_aliases/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.glaps_special_consignee_rules/);
  assert.match(sql, /rule_type TEXT NOT NULL DEFAULT 'consignee'/);
  assert.match(sql, /start_location_name TEXT NOT NULL DEFAULT ''/);
  assert.match(sql, /B000034432/);
  assert.match(sql, /모비스 천안친환경물류센터/);
  assert.match(sql, /모비스 AS아산센터/);
  assert.match(sql, /모비스 AS천안수출물류센터/);
  assert.match(sql, /waypoint_els_name/);
  assert.match(sql, /모비스아산수출물류센터/);
  assert.match(sql, /모비스천안\(입장\)수출물류센터/);
  assert.match(sql, /모비스천안친환경물류센터/);
  assert.match(sql, /GA1588/);
  assert.match(sql, /MOBBEL/);
  assert.match(sql, /N084/);
  assert.match(sql, /현대제철 경유지 화주사코드 우선적용/);
  assert.match(sql, /현대제철 컨테이너 상차지 부산신항 우선적용/);
  assert.match(sql, /ON public\.glaps_special_consignee_rules \(branch_id, rule_type, shipper_code, waypoint_name, waypoint_els_name\)/);
  assert.match(specialRuleSql, /ADD COLUMN IF NOT EXISTS rule_type/);
  assert.match(specialRuleSql, /ADD COLUMN IF NOT EXISTS start_location_name/);
  assert.match(specialRuleSql, /'start_location'/);
  assert.match(specialRuleSql, /'N084'/);
  assert.match(specialRuleSql, /'현대제철'/);
  assert.match(specialRuleSql, /'부산신항'/);
  assert.match(sql, /ALTER TABLE public\.glaps_master_aliases\s+ALTER COLUMN id SET DEFAULT gen_random_uuid\(\);/);
  assert.match(sql, /ALTER TABLE public\.glaps_master_aliases\s+ALTER COLUMN created_at SET DEFAULT now\(\),\s+ALTER COLUMN updated_at SET DEFAULT now\(\);/);
  assert.match(sql, /ALTER TABLE public\.glaps_master_sheet_rows\s+ALTER COLUMN created_at SET DEFAULT now\(\);/);
  assert.match(sql, /UNIQUE \(branch_id, version_id, alias_type, source_name, route_code, glaps_code\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.glaps_master_sheet_rows/);
  assert.match(sql, /container_type/);
  assert.match(sql, /ALTER TABLE public\.glaps_transport_routes ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.glaps_master_sheet_rows ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.glaps_special_consignee_rules ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.glaps_transport_routes FROM anon, authenticated/);
  assert.match(duplicateSql, /DROP CONSTRAINT IF EXISTS glaps_master_aliases_branch_id_version_id_alias_type_source_name_route_code_key/);
  assert.match(duplicateSql, /ADD CONSTRAINT glaps_master_aliases_branch_version_alias_source_route_code_key/);
  assert.match(duplicateSql, /UNIQUE \(branch_id, version_id, alias_type, source_name, route_code, glaps_code\)/);
});

test('아산 배차 NAS 스케줄러는 컨테이너 재시작 후 DB 최신 파일이면 전체 파싱을 건너뛴다', () => {
  const core = fs.readFileSync(
    path.join(webRoot, '../docker/els-backend/app_core.py'),
    'utf8',
  );
  const legacy = fs.readFileSync(
    path.join(webRoot, '../docker/els-backend/app.py'),
    'utf8',
  );

  for (const source of [core, legacy]) {
    assert.match(source, /def _dispatch_db_has_current_mtime/);
    assert.match(source, /last_file_signature_cache/);
    assert.match(source, /branch_dispatch/);
    assert.match(source, /file_modified_at/);
    assert.match(source, /row_count/);
    assert.match(source, /valid_row_count/);
    assert.match(source, /_upsert_branch_dispatch/);
    assert.match(source, /DB 최신 상태 확인, 컨테이너 재시작 후 최초 전체 파싱 생략/);
    assert.match(source, /dispatch_sync_gate\.mark_synced\(f"dispatch:\{dtype\}", file_signature\)/);
    assert.match(source, /cached_signature == file_signature/);
    assert.doesNotMatch(source, /cache(?:d)?_mtime == mtime/);
    assert.match(source, /shipping_cache\.pop\(normalized_path, None\)/);
    assert.match(source, /gc\.collect\(\)/);
  }
});

test('아산 배차 동기화는 파일에서 빠진 날짜 시트를 DB 누적 스냅샷으로 보존한다', () => {
  const core = fs.readFileSync(
    path.join(webRoot, '../docker/els-backend/app_core.py'),
    'utf8',
  );
  const legacySync = fs.readFileSync(
    path.join(webRoot, 'lib/asan-dispatch.js'),
    'utf8',
  );
  const spec = fs.readFileSync(
    path.join(webRoot, '../docs/09_DISPATCH_BOARD_SPEC.md'),
    'utf8',
  );

  assert.match(core, /파일에서 삭제된 과거 시트는 DB 마감 스냅샷으로 보존합니다/);
  assert.doesNotMatch(
    core,
    /branch_dispatch"\)\.delete\(\)\.eq\("branch_id", "asan"\)\.eq\("type", dtype\)\.eq\("target_date", db_date\)/,
  );
  assert.doesNotMatch(core, /엑셀에 없는 과거 시트 .*DB에서 삭제 완료/);
  assert.match(legacySync, /upsertDispatchSheet\(supabase, \{/);
  assert.match(legacySync, /onConflict: 'branch_id,type,target_date'/);
  assert.match(legacySync, /row_count: parsed\.rows\.length/);
  assert.match(legacySync, /valid_row_count: parsed\.rows\.length/);
  assert.doesNotMatch(
    legacySync,
    /\.delete\(\)\.eq\('branch_id', 'asan'\)\.eq\('type', type\)/,
  );
  assert.match(spec, /삭제된 시트는 변경이 끝난 마감 스냅샷/);
});

test('아산 배차 자동 갱신은 화면 위치를 유지하고 메모 변경도 DB 갱신 대상으로 본다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const core = fs.readFileSync(
    path.join(webRoot, '../docker/els-backend/app_core.py'),
    'utf8',
  );

  assert.match(source, /dataRef = useRef\(\[\]\)/);
  assert.match(source, /activeTabRef = useRef\(-1\)/);
  assert.match(source, /fetchData\(viewType, \{ silent: true, preserveActiveDate: true \}\);/);
  assert.match(source, /const \[refreshing, setRefreshing\] = useState\(false\);/);
  assert.match(source, /ASAN_DISPATCH_RELOAD_STATE_KEY/);
  assert.match(source, /consumeAsanDispatchReloadState/);
  assert.match(source, /skipInitialViewResetRef/);
  assert.match(source, /const handleRefreshData = \(\) =>/);
  assert.match(source, /window\.sessionStorage\.setItem\(ASAN_DISPATCH_RELOAD_STATE_KEY, JSON\.stringify\(restoreState\)\)/);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.match(source, /현재 위치를 저장하고 페이지를 새로고침합니다\./);
  assert.match(source, /restoreState\.activeTargetDate === '__all__'/);
  assert.match(source, /refreshing \? '새로고침 중' : '새로고침'/);
  assert.match(source, /setInterval\(\(\) => \{/);
  assert.match(source, /}, 60000\);/);
  assert.match(source, /if \(!silent\) setLoading\(true\);/);
  assert.match(source, /if \(!silent\) setData\(\[\]\);/);
  assert.match(source, /makeDispatchDataUrl/);
  assert.match(source, /mode: 'meta'/);
  assert.match(source, /mode: 'date', date: activeDate/);
  assert.match(source, /mode: 'full'/);
  assert.match(source, /mergeDispatchDateItems/);
  assert.match(source, /NAS 1순위 작업일 동기화 진행 중입니다\. 완료되면 화면을 새로고침합니다\./);
  assert.match(source, /syncGate\.running && !syncGate\.quickDone/);
  assert.match(source, /1순위 재동기화/);
  assert.match(source, /fetch\(`\/api\/branches\/asan\/sync\?t=\$\{Date\.now\(\)\}`/);
  assert.match(source, /동기화 완료\. 최신 자료로 새로고침합니다\./);
  assert.match(source, /syncActionBlocked/);
  assert.match(source, /disabled=\{syncActionBlocked\}/);
  assert.match(source, /setTimeout\(handleRefreshData, 50\)/);
  const excelButtonIdx = source.indexOf('onClick={handleDownload}>엑셀');
  const settingsButtonIdx = source.indexOf('onClick={openSettings}>설정');
  const refreshButtonIdx = source.indexOf('onClick={handleRefreshData}');
  const syncButtonIdx = source.indexOf('onClick={handleSync}');
  assert.ok(excelButtonIdx >= 0 && excelButtonIdx < settingsButtonIdx);
  assert.ok(settingsButtonIdx < refreshButtonIdx);
  assert.ok(refreshButtonIdx < syncButtonIdx);
  assert.match(core, /"comments": comments_dict/);
  assert.match(core, /sort_keys=True/);
  assert.match(core, /def _touch_dispatch_file_modified_at/);
  assert.match(core, /\.in_\(.*"target_date", chunk\)/s);
  assert.match(core, /metadata_only_dates\.append\(target_date\)/);
  assert.match(core, /데이터 동일 시트 .*파일수정일만 갱신/);
  assert.match(core, /def _dispatch_priority_context\(target_dates, now\)/);
  assert.match(core, /future_days\[0\] if future_days else available_days\[-1\]/);
  assert.match(core, /_dispatch_sheet_sort_key\(target_date, now, priority_context\)/);
  assert.match(core, /quick_done/);
  assert.match(core, /phase="adjacent"/);
  assert.match(core, /def _request_asan_sync_cancel/);
  assert.match(core, /def _restart_asan_dispatch_manual_after_current/);
  assert.match(core, /status\.get\("quick_done"\)/);
  assert.match(core, /ASAN_DISPATCH_SYNC_REQUEST_COOLDOWN_SECONDS/);
  assert.match(core, /def sync_asan_dispatch_manual_python/);
  assert.match(core, /phase="quick"/);
  assert.match(core, /phase="rest"/);
  assert.match(core, /def _asan_dispatch_auto_ready_to_sync/);
  assert.match(core, /def sync_asan_dispatch_auto_python/);
  assert.match(core, /수동 동기화와 동일한 1순위 우선 절차/);
  assert.match(core, /return sync_asan_dispatch_manual_python\(\)/);
  assert.match(core, /sync_asan_dispatch_auto_python\(\)/);
  assert.doesNotMatch(core, /if 6 <= now\.hour <= 23:\s*\n\s+sync_asan_dispatch_python\(\)/);
  assert.match(core, /methods=\["GET", "POST"\]/);
  assert.match(core, /_get_asan_sync_status/);
  assert.doesNotMatch(core, /sheet_hash = hashlib\.md5\(str\(rows\)\.encode/);
});

test('아산 배차 통합현황도 WEB 전용 BKG/비고 칸을 항상 표시하고 편집한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const route = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/dispatch/route.js'),
    'utf8',
  );

  assert.match(source, /isDispatchWebCellField/);
  assert.match(source, /if \(isDispatchWebCellField\(h\)\) return true;/);
  assert.match(source, /dispatchType: meta\.sourceType/);
  assert.match(route, /normalizeDispatchRecordHeaders/);
  assert.match(route, /ensureDispatchWebCellHeaders/);
  assert.match(route, /const records = \(data \|\| \[\]\)\.map\(normalizeDispatchRecordHeaders\);/);
  assert.match(route, /legacyHeaders: item\.webCellLegacyHeaders \|\| \[\]/);
  assert.match(route, /webCellRows: \[\]/);
  assert.match(route, /webCellRows\.push\(webCellState\.enabled \? rowMeta : null\)/);
  assert.match(route, /formatMobisCountryPortLabel\(row, item\.headers \|\| \[\]\)/);
  assert.match(route, /h === '고객사\(국가\)' && mobisCustomerLabel/);
  assert.match(route, /applyDispatchWebCellOverlay\(\{/);
  assert.match(route, /headers: unifiedHeaders/);
});

test('아산 배차 통합현황은 비고 오른쪽 특이사항과 날짜별 가변 헤더를 표시한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const route = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/dispatch/route.js'),
    'utf8',
  );
  const rowCountSql = fs.readFileSync(
    path.join(webRoot, 'supabase_sql/20260601_asan_dispatch_row_counts.sql'),
    'utf8',
  );
  const exportRoute = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/export/route.js'),
    'utf8',
  );

  assert.match(source, /function mergeDispatchHeaders\(items = \[\]\)/);
  assert.match(source, /mapDispatchRowToHeaders\(row, item\.headers \|\| \[\], baseHeaders\)/);
  assert.match(source, /formatMobisCountryPortDisplay\(row, sourceHeaders\)/);
  assert.match(source, /findMergedHeaderIndex\(baseHeaders, item\.headers\?\.\[ci\]\)/);
  assert.match(route, /"담당자", "선적", "작업지"/);
  assert.match(route, /"선적": getCol\(\["선적"\]\)/);
  assert.match(route, /"비고", "특이사항"/);
  assert.match(route, /DISPATCH_QUERY_MODES/);
  assert.match(route, /DISPATCH_META_SELECT/);
  assert.match(route, /DISPATCH_META_FALLBACK_SELECT/);
  assert.match(route, /dispatchCountColumnMissing/);
  assert.match(route, /buildQuery\(mode === 'meta' \? DISPATCH_META_SELECT : '\*'\)/);
  assert.match(route, /buildQuery\(DISPATCH_META_FALLBACK_SELECT\)/);
  assert.match(route, /mode === 'meta'/);
  assert.match(route, /valid_row_count/);
  assert.match(rowCountSql, /ADD COLUMN IF NOT EXISTS row_count/);
  assert.match(rowCountSql, /ADD COLUMN IF NOT EXISTS valid_row_count/);
  assert.match(rowCountSql, /jsonb_array_length\(COALESCE\(data, '\[\]'::jsonb\)\)/);
  assert.match(rowCountSql, /idx_branch_dispatch_meta_lookup/);
  assert.match(route, /query = query\.eq\('target_date', targetDate\)/);
  assert.match(route, /return NextResponse\.json\(\{ data: metaData, mode \}\)/);
  assert.match(route, /getColAfter\(\["특이사항", "툭이사항"\], \["검증"\]\)/);
  assert.match(route, /itemType === 'glovis'[\s\S]*getColBefore\(\["특이사항"\], \["라인", "선사명", "선사", "TYPE", "T"\]\)/);
  assert.match(route, /: getCol\(\["Nomi,구간"\]\)/);
  assert.match(exportRoute, /"담당자", "선적", "작업지"/);
  assert.match(exportRoute, /"선적": getCol\(\["선적"\]\)/);
  assert.match(exportRoute, /"비고", "특이사항"/);
  assert.match(exportRoute, /ensureDispatchWebCellHeaders/);
  assert.match(exportRoute, /getColAfter\(\["특이사항", "툭이사항"\], \["검증"\]\)/);
  assert.match(exportRoute, /normalizeDispatchRecordHeaders/);
  assert.match(exportRoute, /const records = \(rawData \|\| \[\]\)\.map\(normalizeDispatchRecordHeaders\);/);
  assert.match(exportRoute, /formatMobisCountryPortLabel\(row, item\.headers \|\| \[\]\)/);
  assert.match(exportRoute, /function mergeDispatchExportHeaders\(records = \[\]\)/);
  assert.match(exportRoute, /mapDispatchExportRow\(r, item\.headers \|\| \[\], headers\)/);
});

test('아산 배차 엑셀 다운로드는 오더와 배차를 숫자 셀로 쓰고 테두리를 적용한다', () => {
  const exportRoute = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/export/route.js'),
    'utf8',
  );
  const viewExportRoute = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/export/view/route.js'),
    'utf8',
  );
  const intranetExcelExport = fs.readFileSync(
    path.join(webRoot, 'utils/intranetExcelExport.mjs'),
    'utf8',
  );

  assert.match(exportRoute, /NUMERIC_DISPATCH_EXPORT_HEADERS/);
  assert.match(exportRoute, /\['오더\(계\)', '오더', '계', '수량', '배차'\]/);
  assert.match(exportRoute, /addIntranetExportWorksheet\(workbook, \{/);
  assert.match(exportRoute, /\}, \{ numericHeaders: NUMERIC_DISPATCH_EXPORT_HEADERS \}\)/);
  assert.match(intranetExcelExport, /function createNumericHeaderSet/);
  assert.match(intranetExcelExport, /function createTextHeaderSet/);
  assert.match(intranetExcelExport, /cell\.numFmt = '#,\#\#0'/);
  assert.match(intranetExcelExport, /cell\.numFmt = '@'/);
  assert.match(intranetExcelExport, /style: 'thin'/);
  assert.match(intranetExcelExport, /hRow\.eachCell\(\{ includeEmpty: true \}/);
  assert.match(viewExportRoute, /export async function POST\(request\)/);
  assert.match(viewExportRoute, /safeExcelFileName/);
  assert.match(viewExportRoute, /normalizeIntranetExportSheet/);
  assert.match(viewExportRoute, /addIntranetExportWorksheet/);
  assert.match(viewExportRoute, /payload\.extraSheets/);
  assert.match(viewExportRoute, /X-ELS-Export-Rows/);
  assert.match(intranetExcelExport, /sheet\.autoFilter/);
});

test('아산 배차 WEB 입력은 저장값 길이에 맞춰 컬럼 폭을 자동 확장한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dispatch.module.css'),
    'utf8',
  );

  assert.match(source, /function estimateDispatchColumnWidth\(header, values = \[\]\)/);
  assert.match(source, /const columnWidthStyle = useCallback/);
  assert.match(source, /const expandWebCellColumnWidth = useCallback/);
  assert.match(source, /estimateDispatchColumnWidth\(header, \[/);
  assert.match(source, /setColWidths\(prev => \{/);
  assert.match(source, /if \(current >= nextWidth\) return prev;/);
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*nextWidths\[header\] = estimateDispatchColumnWidth\(header, allData\.map/);
  assert.match(source, /<th key=\{ci\} style=\{columnWidthStyle\(w\)\}/);
  assert.match(source, /style=\{widthStyle \? \{ \.\.\.widthStyle, overflow: 'hidden', textOverflow: 'ellipsis' \} : undefined\}/);
  assert.match(source, /expandWebCellColumnWidth\(fieldKey, savedValue\)/);
  assert.match(css, /\.table\s*{[\s\S]*width: max-content;[\s\S]*min-width: 100%;/);
  assert.match(css, /\.detailComboInput\s*{[\s\S]*min-width: 96px;/);
  assert.match(css, /\.detailPortSelect\s*{[\s\S]*min-width: 94px;/);
});

test('통합 배차변동은 통합확정이 없어도 확정된 원본 구분을 동기화한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const changeRoute = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/dispatch/change-events/route.js'),
    'utf8',
  );
  const detailUtils = fs.readFileSync(
    path.join(webRoot, 'utils/asanDispatchDetailLines.mjs'),
    'utf8',
  );
  const changeUtils = fs.readFileSync(
    path.join(webRoot, 'utils/asanDispatchChangeEvents.mjs'),
    'utf8',
  );

  assert.match(source, /detailSourceConfirmationToken/);
  assert.match(source, /detailChangeSyncEnabled/);
  assert.match(source, /const signature = `\$\{detailChangeSyncConfirmationToken\}:\$\{detailSnapshotSignature\}`/);
  assert.match(changeRoute, /function splitCurrentLinesByDispatchType/);
  assert.match(changeRoute, /async function syncChangeEventsForPayload/);
  assert.match(changeRoute, /payload\.dispatchType !== 'integrated' \|\| isActiveConfirmation\(directConfirmation\)/);
  assert.match(changeRoute, /query\.in\('dispatch_type', \['integrated', 'glovis', 'mobis'\]\)/);
  assert.match(detailUtils, /sourceType: cleanText\(row\?\.webCellMeta\?\.sourceType \|\| ''\)/);
  assert.match(changeUtils, /sourceType: line\.sourceType \|\| ''/);
});

test('아산 지점 페이지는 Vercel HTML 캐시를 쓰지 않는다', () => {
  const layoutSource = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/layout.js'),
    'utf8',
  );

  assert.match(layoutSource, /export const dynamic = 'force-dynamic'/);
  assert.match(layoutSource, /export const revalidate = 0/);
  assert.match(layoutSource, /export const fetchCache = 'force-no-store'/);
});
