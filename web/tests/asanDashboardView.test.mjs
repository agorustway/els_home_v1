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
  assert.match(source, /월간 평균합 \{formatDecimal\(monthAverageTotal\)\}/);
  assert.match(source, /누적 \{formatQty\(monthTotal\)\}/);
  assert.match(source, /onSelect\?\.\('weekly', event\.target\.value\)/);
  assert.match(source, /onSelect\?\.\('monthly', event\.target\.value\)/);
  assert.match(css, /\.weekdayChooser select\s*{[\s\S]*opacity: 0;/);
  assert.match(css, /\.weekdayChooser small\s*{[\s\S]*color: #94a3b8;/);
});

test('아산 전체 탭 기간 선택지는 오늘 이후 사전기입 날짜를 제외한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );

  assert.match(source, /const todayKey = useMemo\(\(\) => getTodayKey\(\), \[\]\);/);
  assert.match(source, /const eligibleItems = data\.filter\(item => item\.target_date <= todayKey\);/);
  assert.match(source, /const months = \[\.\.\.new Set\(eligibleItems\.map/);
  assert.match(source, /eligibleItems\.forEach\(\(item\) =>/);
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

test('아산 배차 날짜 탭은 데이터 없는 날짜를 비활성화한다', () => {
  const source = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(webRoot, 'app/(main)/employees/branches/asan/dispatch.module.css'),
    'utf8',
  );

  assert.match(source, /const hasRows = \(item\) => Array\.isArray\(item\?\.data\) && item\.data\.length > 0;/);
  assert.match(source, /disabled=\{!hasRows\}/);
  assert.match(source, /styles\.dateTabDisabled/);
  assert.match(source, /title=\{!hasRows \? '데이터 없음' : undefined\}/);
  assert.match(source, /for \(let i = items\.length - 1; i >= 0; i -= 1\)/);
  assert.match(css, /\.dateTabDisabled,[\s\S]*cursor: not-allowed;/);
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
