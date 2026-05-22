import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeDispatchWebCellFieldKey,
  validateDispatchWebCellValue,
} from '../utils/asanDispatchWebCellFields.mjs';
import {
  applyDispatchWebCellOverlay,
  buildWebCellMap,
  createDispatchRowMetaBuilder,
  normalizeDispatchHeadersForType,
  normalizeDispatchRecordHeaders,
  shouldIncludeDispatchRow,
} from '../utils/asanDispatchWebCells.mjs';

const headers = [
  '구분',
  '화주',
  '담당자',
  '작업지',
  '고객사(국가)',
  '포트(도착항)',
  '라인(선사명)',
  'TYPE',
  '오더(계)',
  'BKG1',
  'BKG2',
  'BKG3',
  'TARGET VESSEL',
  '비고',
];

test('WEB 전용 컬럼은 표기 흔들림을 표준 field_key로 정규화한다', () => {
  assert.equal(normalizeDispatchWebCellFieldKey('BKG1'), 'BKG1');
  assert.equal(normalizeDispatchWebCellFieldKey('target vessel'), 'TARGET_VESSEL');
  assert.equal(normalizeDispatchWebCellFieldKey('VECELL'), 'TARGET_VESSEL');
  assert.equal(normalizeDispatchWebCellFieldKey('비고'), 'NOTE');
});

test('중복된 BKG 헤더는 WEB 전용 순서대로 BKG1/BKG2/BKG3로 정리한다', () => {
  assert.deepEqual(
    normalizeDispatchHeadersForType(['BookingNo/InvoiceNo', '비고', 'BKG1', 'BKG1', 'BKG3', 'TARGET VESSEL'], 'mobis'),
    ['BookingNo/InvoiceNo', '비고', 'BKG1', 'BKG2', 'BKG3', 'TARGET VESSEL'],
  );
});

test('BKG와 TARGET VESSEL은 영문·숫자·기호만 허용한다', () => {
  assert.deepEqual(validateDispatchWebCellValue('BKG1', ' 005GX11331 / A-1 '), {
    ok: true,
    value: '005GX11331 / A-1',
    error: '',
  });
  assert.equal(validateDispatchWebCellValue('TARGET VESSEL', '현대호').ok, false);
});

test('비고는 한글·영문·숫자·기호를 허용하고 제어문자는 막는다', () => {
  assert.deepEqual(validateDispatchWebCellValue('비고', '안전화 미착용시 작업불가 #1'), {
    ok: true,
    value: '안전화 미착용시 작업불가 #1',
    error: '',
  });
  assert.equal(validateDispatchWebCellValue('비고', '정상\u0001오류').ok, false);
});

test('행 서명은 WEB 전용 컬럼 값을 제외하고 동일 행을 안정적으로 식별한다', () => {
  const buildMetaA = createDispatchRowMetaBuilder({
    dispatchType: 'glovis',
    targetDate: '2026-05-18',
    headers,
  });
  const buildMetaB = createDispatchRowMetaBuilder({
    dispatchType: 'glovis',
    targetDate: '2026-05-18',
    headers,
  });
  const rowA = ['수출', '글로비스', '강수지', '글로비스1포장장', 'KASK', 'SIKOP', 'CMA', '40HC', '3', '', '', '', '', ''];
  const rowB = ['수출', '글로비스', '강수지', '글로비스1포장장', 'KASK', 'SIKOP', 'CMA', '40HC', '3', 'ABC123', '', '', 'VESSEL-1', '비고 변경'];

  assert.equal(buildMetaA(rowA, 0).rowSignature, buildMetaB(rowB, 0).rowSignature);
});

test('비고 오른쪽 특이사항은 행 서명 안정값에서 제외한다', () => {
  const noteHeaders = [
    '구분',
    '화주',
    '담당자',
    '작업지',
    '국가명',
    '도착항',
    '라인(선사명)',
    'TYPE',
    '계',
    '비고',
    '특이사항',
  ];
  const buildMetaA = createDispatchRowMetaBuilder({
    dispatchType: 'mobis',
    targetDate: '2026-05-22',
    headers: noteHeaders,
  });
  const buildMetaB = createDispatchRowMetaBuilder({
    dispatchType: 'mobis',
    targetDate: '2026-05-22',
    headers: noteHeaders,
  });
  const rowA = ['수출', '모비스AS', '강주희', '모비스천안', '미국', '마이애미', 'CMA', '40HC', '1', '', ''];
  const rowB = ['수출', '모비스AS', '강주희', '모비스천안', '미국', '마이애미', 'CMA', '40HC', '1', '', '엑셀 특이사항'];

  assert.equal(buildMetaA(rowA, 0).rowSignature, buildMetaB(rowB, 0).rowSignature);
});

test('동일한 핵심값의 중복 행은 occurrence 번호로 분리한다', () => {
  const buildMeta = createDispatchRowMetaBuilder({
    dispatchType: 'glovis',
    targetDate: '2026-05-18',
    headers,
  });
  const row = ['수출', '글로비스', '강수지', '글로비스1포장장', 'KASK', 'SIKOP', 'CMA', '40HC', '3', '', '', '', '', ''];

  const first = buildMeta(row, 0).rowSignature;
  const second = buildMeta(row, 1).rowSignature;
  assert.notEqual(first, second);
  assert.match(first, /:001$/);
  assert.match(second, /:002$/);
});

test('익명 TYPE 헤더 복구 후 통합/개별 WEB 셀 행 서명이 동일하다', () => {
  const mobisAnon = normalizeDispatchRecordHeaders({
    type: 'mobis',
    headers: ['구분', '화주', '담당자', '작업지', '국가명', '도착항', 'Nomi,구간', '선사명', 'col_15', '계'],
  });
  const mobisNamed = {
    headers: ['구분', '화주', '담당자', '작업지', '국가명', '도착항', 'Nomi,구간', '선사명', 'TYPE', '계'],
  };
  const mobisRow = ['수출', '모비스AS', '강주희', '모비스천안', '호주', '시드니', '05/12/27~', 'CMA', '40HC', '1'];
  const mobisMetaA = createDispatchRowMetaBuilder({
    dispatchType: 'mobis',
    targetDate: '2026-05-22',
    headers: mobisAnon.headers,
  })(mobisRow, 0);
  const mobisMetaB = createDispatchRowMetaBuilder({
    dispatchType: 'mobis',
    targetDate: '2026-05-22',
    headers: mobisNamed.headers,
  })(mobisRow, 0);

  const glovisAnon = normalizeDispatchRecordHeaders({
    type: 'glovis',
    headers: ['구분', '화주', '담당자', '작업지', '고객사', '포트', '특이사항(Nomi,구간)', '라인', 'col_12', '오더'],
  });
  const glovisNamed = {
    headers: ['구분', '화주', '담당자', '작업지', '고객사', '포트', '특이사항(Nomi,구간)', '라인', 'T', '오더'],
  };
  const glovisRow = ['수출', '글로비스', '강수지', '글로비스KD센터1포장장', 'KASK', 'SIKOP', '', 'CMA', '40HC', '3'];
  const glovisMetaA = createDispatchRowMetaBuilder({
    dispatchType: 'glovis',
    targetDate: '2026-05-22',
    headers: glovisAnon.headers,
  })(glovisRow, 0);
  const glovisMetaB = createDispatchRowMetaBuilder({
    dispatchType: 'glovis',
    targetDate: '2026-05-22',
    headers: glovisNamed.headers,
  })(glovisRow, 0);

  assert.equal(mobisAnon.headers[8], 'TYPE');
  assert.equal(glovisAnon.headers[8], 'T');
  assert.equal(mobisMetaA.rowSignature, mobisMetaB.rowSignature);
  assert.equal(glovisMetaA.rowSignature, glovisMetaB.rowSignature);
});

test('WEB 셀 오버레이는 익명 TYPE 헤더로 저장된 기존 값을 레거시 서명으로 읽는다', () => {
  const legacyHeaders = ['구분', '화주', '담당자', '작업지', '국가명', '도착항', 'Nomi,구간', '선사명', 'col_15', '계', 'BKG1'];
  const normalizedRecord = normalizeDispatchRecordHeaders({
    type: 'mobis',
    headers: legacyHeaders,
  });
  const row = ['수출', '모비스AS', '강주희', '모비스천안', '호주', '시드니', '05/12/27~', 'CMA', '40HC', '1', ''];
  const legacyMeta = createDispatchRowMetaBuilder({
    dispatchType: 'mobis',
    targetDate: '2026-05-22',
    headers: legacyHeaders,
  })(row, 0);
  const canonicalMeta = createDispatchRowMetaBuilder({
    dispatchType: 'mobis',
    targetDate: '2026-05-22',
    headers: normalizedRecord.headers,
    legacyHeaders: normalizedRecord.webCellLegacyHeaders,
  })(row, 0);
  const cellMap = buildWebCellMap([
    {
      branch_id: 'asan',
      dispatch_type: 'mobis',
      target_date: '2026-05-22',
      row_signature: legacyMeta.rowSignature,
      field_key: 'BKG1',
      value: 'AEM0215819',
    },
  ]);
  const applied = applyDispatchWebCellOverlay({
    headers: normalizedRecord.headers,
    row,
    meta: canonicalMeta,
    cellMap,
    enabled: true,
  });

  assert.notEqual(canonicalMeta.rowSignature, legacyMeta.rowSignature);
  assert.deepEqual(canonicalMeta.legacyRowSignatures, [legacyMeta.rowSignature]);
  assert.equal(applied[10], 'AEM0215819');
});

test('오더칸 문자·오류값은 WEB 오버레이 대상 행에서 제외한다', () => {
  assert.equal(shouldIncludeDispatchRow(headers, ['수출', '', '', '', '', '', '', '40HC', '오류'], 'glovis'), false);
  assert.equal(shouldIncludeDispatchRow(headers, ['수출', '', '', '', '', '', '', '40HC', '2'], 'glovis'), true);
});

test('오버레이 활성화 후 WEB 전용 컬럼은 DB 값만 표시하고 엑셀 값은 비운다', () => {
  const buildMeta = createDispatchRowMetaBuilder({
    dispatchType: 'glovis',
    targetDate: '2026-05-18',
    headers,
  });
  const row = ['수출', '글로비스', '강수지', '글로비스1포장장', 'KASK', 'SIKOP', 'CMA', '40HC', '3', 'EXCEL-BKG', '', '', 'EXCEL-VESSEL', 'EXCEL-NOTE'];
  const meta = buildMeta(row, 0);
  const cellMap = buildWebCellMap([
    {
      branch_id: 'asan',
      dispatch_type: 'glovis',
      target_date: '2026-05-18',
      row_signature: meta.rowSignature,
      field_key: 'BKG1',
      value: 'WEB-BKG',
    },
  ]);

  const applied = applyDispatchWebCellOverlay({ headers, row, meta, cellMap, enabled: true });
  assert.equal(applied[9], 'WEB-BKG');
  assert.equal(applied[12], '');
  assert.equal(applied[13], '');
});
