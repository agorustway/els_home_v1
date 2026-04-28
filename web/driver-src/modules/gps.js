/**
 * gps.js — GPS 추적 (네이티브 BackgroundGeolocation 플러그인 기반)
 *
 * [v5.10.0] 전면 리팩토링
 * - navigator.geolocation.watchPosition 폐기 → @capacitor-community/background-geolocation 전환
 * - 백그라운드 위치 수집 끊김 근본 해결 (네이티브 포그라운드 서비스)
 * - 수집 빈도 대폭 상향: 시간 기반 5~10초 + 거리 기반 10m
 * - 불필요한 자이로/모션/심폐소생 코드 제거
 */
import { State, BASE_URL } from './store.js?v=5101';
import { Overlay, remoteLog, smartFetch } from './bridge.js?v=5101';

// ─── GPS 상태 변수 ────────────────────────────────────────────────
export let gpsWatchId        = null;   // 네이티브 Watcher ID (string)
export let lastGpsSend       = 0;
export let currentGpsInterval = 10_000;
export let lastGpsTimestamp  = 0;
export let lastKnownAddr     = '위치 확인 중...';
export let realtimeExpireAt  = 0;

// ─── 오프라인 큐 ────────────────────────────────────────────────
export let _gpsOfflineQueue = [];
try { _gpsOfflineQueue = JSON.parse(localStorage.getItem('els_gps_queue') || '[]'); } catch(e){}

const MAX_QUEUE_SIZE = 500;
let _isFlushingQueue = false;

function saveGpsQueue() {
  if (_gpsOfflineQueue.length > MAX_QUEUE_SIZE) {
    _gpsOfflineQueue = _gpsOfflineQueue.slice(-MAX_QUEUE_SIZE);
  }
  localStorage.setItem('els_gps_queue', JSON.stringify(_gpsOfflineQueue));
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

// ─── GPS 시작: 네이티브 BackgroundGeolocation ─────────────────────
export async function startGPS() {
  if (gpsWatchId !== null) return;

  const BgGeo = getBgGeo();
  if (!BgGeo) {
    // 네이티브 플러그인 없으면 (브라우저 개발 환경) 폴백
    remoteLog('BackgroundGeolocation 플러그인 없음 — 브라우저 폴백', 'GPS_FALLBACK');
    _startBrowserFallback();
    return;
  }

  remoteLog('startGPS() — 네이티브 BackgroundGeolocation.addWatcher 시작', 'GPS_INIT');

  try {
    const watcherId = await BgGeo.addWatcher(
      {
        backgroundMessage: 'ELS 차량 위치를 추적 중입니다.',
        backgroundTitle: 'ELS 위치 관제',
        requestPermissions: true,
        stale: false,
        distanceFilter: 0, // 거리 무관하게 지속 수집 (배터리 무시, 포인트 최대 확보)
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
            altitude:  location.altitude,
          },
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
          onGpsUpdate(pos, true, State.trip.id);
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
      onGpsUpdate(pos, true, State.trip.id);
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

  if (sep1)    sep1.style.display = 'inline-block';
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

export async function onGpsUpdate(pos, isForced = false, forcedTripId = null, markerType = null) {
  const targetId = forcedTripId || State.trip.id;
  if (!targetId) return;

  // 30초마다 긴급명령 폴링
  const _now = Date.now();
  if (_now - lastEmergencyPollMs > 30000 && State.trip.status === 'driving') {
    lastEmergencyPollMs = _now;
    window.App?.pollEmergency?.().catch?.(() => { });
  }

  if (State.trip.status !== 'driving' && !isForced) return;
  const { latitude: lat, longitude: lng, speed, accuracy } = pos.coords;

  const speedKph = (speed || 0) * 3.6;
  lastGpsTimestamp = Date.now();

  // 정확도 필터: 500m 초과만 스킵 (기존 200m → 완화)
  if (!isForced && accuracy && accuracy > 500) {
    remoteLog(`GPS 정확도 낮음: ${accuracy.toFixed(0)}m - 전송 스킵`, 'GPS_ACCURACY');
    updateTripStatusLine();
    return;
  }

  // 속도 기반 가변 전송 주기 (네이티브 수집 주기와 별개로 서버 전송 빈도)
  let interval = 10_000;           // 기본 10초
  if (State.trip.isRealtime) {
    interval = 3_000;              // 실시간 모드: 3초
  } else if (speedKph >= 80) {
    interval = 5_000;              // 고속: 5초
  } else if (speedKph >= 40) {
    interval = 8_000;              // 중속: 8초
  }
  // 저속/정지: 10초 (기본값 유지)

  if (interval !== currentGpsInterval) currentGpsInterval = interval;

  updateTripStatusLine();

  const curTime     = Date.now();
  const minInterval = (isForced || markerType) ? 0 : interval;
  if (!isForced && !markerType && curTime - lastGpsSend < minInterval) return;

  lastGpsSend = curTime;

  const payload = {
    trip_id:     targetId,
    lat, lng,
    speed:       speedKph,
    accuracy:    accuracy || 0,
    marker_type: markerType || null,
    source: isForced
      ? (markerType || 'native_forced')
      : 'native_bg',
  };

  try {
    const gpsRes = await smartFetch(BASE_URL + '/api/vehicle-tracking/location', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (gpsRes.ok) {
      const gpsData = await gpsRes.json().catch(() => ({}));
      lastKnownAddr = gpsData.address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

      // 서버 응답 성공 시 오프라인 큐 플러시 시도
      flushOfflineQueue();
    } else {
      lastKnownAddr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
    updateTripStatusLine();
    remoteLog(
      `GPS전송[${markerType || 'normal'}]: ${lastKnownAddr} spd=${speedKph.toFixed(0)}kph acc=${accuracy?.toFixed(0)}m`,
      'GPS_OK'
    );
  } catch (e) {
    lastKnownAddr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    updateTripStatusLine();
    remoteLog(`GPS 서버전송 실패 (오프라인 캐시): ${e.message}`, 'GPS_SEND_ERR');
    _gpsOfflineQueue.push(payload);
    saveGpsQueue();
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
