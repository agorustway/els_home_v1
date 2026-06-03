import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  GLAPS_CONTAINER_ELS_HEADERS,
  buildGlapsContainerUploadData,
  formatGlapsContainerDate,
  formatGlapsContainerTime,
  glapsContainerRowsToArrays,
} from '../utils/glapsContainerUploadBuilder.mjs';
import { GLAPS_UPLOAD_HEADERS } from '../utils/asanGlapsUploadExport.mjs';
import {
  GLAPS_FORMULA_HELPER_SHEET_NAME,
  GLAPS_FORMULA_SOURCE_SCAN_LAST_ROW,
  buildGlapsContainerRowNumberFormula,
  buildHelperIndexFormula,
  removeUnsafeFilterDatabaseDefinedNames,
  translateFormulaRowReferences,
  wrapFormulaWithInputGuard,
} from '../utils/glapsContainerFormulaTemplate.mjs';
import {
  buildExternalSourceSheetName,
  findLatestContainerSourceWorkbook,
  removeAbsoluteExternalLinkXmlArtifacts,
} from '../scripts/build-glaps-container-formula-workbook.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function rowWith(values = {}) {
  const row = [];
  Object.entries(values).forEach(([idx, value]) => {
    row[Number(idx)] = value;
  });
  return row;
}

function templateRows() {
  return [
    rowWith({
      0: 'ONE',
      1: 'ONE',
      2: '[ON] ONE',
      3: 'ONE',
      6: '아산 2포장장',
      7: 'H000_GB',
      11: 'KIN',
      12: 'GA0196',
      21: '인도',
      22: 'INKAT',
      46: '현대글로비스',
      47: 'KR10',
      49: 'ELS솔루션',
      50: '1011',
      51: 'B000005273',
      53: 'BUSAN(NEW)',
      54: 'KRBNP',
      55: '부산신항',
      59: 'DGT(신)',
      60: 'DGTBC',
      61: '동원글로벌컨테이너부산',
      63: 'KRBNP',
      71: 'H000_GB',
      73: 'EAS',
    }),
    rowWith({
      0: '성도글로비스',
      1: '성도글로비스',
      2: '[CG] 성도글로비스',
      3: 'CG',
      6: '아산 1포장장',
      7: 'H000_GA',
      11: 'KMX',
      12: 'MH03',
      21: '코퍼',
      22: 'SIKOP',
      53: '의왕ICD',
      54: 'KRUWN',
      55: '의왕(부곡)',
      71: 'H000_GA',
      73: 'EAS',
    }),
  ];
}

function ckdRows() {
  return [
    ['GA0196', 'KIN'],
    ['MH03', 'KMX'],
    ['MH03', 'KMM'],
  ];
}

const sourceHeaders = [
  '오더구분',
  '작업지(하차지)도착요청일',
  '작업지(하차지)도착요청시간',
  '픽업부킹번호',
  '선사코드',
  '선사명',
  'POL',
  'Pod',
  '최종목적지',
  '작업지(하차지)명',
  '컨샤이니명',
  '선적지',
  '화주사',
  '컨테이너 번호',
  '컨규격',
  '봉인번호',
  '차량번호',
  'ETD',
  'ETA',
  '냉동',
  '위험물',
  '운송사코드',
  '운송사',
  '운송경로코드',
  '반출지 코드',
  '반출지명(출발)',
  '작업지 코드',
  '반출CY',
  '반입CY',
  '편성번호',
  '통지사항',
  '운송서비스',
  '운송서비스코드',
];

test('컨테이너배차관리 행을 GLAPS 업로드 값으로 역매칭한다', () => {
  const result = buildGlapsContainerUploadData({
    sourceRows: [
      sourceHeaders,
      [
        '수출',
        '2026-06-04 00:00:00',
        '16:00',
        '005GX17204',
        'ONE',
        '오션네트워크익스프레스',
        '',
        '',
        'INKAT',
        '[GB]아산 2포장장 (오토쎌)',
        'KIN',
        '자차',
        '현대글로비스주식회사',
        'TEMU1234567',
        '4510',
        'SEAL-1',
        '12가3456',
        '2026-06-03 00:00:00',
        '2026-06-05 00:00:00',
        'N',
        'N',
        '1011',
        '㈜이엘에스솔루션',
        'GLC00263',
        'KRBNP',
        '부산신항',
        'H000_GB',
        '',
        'DGTBC',
        'F-001',
        '현장 메모',
        '컨테이너_수출',
        '5010001',
      ],
    ],
    glapsCodeRows: templateRows(),
    ckdCustomerRows: ckdRows(),
  });

  assert.equal(result.stats.totalRows, 1);
  assert.equal(result.issues.length, 0);

  const [row] = result.rows;
  assert.equal(row.upload['오더구분'], '20');
  assert.equal(row.upload['선사코드'], 'ONE');
  assert.equal(row.upload['화주사 코드'], 'KR10');
  assert.equal(row.upload['반출지(출발)코드 '], 'KRBNP');
  assert.equal(row.upload['작업지(하차지)코드'], 'H000_GB');
  assert.equal(row.upload['반입지(도착)코드'], 'KRBNP');
  assert.equal(row.upload['운송경로 코드'], 'GLC00263');
  assert.equal(row.upload['운송서비스 코드 '], '5010001');
  assert.equal(row.upload['배차요청일자'], '2026-06-04');
  assert.equal(row.upload['배차요청시간'], '1600');
  assert.equal(row.upload['운송사 코드'], 'B000005273');
  assert.equal(row.upload['부킹번호'], '005GX17204');
  assert.equal(row.upload['컨테이너 번호'], 'TEMU1234567');
  assert.equal(row.upload.POD, '');
  assert.equal(row.upload['최종목적지'], 'INKAT');
  assert.equal(row.upload['컨테이너 규격'], '4510');
  assert.equal(row.upload['컨테이너 수량'], 1);
  assert.equal(row.upload['냉동 여부'], 'N');
  assert.equal(row.upload['위험물 여부 '], 'N');
  assert.equal(row.upload['컨사이니'], 'GA0196');
  assert.equal(row.upload['실출하지'], 'EAS');

  assert.equal(row.els['배차시간'], '16:00');
  assert.equal(row.els['구분(오전,오후)'], '오후');
  assert.equal(row.els['포장장'], '아산 2포장장');
  assert.equal(row.els['40HC'], 1);
  assert.equal(row.els['ContainerNo.'], 'TEMU1234567');

  const arrays = glapsContainerRowsToArrays(result.rows);
  assert.equal(arrays[0].elsValues[GLAPS_CONTAINER_ELS_HEADERS.indexOf('실출하지')], 'EAS');
  assert.equal(arrays[0].uploadValues[GLAPS_UPLOAD_HEADERS.indexOf('운송사 코드')], 'B000005273');
});

test('급행 운송경로와 미정의 반출지는 값 보존 후 확인필요로 분류한다', () => {
  const result = buildGlapsContainerUploadData({
    sourceRows: [
      sourceHeaders,
      [
        '수출',
        '2026-06-04',
        '18:00',
        'BKG-UNKNOWN',
        'CG',
        '[CG] 성도글로비스',
        '',
        '',
        'SIKOP',
        '[GA]아산 1포장장 (공성실업)',
        'KMX/KMM',
        '셔틀',
        '현대글로비스주식회사',
        '',
        '2210',
        '',
        '',
        '',
        '',
        'N',
        'Y',
        '1011',
        '㈜이엘에스솔루션',
        'AAAAAAAAA',
        'AAA',
        '미정의',
        'H000_GA',
        '',
        '',
        'F-002',
        '',
        '컨테이너_수출',
        '5010001',
      ],
    ],
    glapsCodeRows: templateRows(),
    ckdCustomerRows: ckdRows(),
  });

  const [row] = result.rows;
  assert.equal(row.upload['선사코드'], 'CG');
  assert.equal(row.upload['컨사이니'], 'MH03');
  assert.equal(row.upload['운송경로 코드'], 'AAAAAAAAA');
  assert.equal(row.upload['반출지(출발)코드 '], 'AAA');
  assert.equal(row.upload['위험물 여부 '], 'Y');
  assert.equal(row.els['20'], 1);
  assert.equal(row.els['구분(오전,오후)'], '잔업');
  assert.equal(result.issues.some(issue => issue.field === '운송경로코드' && issue.value === 'AAAAAAAAA'), true);
  assert.equal(result.issues.some(issue => issue.field === '반출지 코드' && issue.value === 'AAA'), true);
});

test('에버그린 다운로드 선사코드 EMC는 GLAPS 코드 EMA로 보정한다', () => {
  const result = buildGlapsContainerUploadData({
    sourceRows: [
      sourceHeaders,
      [
        '수출',
        '2026-06-04',
        '08:00',
        'BKG-EMC',
        'EMC',
        '에버그린',
        '',
        '',
        'INKAT',
        '[GB]아산 2포장장 (오토쎌)',
        'KIN',
        '자차',
        '현대글로비스주식회사',
        '',
        '4510',
        '',
        '',
        '',
        '',
        'N',
        'N',
        '1011',
        '㈜이엘에스솔루션',
        'GLC00058',
        'KRBNP',
        '부산신항',
        'H000_GB',
        '',
        'DGTBC',
        'F-003',
        '',
        '컨테이너_수출',
        '5010001',
      ],
    ],
    glapsCodeRows: templateRows(),
    ckdCustomerRows: ckdRows(),
  });

  assert.equal(result.rows[0].upload['선사코드'], 'EMA');
  assert.equal(result.issues.some(issue => issue.field === '선사코드'), false);
});

test('날짜와 시간은 GLAPS 업로드용 텍스트로 정규화한다', () => {
  assert.equal(formatGlapsContainerDate('2026.6.4 00:00'), '2026-06-04');
  assert.equal(formatGlapsContainerTime('8:5'), '08:05');
  assert.equal(formatGlapsContainerTime('8:5', { compact: true }), '0805');
});

test('수식형 자동 템플릿은 원본 행수와 출력 행수를 분리한다', () => {
  const externalSourceSheet = '[컨테이너배차관리___20260603134247.xlsx]컨테이너배차관리__';
  const formula = buildGlapsContainerRowNumberFormula({
    sourceSheetName: externalSourceSheet,
    containerColumnLetter: 'X',
    ordinalCell: 'A7',
  });
  assert.match(formula, /\[컨테이너배차관리___20260603134247\.xlsx\]컨테이너배차관리__/);
  assert.match(formula, new RegExp(`\\$X\\$2:\\$X\\$${GLAPS_FORMULA_SOURCE_SCAN_LAST_ROW}`));
  assert.match(formula, /A7/);
  assert.match(
    buildHelperIndexFormula(externalSourceSheet, 'X', '$B2'),
    /IF\(INDEX\('\[컨테이너배차관리___20260603134247\.xlsx\]컨테이너배차관리__'!\$X:\$X,\$B2\)="","",INDEX/,
  );
  assert.equal(
    wrapFormulaWithInputGuard(
      translateFormulaRowReferences('VLOOKUP(F3,GLAPS정리!$G$3:$J$114,2,0)+IF(I3="",0,$AC$1)', 3, 15),
      15,
    ),
    'IF($B15="","",VLOOKUP(F15,GLAPS정리!$G$3:$J$114,2,0)+IF(I15="",0,$AC$1))',
  );

  const scriptSource = fs.readFileSync(path.join(webRoot, 'scripts/build-glaps-container-formula-workbook.mjs'), 'utf8');
  assert.match(scriptSource, /GLAPS_FORMULA_SOURCE_SCAN_LAST_ROW/);
  assert.match(scriptSource, /GLAPS_FORMULA_OUTPUT_ROW_COUNT/);
  assert.match(scriptSource, /GLAPS_CONTAINER_SOURCE_SHEET_NAME/);
  assert.match(scriptSource, /findLatestContainerSourceWorkbook/);
  assert.match(scriptSource, /buildExternalSourceSheetName/);
  assert.match(scriptSource, /makeExternalLinksPortable/);
  assert.match(scriptSource, /sourceSelectMode/);
  assert.match(scriptSource, /containerColumnNumber/);
  assert.match(scriptSource, /excelColumnLetter\(col \+ 1\)/);
  assert.match(scriptSource, /translateFormulaRowReferences/);
  assert.match(scriptSource, /guardUploadFormulaBlankDriver/);
  assert.match(scriptSource, /GLAPS 26년 6월 업로드양식\.xlsx/);
  assert.match(scriptSource, /최신파일참조/);
  assert.doesNotMatch(scriptSource, /workbook\.xlsx\.writeFile/);
  assert.doesNotMatch(scriptSource, /sourceMatrix/);
  assert.equal(GLAPS_FORMULA_HELPER_SHEET_NAME, 'GLAPS자동계산');
});

test('수식형 자동 템플릿은 같은 폴더의 최신 컨테이너배차관리 파일을 선택한다', async () => {
  const tempDir = path.join(webRoot, '..', '.tmp_test', 'glaps-latest-source');
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  try {
    fs.writeFileSync(path.join(tempDir, '컨테이너배차관리___20260603110551.xlsx'), '');
    fs.writeFileSync(path.join(tempDir, '컨테이너배차관리___20260603134247.xlsx'), '');
    fs.writeFileSync(path.join(tempDir, '~$컨테이너배차관리___20260603150000.xlsx'), '');
    fs.writeFileSync(path.join(tempDir, 'GLAPS 26년 6월 업로드양식.xlsx'), '');

    const latest = await findLatestContainerSourceWorkbook(tempDir);
    assert.equal(path.basename(latest), '컨테이너배차관리___20260603134247.xlsx');
    assert.equal(
      buildExternalSourceSheetName(latest, '컨테이너배차관리__'),
      '[컨테이너배차관리___20260603134247.xlsx]컨테이너배차관리__',
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('수식형 자동 템플릿은 원본 시트를 복사하지 않고 외부참조 수식으로 연결한다', () => {
  const psSource = fs.readFileSync(path.join(webRoot, 'scripts/build-glaps-container-formula-workbook.ps1'), 'utf8');

  assert.match(psSource, /\$sourceWorkbook = \$excel\.Workbooks\.Open\(\$SourceDataPath/);
  assert.match(psSource, /\$helperSheet = \$workbook\.Worksheets\.Add\(\$missing, \$elsSheet\)/);
  assert.match(psSource, /\$containerColumnNumber = \[int\]\$plan\.containerColumnNumber/);
  assert.match(psSource, /\$workbook\.LinkSources\(1\)/);
  assert.match(psSource, /\$workbook\.UpdateLinks = 2/);
  assert.doesNotMatch(psSource, /\$sourceSheet\.Copy\(\$missing, \$elsSheet\)/);
  assert.doesNotMatch(psSource, /sourceMergeAreas/);
  assert.doesNotMatch(psSource, /\$copiedSourceSheet/);
  assert.doesNotMatch(psSource, /\.Range\(\$plan\.sourceRange\)\.Value2 = \$sourceMatrix/);
});

test('수식형 자동 템플릿은 외부참조의 절대경로 흔적을 제거해 폴더 이동에 대응한다', () => {
  const sourceWorkbookPath = 'C:\\Users\\hoon\\Desktop\\els_home_v1\\work-docs\\glaps\\컨테이너배차관리___20260603134247.xlsx';
  const workbookXml = [
    '<workbook xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">',
    '<mc:AlternateContent><mc:Choice Requires="x15"><x15ac:absPath url="C:\\Users\\hoon\\Desktop\\els_home_v1\\work-docs\\glaps\\" xmlns:x15ac="http://schemas.microsoft.com/office/spreadsheetml/2010/11/ac"/></mc:Choice></mc:AlternateContent>',
    '<externalReferences><externalReference r:id="rId5"/></externalReferences>',
    '</workbook>',
  ].join('');
  const externalLinkXml = [
    '<externalLink xmlns:xxl21="http://schemas.microsoft.com/office/spreadsheetml/2021/extlinks2021">',
    '<externalBook r:id="rId1"><xxl21:alternateUrls><xxl21:absoluteUrl r:id="rId2"/></xxl21:alternateUrls></externalBook>',
    '</externalLink>',
  ].join('');
  const externalLinkRelsXml = [
    '<Relationships>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath" Target="file:///C:\\Users\\hoon\\Desktop\\els_home_v1\\work-docs\\glaps\\컨테이너배차관리___20260603134247.xlsx" TargetMode="External"/>',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath" Target="컨테이너배차관리___20260603134247.xlsx" TargetMode="External"/>',
    '</Relationships>',
  ].join('');

  const patched = removeAbsoluteExternalLinkXmlArtifacts({
    workbookXml,
    externalLinkXml,
    externalLinkRelsXml,
    sourceWorkbookPath,
  });

  assert.equal(patched.removedAbsoluteLinks, 1);
  assert.doesNotMatch(patched.workbookXml, /absPath|els_home_v1/);
  assert.doesNotMatch(patched.externalLinkXml, /alternateUrls|absoluteUrl/);
  assert.doesNotMatch(patched.externalLinkRelsXml, /file:\/\/\/|els_home_v1/);
  assert.match(patched.externalLinkRelsXml, /Target="컨테이너배차관리___20260603134247\.xlsx"/);
});

test('수식형 자동 템플릿은 엑셀 복구창을 부르는 전역 자동필터 예약 이름을 제거한다', () => {
  const workbookXml = [
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<definedNames>',
    '<definedName name="_xlnm._FilterDatabase">&apos;GLAPS컨테이너배차관리&apos;!$A$1:$DX$1</definedName>',
    '<definedName name="_xlnm._FilterDatabase" localSheetId="2">&apos;ELS&apos;!$B$2:$CL$2</definedName>',
    '<definedName name="정상범위">ELS!$A$1</definedName>',
    '</definedNames>',
    '</workbook>',
  ].join('');
  const { xml, removed } = removeUnsafeFilterDatabaseDefinedNames(workbookXml);
  assert.equal(removed, 1);
  assert.doesNotMatch(xml, /GLAPS컨테이너배차관리/);
  assert.match(xml, /localSheetId="2"/);
  assert.match(xml, /정상범위/);
});
