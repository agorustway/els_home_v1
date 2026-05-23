import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDispatchDetailLines,
  detailLineToRow,
  DISPATCH_DETAIL_HEADERS,
  GLAPS_START_LOCATION_OPTIONS,
  parseDispatchAssignmentCell,
  resolveGlapsStartLocation,
  summarizeDispatchDetailLines,
} from '../utils/asanDispatchDetailLines.mjs';

test('상세배차는 지역칸 업체수량을 1건 단위 라인으로 분해하고 BKG 값을 반복한다', () => {
  const headers = [
    '날짜',
    '구분',
    '화주',
    '작업지',
    '선적',
    '고객사',
    '포트',
    '라인',
    'T',
    '부산',
    'BKG1',
    'BKG2',
    'BKG3',
    'TARGET VESSEL',
    '비고',
  ];
  const rows = [[
    '5/23(토)',
    '수출',
    '글로비스',
    '서영울산(용연)',
    '부산신항',
    'HD STEEL',
    'SIKOP',
    'MAE',
    '40HC',
    '민경3,이지1',
    'BKG-A',
    'BKG-B',
    'BKG-C',
    'VESSEL-1',
    '확인필요',
  ]];

  const lines = buildDispatchDetailLines({ headers, rows });

  assert.equal(lines.length, 4);
  assert.deepEqual(lines.map((line) => line.company), ['민경', '민경', '민경', '이지']);
  assert.deepEqual(lines.map((line) => line.startLocation), ['부산신항', '부산신항', '부산신항', '부산신항']);
  assert.equal(lines[0].workDate, '5/23(토)');
  assert.equal(lines[0].workplace, '서영울산(용연)');
  assert.equal(lines[0].bkg1, 'BKG-A');
  assert.equal(lines[0].bkg2, 'BKG-B');
  assert.equal(lines[0].bkg3, 'BKG-C');
  assert.equal(lines[0].targetVessel, 'VESSEL-1');
  assert.equal(lines[0].note, '확인필요');
  assert.equal(summarizeDispatchDetailLines(lines).total, 4);
});

test('부산/인천/울산 suffix와 부곡은 GLAPS 상차지로 정규화한다', () => {
  const headers = ['구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산', '인천', '울산', '부곡'];
  const rows = [[
    '수출',
    '글로비스',
    '모비스천안(입장)수출물류센터',
    '부산신항',
    'KIN',
    'INKAT',
    'HMM',
    '40HC',
    '민경B2',
    '한진K1,동원B1,동부1',
    '서영B1,대신1',
    '선진1',
  ]];

  const lines = buildDispatchDetailLines({ headers, rows, workDate: '2026-05-23' });
  const pairs = lines.map((line) => [line.company, line.startLocation]);

  assert.deepEqual(pairs, [
    ['민경', '부산북항'],
    ['민경', '부산북항'],
    ['한진', '인천항국제여객터미널'],
    ['동원', '인천항'],
    ['동부', '인천신항'],
    ['서영', '울산구항'],
    ['대신', '울산신항'],
    ['선진', '의왕ICD'],
  ]);
  assert.equal(lines[2].startSuffix, 'K');
  assert.equal(lines[3].startSuffix, 'B');
  assert.equal(lines[0].workDate, '2026-05-23');
});

test('기타/철송, 아산, 중부는 상세배차에서 선택 필요 상태로 둔다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '기타/철송', '아산', '중부'];
  const rows = [['2026-05-23', '수출', '글로비스', 'KCP', '광진1', '이지1', '선진2']];

  const lines = buildDispatchDetailLines({ headers, rows });

  assert.equal(lines.length, 4);
  assert.deepEqual(lines.map((line) => line.startLocation), ['', '', '', '']);
  assert.equal(summarizeDispatchDetailLines(lines).manualStartLocationCount, 4);
  assert.equal(resolveGlapsStartLocation('아산'), '');
});

test('상세배차 상차지 선택지는 GLAPS 캡처 기준 항목을 포함한다', () => {
  assert.ok(GLAPS_START_LOCATION_OPTIONS.includes('부산신항'));
  assert.ok(GLAPS_START_LOCATION_OPTIONS.includes('인천항국제여객터미널'));
  assert.ok(GLAPS_START_LOCATION_OPTIONS.includes('인천신항'));
  assert.ok(GLAPS_START_LOCATION_OPTIONS.includes('의왕ICD'));
  assert.equal(resolveGlapsStartLocation('인천', 'K'), '인천항국제여객터미널');
});

test('상세배차 행 변환은 요청 컬럼 순서를 유지한다', () => {
  assert.deepEqual(DISPATCH_DETAIL_HEADERS, [
    '운송사코드',
    '작업일자',
    '구분',
    '화주',
    '상차지',
    '작업지',
    '하차지(선적)',
    '운송경로',
    '운송경로코드',
    '고객사',
    '포트',
    '포트코드',
    '라인',
    '라인코드',
    '타입',
    '타입코드',
    '업체명',
    'BKG1',
    'BKG2',
    'BKG3',
    'TARGET VESSEL',
    '비고',
  ]);
  assert.deepEqual(parseDispatchAssignmentCell('민경3, 이지1').map((item) => [item.companyToken, item.count]), [
    ['민경', 3],
    ['이지', 1],
  ]);
  assert.deepEqual(detailLineToRow({
    carrierCode: 'ELS',
    workDate: '26/5/23',
    direction: '수출',
    shipper: '글로비스',
    startLocation: '부산신항',
    workplace: 'KCP',
    destination: '부산신항',
    glapsRouteName: '부산신항 KCP 부산신항',
    glapsRouteCode: 'MBS12345',
    customer: 'HD',
    port: 'USLGB',
    glapsPortCode: 'USLGB',
    line: 'MSC',
    glapsLineCode: 'MSC',
    containerType: '40HC',
    glapsTypeCode: '40HC',
    company: '민경',
    bkg1: 'B1',
    bkg2: 'B2',
    bkg3: 'B3',
    targetVessel: 'TV',
    note: 'N',
  }), [
    'ELS',
    '26/5/23',
    '수출',
    '글로비스',
    '부산신항',
    'KCP',
    '부산신항',
    '부산신항 KCP 부산신항',
    'MBS12345',
    'HD',
    'USLGB',
    'USLGB',
    'MSC',
    'MSC',
    '40HC',
    '40HC',
    '민경',
    'B1',
    'B2',
    'B3',
    'TV',
    'N',
  ]);
});
