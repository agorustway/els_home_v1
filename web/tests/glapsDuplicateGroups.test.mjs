import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGlapsAliasDuplicateGroupKey,
  buildGlapsDuplicateInfo,
  buildGlapsRouteDuplicateGroupKey,
} from '../utils/glapsDuplicateGroups.mjs';

test('GLAPS 운송경로 중복은 운송경로코드가 반복될 때만 잡는다', () => {
  assert.equal(buildGlapsRouteDuplicateGroupKey({
    route_code: 'GLC00005',
    start_location_name: '부산신항',
    destination_name: '부산신항',
  }), 'GLC00005');

  const info = buildGlapsDuplicateInfo('routes', [
    { id: 'a', route_code: 'GLC00005', start_location_name: 'KRUWN', waypoint_els_name: '1포장장', destination_name: 'KRBNX' },
    { id: 'b', route_code: 'GLC00005', start_location_name: 'KRBNP', waypoint_els_name: '2포장장', destination_name: 'KRBNP' },
    { id: 'c', route_code: 'GLC00006', start_location_name: 'KRUWN', waypoint_els_name: '1포장장', destination_name: 'KRBNX' },
  ]);

  assert.equal(info.rowCount, 2);
  assert.equal(info.groupCount, 1);
  assert.deepEqual([...info.byId.keys()].sort(), ['a', 'b']);
});

test('GLAPS 항목매핑 중복은 최종코드(BP)가 반복될 때만 잡는다', () => {
  assert.equal(buildGlapsAliasDuplicateGroupKey({
    alias_type: 'carrier',
    route_code: 'MBS00015',
    glaps_code: 'B000005273',
  }), 'B000005273');

  const info = buildGlapsDuplicateInfo('aliases', [
    { id: 'carrier-a', alias_type: 'carrier', source_name: '1011', route_code: '', glaps_code: 'B000005273' },
    { id: 'carrier-b', alias_type: 'carrier', source_name: 'ELS', route_code: '', glaps_code: 'B000005273' },
    { id: 'port-a', alias_type: 'port', source_name: 'KRBNP', route_code: '', glaps_code: 'B000005273' },
    { id: 'carrier-c', alias_type: 'carrier', source_name: '1020', route_code: 'MBS00015', glaps_code: 'B000005273' },
    { id: 'carrier-d', alias_type: 'carrier', source_name: '1033', route_code: '', glaps_code: 'B000007122' },
  ]);

  assert.equal(info.rowCount, 4);
  assert.equal(info.groupCount, 1);
  assert.deepEqual([...info.byId.keys()].sort(), ['carrier-a', 'carrier-b', 'carrier-c', 'port-a']);
  assert.deepEqual([...info.keyById.values()], ['B000005273', 'B000005273', 'B000005273', 'B000005273']);
});
