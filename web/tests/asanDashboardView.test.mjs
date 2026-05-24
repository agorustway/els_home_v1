import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildAsanDashboardBasisDiffSummary,
  buildAsanDashboardPeriods,
  buildAsanDashboardScope,
  buildAsanDashboardTimeline,
  buildAsanDashboardWeekdayComparison,
  buildSelectableAsanDashboardPeriods,
  getActualDispatchQty,
  getDispatchAssignedQty,
  getDispatchPlannedQty,
  toSortedChartEntries,
} from '../utils/asanDashboardView.mjs';

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
  assert.match(source, /buildAsanDashboardScope\(\{/);
  assert.match(source, /viewMode: 'customer'/);
  assert.match(source, /function findDefaultValidTabIndex\(items = \[\], viewType, today = getTodayKey\(\)\)/);
  assert.match(source, /const \{ silent = false, preserveActiveDate = false \} = options;/);
  assert.match(source, /previousTargetDate === '__all__'/);
  assert.match(source, /setActiveTab\(nextIndex >= 0 \? nextIndex : findDefaultValidTabIndex\(items, type, today\)\);/);
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

  assert.match(source, /buildDispatchDetailLines/);
  assert.match(source, /DISPATCH_DETAIL_HEADERS\.map/);
  assert.match(source, /GLAPS_START_LOCATION_OPTIONS\.filter\(Boolean\)\.map/);
  assert.match(source, /detailStartOverrides/);
  assert.doesNotMatch(source, /detailCarrierOverrides/);
  assert.match(source, /detailIssueFilter/);
  assert.match(source, /glapsDetailLookup/);
  assert.match(source, /buildGlapsRouteFingerprint/);
  assert.match(source, /buildGlapsAliasCodeMap/);
  assert.match(source, /carrier: buildGlapsAliasCodeMap\(glapsDetailLookup\.aliases \|\| \[\], 'carrier'\)/);
  assert.match(source, /consignee: buildGlapsAliasCodeMap\(glapsDetailLookup\.aliases \|\| \[\], 'consignee'\)/);
  assert.match(source, /orderType: buildGlapsSheetCodeMap\(glapsDetailLookup\.sheetRows \|\| \[\], '수출입코드', '수출입구분', '코드'\)/);
  assert.match(source, /buildGlapsShipperCodeMap/);
  assert.match(source, /getGlapsRoutePayload/);
  assert.match(source, /focusDetailGridInput/);
  assert.match(source, /const carrierCode = getGlapsAliasCode\(glapsAliasMaps\.carrier, 'ELS'\)/);
  assert.match(source, /glapsPortCode,/);
  assert.doesNotMatch(source, /glapsPortCode: glapsPortCode \|\| line\.port/);
  assert.match(source, /DETAIL_ISSUE_FILTERS\.map/);
  assert.doesNotMatch(source, /DETAIL_CARRIER_CODE_DATALIST_ID/);
  assert.match(source, /mainView === 'detail'/);
  assert.match(source, /상세배차내역/);
  assert.match(source, /상세배차수량/);
  assert.match(source, /상차지 선택필요/);
  assert.match(source, /운송사코드 확인/);
  assert.match(source, /컨샤이니 미도출/);
  assert.match(source, /GLAPS코드 기존 코드 도출 검수용 상세 라인/);
  assert.match(util, /'오더구분코드'/);
  assert.match(util, /'화주사코드'/);
  assert.match(util, /'반출지\(출발\)코드'/);
  assert.match(util, /'작업지\(하차지\)코드'/);
  assert.match(util, /'반입지\(도착\)코드'/);
  assert.match(util, /'운송서비스코드'/);
  assert.match(util, /'운송사코드'/);
  assert.match(util, /'컨샤이니'/);
  assert.match(util, /'운송경로'/);
  assert.match(util, /'운송경로코드'/);
  assert.match(util, /'포트코드'/);
  assert.match(util, /'라인코드'/);
  assert.match(util, /'타입코드'/);
  assert.match(util, /carrierMissingCount/);
  assert.match(util, /consigneeMissingCount/);
  assert.match(util, /routePartMissingCount/);
  assert.match(css, /\.detailTable th\s*{[\s\S]*background: #1f5673;/);
  assert.match(css, /\.detailIssueButtonActive\s*{[\s\S]*background: #fff7ed;/);
  assert.match(css, /\.detailManualRow\s*{[\s\S]*background: #fff7ed !important;/);
  assert.match(util, /인천항국제여객터미널/);
  assert.match(util, /if \(normalizedRegion === '부곡'\) return '의왕ICD';/);
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
  const util = fs.readFileSync(
    path.join(webRoot, 'utils/glapsMasterData.mjs'),
    'utf8',
  );

  assert.match(pageSource, /loadAsanGlapsMaster/);
  assert.match(pageSource, /GLAPS코드/);
  assert.match(pageSource, /const MAIN_TABS = \['dispatch', 'shipping', 'performance'\];/);
  assert.doesNotMatch(pageSource, /activeMainTab === 'glaps-master'/);
  assert.match(pageSource, /mainView === 'glaps-master'/);
  assert.match(pageSource, /buildGlapsDispatchRouteFingerprints/);
  assert.match(pageSource, /buildGlapsContainerIsoCodeMap/);
  assert.match(masterSource, /NAS 마스터 반영/);
  assert.match(masterSource, /수정양식 내보내기/);
  assert.match(masterSource, /수정양식 업로드/);
  assert.match(masterSource, /postWorkbook\(\{ mode: 'all', file \}\)/);
  assert.match(masterSource, /배차판 매칭용/);
  assert.match(masterSource, /ROUTE_ALIAS_TYPES/);
  assert.match(masterSource, /styles\.protectedField/);
  assert.match(masterSource, /styles\.protectedCell/);
  assert.doesNotMatch(masterSource, /원본명/);
  assert.doesNotMatch(masterSource, /현재 수정양식/);
  assert.doesNotMatch(masterSource, /전체 수정양식/);
  assert.match(masterSource, /beginNewRow/);
  assert.match(masterSource, /beginEditRow/);
  assert.match(masterSource, /deleteRow/);
  assert.match(masterSource, /sourceLabel/);
  assert.match(masterSource, /웹수정 1건 반영 완료/);
  assert.match(masterSource, /원본시트/);
  assert.match(masterSource, /sheetRows/);
  assert.match(masterSource, /matchQuery/);
  assert.match(util, /상세배차\.상차지 = route\.start_location_name/);
  assert.match(util, /buildGlapsMasterSheetRows/);
  assert.match(util, /buildGlapsAliasesFromCodeSheets/);
  assert.match(apiSource, /glaps_master_sheet_rows/);
  assert.match(apiSource, /parseGlapsMasterSheets/);
  assert.match(apiSource, /DEFAULT_GLAPS_MASTER_PATH = '\/아산지점\/A_운송실무\/GLAPS_마스터코드\.xlsx'/);
  assert.match(apiSource, /fetchPagedGlapsRows/);
  assert.match(apiSource, /contentType\.includes\('application\/json'\)/);
  assert.match(apiSource, /handleDirectMutation/);
  assert.match(apiSource, /template_upload/);
  assert.match(apiSource, /buildEditActor\('web'/);
  assert.match(apiSource, /\.range\(from, from \+ PAGE_SIZE - 1\)/);
  assert.match(apiSource, /fetchRowsByIds/);
  assert.match(apiSource, /isRouteTemplateRowChanged/);
  assert.match(apiSource, /isAliasTemplateRowChanged/);
  assert.match(apiSource, /existingById\.get\(cleanText\(row\.id\)\)/);
  assert.match(templateSource, /GLAPS_ROUTE_TEMPLATE_HEADERS/);
  assert.match(templateSource, /GLAPS_REVIEW_STATUS_LABELS/);
  assert.match(templateSource, /ROUTE_PROTECTED_TEMPLATE_COLUMNS/);
  assert.match(templateSource, /ALIAS_PROTECTED_TEMPLATE_COLUMNS/);
  assert.match(templateSource, /applyProtectedColumnStyle/);
  assert.match(templateSource, /회색 칸은 GLAPS 실제 업로드\/원장 기준값/);
  assert.match(templateSource, /배차판 매칭용/);
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
  assert.match(templateSource, /운송경로의 상차지\/경유지\/하차지는 운송경로 시트에서 수정/);
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
  assert.match(masterCss, /\.protectedField/);
  assert.match(masterCss, /\.table td\.protectedCell/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.glaps_master_versions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.glaps_transport_routes/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.glaps_master_aliases/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.glaps_master_sheet_rows/);
  assert.match(sql, /container_type/);
  assert.match(sql, /ALTER TABLE public\.glaps_transport_routes ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.glaps_master_sheet_rows ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.glaps_transport_routes FROM anon, authenticated/);
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
  assert.match(legacySync, /\.upsert\(\{/);
  assert.match(legacySync, /onConflict: 'branch_id,type,target_date'/);
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
  assert.match(source, /setInterval\(\(\) => \{/);
  assert.match(source, /}, 60000\);/);
  assert.match(source, /if \(!silent\) setLoading\(true\);/);
  assert.match(source, /if \(!silent\) setData\(\[\]\);/);
  assert.match(source, /NAS 동기화 진행 중입니다\. 완료되면 화면을 갱신합니다\./);
  assert.match(source, /fetch\(`\/api\/branches\/asan\/sync\?t=\$\{Date\.now\(\)\}`/);
  assert.match(source, /동기화 완료\. 최신 자료로 갱신했습니다\./);
  assert.match(core, /"comments": comments_dict/);
  assert.match(core, /sort_keys=True/);
  assert.match(core, /def _touch_dispatch_file_modified_at/);
  assert.match(core, /\.in_\(.*"target_date", chunk\)/s);
  assert.match(core, /metadata_only_dates\.append\(target_date\)/);
  assert.match(core, /데이터 동일 시트 .*파일수정일만 갱신/);
  assert.match(core, /_dispatch_sheet_sort_key\(target_date, now\)/);
  assert.match(core, /priority_start = now\.date\(\) - timedelta\(days=1\)/);
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
  const exportRoute = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/export/route.js'),
    'utf8',
  );

  assert.match(source, /function mergeDispatchHeaders\(items = \[\]\)/);
  assert.match(source, /mapDispatchRowToHeaders\(row, item\.headers \|\| \[\], baseHeaders\)/);
  assert.match(source, /findMergedHeaderIndex\(baseHeaders, item\.headers\?\.\[ci\]\)/);
  assert.match(route, /"담당자", "선적", "작업지"/);
  assert.match(route, /"선적": getCol\(\["선적"\]\)/);
  assert.match(route, /"비고", "특이사항"/);
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
  assert.match(exportRoute, /function mergeDispatchExportHeaders\(records = \[\]\)/);
  assert.match(exportRoute, /mapDispatchExportRow\(r, item\.headers \|\| \[\], headers\)/);
});

test('아산 배차 엑셀 다운로드는 오더와 배차를 숫자 셀로 쓰고 테두리를 적용한다', () => {
  const exportRoute = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/export/route.js'),
    'utf8',
  );

  assert.match(exportRoute, /NUMERIC_DISPATCH_EXPORT_HEADERS/);
  assert.match(exportRoute, /\['오더\(계\)', '오더', '계', '수량', '배차'\]/);
  assert.match(exportRoute, /function normalizeDispatchExportRowForExcel\(headers = \[\], row = \[\]\)/);
  assert.match(exportRoute, /return isNumericDispatchExportHeader\(header\) \? toDispatchExportNumber\(value\) : value;/);
  assert.match(exportRoute, /const NUMBER_FORMAT = '#,\#\#0';/);
  assert.match(exportRoute, /sheet\.addRow\(normalizeDispatchExportRowForExcel\(pData\.headers, rowData\)\)/);
  assert.match(exportRoute, /r\.getCell\(colIdx\)/);
  assert.match(exportRoute, /style: 'thin'/);
  assert.match(exportRoute, /hRow\.eachCell\(\{ includeEmpty: true \}/);
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
});
