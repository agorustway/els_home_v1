/**
 * gps.js — GPS 추적, 오버레이 상태 표시, 역지오코딩
 */
import { State, BASE_URL } from './store.js?v=486';
import { Overlay, remoteLog, smartFetch } from './bridge.js?v=486';

// ─── GPS 상태 변수 ────────────────────────────────────────────────
export let gpsWatchId        = null;
export let lastGpsSend       = 0;
export let currentGpsInterval = 60_000;
export let lastGpsTimestamp  = 0;
export let lastKnownAddr     = '위치 확인 중...';
export let realtimeExpireAt  = 0;

const gyroData = { magnitude: 0 };

// ─── 오프라인 캐시 ────────────────────────────────────────────────
export let _gpsOfflineQueue = [];
try { _gpsOfflineQueue = JSON.parse(localStorage.getItem('els_gps_queue') || '[]'); } catch(e){}
const saveGpsQueue = () => {
  if (_gpsOfflineQueue.length > 500) _gpsOfflineQueue = _gpsOfflineQueue.slice(-500);
  localStorage.setItem('els_gps_queue', JSON.stringify(_gpsOfflineQueue));
};

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

// ─── GPS watchPosition ────────────────────────────────────────────
export function startGPS() {
  if (!navigator.geolocation) {
    remoteLog('navigator.geolocation 없음 - GPS 불가', 'GPS_FATAL');
    return;
  }
  if (gpsWatchId) return;

  remoteLog('startGPS() called - watchPosition 시작', 'GPS_INIT');

  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', handleGyro, { passive: true });
  }
  if (window.DeviceMotionEvent) {
    window.addEventListener('devicemotion', handleMotion, { passive: true });
  }

  // 즉시 1회 강제 수신 (초기 공백 방지)
  navigator.geolocation.getCurrentPosition(
    pos => {
      lastGpsTimestamp = Date.now();
      remoteLog(
        `GPS 초기수신 성공: ${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)} acc:${pos.coords.accuracy?.toFixed(0)}m`,
        'GPS_INIT'
      );
      onGpsUpdate(pos, true, State.trip.id);
    },
    err => remoteLog(`GPS 초기수신 실패: ${err.code} ${err.message}`, 'GPS_INIT_ERR'),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );

  gpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      lastGpsTimestamp = Date.now();
      onGpsUpdate(pos, false);
    },
    err => {
      remoteLog(`GPS watchPosition 에러: code=${err.code} msg=${err.message}`, 'GPS_WATCH_ERR');
      console.warn('GPS watch error', err.code, err.message);
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
  );
  remoteLog(`GPS watchPosition 등록됨 ID=${gpsWatchId}`, 'GPS_INIT');
}

export function stopGPS() {
  if (gpsWatchId) {
    navigator.geolocation.clearWatch(gpsWatchId);
    remoteLog(`GPS watchPosition 해제 ID=${gpsWatchId}`, 'GPS_STOP');
    gpsWatchId = null;
  }
  window.removeEventListener('deviceorientation', handleGyro);
  window.removeEventListener('devicemotion', handleMotion);
  lastGpsTimestamp = 0;
}

function handleGyro(e) {
  gyroData.magnitude = Math.abs(e.alpha || 0) + Math.abs(e.beta || 0) + Math.abs(e.gamma || 0);
}

function handleMotion(e) {
  const acc = e.acceleration;
  if (acc) {
    const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
    if (gyroData.magnitude < 10) gyroData.magnitude = Math.max(gyroData.magnitude, mag * 3);
  }
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
  // 절대 시간으로 실시간 모드 만료 체크 (백그라운드 setTimeout 지연 대응)
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

  const deadTimeout = Math.max(currentGpsInterval + 10_000, 30_000);
  const isDown = !lastGpsTimestamp || (Date.now() - lastGpsTimestamp > deadTimeout);
  let gpsColor = '#10b981';
  let gpsText  = `${Math.round(currentGpsInterval / 1000)}s`;

  if (State.trip.status === 'paused') {
    gpsColor = '#ef4444';
    gpsText  = '수신중지';
  } else if (isDown && State.trip.status === 'driving') {
    if (window._resumeGracePeriod) {
      gpsColor = '#10b981';
      gpsText  = '수신중';
    } else {
      gpsColor = '#ef4444';
      gpsText  = '연결안됨';

      const now = Date.now();
      if (!window._lastGpsRetry || (now - window._lastGpsRetry > 3000)) {
        window._lastGpsRetry = now;
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => { lastGpsTimestamp = Date.now(); onGpsUpdate(pos, true, State.trip.id); },
            () => { },
            { enableHighAccuracy: true, timeout: 2500, maximumAge: 0 }
          );
        }
      }
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

  // 기지국/네트워크 위치 원천 차단 (속도 데이터 없음 = GPS 아님)
  if (!State.trip.isRealtime && (speed === null || speed === undefined)) {
    remoteLog(`기지국/네트워크 위치 스킵 (속도 불명): acc=${accuracy?.toFixed(0)}m`, 'GPS_SKIP_NETWORK');
    return;
  }

  const speedKph = (speed || 0) * 3.6;
  lastGpsTimestamp = Date.now();

  // 정확도 필터 (200m 초과 → 스킵, 단 강제수신/실시간 예외)
  if (!State.trip.isRealtime && !isForced && accuracy && accuracy > 200) {
    remoteLog(`GPS 정확도 낮음: ${accuracy.toFixed(0)}m - 전송 스킵`, 'GPS_ACCURACY');
    updateTripStatusLine();
    return;
  }

  // 속도 기반 가변 주기
  let interval = 60_000;
  if (State.trip.isRealtime)  interval = 3000;
  else if (speedKph >= 60)    interval = 30_000;
  else if (speedKph >= 20)    interval = 45_000;
  if (interval !== currentGpsInterval) currentGpsInterval = interval;

  updateTripStatusLine();

  const isSharpTurn = gyroData.magnitude > 25;
  const curTime     = Date.now();
  const minInterval = (isForced || markerType) ? 0 : (isSharpTurn ? Math.min(10_000, interval) : interval);
  if (!isForced && !markerType && curTime - lastGpsSend < minInterval) return;

  lastGpsSend = curTime;

  const payload = {
    trip_id:     targetId,
    lat, lng,
    speed:       speedKph,
    accuracy:    accuracy || 0,
    marker_type: markerType || null,
    source: isForced
      ? (markerType || 'webview_forced')
      : (isSharpTurn ? 'webview_gyro' : 'webview'),
  };

  try {
    const gpsRes = await smartFetch(BASE_URL + '/api/vehicle-tracking/location', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (gpsRes.ok) {
      const gpsData = await gpsRes.json().catch(() => ({}));
      lastKnownAddr = gpsData.address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

      if (_gpsOfflineQueue.length > 0) {
        const queueBackup = [..._gpsOfflineQueue];
        _gpsOfflineQueue = [];
        saveGpsQueue();
        queueBackup.forEach(async (queuedPayload) => {
          try {
            const r = await fetch(BASE_URL + '/api/vehicle-tracking/location', { method: 'POST', body: JSON.stringify(queuedPayload) });
            if (!r.ok) throw new Error('Offline Queue Sync Failed');
          } catch(err) {
            _gpsOfflineQueue.push(queuedPayload);
            saveGpsQueue();
          }
        });
      }
    } else {
      lastKnownAddr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
    updateTripStatusLine();
    remoteLog(
      `GPS전송[${markerType || 'normal'}]: ${lastKnownAddr} spd=${speedKph.toFixed(0)}kph acc=${accuracy?.toFixed(0)}m gyro=${gyroData.magnitude.toFixed(1)}`,
      'GPS_OK'
    );
  } catch (e) {
    lastKnownAddr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    updateTripStatusLine();
    remoteLog(`GPS 서버전송 실패 (오프라인 캐시 저장): ${e.message}`, 'GPS_SEND_ERR');
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
