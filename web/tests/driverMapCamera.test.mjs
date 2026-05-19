import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapSource = readFileSync(new URL('../driver-src/modules/map.js', import.meta.url), 'utf8');
const tripSource = readFileSync(new URL('../driver-src/modules/trip.js', import.meta.url), 'utf8');
const mainActivitySource = readFileSync(new URL('../android/app/src/main/java/com/elssolution/driver/MainActivity.java', import.meta.url), 'utf8');
const overlayPluginSource = readFileSync(new URL('../android/app/src/main/java/com/elssolution/driver/OverlayPlugin.java', import.meta.url), 'utf8');
const floatingServiceSource = readFileSync(new URL('../android/app/src/main/java/com/elssolution/driver/FloatingWidgetService.java', import.meta.url), 'utf8');

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

test('운행 중 위치보기는 matched-route 조회나 complete 호출을 하지 않는다', () => {
  const routeStart = mapSource.indexOf('export async function showTripRouteOnMap');
  const routeEnd = mapSource.indexOf('/** 경로 표시 초기화 */', routeStart);
  const routeBody = mapSource.slice(routeStart, routeEnd);
  const activeBranch = routeBody.slice(
    routeBody.indexOf("if (trip.status !== 'completed')"),
    routeBody.indexOf('const isActiveOwnTrip = false')
  );

  assert.ok(activeBranch.includes('return;'), 'active route branch should exit before completed route logic');
  assert.equal(activeBranch.includes('matched-route'), false, 'active route branch must not fetch matched-route');
  assert.equal(activeBranch.includes("action: 'complete'"), false, 'active route branch must not complete trip');
});

test('PiP 판단용 운행 ID는 서비스 시작 즉시 네이티브 prefs에 저장한다', () => {
  const startServiceStart = overlayPluginSource.indexOf('public void startService');
  const startServiceEnd = overlayPluginSource.indexOf('// JS → 서비스 상태 업데이트', startServiceStart);
  const startServiceBody = overlayPluginSource.slice(startServiceStart, startServiceEnd);

  assert.ok(startServiceBody.includes('putString(KEY_TRIP_ID, tripId)'), 'startService should persist active trip before service startup');
  assert.ok(mainActivitySource.includes('setAutoEnterEnabled(true)'), 'Android 12+ should enable auto PiP entry');
  assert.ok(mainActivitySource.includes('enterPipIfActiveTrip()'), 'home/leave flow should call PiP entry helper');
});

test('운행 시작은 네이티브 PiP를 직접 요청하고 실패 시 오버레이를 보인다', () => {
  assert.ok(tripSource.includes('startOverlayService({ enterPip: true })'), 'startTrip should request immediate PiP');
  assert.ok(tripSource.includes('enterPipMode'), 'driver app should call native PiP entry');
  assert.ok(tripSource.includes('setWidgetVisible'), 'driver app should show overlay when PiP cannot enter');
  assert.ok(overlayPluginSource.includes('public void enterPipMode'), 'native plugin should expose PiP entry');
  assert.ok(overlayPluginSource.includes('public void setWidgetVisible'), 'native plugin should expose overlay visibility control');
  assert.ok(floatingServiceSource.includes('setupFloatingWidget(initialVisible)'), 'service should honor initial visibility from trip start');
});

test('운행 종료는 오버레이와 앱 태스크를 함께 정리한다', () => {
  const endTripStart = tripSource.indexOf('export async function endTrip');
  const endTripBody = tripSource.slice(endTripStart);
  const stopServiceStart = overlayPluginSource.indexOf('public void stopService');
  const stopServiceEnd = overlayPluginSource.indexOf('// JS → 앱 강제 종료', stopServiceStart);
  const stopServiceBody = overlayPluginSource.slice(stopServiceStart, stopServiceEnd);

  assert.ok(endTripBody.includes('stopOverlayService()'), 'endTrip should stop native overlay service');
  assert.ok(endTripBody.includes('scheduleAppExitAfterTripEnd()'), 'endTrip should close the native app after completion');
  assert.ok(tripSource.includes('exitAppForce'), 'driver app should use native hard exit after trip end');
  assert.ok(stopServiceBody.includes('remove(KEY_TRIP_ID).remove(KEY_START_TIME)'), 'stopService should clear active trip prefs');
  assert.ok(overlayPluginSource.includes('finishAndRemoveTask()'), 'native hard exit should remove the Android task');
});
