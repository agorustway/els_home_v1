import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GLAPS_ALIAS_TEMPLATE_HEADERS,
  GLAPS_ROUTE_TEMPLATE_HEADERS,
  buildGlapsDispatchRouteFingerprints,
  buildGlapsRouteFingerprint,
  getGlapsRouteMatchQuery,
  inferGlapsRouteParts,
  parseGlapsAliasTemplateSheets,
  parseGlapsMasterSheets,
  parseGlapsRouteTemplateSheets,
} from '../utils/glapsMasterData.mjs';

test('GLAPS 수정양식 다운로드 헤더는 현업이 읽는 한국어 컬럼명을 사용한다', () => {
  assert.deepEqual(GLAPS_ROUTE_TEMPLATE_HEADERS, [
    'ID',
    '운송경로코드',
    '운송경로명',
    '상차지',
    '경유지',
    '경유지(ELS)',
    '하차지(선적)',
    '매칭상태',
    '조정안내',
    '삭제(Y)',
  ]);
  assert.deepEqual(GLAPS_ALIAS_TEMPLATE_HEADERS, [
    'ID',
    '항목',
    '원본명',
    'ELS명',
    'GLAPS명',
    'GLAPS코드',
    '운송경로코드',
    '매칭상태',
    '조정안내',
    '삭제(Y)',
  ]);
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
        ['운송경로코드', '운송경로명', '경유지', '경유지(ELS)', '비고'],
        ['MBS00015', '부산신항 모비스 AS천안수출물류센터 부산항', '모비스 AS천안수출물류센터', '모비스AS천안', ''],
        ['MBS99999', '인천항국제여객터미널 모비스 친환경센터 인천신항', '모비스 친환경센터', '', 'ELS 매핑 필요'],
      ],
    },
  ]);

  assert.equal(parsed.routes.length, 2);
  assert.equal(parsed.routes[0].startLocationName, '부산신항');
  assert.equal(parsed.routes[0].waypointElsName, '모비스AS천안');
  assert.equal(parsed.routes[0].destinationName, '부산항');
  assert.equal(parsed.routes[0].reviewStatus, 'ready');
  assert.equal(parsed.routes[1].reviewStatus, 'needs_mapping');
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'waypoint' && alias.elsName === '모비스AS천안'), true);
  assert.equal(parsed.summary.ready, 1);
  assert.equal(parsed.summary.needsMapping, 1);
});

test('GLAPS 마스터는 운송경로 외 전 시트를 원본행과 항목 코드로 파싱한다', () => {
  const parsed = parseGlapsMasterSheets([
    {
      name: '운송경로',
      rows: [
        ['운송경로코드', '운송경로명', '경유지(ELS)'],
        ['MBS00015', '부산신항 모비스AS천안 부산신항', '모비스AS천안'],
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
        ['CMDU', 'CMA', 'CMA-CGM', '', 'CMA CGM'],
      ],
    },
    {
      name: '운송사코드',
      rows: [
        ['운송사코드', '운송사명'],
        ['1011', 'ELS솔루션'],
      ],
    },
  ]);

  assert.equal(parsed.sheetRows.some(row => row.sheetName === '컨테이너규격' && row.headerRow), true);
  assert.equal(parsed.sheetRows.some(row => row.sheetName === '프로코드' && row.rowPayload['GLAPS 포트'] === 'KRBNP'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'container_type' && alias.sourceName === '40HC' && alias.glapsCode === '4510'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'container_type' && alias.sourceName === '40HQ' && alias.glapsCode === '4510'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'port' && alias.sourceName === 'KRBNP' && alias.glapsCode === 'PNITC'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'port' && alias.sourceName === 'USSAV' && alias.glapsCode === 'PNITC'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'line' && alias.sourceName === 'CMA' && alias.glapsCode === 'CMDU'), true);
  assert.equal(parsed.aliases.some(alias => alias.aliasType === 'carrier' && alias.sourceName === 'ELS' && alias.glapsCode === '1011'), true);
  assert.deepEqual(parsed.sourceSheets, ['운송경로', '컨테이너규격', '프로코드', '선사코드', '운송사코드']);
});

test('GLAPS 상세배차 매칭 키는 상차지, 경유지(ELS), 하차지를 기준으로 만든다', () => {
  const key = buildGlapsRouteFingerprint({
    startLocationName: '인천항국제여객터미널',
    waypointElsName: '모비스친환경센터',
    destinationName: '인천신항',
  });

  assert.equal(key, '인천항국제여객터미널|모비스친환경센터|인천신항');
  assert.ok(buildGlapsDispatchRouteFingerprints({
    startLocationName: '부산신항',
    waypointElsName: '글로비스KD센터2포장장',
    destinationName: '부산신항',
  }).includes('KRBNP|글로비스KD센터2포장장|KRBNP'));
  assert.deepEqual(getGlapsRouteMatchQuery().slice(2), [
    '상세배차.상차지 = route.start_location_name',
    '상세배차.경유지(ELS) = route.waypoint_els_name',
    '상세배차.하차지(선적) = route.destination_name',
  ]);
});

test('GLAPS 항목별 수정양식은 운송경로와 매핑 항목을 다시 업로드할 수 있게 읽는다', () => {
  const routeRows = parseGlapsRouteTemplateSheets([
    {
      name: '운송경로_수정양식',
      rows: [
        ['id', 'route_code', 'route_name', 'start_location_name', 'waypoint_name', 'waypoint_els_name', 'destination_name', 'review_status', 'review_note', '삭제(Y)'],
        ['11111111-1111-1111-1111-111111111111', 'MBS00015', '부산신항 모비스 AS천안수출물류센터 부산항', '부산신항', '모비스 AS천안수출물류센터', '모비스AS천안', '부산항', 'ready', '', ''],
      ],
    },
  ]);
  const aliasRows = parseGlapsAliasTemplateSheets([
    {
      name: '항목매핑_수정양식',
      rows: [
        ['id', 'alias_type', 'source_name', 'els_name', 'glaps_name', 'glaps_code', 'route_code', 'review_status', 'review_note', '삭제(Y)'],
        ['22222222-2222-2222-2222-222222222222', 'waypoint', '모비스 친환경센터', '모비스친환경센터', '모비스 친환경센터', '', 'MBS99999', '조정필요', '확인', 'Y'],
      ],
    },
  ]);

  assert.equal(routeRows[0].id, '11111111-1111-1111-1111-111111111111');
  assert.equal(routeRows[0].reviewStatus, 'ready');
  assert.equal(aliasRows[0].deleteFlag, true);
  assert.equal(aliasRows[0].reviewStatus, 'needs_mapping');
});
