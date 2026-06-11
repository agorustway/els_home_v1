import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDispatchRateLimitFallbackText,
  buildSseTextPayload,
} from '../utils/chatFallbacks.mjs';

test('Gemini 429 때 아산 배차 RAG 집계로 SSE fallback 답변을 만든다', () => {
  const text = buildDispatchRateLimitFallbackText({
    success: true,
    shouldQuery: true,
    loadedDates: ['2026-06-11'],
    intent: {
      dateScope: { label: '오늘(2026-06-11)' },
      quantityMetric: 'dispatch',
    },
    overallSummary: {
      rowCount: 12,
      orderCount: 20,
      dispatchCount: 18,
      byCarrier: { 대신: 8, 이지: 6, 서틀: 4 },
      byRegion: { 부산: 10, 중부: 5, 부곡: 3 },
    },
    matchedSummary: {
      rowCount: 0,
      orderCount: 0,
      dispatchCount: 0,
      byCarrier: {},
      byRegion: {},
    },
  });

  assert.match(text, /생성 모델 요청 한도/);
  assert.match(text, /오늘\(2026-06-11\) 기준 아산 배차는 실제 배차 18대입니다\. 오더는 20대입니다\./);
  assert.match(text, /운송사별: 대신\(8대\), 이지\(6대\), 서틀\(4대\)/);
  assert.match(text, /상차지별: 부산\(10대\), 중부\(5대\), 부곡\(3대\)/);
  assert.match(text, /실제 조회일: 2026-06-11/);
  assert.match(text, /\[사내 통합 데이터베이스\] branch_dispatch/);
});

test('배차 fallback은 운송사·상차지·시간 필터가 있으면 매칭 집계를 우선한다', () => {
  const text = buildDispatchRateLimitFallbackText({
    success: true,
    shouldQuery: true,
    loadedDates: ['2026-06-11'],
    intent: {
      dateScope: { label: '오늘(2026-06-11)' },
      carrierFilters: ['대신'],
      regionFilters: ['부산'],
      filterHour: 13,
      quantityMetric: 'both',
    },
    overallSummary: {
      rowCount: 30,
      orderCount: 70,
      dispatchCount: 65,
      byCarrier: { 대신: 27, 이지: 20 },
      byRegion: { 부산: 41, 중부: 12 },
    },
    matchedSummary: {
      rowCount: 3,
      orderCount: 5,
      dispatchCount: 4,
      byCarrier: { 대신: 4 },
      byRegion: { 부산: 4 },
    },
  });

  assert.match(text, /오늘\(2026-06-11\) 13시, 대신, 부산 조건 기준 아산 배차는 실제 배차 4대, 오더 5대입니다\./);
  assert.doesNotMatch(text, /실제 배차 65대/);
  assert.match(text, /운송사별: 대신\(4대\)/);
  assert.match(text, /상차지별: 부산\(4대\)/);
});

test('fallback SSE payload는 프론트 스트림 파서 형식과 맞는다', () => {
  const payload = buildSseTextPayload('배차 18대');

  assert.equal(payload, 'data: {"text":"배차 18대"}\n\ndata: [DONE]\n\n');
});
