/**
 * gps.js — GPS 추적 (네이티브 BackgroundGeolocation 플러그인 기반)
 *
 * [v5.10.0] 전면 리팩토링
 * - navigator.geolocation.watchPosition 폐기 → @capacitor-community/background-geolocation 전환
 * - 백그라운드 위치 수집 끊김 근본 해결 (네이티브 포그라운드 서비스)
 * - 수집 빈도 대폭 상향: 시간 기반 5~10초 + 거리 기반 10m
 * - 불필요한 자이로/모션/심폐소생 코드 제거
 */
import { State, BASE_URL } from './store.js?v=5155';
import { Overlay, remoteLog, smartFetch } from './bridge.js?v=5155';
import { angleDiffDeg, bearingDeg, haversineKm } from './locationFilter.js?v=5155';

// ─── GPS 상태 변수 ────────────────────────────────────────────────
export let gpsWatchId        = null;   // 네이티브 Watcher ID (string)
export let lastGpsSend       = 0;
export let currentGpsInterval = 10_000;
export let lastGpsTimestamp  = 0;
export let lastKnownAddr     = '위치 확인 중...';
export let realtimeExpireAt  = 0;
let _lastSentMotion = null;
let _currentSpeedKph = 0;
let _motionBurstUntil = 0;
let _mapForegroundTimer = null;
let _mapForegroundBusy = false;
let _appForegroundTimer = null;
let _appForegroundBusy = false;
let _lastAcceptedPoint = null;
let _lastTransmittedPoint = null;
let _pendingPoint = null;
let _pendingCount = 0;
let _lastFilterLogMs = 0;

const ACCURACY_HARD_SKIP_M = 100;
const ACCURACY_SUSPECT_M = 45;
const STATIONARY_SPEED_KPH = 4;
const LOW_SPEED_KPH = 12;

function resetGpsStabilizer() {
  _lastAcceptedPoint = null;
  _lastTransmittedPoint = null;
  _pendingPoint = null;
  _pendingCount = 0;
}

// ─── 오프라인 큐 ────────────────────────────────────────────────
export let _gpsOfflineQueue = [];
try { _gpsOfflineQueue = JSON.parse(localStorage.getItem('els_gps_queue') || '[]'); } catch(e){}

const MAX_QUEUE_SIZE = 500;
let _isFlushingQueue = false;

function saveGpsQueue() {
  _gpsOfflineQueue = compactGpsPayloads(_gpsOfflineQueue);
  if (_gpsOfflineQueue.length > MAX_QUEUE_SIZE) {
    _gpsOfflineQueue = _gpsOfflineQueue.slice(-MAX_QUEUE_SIZE);
  }
  localStorage.setItem('els_gps_queue', JSON.stringify(_gpsOfflineQueue));
}

function payloadDistanceKm(a, b) {
  if (!a || !b) return Infinity;
  const aLat = Number(a.lat);
  const aLng = Number(a.lng);
  const bLat = Number(b.lat);
  const bLng = Number(b.lng);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return Infinity;
  return haversineKm(aLat, aLng, bLat, bLng);
}

function payloadTimeMs(payload) {
  const raw = payload?.recorded_at;
  const ms = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function canCollapsePayload(prev, next) {
  if (!prev || !next) return false;
  if (prev.marker_type || next.marker_type) return false;
  if (String(prev.trip_id) !== String(next.trip_id)) return false;
  const dt = Math.abs(payloadTimeMs(next) - payloadTimeMs(prev));
  return payloadDistanceKm(prev, next) < 0.03 && dt < 90_000;
}

function compactGpsPayloads(queue) {
  const compacted = [];
  for (const payload of queue || []) {
    const prev = compacted[compacted.length - 1];
    if (canCollapsePayload(prev, payload)) compacted[compacted.length - 1] = payload;
    else compacted.push(payload);
  }
  return compacted;
}

function enqueueGpsPayload(payload) {
  const last = _gpsOfflineQueue[_gpsOfflineQueue.length - 1];
  if (canCollapsePayload(last, payload)) _gpsOfflineQueue[_gpsOfflineQueue.length - 1] = payload;
  else _gpsOfflineQueue.push(payload);
  saveGpsQueue();
}

/** 오프라인 큐를 순차적으로 서버에 전송 (동시 전송 방지) */
async function flushOfflineQueue() {
  if (_isFlushingQueue || _gpsOfflineQueue.length === 0) return;
  _isFlushingQueue = true;

  const snapshot = [..._gpsOfflineQueue];
  _gpsOfflineQueue = [];
  saveGpsQueue();

  const failed = [];
  for (const payload of snapshot) {
    try {
      const r = await fetch(BASE_URL + '/api/vehicle-tracking/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch {
      failed.push(payload);
    }
  }

  if (failed.length > 0) {
    _gpsOfflineQueue.push(...failed);
    saveGpsQueue();
    remoteLog(`오프라인 큐 플러시: ${snapshot.length - failed.length}건 성공, ${failed.length}건 실패`, 'GPS_QUEUE');
  } else if (snapshot.length > 0) {
    remoteLog(`오프라인 큐 플러시 완료: ${snapshot.length}건 전송`, 'GPS_QUEUE');
  }
  _isFlushingQueue = false;
}

// ─── 실시간 모드 ─────────────────────────────────────────────────
export function startRealtimeMode() {
  State.trip.isRealtime = true;
  realtimeExpireAt = Date.now() + 60000;
  updateTripStatusLine();
  _syncRealtimeModeToNative(true);
  pollAppForegroundPosition();
  remoteLog('실시간 고정밀 관제 모드 시작 (1분)', 'SYSTEM');
}

export function stopRealtimeMode() {
  State.trip.isRealtime = false;
  realtimeExpireAt = 0;
  updateTripStatusLine();
  _syncRealtimeModeToNative(false);
  remoteLog('실시간 고정밀 관제 모드 수동 종료', 'SYSTEM');
}

function _syncRealtimeModeToNative(isRealtime) {
  const overlay = Overlay();
  if (!overlay) return;
  overlay.updateStatus({ status: State.trip.status, isRealtime }).catch(() => { });
}

function emitGpsSample(point, source = 'gps') {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  window.dispatchEvent(new CustomEvent('els:gps-sample', {
    detail: {
      lat,
      lng,
      speed: Number(point.speedKph || 0),
      accuracy: Number(point.accuracy || 0),
      heading: typeof point.heading === 'number' ? point.heading : null,
      source,
      recordedAt: new Date(point.recordedAtMs || Date.now()).toISOString(),
      stable: true,
    },
  }));
}

function toGpsPoint(pos, source) {
  const c = pos?.coords || {};
  const lat = Number(c.latitude);
  const lng = Number(c.longitude);
  const rawSpeed = Number(c.speed || 0);
  const recordedAtMs = Number.isFinite(pos?.timestamp) && pos.timestamp > 0 ? pos.timestamp : Date.now();
  return {
    lat,
    lng,
    accuracy: Number(c.accuracy || 0),
    speedKph: Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed * 3.6 : 0,
    heading: typeof c.heading === 'number' && Number.isFinite(c.heading) ? c.heading : null,
    recordedAtMs,
    source,
  };
}

function adaptiveLocalSpeedLimit(speedKph) {
  if (speedKph <= STATIONARY_SPEED_KPH) return 45;
  if (speedKph < LOW_SPEED_KPH) return 70;
  return Math.min(145, Math.max(95, speedKph + 45));
}

function pointHeading(point) {
  const heading = Number(point?.heading);
  return Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : null;
}

function effectiveSpeedKph(point, prev = null) {
  const candidates = [
    Number(point?.speedKph || 0),
    Number(prev?.speedKph || 0),
    Number(_lastSentMotion?.speedKph || 0),
  ];
  return Math.max(0, ...candidates.filter(Number.isFinite));
}

function isDirectionMismatch(point, prev, distKm) {
  if (!point || !prev || distKm < 0.05) return false;
  const prevHeading = pointHeading(prev) ?? _lastSentMotion?.heading;
  if (!Number.isFinite(prevHeading)) return false;

  const moveBearing = bearingDeg(prev.lat, prev.lng, point.lat, point.lng);
  const diff = angleDiffDeg(prevHeading, moveBearing);
  if (diff == null) return false;

  const speed = effectiveSpeedKph(point, prev);
  const accuracy = Number(point.accuracy || 0);
  if (speed < LOW_SPEED_KPH && distKm < 0.25) return false;
  if (accuracy >= ACCURACY_SUSPECT_M && diff > 100 && distKm > 0.08) return true;
  if (diff > 135 && distKm > 0.2) return true;
  return false;
}

function isTunnelRecoveryCandidate(point, prev, distKm, impliedSpeed, dtSec) {
  if (!point || !prev) return false;
  if (dtSec < 8 || distKm < 0.08) return false;
  if (isDirectionMismatch(point, prev, distKm)) return false;
  const speed = effectiveSpeedKph(point, prev);
  const limit = Math.min(145, Math.max(75, speed + 35));
  return impliedSpeed <= limit;
}

function duplicateRadiusKm(point) {
  const speed = Number(point?.speedKph || 0);
  const accuracy = Number(point?.accuracy || 0);
  if (speed <= STATIONARY_SPEED_KPH || accuracy >= ACCURACY_SUSPECT_M) return 0.025;
  if (speed < LOW_SPEED_KPH) return 0.018;
  return 0.012;
}

function shouldHoldCandidate(point, prev, distKm, impliedSpeed) {
  const speed = Number(point.speedKph || 0);
  const accuracy = Number(point.accuracy || 0);
  if (speed <= STATIONARY_SPEED_KPH && distKm > 0.025 && impliedSpeed > 12) return true;
  if (speed < LOW_SPEED_KPH && distKm > 0.04 && impliedSpeed > 25) return true;
  if (accuracy >= ACCURACY_SUSPECT_M && distKm > 0.025) return true;
  if (distKm > 0.05 && impliedSpeed > adaptiveLocalSpeedLimit(speed)) return true;
  return false;
}

function acceptPendingCandidate(point, prev) {
  if (!_pendingPoint || !prev) return false;
  const pendingGapKm = haversineKm(_pendingPoint.lat, _pendingPoint.lng, point.lat, point.lng);
  const pendingFromPrevKm = haversineKm(prev.lat, prev.lng, _pendingPoint.lat, _pendingPoint.lng);
  const currentFromPrevKm = haversineKm(prev.lat, prev.lng, point.lat, point.lng);
  const elapsedSec = Math.max(1, (point.recordedAtMs - prev.recordedAtMs) / 1000);
  const impliedSpeed = currentFromPrevKm / (elapsedSec / 3600);
  const clusterKm = Math.max(0.025, ((point.accuracy || 0) + (_pendingPoint.accuracy || 0)) / 1000);
  const sameCluster = pendingGapKm <= clusterKm;
  const stillAway = currentFromPrevKm > duplicateRadiusKm(point);
  const notRetreating = currentFromPrevKm >= Math.max(0.015, pendingFromPrevKm * 0.6);
  const plausibleByTime = currentFromPrevKm <= 0.05 || impliedSpeed <= adaptiveLocalSpeedLimit(effectiveSpeedKph(point, prev));
  const plausibleDirection = !isDirectionMismatch(point, prev, currentFromPrevKm);
  return sameCluster && stillAway && notRetreating && plausibleByTime && plausibleDirection;
}

function stabilizeGpsPoint(point, { forced = false } = {}) {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return { ok: false, reason: 'invalid_coord' };
  }

  if (!forced && point.accuracy > ACCURACY_HARD_SKIP_M) {
    return { ok: false, reason: 'low_accuracy' };
  }

  if (forced || !_lastAcceptedPoint) {
    _lastAcceptedPoint = point;
    _pendingPoint = null;
    _pendingCount = 0;
    return { ok: true, point, reason: forced ? 'forced' : 'first' };
  }

  const prev = _lastAcceptedPoint;
  const distKm = haversineKm(prev.lat, prev.lng, point.lat, point.lng);
  const dtSec = Math.max(1, (point.recordedAtMs - prev.recordedAtMs) / 1000);
  const impliedSpeed = distKm / (dtSec / 3600);

  if (distKm <= duplicateRadiusKm(point)) {
    _pendingPoint = null;
    _pendingCount = 0;
    return { ok: false, reason: 'duplicate_jitter', distKm, impliedSpeed };
  }

  if (isDirectionMismatch(point, prev, distKm)) {
    _pendingPoint = point;
    _pendingCount = 1;
    return { ok: false, reason: 'heading_mismatch', distKm, impliedSpeed };
  }

  const tunnelRecovery = isTunnelRecoveryCandidate(point, prev, distKm, impliedSpeed, dtSec);
  if (tunnelRecovery && point.accuracy <= ACCURACY_SUSPECT_M) {
    _lastAcceptedPoint = point;
    _pendingPoint = null;
    _pendingCount = 0;
    return { ok: true, point, reason: 'tunnel_recovery' };
  }

  if (shouldHoldCandidate(point, prev, distKm, impliedSpeed)) {
    if (acceptPendingCandidate(point, prev)) {
      _pendingCount += 1;
      if (_pendingCount >= 2) {
        _lastAcceptedPoint = point;
        _pendingPoint = null;
        _pendingCount = 0;
        return { ok: true, point, reason: 'confirmed_candidate' };
      }
    } else {
      _pendingPoint = point;
      _pendingCount = 1;
    }
    return { ok: false, reason: 'pending_candidate', distKm, impliedSpeed };
  }

  _lastAcceptedPoint = point;
  _pendingPoint = null;
  _pendingCount = 0;
  return { ok: true, point, reason: 'accepted' };
}

function shouldTransmitStablePoint(point, { forced = false, isTurningOrChangingSpeed = false } = {}) {
  if (forced || !_lastTransmittedPoint) return { ok: true, reason: forced ? 'forced' : 'first' };

  const distKm = haversineKm(_lastTransmittedPoint.lat, _lastTransmittedPoint.lng, point.lat, point.lng);
  const elapsedMs = Math.max(0, point.recordedAtMs - _lastTransmittedPoint.recordedAtMs);
  const fastMode = State.trip.isRealtime || point.source === 'map_foreground';
  const speed = Number(point.speedKph || 0);

  let minMoveKm;
  if (fastMode) minMoveKm = speed < LOW_SPEED_KPH ? 0.025 : 0.015;
  else if (isTurningOrChangingSpeed) minMoveKm = 0.025;
  else if (speed <= STATIONARY_SPEED_KPH) minMoveKm = 0.06;
  else if (speed < 45) minMoveKm = 0.05;
  else minMoveKm = 0.08;

  const heartbeatMs = fastMode ? 20_000 : (speed <= STATIONARY_SPEED_KPH ? 90_000 : 45_000);
  if (distKm >= minMoveKm) return { ok: true, reason: 'moved', distKm };
  if (elapsedMs >= heartbeatMs) return { ok: true, reason: 'heartbeat', distKm };
  return { ok: false, reason: 'local_duplicate', distKm };
}

function logGpsFilter(reason, detail = '') {
  const now = Date.now();
  if (now - _lastFilterLogMs < 15_000) return;
  _lastFilterLogMs = now;
  remoteLog(`GPS 로컬필터: ${reason}${detail ? ` ${detail}` : ''}`, 'GPS_FILTER');
}

async function pollMapForegroundPosition() {
  if (_mapForegroundBusy || !navigator.geolocation) return;
  if (State.trip.status !== 'driving' || !State.trip.id) return;
  _mapForegroundBusy = true;
  navigator.geolocation.getCurrentPosition(
    pos => {
      _mapForegroundBusy = false;
      onGpsUpdate(pos, false, State.trip.id, null, { source: 'map_foreground' }).catch?.(() => { });
    },
    () => { _mapForegroundBusy = false; },
    { enableHighAccuracy: true, timeout: 1200, maximumAge: 0 }
  );
}

async function pollAppForegroundPosition() {
  if (_appForegroundBusy || _mapForegroundTimer || !navigator.geolocation) return;
  if (document.visibilityState === 'hidden') return;
  if (State.trip.status !== 'driving' || !State.trip.id) return;
  _appForegroundBusy = true;
  navigator.geolocation.getCurrentPosition(
    pos => {
      _appForegroundBusy = false;
      onGpsUpdate(pos, false, State.trip.id, null, { source: 'app_foreground' }).catch?.(() => { });
    },
    () => { _appForegroundBusy = false; },
    { enableHighAccuracy: true, timeout: 2000, maximumAge: 0 }
  );
}

function startAppForegroundTracking() {
  if (_appForegroundTimer) return;
  _appForegroundTimer = setInterval(pollAppForegroundPosition, 10000);
  document.addEventListener('visibilitychange', pollAppForegroundPosition);
}

function stopAppForegroundTracking() {
  if (_appForegroundTimer) {
    clearInterval(_appForegroundTimer);
    _appForegroundTimer = null;
  }
  document.removeEventListener('visibilitychange', pollAppForegroundPosition);
  _appForegroundBusy = false;
}

export function startMapForegroundTracking() {
  if (_mapForegroundTimer) return;
  pollMapForegroundPosition();
  _mapForegroundTimer = setInterval(pollMapForegroundPosition, 1000);
  remoteLog('지도 전경 GPS 샘플링 시작 (1초 수신, 안정 포인트만 반영/전송)', 'GPS_MAP');
}

export function stopMapForegroundTracking() {
  if (_mapForegroundTimer) {
    clearInterval(_mapForegroundTimer);
    _mapForegroundTimer = null;
  }
  _mapForegroundBusy = false;
  remoteLog('지도 전경 GPS 샘플링 종료', 'GPS_MAP');
}

// ─── BackgroundGeolocation 플러그인 접근 ──────────────────────────
function getBgGeo() {
  try {
    // Capacitor registerPlugin 방식
    if (window.Capacitor?.registerPlugin) {
      return window.Capacitor.Plugins?.BackgroundGeolocation
        || window.Capacitor.registerPlugin('BackgroundGeolocation');
    }
    return window.Capacitor?.Plugins?.BackgroundGeolocation || null;
  } catch (e) {
    console.warn('BackgroundGeolocation 플러그인 로드 실패:', e);
    return null;
  }
}

function startMotionBurstWatcher() {
  if (!window.DeviceMotionEvent) return;
  window.addEventListener('devicemotion', (event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc) return;
    const magnitude = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
    if (magnitude >= 15) _motionBurstUntil = Date.now() + 15000;
  }, { passive: true });
}

// ─── GPS 시작: 네이티브 BackgroundGeolocation ─────────────────────
export async function startGPS() {
  if (gpsWatchId !== null) return;

  const BgGeo = getBgGeo();
  if (!BgGeo) {
    // 네이티브 플러그인 없으면 (브라우저 개발 환경) 폴백
    remoteLog('BackgroundGeolocation 플러그인 없음 — 브라우저 폴백', 'GPS_FALLBACK');
    resetGpsStabilizer();
    _startBrowserFallback();
    return;
  }

  remoteLog('startGPS() — 네이티브 BackgroundGeolocation.addWatcher 시작', 'GPS_INIT');
  resetGpsStabilizer();
  startMotionBurstWatcher();
  startAppForegroundTracking();

  try {
    const watcherId = await BgGeo.addWatcher(
      {
        backgroundMessage: 'ELS 차량 위치를 추적 중입니다.',
        backgroundTitle: 'ELS 위치 관제',
        requestPermissions: true,
        stale: false,
        distanceFilter: 20,  // 기본 주행은 배터리 보호, 지도/실시간은 전경 샘플러로 보강
      },
      (location, error) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            remoteLog('GPS 권한 거부 — 사용자에게 설정 안내 필요', 'GPS_PERM_ERR');
          } else {
            remoteLog(`GPS 네이티브 에러: ${error.code} ${error.message || ''}`, 'GPS_NATIVE_ERR');
          }
          return;
        }
        if (!location) return;

        lastGpsTimestamp = Date.now();

        // 네이티브 location → 표준 좌표 객체로 변환
        const pos = {
          coords: {
            latitude:  location.latitude,
            longitude: location.longitude,
            accuracy:  location.accuracy || 0,
            speed:     location.speed,       // m/s 또는 null
            heading:   location.bearing ?? location.heading ?? null,
            altitude:  location.altitude,
          },
          timestamp: Date.now(),
        };
        onGpsUpdate(pos, false);
      }
    );

    gpsWatchId = watcherId;
    remoteLog(`네이티브 GPS Watcher 등록 완료: ID=${watcherId}`, 'GPS_INIT');

    // 즉시 1회 강제 수신 (초기 공백 방지)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          lastGpsTimestamp = Date.now();
          remoteLog(
            `GPS 초기수신: ${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)} acc:${pos.coords.accuracy?.toFixed(0)}m`,
            'GPS_INIT'
          );
          onGpsUpdate(pos, false, State.trip.id, null, { source: 'app_initial' });
        },
        err => remoteLog(`GPS 초기수신 실패: ${err.code} ${err.message}`, 'GPS_INIT_ERR'),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  } catch (e) {
    remoteLog(`BackgroundGeolocation.addWatcher 실패: ${e.message}`, 'GPS_INIT_ERR');
    // 네이티브 실패 시 브라우저 폴백
    _startBrowserFallback();
  }
}

// ─── GPS 정지 ────────────────────────────────────────────────────
export function stopGPS() {
  if (gpsWatchId !== null) {
    const BgGeo = getBgGeo();
    if (BgGeo) {
      BgGeo.removeWatcher({ id: gpsWatchId }).catch(() => { });
      remoteLog(`네이티브 GPS Watcher 해제: ID=${gpsWatchId}`, 'GPS_STOP');
    } else if (_browserWatchId !== null) {
      navigator.geolocation.clearWatch(_browserWatchId);
      remoteLog(`브라우저 GPS 해제: ID=${_browserWatchId}`, 'GPS_STOP');
      _browserWatchId = null;
    }
    gpsWatchId = null;
  }
  lastGpsTimestamp = 0;
  stopAppForegroundTracking();
}

// ─── 브라우저 폴백 (PC 개발/테스트용) ────────────────────────────
let _browserWatchId = null;

function _startBrowserFallback() {
  if (!navigator.geolocation) {
    remoteLog('navigator.geolocation 없음 — GPS 완전 불가', 'GPS_FATAL');
    return;
  }
  if (gpsWatchId !== null) return;

  // 즉시 1회
  navigator.geolocation.getCurrentPosition(
    pos => {
      lastGpsTimestamp = Date.now();
      onGpsUpdate(pos, false, State.trip.id, null, { source: 'browser_initial' });
    },
    () => {},
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );

  _browserWatchId = navigator.geolocation.watchPosition(
    pos => {
      lastGpsTimestamp = Date.now();
      onGpsUpdate(pos, false);
    },
    err => {
      remoteLog(`브라우저 GPS watch 에러: ${err.code} ${err.message}`, 'GPS_WATCH_ERR');
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
  );
  gpsWatchId = '__browser__';
  remoteLog(`브라우저 GPS watchPosition 등록 (폴백): ID=${_browserWatchId}`, 'GPS_INIT');
}

// ─── 운행 상태 타이머 ─────────────────────────────────────────────
let tripStatusTimer = null;
export function startTripStatusTimer() {
  if (tripStatusTimer) clearInterval(tripStatusTimer);
  tripStatusTimer = setInterval(updateTripStatusLine, 1000);
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return '00:00:00';
  const s  = Math.floor(ms / 1000);
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h, m, ss].map(v => String(v).padStart(2, '0')).join(':');
}

// ─── 주소 축약 ───────────────────────────────────────────────────
function abbreviateAddr(full) {
  if (!full || full.includes('확인 중')) return full;
  return full.split(' ')
    .map(s => s
      .replace(/특별시|광역시|특별자치시|특별자치도/g, '')
      .replace(/(도|시|구|동|읍|면|리)$/g, ''))
    .filter(s => s.length > 0)
    .join(' ');
}

// ─── 상태 표시줄 갱신 (1초 타이머 + GPS 수신 시) ─────────────────
export function updateTripStatusLine() {
  // 절대 시간으로 실시간 모드 만료 체크
  if (State.trip.isRealtime && Date.now() > realtimeExpireAt) {
    State.trip.isRealtime = false;
    remoteLog('실시간 고정밀 관제 모드 종료', 'SYSTEM');
  }

  const dateDisplay = document.getElementById('trip-date-display');
  const sep1        = document.getElementById('trip-status-sep1');
  const elapsedEl   = document.getElementById('trip-elapsed-display');
  const sepTime     = document.getElementById('trip-status-sep-time');
  const speedEl     = document.getElementById('trip-speed-display');
  const sepSpeed    = document.getElementById('trip-status-sep-speed');
  const gpsChip     = document.getElementById('trip-gps-chip');
  const sep2        = document.getElementById('trip-status-sep2');
  const addrDisplay = document.getElementById('trip-addr-display');
  
  const settingsDateDisplay = document.getElementById('settings-trip-date-display');
  const settingsAddrDisplay = document.getElementById('settings-trip-addr-display');

  if (State.trip.status === 'idle') {
    if (dateDisplay) {
      dateDisplay.textContent  = '운송시작 대기중';
      dateDisplay.style.color  = 'var(--primary)';
      dateDisplay.style.fontWeight = '700';
    }
    if (settingsDateDisplay) {
      settingsDateDisplay.textContent  = '운송시작 대기중';
      settingsDateDisplay.style.color  = 'var(--primary)';
    }
    if (sep1)        sep1.style.display  = 'none';
    if (elapsedEl)   elapsedEl.style.display = 'none';
    if (sepTime)     sepTime.style.display = 'none';
    if (speedEl)     speedEl.style.display = 'none';
    if (sepSpeed)    sepSpeed.style.display = 'none';
    if (gpsChip)     gpsChip.style.display = 'none';
    if (sep2)        sep2.style.display  = 'none';
    if (addrDisplay) addrDisplay.style.display = 'none';
    if (settingsAddrDisplay) settingsAddrDisplay.style.display = 'none';
    return;
  }

  // GPS 수신 상태 판단: 네이티브 플러그인이므로 임계값을 90초로 상향 (정차 시 지연 고려)
  const deadTimeout = 90_000;
  const isDown = !lastGpsTimestamp || (Date.now() - lastGpsTimestamp > deadTimeout);
  let gpsColor = '#10b981';
  let gpsText  = `${Math.round(currentGpsInterval / 1000)}s`;

  if (State.trip.status === 'paused') {
    gpsColor = '#ef4444';
    gpsText  = '수신중지';
  } else if (isDown && State.trip.status === 'driving') {
    if (window._resumeGracePeriod) {
      gpsColor = '#10b981';
      gpsText  = '수신대기';
    } else {
      gpsColor = '#ef4444';
      gpsText  = '연결안됨';
    }
  } else if (State.trip.isRealtime) {
    gpsColor = '#f59e0b';
    gpsText  = '실시간 수집중';
  }

  const addrShort = abbreviateAddr(lastKnownAddr);

  if (dateDisplay && State.trip.startTime) {
    const d   = new Date(State.trip.startTime);
    const mm  = String(d.getMonth() + 1).padStart(2, '0');
    const dd  = String(d.getDate()).padStart(2, '0');
    const HH  = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const timeStr = `${mm}/${dd} ${HH}:${min}`;
    dateDisplay.textContent      = timeStr;
    dateDisplay.style.color      = '#64748b';
    dateDisplay.style.fontWeight = '400';
    if (settingsDateDisplay) {
        settingsDateDisplay.textContent = timeStr;
        settingsDateDisplay.style.color = '#64748b';
    }
  }

  const elapsedText = State.trip.startTime ? formatDuration(Date.now() - State.trip.startTime) : '00:00:00';
  if (sep1)      sep1.style.display = 'inline-block';
  if (elapsedEl) {
    elapsedEl.style.display = 'inline-block';
    elapsedEl.textContent = elapsedText;
  }
  if (sepTime)   sepTime.style.display = 'inline-block';
  if (speedEl) {
    speedEl.style.display = 'inline-block';
    speedEl.textContent = `${Math.round(Math.max(0, Math.min(_currentSpeedKph, 160)))}km/h`;
  }
  if (sepSpeed)  sepSpeed.style.display = 'inline-block';
  if (gpsChip) {
    gpsChip.style.display = 'inline-block';
    gpsChip.style.color   = gpsColor;
    gpsChip.textContent   = `GPS ${gpsText}`;
  }
  if (sep2)        sep2.style.display  = 'inline-block';
  if (addrDisplay) {
    addrDisplay.style.display = 'inline-block';
    addrDisplay.textContent   = addrShort || '위치 확인 중...';
  }
  if (settingsAddrDisplay) {
    settingsAddrDisplay.style.display = 'inline-block';
    settingsAddrDisplay.textContent   = addrShort || '위치 확인 중...';
  }

  // 오버레이 위젯 동기화
  const overlay = Overlay();
  if (overlay && (State.trip.status === 'driving' || State.trip.status === 'paused')) {
    overlay.updateStatus({
      status:     State.trip.status,
      gpsText,
      gpsColor,
      address:    addrShort,
      isRealtime: State.trip.isRealtime,
    }).catch(() => { });
  }
}

// ─── GPS 수신 처리 (서버 전송) ────────────────────────────────────
let lastEmergencyPollMs = 0;

export async function onGpsUpdate(pos, isForced = false, forcedTripId = null, markerType = null, options = {}) {
  const targetId = forcedTripId || State.trip.id;
  if (!targetId) return false;

  // 30초마다 긴급명령 폴링
  const _now = Date.now();
  if (_now - lastEmergencyPollMs > 30000 && State.trip.status === 'driving') {
    lastEmergencyPollMs = _now;
    window.App?.pollEmergency?.().catch?.(() => { });
  }

  if (State.trip.status !== 'driving' && !isForced) return false;

  const source = options.source || (isForced ? (markerType || 'native_forced') : 'native_bg');
  const markerName = String(markerType || '').toUpperCase();
  const isTripEndMarker = markerName === 'TRIP_END';
  const rawPoint = toGpsPoint(pos, source);
  const speedKph = rawPoint.speedKph;
  _currentSpeedKph = speedKph > 160 ? 0 : speedKph;
  lastGpsTimestamp = Date.now();

  const forceStability = options.forceStability === true || ((isForced || Boolean(markerType)) && !isTripEndMarker);
  let stable = stabilizeGpsPoint(rawPoint, { forced: forceStability });
  if (!stable.ok && isTripEndMarker && stable.reason === 'duplicate_jitter' && _lastAcceptedPoint) {
    stable = {
      ok: true,
      point: { ..._lastAcceptedPoint, speedKph: 0, recordedAtMs: rawPoint.recordedAtMs },
      reason: 'trip_end_last_stable',
    };
  }
  if (!stable.ok) {
    logGpsFilter(stable.reason, stable.distKm ? `dist=${Math.round(stable.distKm * 1000)}m` : '');
    updateTripStatusLine();
    return false;
  }

  const point = stable.point;
  const { lat, lng, accuracy, heading } = point;

  // 마지막 확정 위치 저장 (endTrip fallback과 지도 표시 모두 raw가 아니라 안정 포인트 기준)
  State._lastLat = lat;
  State._lastLng = lng;
  State._lastGpsRecordedAtMs = point.recordedAtMs;
  emitGpsSample(point, source);

  const lastMotion = _lastSentMotion;
  const speedDelta = lastMotion ? Math.abs(speedKph - lastMotion.speedKph) : 0;
  const headingDelta = (lastMotion && heading !== null && lastMotion.heading !== null)
    ? Math.min(Math.abs(heading - lastMotion.heading), 360 - Math.abs(heading - lastMotion.heading))
    : 0;
  const isMotionBurst = Date.now() < _motionBurstUntil;
  const isTurningOrChangingSpeed = isMotionBurst || speedDelta >= 10 || headingDelta >= 22;

  // 센서 수신과 서버 전송을 분리한다. 지도/웹 실시간은 민감하게, 일반 운행은 배터리와 서버 부하를 우선한다.
  const isMapForeground = options.source === 'map_foreground';
  const isAppForeground = options.source === 'app_foreground';
  let interval = 18_000;
  if (State.trip.isRealtime || isMapForeground) {
    interval = 2_000;
  } else if (speedKph <= STATIONARY_SPEED_KPH) {
    interval = 45_000;
  } else if (isAppForeground) {
    interval = 10_000;
  } else if (isTurningOrChangingSpeed) {
    interval = 6_000;
  } else if (speedKph < 15) {
    interval = 12_000;
  } else if (speedKph < 45) {
    interval = 15_000;
  } else if (speedKph >= 80) {
    interval = 20_000;
  }

  if (interval !== currentGpsInterval) currentGpsInterval = interval;

  updateTripStatusLine();

  const curTime     = Date.now();
  const minInterval = (isForced || markerType) ? 0 : interval;
  if (!isForced && !markerType && curTime - lastGpsSend < minInterval) return false;

  const transmitDecision = shouldTransmitStablePoint(point, {
    forced: isForced || Boolean(markerType),
    isTurningOrChangingSpeed,
  });
  if (!transmitDecision.ok) {
    logGpsFilter(transmitDecision.reason, transmitDecision.distKm ? `dist=${Math.round(transmitDecision.distKm * 1000)}m` : '');
    return false;
  }

  lastGpsSend = curTime;
  _lastTransmittedPoint = point;

  const payload = {
    trip_id:     targetId,
    lat, lng,
    speed:       speedKph,
    accuracy:    accuracy || 0,
    marker_type: markerType || null,
    recorded_at: new Date(point.recordedAtMs || curTime).toISOString(),
    source,
    realtime: Boolean(State.trip.isRealtime || isMapForeground),
  };

  try {
    const gpsRes = await smartFetch(BASE_URL + '/api/vehicle-tracking/location', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    let savedOnServer = false;
    if (gpsRes.ok) {
      const gpsData = await gpsRes.json().catch(() => ({}));
      lastKnownAddr = gpsData.address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      if (!gpsData.skipped) {
        _lastSentMotion = { speedKph, heading };
        savedOnServer = true;
      }

      // 서버 응답 성공 시 오프라인 큐 플러시 시도
      flushOfflineQueue();
    } else {
      lastKnownAddr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
    updateTripStatusLine();
    remoteLog(
      `GPS전송[${markerType || transmitDecision.reason}]: ${lastKnownAddr} spd=${speedKph.toFixed(0)}kph acc=${accuracy?.toFixed(0)}m`,
      'GPS_OK'
    );
    return savedOnServer;
  } catch (e) {
    lastKnownAddr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    updateTripStatusLine();
    remoteLog(`GPS 서버전송 실패 (오프라인 캐시): ${e.message}`, 'GPS_SEND_ERR');
    enqueueGpsPayload(payload);
    return true;
  }
}

// ─── 역지오코딩 (단독 조회용) ────────────────────────────────────
export async function reverseGeocode(lat, lng) {
  try {
    const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/geocode?lat=${lat}&lng=${lng}`);
    if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
    const d = await res.json();
    return (d && d.address) ? d.address : null;
  } catch (e) {
    console.warn('reverseGeocode failed', e);
    return null;
  }
}
