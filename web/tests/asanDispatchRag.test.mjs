import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAsanDispatchRagText,
  parseAsanDispatchIntent,
  parseCarrierCell,
} from '../utils/asanDispatchRag.mjs';

const now = new Date(Date.UTC(2026, 4, 18, 15, 0, 0)); // 2026-05-19 KST

test('아산 배차판 질문 의도는 날짜·시간·픽업지역을 분리해 인식한다', () => {
  const intent = parseAsanDispatchIntent('내일 13시 부산 배차 몇대야?', {
    now,
    searchTerms: ['내일', '13시', '부산', '배차', '몇대야'],
  });

  assert.equal(intent.shouldQuery, true);
  assert.equal(intent.dateScope.start, '2026-05-20');
  assert.equal(intent.filterHour, '13');
  assert.deepEqual(intent.specificKeywords, ['부산']);
});

test('차번·날짜·작업지 질문은 숫자를 필터 키워드로 오인하지 않는다', () => {
  const intent = parseAsanDispatchIntent('1145 4/23 작업지는?', {
    now,
    searchTerms: ['1145', '4/23', '작업지는'],
  });

  assert.equal(intent.shouldQuery, true);
  assert.equal(intent.dateScope.start, '2026-04-23');
  assert.deepEqual(intent.specificKeywords, []);
});

test('업체별 시간 질문은 업체/수량 같은 집계어를 필터로 쓰지 않는다', () => {
  const intent = parseAsanDispatchIntent('오늘 8시도착 업체 별 수량은?', {
    now,
    searchTerms: ['오늘', '8시도착', '업체', '별', '수량은'],
  });

  assert.equal(intent.shouldQuery, true);
  assert.equal(intent.dateScope.start, '2026-05-19');
  assert.equal(intent.filterHour, '08');
  assert.deepEqual(intent.specificKeywords, []);
});

test('지역칸 업체명과 대수는 점·쉼표 구분자를 모두 읽는다', () => {
  assert.deepEqual(parseCarrierCell('이지1.대신3'), [
    { carrier: '이지', count: 1 },
    { carrier: '대신', count: 3 },
  ]);
  assert.deepEqual(parseCarrierCell('대신10,자차3.이지5'), [
    { carrier: '대신', count: 10 },
    { carrier: '자차', count: 3 },
    { carrier: '이지', count: 5 },
  ]);
});

test('RAG 텍스트는 배차판을 도표형 스키마로 먼저 주입한다', () => {
  const intent = parseAsanDispatchIntent('내일 13시 부산 배차 몇대야?', { now });
  const result = buildAsanDispatchRagText([
    {
      target_date: '2026-05-20',
      type: 'glovis',
      headers: ['담당자', '작업지', '오더(계)', '배차정보', '부산', '아산', '비고'],
      data: [
        ['양진영', '글로비스2포장장', '4', '13 14', '이지1.대신3', '', ''],
      ],
      comments: {
        '0:4': '이지 13, 대신 14 15 16',
      },
    },
  ], intent);

  assert.match(result.text, /도표형 스키마/);
  assert.match(result.text, /오더 컬럼: 오더\(계\)/);
  assert.match(result.text, /픽업지역\/상차지 컬럼: 부산, 아산/);
  assert.match(result.text, /매칭 행: 1건 \/ 오더 4대 \/ 실제 배차 4대/);
  assert.match(result.text, /부산 이지 1대/);
  assert.match(result.text, /부산 대신 3대/);
});

test('미래에 추가되는 픽업지역 컬럼도 셀 패턴으로 추론한다', () => {
  const intent = parseAsanDispatchIntent('청주 배차 몇대야?', { now });
  const result = buildAsanDispatchRagText([
    {
      target_date: '2026-05-19',
      type: 'glovis',
      headers: ['담당자', '작업지', '오더(계)', '배차정보', '청주'],
      data: [
        ['강주희', '신규작업지', '2', '09 10', '새운송2'],
      ],
      comments: {},
    },
  ], intent);

  assert.match(result.text, /픽업지역\/상차지 컬럼: 청주/);
  assert.match(result.text, /청주 새운송 2대/);
});
