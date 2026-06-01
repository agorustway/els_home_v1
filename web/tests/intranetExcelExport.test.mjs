import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import {
  addIntranetExportWorksheet,
  normalizeIntranetExportSheet,
  safeExcelFileName,
  toIntranetExcelTimeText,
  toIntranetExcelTimeValue,
} from '../utils/intranetExcelExport.mjs';

test('인트라넷 엑셀 공통 유틸은 상세배차 기준 제목, 메타, 헤더 스타일을 적용한다', () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = addIntranetExportWorksheet(workbook, {
    title: '아산 상세배차내역',
    generatedAt: '다운로드 2026. 5. 26. / 1건',
    sheetName: '상세배차내역',
    headers: ['작업지', '오더(계)', '비고'],
    rows: [['글로비스1포장장', '1,200', '확인']],
  });

  assert.equal(sheet.name, '상세배차내역');
  assert.equal(sheet.getCell('A1').value, '아산 상세배차내역');
  assert.equal(sheet.getCell('A2').value, '다운로드 2026. 5. 26. / 1건');
  assert.equal(sheet.getCell('A3').value, '작업지');
  assert.equal(sheet.getCell('A3').fill.fgColor.argb, 'FF1F5673');
  assert.equal(sheet.getCell('B4').value, 1200);
  assert.equal(sheet.getCell('B4').numFmt, '#,##0');
  assert.equal(sheet.views[0].ySplit, 3);
  assert.equal(sheet.autoFilter.from.row, 3);
  assert.equal(sheet.autoFilter.to.column, 3);
});

test('인트라넷 엑셀 공통 유틸은 파일명과 시트 입력값을 안전하게 정리한다', () => {
  const sheet = normalizeIntranetExportSheet({
    title: '테스트',
    sheetName: '금지/문자*시트',
    headers: ['구간(KM)', '메모'],
    rows: [['12', '  확인  ']],
  }, { numericHeaders: ['구간(KM)'] });

  assert.deepEqual(sheet.rows, [[12, '확인']]);
  assert.equal(safeExcelFileName('안전운임:구간조회', '다운로드.xlsx'), '안전운임_구간조회.xlsx');
});

test('인트라넷 엑셀 공통 유틸은 시간 컬럼을 HH:MM 텍스트로 저장한다', () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = addIntranetExportWorksheet(workbook, {
    sheetName: '상세배차내역',
    headers: ['업체명', '시간', '배차요청시간'],
    rows: [['이지', '08', '16:40']],
  });

  assert.equal(toIntranetExcelTimeValue('08'), 8 / 24);
  assert.equal(toIntranetExcelTimeText('08'), '08:00');
  assert.equal(sheet.getCell('B2').value, '08:00');
  assert.equal(sheet.getCell('B2').numFmt, '@');
  assert.equal(sheet.getCell('C2').value, '16:40');
  assert.equal(sheet.getCell('C2').numFmt, '@');
});
