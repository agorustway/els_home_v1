import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  GLAPS_ALIAS_TEMPLATE_HEADERS,
  GLAPS_REVIEW_STATUS_LABELS,
  GLAPS_ROUTE_TEMPLATE_HEADERS,
  buildGlapsDispatchRouteFingerprints,
  buildGlapsRouteDisplayName,
  buildGlapsRouteFingerprint,
  cleanGlapsText,
  formatGlapsAliasType,
  getGlapsRouteBillingStartLocation,
  getGlapsRouteLocationCodeCandidates,
  getGlapsRouteLocationDisplayName,
  getGlapsRouteLocationPrimaryCode,
  getGlapsRouteShipperCode,
  getGlapsRouteWaypointCode,
  getGlapsRouteMatchQuery,
  inferGlapsAliasTypeFromReviewNote,
  inferGlapsRouteParts,
  isDiscardedGlapsAliasReviewNote,
  normalizeGlapsAliasType,
  parseGlapsAliasTemplateSheets,
  parseGlapsMasterSheets,
  parseGlapsRouteTemplateSheets,
  resolveGlapsAliasType,
} from '../utils/glapsMasterData.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('GLAPS 텍스트 정리는 양끝 공백만 제거하고 중간 공백은 유지한다', () => {
  assert.equal(cleanGlapsText('  글로비스  KD센터  '), '글로비스  KD센터');
});

test('GLAPS 수정양식 다운로드 헤더는 현업이 읽는 한국어 컬럼명을 사용한다', () => {
  assert.deepEqual(GLAPS_ROUTE_TEMPLATE_HEADERS, [
    'ID',
    '화주사코드',
    '상차지',
    '상차지(청구)',
    '경유지(ELS)',
    '경유지코드',
    '하차지(선적)',
    '경유지',
    '운송경로명',
    '운송경로코드',
    '매칭상태',
    '검수메모',
    '수정출처',
    '수정일시',
    '삭제(Y)',
  ]);
  assert.deepEqual(GLAPS_ALIAS_TEMPLATE_HEADERS, [
    'ID',
    '매핑항목',
    'ELS 매치코드',
    'ELS 디스크립션(설명)',
    'GLAPS 디스크립션(설명)',
    '최종코드(BP)',
    '매칭상태',
    '검수메모',
    '수정출처',
    '수정일시',
    '삭제(Y)',
  ]);
  assert.deepEqual(GLAPS_REVIEW_STATUS_LABELS, {
    ready: '확정',
    needs_mapping: '조정필요',
    missing_route_code: '코드없음',
  });
});

test('GLAPS 매핑항목은 한글 표시와 영문 내부값을 서로 변환한다', () => {
  assert.equal(formatGlapsAliasType('order_type'), '수출입코드');
  assert.equal(formatGlapsAliasType('container_type'), '컨테이너규격');
  assert.equal(formatGlapsAliasType('actual_unloading'), '실출하지코드');
  assert.equal(formatGlapsAliasType('carrier'), '운송사');
  assert.equal(normalizeGlapsAliasType('수출입코드'), 'order_type');
  assert.equal(normalizeGlapsAliasType('컨테이너규격'), 'container_type');
  assert.equal(normalizeGlapsAliasType('실출하지코드'), 'actual_unloading');
  assert.equal(normalizeGlapsAliasType('운송사'), 'carrier');
  assert.equal(normalizeGlapsAliasType('line'), 'line');
  assert.equal(inferGlapsAliasTypeFromReviewNote('실출하지코드'), 'actual_unloading');
  assert.equal(resolveGlapsAliasType('기타', '선사코드'), 'line');
  assert.equal(isDiscardedGlapsAliasReviewNote('선사코드, 실출하지코드'), true);
});

test('GLAPS 운송경로명은 상차지, 경유지, 하차지를 추론한다', () => {
  assert.deepEqual(inferGlapsRouteParts('부산신항 모비스 천안친환경물류센터 부산신항'), {
    startLocationName: '부산신항',
    waypointName: '모비스 천안친환경물류센터',
    destinationName: '부산신항',
  });
});

test('GLAPS 마스터 운송경로 시트는 경유지(ELS)와 매칭상태를 파싱한다', () => {
  const parsed = parseGlapsMasterSheets([
    {
      name: '운송경로',
      rows: [
        ['화주사', '운송경로코드', '운송경로명', '상차지(청구)', '경유지', '경유지(ELS)', '경유지코드', '비고'],
        ['B000034432', 'MBS00015', '부산신항 모비스 AS천안수출물류센터 부산항', 'KRBNP', '모비스 AS천안수출물류센터', '모비스AS천안', 'S013_EZN', ''],
        ['B000034432', 'MBS99999', '인천항국제여객터미널 모비스 친환경센터 인천신항', '', '모비스 친환경센터', '', '', 'ELS 매핑 필요'],
      ],
    },
  ]);

  assert.equal(parsed.routes.length, 2);
  assert.equal(parsed.routes[0].startLocationName, '부산신항');
  assert.equal(getGlapsRouteBillingStartLocation(parsed.routes[0]), 'KRBNP');
  assert.equal(parsed.routes[0].shipperCode, 'B000034432');
  assert.equal(getGlapsRouteShipperCode(parsed.routes[0]), 'B000034432');
  assert.equal(parsed.routes[0].waypointElsName, '모비스AS천안');
  assert.equal(getGlapsRouteWaypointCode(parsed.routes[0]), 'S013_EZN');
  assert.equal(parsed.routes[0].destinationName, '부산항');
  assert.equal(parsed.routes[0].reviewStatus, 'ready');
  assert.equal(parsed.routes[1].reviewStatus, 'needs_mapping');
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'waypoint' && alias.elsName === '모비스AS천안'), true);
  assert.equal(parsed.summary.ready, 1);
  assert.equal(parsed.summary.needsMapping, 1);
});

test('GLAPS 운송경로 경유지코드는 raw payload 헤더명으로 복구한다', () => {
  assert.equal(getGlapsRouteWaypointCode({
    raw_payload: {
      '경유지코드': ' S013_M12 ',
    },
  }), 'S013_M12');
  assert.equal(getGlapsRouteWaypointCode({
    raw_payload: {
      '작업지(하차지)코드': 'H000_KC',
    },
  }), 'H000_KC');

  const parsed = parseGlapsMasterSheets([
    {
      name: '운송경로',
      rows: [
        ['화주사코드', '운송경로코드', '운송경로명', '출발지 권역', '경유지 코드', '경유지(ELS)', '최종도착지'],
        ['KR10', 'GLC00020', '광양항 아산 제2KD 광양항', 'KRKAN', 'S013_EZB', '글로비스KD센터3포장장', 'KRKAN'],
      ],
    },
  ]);
  assert.equal(getGlapsRouteWaypointCode(parsed.routes[0]), 'S013_EZB');
  assert.equal(parsed.routes[0].waypointName, '아산 제2KD');
  assert.equal(parsed.routes[0].waypointElsName, '글로비스KD센터3포장장');
});

test('GLAPS 마스터는 운송경로 외 전 시트를 원본행과 항목 코드로 파싱한다', () => {
  const parsed = parseGlapsMasterSheets([
    {
      name: '운송경로',
      rows: [
        ['화주사', '운송경로코드', '운송경로명', '경유지(ELS)'],
        ['B000034432', 'MBS00015', '부산신항 모비스AS천안 부산신항', '모비스AS천안'],
      ],
    },
    {
      name: '컨테이너규격',
      rows: [
        ['ISO코드', '세관코드', 'ELS코드', '설명 (Description)', 'GLAPS 등록 KEY'],
        ['4510', '40HC', '40HQ', "40' HIGH CUBIC", ''],
      ],
    },
    {
      name: '수출입코드',
      rows: [
        ['코드', 'ELS코드', '명칭'],
        ['10', '수입', '수입'],
        ['20', '수출', '수출'],
      ],
    },
    {
      name: '프로코드',
      rows: [
        ['등록구분', 'GLAPS 코드', 'GLAPS 포트', 'ELS코드1', 'ELS코드2', '명칭(GLOVE)', 'KD보낼값'],
        ['로케이션', 'PNITC', 'KRBNP', 'USSAV', 'USMOB', '부산신항국제터미널 (PNIT)', '[KRBNP]BUSAN(NEW)'],
      ],
    },
    {
      name: '선사코드',
      rows: [
        ['선사코드 (GLAPS)', 'ELS코드1', 'ELS코드2', 'ELS코드3', '선사명(영문)'],
        ['CMDU', 'CMA, CMA-CGM\nCMA CGM', '', '', 'CMA CGM'],
      ],
    },
    {
      name: '실출하지코드',
      rows: [
        ['실출하지코드', 'ELS코드', '명칭'],
        ['EAS', 'EAS실핑', 'EAS실핑, 아산 2포장장아산'],
      ],
    },
    {
      name: '운송사코드',
      rows: [
        ['운송사', 'BP', 'GLAPS 코드', 'CODE(GLOVE)', 'KD'],
        ['ELS솔루션', 'B000005273', '1011', 'ELS', ''],
      ],
    },
    {
      name: '컨샤이니',
      rows: [
        ['Location구분', 'Location코드', 'Location명', 'ELS Location명'],
        ['목적지', 'GA0196', 'KIN', 'KIN'],
        ['목적지', 'UH03', 'HMMA', 'HMMA'],
      ],
    },
  ]);

  assert.equal(parsed.sheetRows.some(row => row.sheetName === '컨테이너규격' && row.headerRow), true);
  assert.equal(parsed.sheetRows.some(row => row.sheetName === '프로코드' && row.rowPayload['GLAPS 포트'] === 'KRBNP'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'container_type' && alias.sourceName === '40HC' && alias.glapsCode === '4510'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'container_type' && alias.sourceName === '40HQ' && alias.glapsCode === '4510'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'order_type' && alias.sourceName === '수입' && alias.glapsCode === '10'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'order_type' && alias.sourceName === '수출' && alias.glapsCode === '20'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'port' && alias.sourceName === 'KRBNP' && alias.glapsCode === 'PNITC'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'port' && alias.sourceName === 'USSAV' && alias.glapsCode === 'PNITC'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'line' && alias.sourceName === 'CMA' && alias.glapsCode === 'CMDU'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'line' && alias.sourceName === 'CMA-CGM' && alias.glapsCode === 'CMDU'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'line' && alias.sourceName === 'CMA, CMA-CGM\nCMA CGM'), false);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'actual_unloading' && alias.sourceName === 'EAS' && alias.glapsCode === 'EAS'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'actual_unloading' && alias.sourceName === 'EAS실핑' && alias.glapsCode === 'EAS'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'carrier' && alias.sourceName === 'ELS' && alias.glapsCode === 'B000005273'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'consignee' && alias.sourceName === 'KIN' && alias.glapsCode === 'GA0196'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'consignee' && alias.sourceName === 'HMMA' && alias.glapsCode === 'UH03'), true);
  assert.deepEqual(parsed.sourceSheets, ['운송경로', '컨테이너규격', '수출입코드', '프로코드', '선사코드', '실출하지코드', '운송사코드', '컨샤이니']);
});

test('GLAPS 상세배차 매칭 키는 화주사코드, 상차지, 경유지(ELS), 하차지를 기준으로 만든다', () => {
  const key = buildGlapsRouteFingerprint({
    shipperCode: 'B000034432',
    startLocationName: '인천항국제여객터미널',
    waypointElsName: '모비스친환경센터',
    destinationName: '인천신항',
  });

  assert.equal(key, 'B000034432|인천항국제여객터미널|모비스친환경센터|인천신항');
  assert.equal(buildGlapsRouteFingerprint({
    startLocationName: '인천항국제여객터미널',
    waypointElsName: '모비스친환경센터',
    destinationName: '인천신항',
  }), '인천항국제여객터미널|모비스친환경센터|인천신항');
  assert.ok(buildGlapsDispatchRouteFingerprints({
    shipperCode: 'B000034432',
    startLocationName: '부산신항',
    waypointElsName: '글로비스KD센터2포장장',
    destinationName: '부산신항',
  }).includes('B000034432|KRBNP|글로비스KD센터2포장장|KRBNP'));
  assert.ok(getGlapsRouteLocationCodeCandidates('KRBNP,KRUWN').includes('KRUWN'));
  assert.equal(getGlapsRouteLocationPrimaryCode('부산신항'), 'KRBNP');
  assert.equal(getGlapsRouteLocationPrimaryCode('의왕ICD'), 'KRUWN');
  assert.ok(buildGlapsDispatchRouteFingerprints({
    shipperCode: 'N084',
    startLocationName: 'KRBNP,KRUWN',
    waypointElsName: 'KCP_아산',
    destinationName: 'KRBNP',
  }).includes('N084|KRUWN|KCP_아산|KRBNP'));
  assert.equal(getGlapsRouteLocationDisplayName('KRINF'), '인천항국제여객터미널');
  assert.equal(buildGlapsRouteDisplayName({
    startLocationName: 'KRINC',
    waypointCode: 'H000_GA',
    destinationName: 'KRINF',
  }, new Map([['H000GA', '글로비스KD센터1포장장']])), '인천항 글로비스KD센터1포장장 인천항국제여객터미널');
  assert.deepEqual(getGlapsRouteMatchQuery().slice(2), [
    '상세배차.화주사코드 = route.화주사코드',
    '상세배차.상차지(청구 우선) = route.billing_start_location_name || route.start_location_name',
    '상세배차.경유지(ELS) = route.waypoint_els_name',
    '상세배차.하차지(선적) = route.destination_name',
  ]);
});

test('GLAPS 항목별 수정양식은 운송경로와 매핑 항목을 다시 업로드할 수 있게 읽는다', () => {
  const sheets = [
    {
      name: '운송경로_수정양식',
      rows: [
        ['id', 'shipper_code', 'route_code', 'route_name', 'start_location_name', 'billing_start_location_name', 'waypoint_name', 'waypoint_els_name', 'destination_name', 'review_status', 'review_note', '수정출처', '수정일시', '삭제(Y)'],
        ['11111111-1111-1111-1111-111111111111', 'B000034432', 'MBS00015', '부산신항 모비스 AS천안수출물류센터 부산항', '부산신항', 'KRBNP', '모비스 AS천안수출물류센터', '모비스AS천안', '부산항', 'ready', '', '웹수정', '2026-05-24', ''],
      ],
    },
    {
      name: '항목매핑_수정양식',
      rows: [
        ['id', '매핑항목', 'ELS 매치코드', 'ELS 디스크립션(설명)', 'GLAPS 디스크립션(설명)', '최종코드(BP)', 'review_status', '검수메모', '수정출처', '수정일시', '삭제(Y)'],
        ['22222222-2222-2222-2222-222222222222', '경유지', '모비스 친환경센터', '모비스친환경센터', '모비스 친환경센터', '', '조정필요', '확인', '업로드수정', '2026-05-24', 'Y'],
        ['', '기타', 'EAS', 'EAS실핑', 'EAS실핑, 아산 2포장장아산', 'EAS', '확정', '실출하지코드', '', '', ''],
        ['', '기타', '', '', '', '', '확정', '선사코드, 실출하지코드', '', '', ''],
      ],
    },
  ];
  const routeRows = parseGlapsRouteTemplateSheets(sheets);
  const aliasRows = parseGlapsAliasTemplateSheets(sheets);

  assert.equal(routeRows.length, 1);
  assert.equal(aliasRows.length, 2);
  assert.equal(routeRows[0].id, '11111111-1111-1111-1111-111111111111');
  assert.equal(routeRows[0].shipperCode, 'B000034432');
  assert.equal(routeRows[0].billingStartLocationName, 'KRBNP');
  assert.equal(routeRows[0].reviewStatus, 'ready');
  assert.equal(aliasRows[0].deleteFlag, true);
  assert.equal(aliasRows[0].reviewStatus, 'needs_mapping');
  assert.equal(aliasRows[0].aliasType, 'waypoint');
  assert.equal(aliasRows[0].sourceName, '모비스 친환경센터');
  assert.equal(aliasRows[0].elsName, '모비스친환경센터');
  assert.equal(aliasRows[1].aliasType, 'actual_unloading');
  assert.equal(aliasRows[1].glapsCode, 'EAS');
});

test('GLAPS 운송경로 수정양식은 안내문을 헤더로 오인하지 않는다', () => {
  const uuid = '009bc02b-0704-45fd-840c-400e2ef8e12f';
  const routeRows = parseGlapsRouteTemplateSheets([
    {
      name: '운송경로_수정양식',
      rows: [
        ['GLAPS 운송경로 수정양식'],
        ['상세배차 매칭 기준: 화주사코드 + 상차지(청구 우선) + 경유지(ELS) + 하차지(선적). 기존 GLAPS 운송경로코드를 도출하기 위한 원장 보정용입니다.'],
        GLAPS_ROUTE_TEMPLATE_HEADERS,
        [uuid, 'KR10', '부산신항', 'KRBNP', 'KCC글라스', 'S013_M12', '부산신항', 'KCC글라스', '부산신항KCC글라스부산신항', 'GLC0035', '확정', '', '웹수정', '2026-05-24', ''],
      ],
    },
  ]);

  assert.equal(routeRows.length, 1);
  assert.equal(routeRows[0].id, uuid);
  assert.equal(routeRows[0].shipperCode, 'KR10');
  assert.equal(routeRows[0].routeCode, 'GLC0035');
  assert.equal(routeRows[0].startLocationName, '부산신항');
  assert.equal(routeRows[0].billingStartLocationName, 'KRBNP');
  assert.equal(routeRows[0].waypointElsName, 'KCC글라스');
  assert.equal(routeRows[0].waypointCode, 'S013_M12');
  assert.equal(routeRows[0].destinationName, '부산신항');
});

test('GLAPS 운송경로 수정양식은 UUID가 경로 필드로 복제된 오염 행을 버린다', () => {
  const uuid = '009bc02b-0704-45fd-840c-400e2ef8e12f';
  const routeRows = parseGlapsRouteTemplateSheets([
    {
      name: '운송경로_수정양식',
      rows: [
        GLAPS_ROUTE_TEMPLATE_HEADERS,
        [uuid, uuid, uuid, uuid, '', uuid, '', '', '', uuid, '확정', '', '', '', ''],
      ],
    },
  ]);

  assert.equal(routeRows.length, 0);
});

test('GLAPS 항목별 수정양식은 기존 영문/구형 헤더도 계속 읽는다', () => {
  const aliasRows = parseGlapsAliasTemplateSheets([
    {
      name: '항목매핑_수정양식',
      rows: [
        ['id', 'alias_type', '배차판 매칭용', 'els_name', 'glaps_name', 'glaps_code', 'review_status', '조정안내', '수정출처', '수정일시', '삭제(Y)'],
        ['', 'container_type', '40HC', "40' HIGH CUBIC", "40' HIGH CUBIC", '4510', '확정', '', '', '', ''],
      ],
    },
  ]);

  assert.equal(aliasRows.length, 1);
  assert.equal(aliasRows[0].aliasType, 'container_type');
  assert.equal(aliasRows[0].sourceName, '40HC');
  assert.equal(aliasRows[0].elsName, "40' HIGH CUBIC");
  assert.equal(aliasRows[0].glapsCode, '4510');
});

test('GLAPS 항목매핑 중복후보 SQL은 구버전 source 제약까지 제거한다', () => {
  const migration = fs.readFileSync(
    path.join(webRoot, 'supabase_sql/20260527_glaps_alias_duplicate_candidates.sql'),
    'utf8',
  );
  const baseSql = fs.readFileSync(
    path.join(webRoot, 'supabase_sql/20260523_asan_glaps_master_codes.sql'),
    'utf8',
  );
  const route = fs.readFileSync(
    path.join(webRoot, 'app/api/branches/asan/glaps/master/route.js'),
    'utf8',
  );

  assert.match(migration, /DROP CONSTRAINT IF EXISTS glaps_master_aliases_branch_id_version_id_alias_type_source_key/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS glaps_master_aliases_branch_id_version_id_alias_type_source_name_key/);
  assert.match(migration, /UNIQUE \(branch_id, version_id, alias_type, source_name, route_code, glaps_code\)/);
  assert.match(baseSql, /DROP CONSTRAINT IF EXISTS glaps_master_aliases_branch_id_version_id_alias_type_source_key/);
  assert.match(baseSql, /order_type/);
  assert.match(baseSql, /actual_unloading/);
  assert.match(route, /isLegacyAliasSourceConstraintError/);
  assert.match(route, /20260527_glaps_alias_duplicate_candidates\.sql/);
});
