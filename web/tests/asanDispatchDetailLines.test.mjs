import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDispatchDetailLines,
  detailLineToRow,
  DISPATCH_DETAIL_DG_HEADER,
  DISPATCH_DETAIL_HEADERS,
  DISPATCH_DETAIL_RF_HEADER,
  GLAPS_START_LOCATION_OPTIONS,
  inferDispatchDgFlag,
  inferDispatchRfFlag,
  normalizeDispatchDgValue,
  normalizeDispatchRfValue,
  normalizeDispatchTimeValue,
  parseDispatchAssignmentCell,
  resolveGlapsStartLocation,
  summarizeDispatchDetailLines,
} from '../utils/asanDispatchDetailLines.mjs';
import {
  DISPATCH_CHANGE_HEADERS,
  DISPATCH_CHANGE_SCHEMA_VERSION,
  diffDispatchChangeLines,
  diffDispatchMemoOnlyChanges,
  filterNeutralizedDispatchChangeEvents,
  getDispatchChangeDiffHeaders,
  makeDispatchNeutralPairKey,
  makeDispatchMemoSignature,
  makeDispatchChangeSnapshotLine,
  mergeDispatchMemoOnlyPayload,
} from '../utils/asanDispatchChangeEvents.mjs';
import {
  GLAPS_UPLOAD_HEADERS,
  buildGlapsUploadRowsFromDetailRows,
} from '../utils/asanGlapsUploadExport.mjs';

test('상세배차는 지역칸 업체수량을 1건 단위 라인으로 분해하고 BKG 값을 반복한다', () => {
  const headers = [
    '날짜',
    '구분',
    '화주',
    '작업지',
    '선적',
    '고객사',
    '포트(DIST)',
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

test('상세배차는 지역칸 메모의 단일 업체 시간을 수량별 라인에 배정한다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산'];
  const rows = [['2026-05-28', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '이지3']];

  const lines = buildDispatchDetailLines({
    headers,
    rows,
    comments: { '0:9': '13 14 15' },
  });

  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map(line => line.dispatchTime), ['13:00', '14:00', '15:00']);
  assert.deepEqual(
    lines.map(line => detailLineToRow(line)[DISPATCH_DETAIL_HEADERS.indexOf('시간')]),
    ['13:00', '14:00', '15:00'],
  );
});

test('상세배차 시간은 HH:MM 형식으로 정규화한다', () => {
  assert.equal(normalizeDispatchTimeValue('08'), '08:00');
  assert.equal(normalizeDispatchTimeValue('8'), '08:00');
  assert.equal(normalizeDispatchTimeValue('16:40'), '16:40');
  assert.equal(normalizeDispatchTimeValue('8:5'), '08:05');
  assert.equal(normalizeDispatchTimeValue('25'), '25');
});

test('상세배차 DG와 RF는 분리하고 TYPE에 R이 있으면 RF 기본값만 Y로 표시한다', () => {
  assert.equal(normalizeDispatchDgValue(''), 'N');
  assert.equal(normalizeDispatchDgValue('Y'), 'Y');
  assert.equal(inferDispatchDgFlag('DG'), 'Y');
  assert.equal(inferDispatchDgFlag('Nomi DG 확인'), 'Y');
  assert.equal(inferDispatchDgFlag('일반'), 'N');
  assert.equal(inferDispatchRfFlag('40HC'), 'N');
  assert.equal(inferDispatchRfFlag('20RF'), 'Y');
  assert.equal(inferDispatchRfFlag('22RE'), 'Y');
  assert.equal(inferDispatchRfFlag('45RH'), 'Y');
  assert.equal(normalizeDispatchRfValue('', '40HC'), 'N');
  assert.equal(normalizeDispatchRfValue('', '20RF'), 'Y');
  assert.equal(normalizeDispatchRfValue('n', '20RF'), 'N');
});

test('상세배차 DG는 특이사항(Nomi,구간)에 DG가 있으면 자동 Y로 표시한다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '특이사항(Nomi,구간)', '부산'];
  const rows = [['2026-06-01', '수출', '글로비스', 'KCP', '부산신항', 'HD STEEL', 'USMOB', 'ONE', '40HC', 'DG 확인', '대신1']];

  const [line] = buildDispatchDetailLines({ headers, rows });

  assert.equal(line.dgFlag, 'Y');
  assert.equal(line.rfFlag, 'N');
  assert.equal(detailLineToRow(line)[DISPATCH_DETAIL_HEADERS.indexOf(DISPATCH_DETAIL_DG_HEADER)], 'Y');
});

test('상세배차는 지역칸 메모의 업체별 시간을 업체 수량에 맞춰 배정한다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산'];
  const rows = [['2026-05-28', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '대신3,이지2']];

  const lines = buildDispatchDetailLines({
    headers,
    rows,
    comments: { '0:9': '이지: 13 14 대신: 16 18 19' },
  });

  assert.deepEqual(lines.map(line => line.company), ['대신', '대신', '대신', '이지', '이지']);
  assert.deepEqual(lines.map(line => line.dispatchTime), ['16:00', '18:00', '19:00', '13:00', '14:00']);
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
    '작업일자',
    '구분',
    '화주',
    '상차지',
    '작업지',
    '하차지(선적)',
    '운송경로',
    '운송경로코드',
    '고객사',
    '포트(DIST)',
    '포트코드',
    '라인',
    '라인코드',
    '타입',
    '타입코드',
    'DG',
    'RF',
    '업체명',
    '시간',
    'BKG확정',
    'BKG1',
    'BKG2',
    'BKG3',
    'TARGET VESSEL',
    '비고',
    '오더구분코드',
    '화주사코드',
    '반출지(출발)코드',
    '작업지(하차지)코드',
    '반입지(도착)코드',
    '운송서비스코드',
    '운송사코드',
    '컨샤이니',
    '수정일시',
  ]);
  assert.deepEqual(parseDispatchAssignmentCell('민경3, 이지1').map((item) => [item.companyToken, item.count]), [
    ['민경', 3],
    ['이지', 1],
  ]);
  assert.deepEqual(detailLineToRow({
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
    dgFlag: 'N',
    rfFlag: 'N',
    company: '민경',
    dispatchTime: '13',
    confirmedBkg: 'B2',
    bkg1: 'B1',
    bkg2: 'B2',
    bkg3: 'B3',
    targetVessel: 'TV',
    note: 'N',
    glapsOrderTypeCode: '20',
    glapsShipperCode: 'KR10',
    glapsStartLocationCode: 'AAA',
    glapsWorkplaceCode: 'H000_GB',
    glapsDestinationCode: 'KRBNP',
    glapsTransportServiceCode: '',
    glapsCarrierBpCode: 'B000005273',
    glapsConsigneeCode: 'GA0196',
    detailUpdatedAt: '2026-05-24 13:20',
  }), [
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
    'N',
    'N',
    '민경',
    '13:00',
    'B2',
    'B1',
    'B2',
    'B3',
    'TV',
    'N',
    '20',
    'KR10',
    'AAA',
    'H000_GB',
    'KRBNP',
    '',
    'B000005273',
    'GA0196',
    '2026-05-24 13:20',
  ]);
});

test('배차변동 스냅샷은 구버전 클라이언트 재동기화 방지용 스키마 버전을 담는다', () => {
  const sourceRow = Object.assign(
    ['2026-05-27', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '민경1'],
    { webCellMeta: { sourceType: 'glovis' } },
  );
  const line = buildDispatchDetailLines({
    headers: ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산'],
    rows: [sourceRow],
  })[0];
  const snapshot = makeDispatchChangeSnapshotLine(line, 'line-1');

  assert.equal(snapshot.rowContext.changeSchemaVersion, DISPATCH_CHANGE_SCHEMA_VERSION);
  assert.equal(line.sourceType, 'glovis');
  assert.equal(snapshot.rowContext.sourceType, 'glovis');
});

test('상세배차 행은 GLAPS 업로드 첫 시트 양식으로 변환하고 같은 부킹도 1대씩 분리한다', () => {
  assert.deepEqual(GLAPS_UPLOAD_HEADERS.slice(0, 16), [
    '오더구분',
    '선사코드',
    '선사명',
    '화주사 코드',
    '화주사명',
    '반출지(출발)코드 ',
    '작업지(하차지)코드',
    '반입지(도착)코드',
    '운송경로 코드',
    '운송서비스 코드 ',
    '운송서비스명',
    '배차요청일자',
    '배차요청시간',
    '운송사 코드',
    '운송사명',
    '부킹번호',
  ]);
  assert.equal(GLAPS_UPLOAD_HEADERS.length, 62);

  const detailRow = detailLineToRow({
    workDate: '2026-05-25',
    direction: '수출',
    shipper: '글로비스',
    startLocation: '부산신항',
    workplace: 'KCC글라스',
    destination: '부산신항',
    glapsRouteName: '부산신항KCC글라스부산신항',
    glapsRouteCode: 'GLC00035',
    customer: 'HMMA',
    port: 'USMOB',
    glapsPortCode: 'USMOB',
    line: 'ONE',
    glapsLineCode: 'ONE',
    containerType: '40HC',
    glapsTypeCode: '4510',
    company: '자차',
    dispatchTime: '13',
    confirmedBkg: 'SELG43226600',
    bkg1: 'SELG43226600',
    targetVessel: 'TV',
    note: 'N',
    glapsOrderTypeCode: '20',
    glapsShipperCode: 'KR10',
    glapsStartLocationCode: 'KRBNP',
    glapsWorkplaceCode: 'H000_KC',
    glapsDestinationCode: 'KRBNP',
    glapsTransportServiceCode: '5010001',
    glapsCarrierBpCode: 'B000005273',
    glapsConsigneeCode: 'UH03',
  });
  const rows = buildGlapsUploadRowsFromDetailRows({
    headers: DISPATCH_DETAIL_HEADERS,
    rows: [detailRow, detailRow],
  });
  const byHeader = Object.fromEntries(GLAPS_UPLOAD_HEADERS.map((header, idx) => [header, rows[0][idx]]));

  assert.equal(rows.length, 2);
  assert.equal(byHeader['오더구분'], '20');
  assert.equal(byHeader['선사코드'], 'ONE');
  assert.equal(byHeader['화주사 코드'], 'KR10');
  assert.equal(byHeader['반출지(출발)코드 '], 'KRBNP');
  assert.equal(byHeader['작업지(하차지)코드'], 'H000_KC');
  assert.equal(byHeader['반입지(도착)코드'], 'KRBNP');
  assert.equal(byHeader['운송경로 코드'], 'GLC00035');
  assert.equal(byHeader['운송서비스 코드 '], '5010001');
  assert.equal(byHeader['배차요청일자'], '2026-05-25');
  assert.equal(byHeader['배차요청시간'], '13:00');
  assert.equal(byHeader['운송사 코드'], 'B000005273');
  assert.equal(byHeader['부킹번호'], 'SELG43226600');
  assert.equal(byHeader.POD, '');
  assert.equal(byHeader['최종목적지'], 'USMOB');
  assert.equal(byHeader['선적지'], '자차');
  assert.equal(byHeader['컨테이너 규격'], '4510');
  assert.equal(byHeader['컨테이너 수량'], 1);
  assert.equal(byHeader['냉동 여부'], 'N');
  assert.equal(byHeader['컨사이니'], 'UH03');
  assert.equal(rows[1][GLAPS_UPLOAD_HEADERS.indexOf('컨테이너 수량')], 1);
});

test('GLAPS 업로드 냉동/위험물 여부는 상세배차 RF/DG 값을 각각 사용한다', () => {
  const detailRow = detailLineToRow({
    direction: '수출',
    containerType: '20RF',
    glapsTypeCode: '2232',
    dgFlag: 'Y',
    rfFlag: 'Y',
    confirmedBkg: 'RF-BKG',
  });
  const [uploadRow] = buildGlapsUploadRowsFromDetailRows({
    headers: DISPATCH_DETAIL_HEADERS,
    rows: [detailRow],
  });

  assert.equal(detailRow[DISPATCH_DETAIL_HEADERS.indexOf(DISPATCH_DETAIL_DG_HEADER)], 'Y');
  assert.equal(detailRow[DISPATCH_DETAIL_HEADERS.indexOf(DISPATCH_DETAIL_RF_HEADER)], 'Y');
  assert.equal(uploadRow[GLAPS_UPLOAD_HEADERS.indexOf('냉동 여부')], 'Y');
  assert.equal(uploadRow[GLAPS_UPLOAD_HEADERS.indexOf('위험물 여부 ')], 'Y');
});

test('배차변동 GLAPS 업로드 양식은 삭제 변동건을 신규 업로드 대상에서 제외한다', () => {
  const baseRow = detailLineToRow({
    direction: '수출',
    glapsRouteCode: 'GLC00035',
    glapsLineCode: 'ONE',
    glapsTypeCode: '4510',
    confirmedBkg: 'BKG-1',
  });
  const addRow = [...baseRow, '추가', '미확인', '2026-05-25 09:00', '', ''];
  const deleteRow = [...baseRow, '삭제', '미확인', '2026-05-25 09:01', '', ''];

  const rows = buildGlapsUploadRowsFromDetailRows({
    headers: DISPATCH_CHANGE_HEADERS,
    rows: [addRow, deleteRow],
    skipDeleted: true,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0][GLAPS_UPLOAD_HEADERS.indexOf('부킹번호')], 'BKG-1');
});

test('배차변동 비교는 수량 감소를 삭제 이벤트로 감지한다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산', 'BKG1'];
  const beforeLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-26', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '민경5,이지3', 'BKG-A']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `before-${index}`));
  const afterLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-26', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '민경2,이지3', 'BKG-A']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `after-${index}`));

  const events = diffDispatchChangeLines(beforeLines, afterLines, { occurredAt: '2026-05-24T12:00:00Z' });

  assert.equal(events.length, 3);
  assert.deepEqual(events.map(event => event.changeType), ['delete', 'delete', 'delete']);
  assert.equal(events.reduce((sum, event) => sum + event.quantityDelta, 0), -3);
});

test('배차변동 비교는 같은 운송조건 안의 업체 교체를 변경 이벤트로 감지한다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산', 'BKG1'];
  const beforeLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-28', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '칸1', 'BKG-A']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `before-${index}`));
  const afterLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-28', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '이지1', 'BKG-A']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `after-${index}`));

  const events = diffDispatchChangeLines(beforeLines, afterLines, { occurredAt: '2026-05-28T01:00:00Z' });
  const companyIdx = DISPATCH_DETAIL_HEADERS.indexOf('업체명');

  assert.equal(events.length, 1);
  assert.equal(events[0].changeType, 'change');
  assert.equal(events[0].quantityDelta, 0);
  assert.equal(events[0].beforeSnapshot.rowValues[companyIdx], '칸');
  assert.equal(events[0].afterSnapshot.rowValues[companyIdx], '이지');
  assert.deepEqual(getDispatchChangeDiffHeaders(events[0].beforeSnapshot.rowValues, events[0].afterSnapshot.rowValues), ['업체명']);
});

test('배차변동 비교는 반복 행 중 1건 삭제를 같은 운송조건의 다른 행과 섞지 않는다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산', 'BKG1'];
  const beforeLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-28', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '칸1,이지1', 'BKG-A']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `before-${index}`));
  const afterLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-28', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '이지1', 'BKG-A']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `after-${index}`));

  const events = diffDispatchChangeLines(beforeLines, afterLines, { occurredAt: '2026-05-28T01:00:00Z' });

  assert.deepEqual(events.map(event => event.changeType), ['delete']);
  assert.equal(events[0].beforeSnapshot.rowValues[DISPATCH_DETAIL_HEADERS.indexOf('업체명')], '칸');
});

test('배차변동 비교는 같은 항목의 미확인 추가/삭제 순증감 0건을 숨긴다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산', 'BKG1'];
  const [line] = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-27', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '칸1', 'BKG-A']],
  }).map((item, index) => makeDispatchChangeSnapshotLine(item, `line-${index}`));
  const addEvent = {
    eventKey: 'add:test:1',
    changeType: 'add',
    afterSnapshot: line,
    editablePayload: line,
  };
  const deleteEvent = {
    eventKey: 'delete:test:1',
    changeType: 'delete',
    beforeSnapshot: line,
    editablePayload: line,
  };

  assert.equal(makeDispatchNeutralPairKey(addEvent), makeDispatchNeutralPairKey(deleteEvent));
  assert.deepEqual(filterNeutralizedDispatchChangeEvents([addEvent, deleteEvent]), []);
  assert.deepEqual(
    filterNeutralizedDispatchChangeEvents([addEvent, deleteEvent], {
      isConfirmedEvent: event => event.eventKey === addEvent.eventKey,
    }).map(event => event.changeType),
    ['add', 'delete'],
  );
});

test('배차변동 비교는 BKG 변경을 행 이벤트가 아닌 메모 이력 대상으로만 본다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산', 'BKG1'];
  const beforeLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-26', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '민경1', 'BKG-A']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `before-${index}`));
  const afterLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-26', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '민경1', 'BKG-B']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `after-${index}`));

  const events = diffDispatchChangeLines(beforeLines, afterLines, { occurredAt: '2026-05-24T12:00:00Z' });
  const memoChanges = diffDispatchMemoOnlyChanges(beforeLines, afterLines, { occurredAt: '2026-05-24T12:00:00Z' });

  assert.equal(events.length, 0);
  assert.equal(memoChanges.length, 1);
  assert.deepEqual(memoChanges[0].diffHeaders, ['BKG1']);
  assert.equal(memoChanges[0].beforeSnapshot.rowValues[DISPATCH_DETAIL_HEADERS.indexOf('BKG1')], 'BKG-A');
  assert.equal(memoChanges[0].afterSnapshot.rowValues[DISPATCH_DETAIL_HEADERS.indexOf('BKG1')], 'BKG-B');
  assert.equal(memoChanges[0].afterSnapshot.rowValues[DISPATCH_DETAIL_HEADERS.indexOf('BKG확정')], 'BKG-B');
});

test('배차변동 editable payload는 원본 BKG 변경을 반영하되 BKG확정은 보존한다', () => {
  const existing = {
    rowValues: DISPATCH_DETAIL_HEADERS.map(header => (
      header === 'BKG확정' || header === 'BKG1' ? 'BKG-A' : ''
    )),
    rowContext: { bkg1: 'BKG-A', confirmedBkg: 'BKG-A' },
  };
  const next = {
    rowValues: DISPATCH_DETAIL_HEADERS.map(header => (
      header === 'BKG확정' ? 'BKG-B' : header === 'BKG1' ? 'BKG-B' : header === 'TARGET VESSEL' ? 'VESSEL-2' : ''
    )),
    rowContext: { bkg1: 'BKG-B', confirmedBkg: 'BKG-B', targetVessel: 'VESSEL-2' },
  };

  const merged = mergeDispatchMemoOnlyPayload(existing, next);

  assert.equal(merged.rowValues[DISPATCH_DETAIL_HEADERS.indexOf('BKG확정')], 'BKG-A');
  assert.equal(merged.rowValues[DISPATCH_DETAIL_HEADERS.indexOf('BKG1')], 'BKG-B');
  assert.equal(merged.rowValues[DISPATCH_DETAIL_HEADERS.indexOf('TARGET VESSEL')], 'VESSEL-2');
  assert.equal(makeDispatchMemoSignature(existing.rowValues).includes('BKG-A'), true);
});

test('배차변동 비교는 고객사 포트 타입 변경을 변경 이벤트로 감지한다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산', 'BKG1'];
  const beforeLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-26', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '민경1', 'BKG-A']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `line-${index}`));
  const afterLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-26', '수출', '글로비스', 'KCC글라스', '부산신항', 'HMMA', 'USMOB', 'EMC', '20ST', '민경1', 'BKG-Z']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `line-${index}`));

  const events = diffDispatchChangeLines(beforeLines, afterLines, { occurredAt: '2026-05-24T12:00:00Z' });
  const changedHeaders = getDispatchChangeDiffHeaders(events[0].beforeSnapshot.rowValues, events[0].afterSnapshot.rowValues);

  assert.equal(events.length, 1);
  assert.equal(events[0].changeType, 'change');
  assert.equal(events[0].quantityDelta, 0);
  assert.deepEqual(changedHeaders, ['고객사', '포트(DIST)', '타입']);
});

test('배차변동 비교는 선사 라인이 바뀌면 기존 오더 삭제와 신규 오더 추가로 감지한다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산', 'BKG1'];
  const beforeLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-26', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '민경1', 'BKG-A']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `line-${index}`));
  const afterLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-26', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'ONE', '40HC', '민경1', 'BKG-A']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `line-${index}`));

  const events = diffDispatchChangeLines(beforeLines, afterLines, { occurredAt: '2026-05-24T12:00:00Z' });

  assert.deepEqual(events.map(event => event.changeType).sort(), ['add', 'delete']);
  assert.equal(events.reduce((sum, event) => sum + event.quantityDelta, 0), 0);
});

test('배차변동 비교는 지역칸 메모 시간 변경을 변경 이벤트로 감지한다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산', 'BKG1'];
  const beforeLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-28', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '이지1', 'BKG-A']],
    comments: { '0:9': '13' },
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `line-${index}`));
  const afterLines = buildDispatchDetailLines({
    headers,
    rows: [['2026-05-28', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', '이지1', 'BKG-A']],
    comments: { '0:9': '14' },
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `line-${index}`));

  const events = diffDispatchChangeLines(beforeLines, afterLines, { occurredAt: '2026-05-28T01:00:00Z' });
  const changedHeaders = getDispatchChangeDiffHeaders(events[0].beforeSnapshot.rowValues, events[0].afterSnapshot.rowValues);

  assert.equal(events.length, 1);
  assert.equal(events[0].changeType, 'change');
  assert.deepEqual(changedHeaders, ['시간']);
});

test('배차변동 비교는 저장 시점별로 직전 저장분 대비 변경을 새 이벤트로 만든다', () => {
  const headers = ['작업일자', '구분', '화주', '작업지', '선적', '고객사', '포트', '라인', 'TYPE', '부산', 'BKG1'];
  const makeSnapshots = (memo, keyPrefix) => buildDispatchDetailLines({
    headers,
    rows: [['2026-05-28', '수출', '글로비스', 'KCC글라스', '부산신항', 'KAGA', 'USSAV', 'EMC', '40HC', memo, 'BKG-A']],
  }).map((line, index) => makeDispatchChangeSnapshotLine(line, `${keyPrefix}-${index}`));
  const confirmed = makeSnapshots('대신5,이지2', 'confirmed');
  const firstSaved = makeSnapshots('대신4,이지3', 'first');
  const secondSaved = makeSnapshots('대신4,이지2,칸1', 'second');

  const firstEvents = diffDispatchChangeLines(confirmed, firstSaved, { occurredAt: '2026-05-28T01:00:00Z' });
  const secondEvents = diffDispatchChangeLines(firstSaved, secondSaved, { occurredAt: '2026-05-28T02:00:00Z' });

  assert.equal(firstEvents.filter(event => event.changeType === 'change').length, 1);
  assert.equal(firstEvents.filter(event => event.changeType !== 'change').length, 0);
  assert.equal(secondEvents.filter(event => event.changeType === 'change').length, 1);
  assert.equal(secondEvents.filter(event => event.changeType !== 'change').length, 0);
  assert.notEqual(firstEvents[0].eventKey, secondEvents[0].eventKey);
});

test('배차변동 비교는 Nomi/특이사항 변경만으로 변동 이벤트를 만들지 않는다', () => {
  const baseLine = {
    lineNo: 1,
    workDate: '2026-05-27',
    direction: '수출',
    shipper: '글로비스',
    startLocation: '부산신항',
    workplace: 'KCC글라스',
    destination: '부산신항',
    customer: 'KAGA',
    port: 'USSAV',
    line: 'EMC',
    containerType: '40HC',
    company: '칸',
    bkg1: 'BKG-A',
    confirmedBkg: 'BKG-A',
    sourceRowIndex: 1,
    sourceRegion: '부산',
    sourceText: '칸1',
    sourceUnitIndex: 1,
    rawCompany: '칸',
  };

  const beforeLine = makeDispatchChangeSnapshotLine({ ...baseLine, transportRemark: '' }, 'line-1');
  const afterLine = makeDispatchChangeSnapshotLine({ ...baseLine, transportRemark: '모빌' }, 'line-1');
  const events = diffDispatchChangeLines([beforeLine], [afterLine], { occurredAt: '2026-05-27T12:00:00Z' });

  assert.equal(events.length, 0);
});

test('배차변동 비교는 GLAPS 파생코드 보강만으로 변경 이벤트를 만들지 않는다', () => {
  const baseLine = {
    lineNo: 1,
    workDate: '2026-05-26',
    direction: '수출',
    shipper: '글로비스',
    startLocation: '부산신항',
    workplace: 'KCC글라스',
    destination: '부산신항',
    customer: 'HMMA',
    port: 'USMOB',
    line: 'ONE',
    containerType: '40HC',
    company: '자차',
    confirmedBkg: 'BKG-A',
    bkg1: 'BKG-A',
    sourceRowIndex: 0,
    sourceRegion: '부산',
    sourceText: '자차1',
    sourceUnitIndex: 1,
    rawCompany: '자차',
  };
  const beforeLine = makeDispatchChangeSnapshotLine({
    ...baseLine,
    glapsRouteName: '',
    glapsRouteCode: '',
    glapsPortCode: '',
    glapsLineCode: '',
    glapsTypeCode: '',
    glapsOrderTypeCode: '',
    glapsShipperCode: '',
    glapsStartLocationCode: '',
    glapsWorkplaceCode: '',
    glapsDestinationCode: '',
    glapsCarrierBpCode: '',
    glapsConsigneeCode: '',
  }, 'line-1');
  const afterLine = makeDispatchChangeSnapshotLine({
    ...baseLine,
    glapsRouteName: '부산신항KCC글라스부산신항',
    glapsRouteCode: 'GLC00035',
    glapsPortCode: 'USMOB',
    glapsLineCode: 'ONE',
    glapsTypeCode: '4510',
    glapsOrderTypeCode: '20',
    glapsShipperCode: 'KR10',
    glapsStartLocationCode: 'KRBNP',
    glapsWorkplaceCode: 'H000_KC',
    glapsDestinationCode: 'KRBNP',
    glapsCarrierBpCode: 'B000005273',
    glapsConsigneeCode: 'UH03',
  }, 'line-1');

  const events = diffDispatchChangeLines([beforeLine], [afterLine], { occurredAt: '2026-05-24T12:00:00Z' });

  assert.equal(events.length, 0);
});
