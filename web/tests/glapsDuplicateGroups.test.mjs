import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGlapsAliasDuplicateGroupKey,
  buildGlapsDuplicateInfo,
  buildGlapsRouteDuplicateGroupKey,
  isGlapsRouteDuplicateBypassCode,
} from '../utils/glapsDuplicateGroups.mjs';

test('GLAPS 운송경로 중복은 운송경로코드가 반복될 때만 잡는다', () => {
  assert.equal(buildGlapsRouteDuplicateGroupKey({
    route_code: 'GLC00005',
    start_location_name: '부산신항',
    destination_name: '부산신항',
  }), 'GLC00005');
  assert.equal(isGlapsRouteDuplicateBypassCode('AAAAAAAAA'), true);
  assert.equal(buildGlapsRouteDuplicateGroupKey({ route_code: 'AAAAAAAAA' }), '');

  const info = buildGlapsDuplicateInfo('routes', [
    { id: 'a', route_code: 'GLC00005', start_location_name: 'KRUWN', waypoint_els_name: '1포장장', destination_name: 'KRBNX' },
    { id: 'b', route_code: 'GLC00005', start_location_name: 'KRBNP', waypoint_els_name: '2포장장', destination_name: 'KRBNP' },
    { id: 'c', route_code: 'GLC00006', start_location_name: 'KRUWN', waypoint_els_name: '1포장장', destination_name: 'KRBNX' },
    { id: 'd', route_code: 'AAAAAAAAA', start_location_name: 'AAA', waypoint_els_name: 'AAA', destination_name: 'AAA' },
    { id: 'e', route_code: 'AAAAAAAAA', start_location_name: 'KR10', waypoint_els_name: 'PLMAA', destination_name: 'PLMAA' },
  ]);

  assert.equal(info.rowCount, 2);
  assert.equal(info.groupCount, 1);
  assert.deepEqual([...info.byId.keys()].sort(), ['a', 'b']);
});

test('GLAPS 항목매핑 중복은 매핑항목과 최종코드(BP)가 함께 반복될 때만 잡는다', () => {
  assert.equal(buildGlapsAliasDuplicateGroupKey({
    alias_type: 'carrier',
    route_code: 'MBS00015',
    glaps_code: 'B000005273',
  }), 'CARRIER|B000005273');

  assert.notEqual(
    buildGlapsAliasDuplicateGroupKey({ alias_type: 'line', glaps_code: 'EAS' }),
    buildGlapsAliasDuplicateGroupKey({ alias_type: 'actual_unloading', glaps_code: 'EAS' }),
  );

  const info = buildGlapsDuplicateInfo('aliases', [
    { id: 'carrier-a', alias_type: 'carrier', source_name: '1011', route_code: '', glaps_code: 'B000005273' },
    { id: 'carrier-b', alias_type: 'carrier', source_name: 'ELS', route_code: '', glaps_code: 'B000005273' },
    { id: 'port-a', alias_type: 'port', source_name: 'KRBNP', route_code: '', glaps_code: 'B000005273' },
    { id: 'carrier-c', alias_type: 'carrier', source_name: '1020', route_code: 'MBS00015', glaps_code: 'B000005273' },
    { id: 'actual-unloading-a', alias_type: 'actual_unloading', source_name: 'EAS', route_code: '', glaps_code: 'EAS' },
    { id: 'line-a', alias_type: 'line', source_name: 'EAS', route_code: '', glaps_code: 'EAS' },
    { id: 'line-b', alias_type: 'line', source_name: 'EAS실핑', route_code: '', glaps_code: 'EAS' },
    { id: 'carrier-d', alias_type: 'carrier', source_name: '1033', route_code: '', glaps_code: 'B000007122' },
  ]);

  assert.equal(info.rowCount, 5);
  assert.equal(info.groupCount, 2);
  assert.deepEqual([...info.byId.keys()].sort(), ['carrier-a', 'carrier-b', 'carrier-c', 'line-a', 'line-b']);
  assert.deepEqual([...new Set(info.keyById.values())].sort(), ['CARRIER|B000005273', 'LINE|EAS']);
});
