import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapSource = readFileSync(new URL('../driver-src/modules/map.js', import.meta.url), 'utf8');

test('앱 지도 진입은 차량 데이터 초기 포커스 후 GPS 샘플링을 시작한다', () => {
  const openMapStart = mapSource.indexOf('export async function openMap()');
  const openMapEnd = mapSource.indexOf('/** 지도 화면 닫기 */', openMapStart);
  const openMapBody = mapSource.slice(openMapStart, openMapEnd);

  const initialRefreshIndex = openMapBody.indexOf('await refreshMapData({ initialFocus: true })');
  const gpsSamplingIndex = openMapBody.indexOf('startMapGpsSampling()');

  assert.ok(initialRefreshIndex >= 0, 'openMap should wait for initial vehicle data');
  assert.ok(gpsSamplingIndex > initialRefreshIndex, 'foreground GPS sampling must start after initial map focus');
});

test('지도 이동+확대 helper는 중심 좌표를 먼저 확정한 뒤 줌을 적용한다', () => {
  const helperStart = mapSource.indexOf('function focusMapOnPosition');
  const helperEnd = mapSource.indexOf('function followMapToPosition', helperStart);
  const helperBody = mapSource.slice(helperStart, helperEnd);

  assert.ok(helperBody.includes('_map.morph(position, targetZoom'), 'combined camera morph should be preferred');
  assert.ok(helperBody.includes('_map.setCenter(position)'), 'fallback should set center before zoom');
  assert.ok(
    helperBody.indexOf('_map.setCenter(position)') < helperBody.indexOf('setMapZoom(targetZoom'),
    'fallback camera order should be center first, zoom second'
  );
});
