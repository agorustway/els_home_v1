import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAsanDispatchRagText,
  buildAsanDispatchDetailRagText,
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
  assert.equal(intent.quantityMetric, 'dispatch');
  assert.deepEqual(intent.typeFilters, []);
  assert.deepEqual(intent.specificKeywords, ['부산']);
});

test('모레와 13:00 표현은 날짜·시간으로 정규화하고 키워드로 오인하지 않는다', () => {
  const intent = parseAsanDispatchIntent('모레 13:00 부산배차 몇대야?', {
    now,
    searchTerms: ['모레', '13:00', '부산배차', '몇대야'],
  });

  assert.equal(intent.shouldQuery, true);
  assert.equal(intent.dateScope.start, '2026-05-21');
  assert.equal(intent.filterHour, '13');
  assert.deepEqual(intent.typeFilters, []);
  assert.deepEqual(intent.specificKeywords, ['부산']);
});

test('상차지별 같은 집계축은 필터 키워드가 아니며 모비스는 데이터셋 필터로 분리한다', () => {
  const overall = parseAsanDispatchIntent('내일 상차지별 수량 알려줘', {
    now,
    searchTerms: ['내일', '상차지별', '수량', '알려줘'],
  });
  const mobis = parseAsanDispatchIntent('5/26일 모비스 아산 상차지별 배차 수량 알려줘', {
    now,
    searchTerms: ['5/26일', '모비스', '아산', '상차지별', '배차', '수량', '알려줘'],
  });

  assert.equal(overall.shouldQuery, true);
  assert.deepEqual(overall.specificKeywords, []);
  assert.deepEqual(overall.typeFilters, []);
  assert.deepEqual(overall.groupBy, ['region']);

  assert.equal(mobis.shouldQuery, true);
  assert.equal(mobis.dateScope.start, '2026-05-26');
  assert.deepEqual(mobis.typeFilters, ['mobis']);
  assert.deepEqual(mobis.specificKeywords, []);
  assert.deepEqual(mobis.groupBy, ['region']);
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
  assert.match(result.text, /질문 즉답용 집계/);
  assert.match(result.text, /정답 후보: 실제 배차 4대 \(오더 4대\)/);
  assert.match(result.text, /오더 컬럼: 오더\(계\)/);
  assert.match(result.text, /픽업지역\/상차지 컬럼: 부산, 아산/);
  assert.match(result.text, /매칭 행: 1건 \/ 오더 4대 \/ 실제 배차 4대/);
  assert.match(result.text, /부산 이지 1대/);
  assert.match(result.text, /부산 대신 3대/);
});

test('13:00과 13시30분 메모는 13시 질문에 매칭된다', () => {
  const intent = parseAsanDispatchIntent('모레 13:00 부산배차 몇대야?', { now });
  const result = buildAsanDispatchRagText([
    {
      target_date: '2026-05-21',
      type: 'glovis',
      headers: ['담당자', '작업지', '오더(계)', '배차정보', '부산'],
      data: [
        ['양진영', 'KCC글라스', '2', '13:00 13시30분', '이지1.대신1'],
      ],
      comments: {
        '0:4': '이지 13:00, 대신 13시30분',
      },
    },
  ], intent);

  assert.match(result.text, /매칭 행: 1건 \/ 오더 2대 \/ 실제 배차 2대/);
  assert.match(result.text, /부산 이지 1대/);
  assert.match(result.text, /부산 대신 1대/);
});

test('배차정보의 09 10 공백형 시간은 09시와 10시 질문에 각각 매칭된다', () => {
  const records = [
    {
      target_date: '2026-05-19',
      type: 'glovis',
      headers: ['담당자', '작업지', '오더(계)', '배차정보', '청주'],
      data: [
        ['강주희', '신규작업지', '2', '09 10', '새운송2'],
      ],
      comments: {},
    },
  ];
  const nine = buildAsanDispatchRagText(records, parseAsanDispatchIntent('오늘 청주 09시 배차 몇대야?', { now }));
  const ten = buildAsanDispatchRagText(records, parseAsanDispatchIntent('오늘 청주 10:00 배차 몇대야?', { now }));

  assert.match(nine.text, /매칭 행: 1건 \/ 오더 2대 \/ 실제 배차 2대/);
  assert.match(ten.text, /매칭 행: 1건 \/ 오더 2대 \/ 실제 배차 2대/);
});

test('모비스 상차지별 질문은 모비스 데이터만 묶어 지역별 수량을 낸다', () => {
  const intent = parseAsanDispatchIntent('5/26일 모비스 아산 상차지별 배차 수량 알려줘', { now });
  const result = buildAsanDispatchRagText([
    {
      target_date: '2026-05-26',
      type: 'mobis',
      headers: ['담당자', '작업지', '계', '배차정보', '아산', '부산'],
      data: [
        ['박지영', '모비스센터', '3', '09 10', '이지2', '대신1'],
      ],
      comments: {},
    },
    {
      target_date: '2026-05-26',
      type: 'glovis',
      headers: ['담당자', '작업지', '오더(계)', '배차정보', '아산', '부산'],
      data: [
        ['강주희', '글로비스센터', '5', '09 10', '이지5', ''],
      ],
      comments: {},
    },
  ], intent);

  assert.match(result.text, /조건: 모비스/);
  assert.match(result.text, /매칭 행: 1건 \/ 오더 3대 \/ 실제 배차 3대/);
  assert.match(result.text, /매칭 상차지: 아산\(2대\), 부산\(1대\)/);
  assert.doesNotMatch(result.text, /매칭 행: 2건/);
});

test('총 배차 질문의 즉답 기준은 오더가 아니라 실제 배차 수량이다', () => {
  const intent = parseAsanDispatchIntent('내일 총 몇대 배차야?', { now });
  const result = buildAsanDispatchRagText([
    {
      target_date: '2026-05-20',
      type: 'glovis',
      headers: ['담당자', '작업지', '오더(계)', '배차정보', '부산', '아산'],
      data: [
        ['조윤진', '글로비스KD센터', '3', '08 16', '대신2', ''],
      ],
      comments: {},
    },
    {
      target_date: '2026-05-20',
      type: 'mobis',
      headers: ['담당자', '작업지', '계', '배차정보', '부산', '아산'],
      data: [
        ['장희수', '모비스아산수출물류센터', '1', '13:00가이드', '', '선진1'],
      ],
      comments: {},
    },
  ], intent);

  assert.equal(intent.quantityMetric, 'dispatch');
  assert.match(result.text, /정답 후보: 실제 배차 3대 \(오더 4대\)/);
  assert.match(result.text, /오더와 배차를 더하거나 섞지 마라/);
});

test('모비스 CODE와 Nomi 같은 설명 컬럼은 상차지 컬럼으로 오인하지 않는다', () => {
  const intent = parseAsanDispatchIntent('5/26일 모비스 총 몇대 배차야?', { now });
  const result = buildAsanDispatchRagText([
    {
      target_date: '2026-05-26',
      type: 'mobis',
      headers: [
        '구분', '화주', '담당자', '운송사', '선적', '작업지', 'CODE', 'TYPE', '수량',
        '도착항', '선사명', '배차정보', 'Nomi,구간', 'BookingNo/InvoiceNo', '국가명',
        '계', '추가', '배차예정', '기타', '아산', '부산', '광양', '평택', '중부',
        '부곡', '인천', '배차', '검증', '툭이사항', '함축', 'col_31', 'col_32', 'A', 'B',
      ],
      data: [
        [
          '수출', '모비스AS', '장희수', 'ELS', '부산신항', '모비스아산수출물류센터',
          'A07VEA', '40HC', '1', '상하이', '두우해운(인)', '13:00가이드', '',
          '', '중국', '1', '', '', '', '', '', '', '', '', '', '선진1', '1',
          '', '', '두우해운(인) 상하이 1대', '아산 두우해운(인)', '', '장희수', '두우해운',
        ],
        [
          '수출', '모비스AS', '이유림', 'ELS', '부산신항', '모비스아산수출물류센터',
          'B00VAX', '40HC', '1', '마이애미', 'CMA', '08:00착', '1/13~',
          '', '미국', '1', '', '', '', '', '대신1', '', '', '', '', '', '1',
          '', '', 'CMA 마이애미 1대', '아산 CMA', '', '', '',
        ],
      ],
      comments: {},
    },
  ], intent);

  assert.match(result.text, /정답 후보: 실제 배차 2대 \(오더 2대\)/);
  assert.match(result.text, /픽업지역\/상차지 컬럼: 기타, 아산, 부산, 광양, 평택, 중부, 부곡, 인천/);
  assert.doesNotMatch(result.text, /픽업지역\/상차지 컬럼:[^\n]*CODE/);
  assert.doesNotMatch(result.text, /픽업지역\/상차지 컬럼:[^\n]*Nomi/);
  assert.doesNotMatch(result.text, /AVEA\(7대\)/);
});

test('상세배차 RAG는 지역 셀 수량을 1대 단위 라인으로 펼친다', () => {
  const intent = parseAsanDispatchIntent('5/26일 상세배차 GLAPS 코드 확인해줘', { now });
  const result = buildAsanDispatchDetailRagText([
    {
      target_date: '2026-05-26',
      type: 'glovis',
      headers: ['구분', '화주', '담당자', '선적', '작업지', '고객사', '포트', '라인', 'TYPE', '오더', '배차정보', '부산', '중부', 'CODE'],
      data: [
        ['수출', '글로비스', '조윤진', '부산신항', '글로비스KD센터', 'HMMA', 'USMOB', 'ONE', '40HC', '3', '09 11 13', '대신2', '셔틀1', 'A07VEA'],
      ],
      comments: {},
    },
  ], intent);

  assert.match(result.text, /상세배차 라인 총 3대/);
  assert.match(result.text, /부산신항 -> 글로비스KD센터 -> 부산신항/);
  assert.match(result.text, /대신/);
  assert.match(result.text, /셔틀/);
  assert.doesNotMatch(result.text, /AVEA 7/);
});

test('GLAPS 경로확인 안되는 질문은 운송경로 미도출 조건으로 해석한다', () => {
  const intent = parseAsanDispatchIntent('내일 GLAPS 경로확인 안되는 작업지 어디야?', { now });
  const result = buildAsanDispatchDetailRagText([
    {
      target_date: '2026-05-20',
      type: 'glovis',
      headers: ['구분', '화주', '담당자', '선적', '작업지', '고객사', '포트', '라인', 'TYPE', '오더', '배차정보', '부산'],
      data: [
        ['수출', '글로비스', '조윤진', '부산신항', '등록작업지', 'HMMA', 'USMOB', 'ONE', '40HC', '1', '09', '대신1'],
        ['수출', '글로비스', '조윤진', '부산신항', '미등록작업지', 'HMMA', 'USMOB', 'ONE', '40HC', '1', '10', '칸1'],
      ],
      comments: {},
    },
  ], intent, {
    glapsLookup: {
      routes: [
        {
          route_code: 'R001',
          route_name: '부산-등록-부산',
          start_location_name: '부산신항',
          waypoint_els_name: '등록작업지',
          destination_name: '부산신항',
          route_fingerprint: '',
          raw_payload: {
            경유지코드: 'W001',
            화주사코드: 'KR10',
          },
        },
      ],
      aliases: [
        { alias_type: 'carrier', source_name: 'ELS', glaps_name: 'ELS', glaps_code: 'B000005273' },
        { alias_type: 'port', source_name: 'USMOB', glaps_name: 'USMOB', glaps_code: 'USMOB' },
        { alias_type: 'line', source_name: 'ONE', glaps_name: 'ONE', glaps_code: 'ONEY' },
        { alias_type: 'container_type', source_name: '40HC', glaps_name: '40HC', glaps_code: '4510' },
        { alias_type: 'consignee', source_name: 'HMMA', glaps_name: 'HMMA', glaps_code: 'C001' },
      ],
    },
  });

  assert.equal(intent.shouldQuery, true);
  assert.deepEqual(intent.detailIssueFilters, ['route']);
  assert.deepEqual(intent.specificKeywords, []);
  assert.equal(result.total, 1);
  assert.match(result.text, /GLAPS 경로 미도출 작업지/);
  assert.match(result.text, /미등록작업지: 1대/);
  assert.match(result.text, /운송경로 미도출/);
  assert.doesNotMatch(result.text, /\n- 등록작업지: 1대/);
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
