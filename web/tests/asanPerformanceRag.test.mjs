import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAsanPerformanceRagText,
  parseAsanPerformanceIntent,
} from '../utils/asanPerformanceRag.mjs';

const now = new Date(Date.UTC(2026, 4, 24, 15, 0, 0)); // 2026-05-25 KST

test('실적관리 의도는 이번달 이익을 화면 scope로 정규화한다', () => {
  const intent = parseAsanPerformanceIntent('이번달 마감 이익 어때?', { now });

  assert.equal(intent.shouldQuery, true);
  assert.equal(intent.menu, 'monthly');
  assert.deepEqual(intent.scope, { mode: 'month', month: '2026-05' });
});

test('실적관리 의도는 운송사 매출순위 질문의 breakdown 축을 인식한다', () => {
  const intent = parseAsanPerformanceIntent('5월달 업체(운송사) 매출순위는? 건수와 매입금 도출해서', { now });

  assert.equal(intent.shouldQuery, true);
  assert.equal(intent.scope.mode, 'month');
  assert.equal(intent.scope.month, '2026-05');
  assert.deepEqual(intent.breakdownAxes, ['carrier']);
  assert.equal(intent.rankMetric, 'revenue');
});

test('실적관리 RAG는 원장 전체가 아니라 화면 도출항목 요약을 주입한다', () => {
  const intent = parseAsanPerformanceIntent('실적관리 이익 요약해줘', { now });
  const result = buildAsanPerformanceRagText({
    summary: {
      totalRevenue: 150000000,
      totalPurchase: 120000000,
      totalProfit: 30000000,
      profitRate: 20,
      purchaseRate: 80,
      rowCount: 321,
      fileCount: 5,
      syncedAt: '2026-05-25T10:00:00+09:00',
      periodStart: '2026-01',
      periodEnd: '2026-05',
      latestMonth: { period: '2026-05', revenue: 50000000, purchase: 42000000, profit: 8000000, profitRate: 16 },
      previousMonth: { period: '2026-04', revenue: 45000000, purchase: 39000000, profit: 6000000, profitRate: 13.33 },
      latestRevenueDelta: { amount: 5000000, rate: 11.1 },
      latestProfitDelta: { amount: 2000000, rate: 33.3 },
      scope: { mode: 'all', label: '전체' },
      sourceMix: {
        annual: { revenue: 90000000, purchase: 70000000, profit: 20000000, rowCount: 200 },
        monthly: { revenue: 60000000, purchase: 50000000, profit: 10000000, rowCount: 121 },
      },
      executiveSignals: [
        { title: '이익률', value: '20%', detail: '원가율 80%', tone: 'good' },
      ],
      strategicSegments: [
        { label: '자사 직계약', revenue: 70000000, purchase: 50000000, profit: 20000000, profitRate: 28.57 },
      ],
      vehiclePerformance: [
        { vehicleNo: '1145', revenue: 30000000, purchase: 24000000, profit: 6000000, profitRate: 20 },
      ],
      breakdowns: [
        {
          column: '운송사',
          items: [
            { label: '대신', revenue: 70000000, purchase: 59000000, profit: 11000000, rowCount: 21, profitRate: 15.71 },
            { label: '한진', revenue: 30000000, purchase: 25000000, profit: 5000000, rowCount: 9, profitRate: 16.67 },
          ],
        },
      ],
      trendItems: [
        { period: '2026-04', revenue: 45000000, profit: 6000000, profitRate: 13.33 },
        { period: '2026-05', revenue: 50000000, profit: 8000000, profitRate: 16 },
      ],
    },
  }, intent);

  assert.match(result.text, /실적관리 화면 도출항목 재사용/);
  assert.match(result.text, /이익/);
  assert.match(result.text, /이익률/);
  assert.doesNotMatch(result.text, /손익/);
  assert.match(result.text, /예하 메뉴 연결: 종합실적, 월간실적, 연간실적/);
  assert.match(result.text, /도출항목\/경보/);
  assert.match(result.text, /자사 직계약/);
  assert.match(result.text, /1145/);
  assert.match(result.text, /업체\/거래처별 도출항목/);
  assert.match(result.text, /운송사 기준/);
  assert.match(result.text, /대신: 매출 7,000만원 \/ 건수 21건 \/ 매입금 5,900만원/);
  assert.match(result.text, /원장 전체 행을 AI 프롬프트에 직접 주입하거나 금액을 추정하지 마라/);
});

test('실적관리 의도는 기존 손익 표현도 호환한다', () => {
  const intent = parseAsanPerformanceIntent('실적관리 손익 요약해줘', { now });

  assert.equal(intent.shouldQuery, true);
  assert.equal(intent.menu, 'summary');
});
