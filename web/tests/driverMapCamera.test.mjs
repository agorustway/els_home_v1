import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mapSource = readFileSync(new URL('../driver-src/modules/map.js', import.meta.url), 'utf8');
const tripSource = readFileSync(new URL('../driver-src/modules/trip.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../driver-src/index.html', import.meta.url), 'utf8');
const permissionsSource = readFileSync(new URL('../driver-src/modules/permissions.js', import.meta.url), 'utf8');
const profileSource = readFileSync(new URL('../driver-src/modules/profile.js', import.meta.url), 'utf8');
const mainActivitySource = readFileSync(new URL('../android/app/src/main/java/com/elssolution/driver/MainActivity.java', import.meta.url), 'utf8');
const overlayPluginSource = readFileSync(new URL('../android/app/src/main/java/com/elssolution/driver/OverlayPlugin.java', import.meta.url), 'utf8');
const floatingServiceSource = readFileSync(new URL('../android/app/src/main/java/com/elssolution/driver/FloatingWidgetService.java', import.meta.url), 'utf8');
const manifestSource = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');

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

test('오버레이 판단용 운행 ID는 서비스 시작 즉시 네이티브 prefs에 저장한다', () => {
  const startServiceStart = overlayPluginSource.indexOf('public void startService');
  const startServiceEnd = overlayPluginSource.indexOf('// JS → 서비스 상태 업데이트', startServiceStart);
  const startServiceBody = overlayPluginSource.slice(startServiceStart, startServiceEnd);

  assert.ok(startServiceBody.includes('putString(KEY_TRIP_ID, tripId)'), 'startService should persist active trip before service startup');
  assert.ok(startServiceBody.includes('putLong(KEY_START_TIME, startTime)'), 'startService should persist start time for overlay timer');
});

test('백그라운드 위치 수신은 앱 최소화 위젯 표시와 독립적으로 계속 유지된다', () => {
  const startTripStart = tripSource.indexOf('export async function startTrip');
  const startTripEnd = tripSource.indexOf('// ─── 일시정지', startTripStart);
  const startTripBody = tripSource.slice(startTripStart, startTripEnd);
  const setVisibilityStart = floatingServiceSource.indexOf('if ("SET_VISIBILITY".equals(action))');
  const setVisibilityEnd = floatingServiceSource.indexOf('if (intent.hasExtra("tripId"))', setVisibilityStart);
  const setVisibilityBody = floatingServiceSource.slice(setVisibilityStart, setVisibilityEnd);

  assert.ok(manifestSource.includes('android.permission.ACCESS_BACKGROUND_LOCATION'), 'background location permission must remain declared');
  assert.ok(manifestSource.includes('android.permission.FOREGROUND_SERVICE_LOCATION'), 'foreground location service permission must remain declared');
  assert.ok(manifestSource.includes('android:stopWithTask="false"'), 'native service must survive app task backgrounding');
  assert.ok(floatingServiceSource.includes('startForeground(1, notification'), 'service must run as foreground service');
  assert.ok(floatingServiceSource.includes('startLocationTracking();'), 'service startup must begin native location tracking');
  assert.ok(floatingServiceSource.includes('requestLocationUpdates(request, mLocationCallback'), 'service must request fused location updates');
  assert.ok(floatingServiceSource.includes('sendLocationToServer(location, speedKph)'), 'native location callback must send locations to server');
  assert.ok(startTripBody.indexOf('startOverlayService();') < startTripBody.indexOf('startGPS();'), 'native service should start before JS GPS watcher');
  assert.ok(setVisibilityBody.includes('ensureActiveTripRuntime(visible)'), 'visibility-only service restarts must resume timer/location runtime');
  assert.equal(setVisibilityBody.includes('removeLocationUpdates'), false, 'minimize must not stop native GPS updates');
  assert.equal(setVisibilityBody.includes('stopForeground'), false, 'minimize must not stop foreground service');
});

test('운행 시작은 오버레이 서비스를 숨김 상태로 준비하고 네이티브 PiP를 쓰지 않는다', () => {
  assert.ok(tripSource.includes('startOverlayService();'), 'startTrip should prepare overlay service');
  assert.equal(tripSource.includes('enterPipMode'), false, 'driver app must not request native PiP');
  assert.equal(overlayPluginSource.includes('public void enterPipMode'), false, 'native plugin must not expose PiP entry');
  assert.equal(mainActivitySource.includes('PictureInPicture'), false, 'activity must not import native PiP');
  assert.equal(mainActivitySource.includes('enterPictureInPictureMode'), false, 'activity must not enter native PiP');
  assert.equal(manifestSource.includes('supportsPictureInPicture'), false, 'manifest must not advertise native PiP');
  assert.ok(overlayPluginSource.includes('public void setWidgetVisible'), 'native plugin should expose overlay visibility control');
  assert.ok(floatingServiceSource.includes('setupFloatingWidget(initialVisible)'), 'service should honor initial visibility from trip start');
});

test('앱 최소화 시 기존 플로팅 위젯을 보이고 복귀 시 숨긴다', () => {
  const onResumeStart = mainActivitySource.indexOf('public void onResume()');
  const onPauseStart = mainActivitySource.indexOf('public void onPause()');
  const onResumeBody = mainActivitySource.slice(onResumeStart, onPauseStart);
  const onPauseBody = mainActivitySource.slice(onPauseStart);

  assert.ok(onResumeBody.includes('intent.setAction("SET_VISIBILITY")'), 'resume should control overlay visibility');
  assert.ok(onResumeBody.includes('intent.putExtra("visible", false)'), 'resume should hide floating widget');
  assert.ok(onPauseBody.includes('intent.setAction("SET_VISIBILITY")'), 'pause should control overlay visibility');
  assert.ok(onPauseBody.includes('intent.putExtra("visible", true)'), 'pause should show floating widget');
  assert.equal(onPauseBody.includes('isInPictureInPictureMode'), false, 'overlay display should not depend on native PiP state');
});

test('운행 종료는 오버레이/GPS만 정리하고 앱 화면은 유지한다', () => {
  const endTripStart = tripSource.indexOf('export async function endTrip');
  const endTripBody = tripSource.slice(endTripStart);
  const stopServiceStart = overlayPluginSource.indexOf('public void stopService');
  const stopServiceEnd = overlayPluginSource.indexOf('// JS → 앱 강제 종료', stopServiceStart);
  const stopServiceBody = overlayPluginSource.slice(stopServiceStart, stopServiceEnd);

  assert.ok(endTripBody.includes('stopOverlayService()'), 'endTrip should stop native overlay service');
  assert.ok(endTripBody.includes('stopGPS()'), 'endTrip should stop JS GPS watcher');
  assert.ok(endTripBody.includes("Store.rm('activeTrip')"), 'endTrip should clear active trip state');
  assert.ok(endTripBody.includes('clearTripData(true)'), 'endTrip should reset trip UI');
  assert.equal(endTripBody.includes('scheduleAppExitAfterTripEnd'), false, 'endTrip must not schedule app exit');
  assert.equal(endTripBody.includes('exitAppForce'), false, 'endTrip must not hard-exit the app');
  assert.equal(endTripBody.includes('finishAndRemoveTask'), false, 'endTrip must not remove Android task');
  assert.ok(stopServiceBody.includes('clearNativeTripState(context)'), 'stopService should clear active trip prefs');
  assert.equal(stopServiceBody.includes('startForegroundService'), false, 'stopService must not start a foreground service just to stop it');
  assert.equal(stopServiceBody.includes('startService'), false, 'stopService must not start a service just to stop it');
});

test('앱 종료 경로는 Samsung crash dialog를 만들 수 있는 process kill을 쓰지 않는다', () => {
  const cleanExitStart = mainActivitySource.indexOf('private void cleanExitApp');
  const cleanExitEnd = mainActivitySource.indexOf('// ─── 배터리', cleanExitStart);
  const cleanExitBody = mainActivitySource.slice(cleanExitStart, cleanExitEnd);
  const exitForceStart = overlayPluginSource.indexOf('public void exitAppForce');
  const exitForceEnd = overlayPluginSource.indexOf('// JS → 배터리', exitForceStart);
  const exitForceBody = overlayPluginSource.slice(exitForceStart, exitForceEnd);
  const loadCurrentTripStart = tripSource.indexOf('export async function loadCurrentTrip');
  const loadCurrentTripEnd = tripSource.indexOf('// ─── 운행 시작', loadCurrentTripStart);
  const loadCurrentTripBody = tripSource.slice(loadCurrentTripStart, loadCurrentTripEnd);

  assert.equal(mainActivitySource.includes('killProcess'), false, 'MainActivity must not kill the app process');
  assert.equal(overlayPluginSource.includes('killProcess'), false, 'OverlayPlugin must not kill the app process');
  assert.ok(cleanExitBody.includes('clearNativeTripState()'), 'native exit should clear trip/service state');
  assert.ok(exitForceBody.includes('clearNativeTripState(context)'), 'plugin exit should clear trip/service state');
  assert.ok(cleanExitBody.includes('moveTaskToBack(true)'), 'native exit should hide the task immediately before final cleanup');
  assert.ok(exitForceBody.includes('moveTaskToBack(true)'), 'plugin exit should hide the task immediately before final cleanup');
  assert.ok(loadCurrentTripBody.includes('stopOverlayService()'), 'server-completed saved trips should stop native service');
  assert.ok(loadCurrentTripBody.includes("Store.rm('activeTrip')"), 'server-completed saved trips should clear local active trip');
});

test('네이티브 오버레이는 표시 전환으로 살아나도 타이머와 속도 보정을 즉시 적용한다', () => {
  const ensureStart = floatingServiceSource.indexOf('private void ensureActiveTripRuntime');
  const ensureEnd = floatingServiceSource.indexOf('// ─── 오버레이 위젯', ensureStart);
  const ensureBody = floatingServiceSource.slice(ensureStart, ensureEnd);
  const updateStart = floatingServiceSource.indexOf('private void updateWidgetDisplay');
  const updateEnd = floatingServiceSource.indexOf('private String getStatusLabel', updateStart);
  const updateBody = floatingServiceSource.slice(updateStart, updateEnd);
  const speedStart = floatingServiceSource.indexOf('private float sanitizeOutboundSpeedKph');
  const speedEnd = floatingServiceSource.indexOf('// ─── 위치 서버 전송', speedStart);
  const speedBody = floatingServiceSource.slice(speedStart, speedEnd);

  assert.ok(ensureBody.includes('startNativeTimer()'), 'visibility-only service path must start native timer');
  assert.ok(ensureBody.includes('startLocationTracking()'), 'visibility-only service path must start location tracking');
  assert.ok(updateBody.includes('tvTimer.setText(formatTime(elapsed))'), 'widget should not render a blank timer before first tick');
  assert.ok(floatingServiceSource.includes('if (mSensorManager != null && mGyroListener != null) return;'), 'gyro listener must not duplicate on repeated visibility changes');
  assert.ok(speedBody.includes('impliedKph'), 'native speed should be checked against coordinate-implied speed');
  assert.ok(speedBody.includes('sanitized > sensorCap'), 'sensor speed spikes should be clipped before storage');
});

test('핵심 진행 버튼은 불가 상태 빨강, 진행 가능 상태 파랑을 사용한다', () => {
  assert.ok(indexSource.includes('id="btn-trip-start" style="background:#ef4444'), 'trip start should be red before checklist');
  assert.ok(tripSource.includes("startBtn.style.background = '#2563eb'"), 'trip start should turn blue when checklist is complete');
  assert.ok(tripSource.includes("startBtn.style.background = '#ef4444'"), 'trip start should reset to red when data is cleared');
  assert.ok(tripSource.includes("btn.style.background = '#2563eb'"), 'checklist completion should use blue for proceed');
  assert.ok(profileSource.includes("enabled ? '#2563eb' : '#ef4444'"), 'profile save should use blue/red state colors');
  assert.ok(permissionsSource.includes("btnFinish.classList.add('btn-primary')"), 'permission finish should turn blue when critical permissions are ready');
  assert.ok(permissionsSource.includes("btnFinish.classList.add('btn-red')"), 'permission finish should stay red while critical permissions are missing');
});
