/**
 * gps.js ??GPS 異붿쟻, ?ㅻ쾭?덉씠 ?곹깭 ?쒖떆, ????ㅼ퐫?? */
import { State, BASE_URL } from './store.js?v=4919';
import { Overlay, remoteLog, smartFetch } from './bridge.js?v=4919';

// ??? GPS ?곹깭 蹂??????????????????????????????????????????????????
export let gpsWatchId        = null;
export let lastGpsSend       = 0;
export let currentGpsInterval = 60_000;
export let lastGpsTimestamp  = 0;
export let lastKnownAddr     = '?꾩튂 ?뺤씤 以?..';
export let realtimeExpireAt  = 0;

const gyroData = { magnitude: 0 };

// ??? ?ㅽ봽?쇱씤 罹먯떆 ????????????????????????????????????????????????
export let _gpsOfflineQueue = [];
try { _gpsOfflineQueue = JSON.parse(localStorage.getItem('els_gps_queue') || '[]'); } catch(e){}
const saveGpsQueue = () => {
  if (_gpsOfflineQueue.length > 500) _gpsOfflineQueue = _gpsOfflineQueue.slice(-500);
  localStorage.setItem('els_gps_queue', JSON.stringify(_gpsOfflineQueue));
};

// ??? ?ㅼ떆媛?紐⑤뱶 ?????????????????????????????????????????????????
export function startRealtimeMode() {
  State.trip.isRealtime = true;
  realtimeExpireAt = Date.now() + 60000;
  updateTripStatusLine();
  _syncRealtimeModeToNative(true);
  remoteLog('?ㅼ떆媛?怨좎젙諛 愿??紐⑤뱶 ?쒖옉 (1遺?', 'SYSTEM');
}

export function stopRealtimeMode() {
  State.trip.isRealtime = false;
  realtimeExpireAt = 0;
  updateTripStatusLine();
  _syncRealtimeModeToNative(false);
  remoteLog('?ㅼ떆媛?怨좎젙諛 愿??紐⑤뱶 ?섎룞 醫낅즺', 'SYSTEM');
}

function _syncRealtimeModeToNative(isRealtime) {
  const overlay = Overlay();
  if (!overlay) return;
  overlay.updateStatus({ status: State.trip.status, isRealtime }).catch(() => { });
}

// ??? GPS watchPosition ????????????????????????????????????????????
export function startGPS() {
  if (!navigator.geolocation) {
    remoteLog('navigator.geolocation ?놁쓬 - GPS 遺덇?', 'GPS_FATAL');
    return;
  }
  if (gpsWatchId) return;

  remoteLog('startGPS() called - watchPosition ?쒖옉', 'GPS_INIT');

  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', handleGyro, { passive: true });
  }
  if (window.DeviceMotionEvent) {
    window.addEventListener('devicemotion', handleMotion, { passive: true });
  }

  // 利됱떆 1??媛뺤젣 ?섏떊 (珥덇린 怨듬갚 諛⑹?)
  navigator.geolocation.getCurrentPosition(
    pos => {
      lastGpsTimestamp = Date.now();
      remoteLog(
        `GPS 珥덇린?섏떊 ?깃났: ${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)} acc:${pos.coords.accuracy?.toFixed(0)}m`,
        'GPS_INIT'
      );
      onGpsUpdate(pos, true, State.trip.id);
    },
    err => remoteLog(`GPS 珥덇린?섏떊 ?ㅽ뙣: ${err.code} ${err.message}`, 'GPS_INIT_ERR'),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );

  gpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      lastGpsTimestamp = Date.now();
      onGpsUpdate(pos, false);
    },
    err => {
      remoteLog(`GPS watchPosition ?먮윭: code=${err.code} msg=${err.message}`, 'GPS_WATCH_ERR');
      console.warn('GPS watch error', err.code, err.message);
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
  );
  remoteLog(`GPS watchPosition ?깅줉??ID=${gpsWatchId}`, 'GPS_INIT');
}

export function stopGPS() {
  if (gpsWatchId) {
    navigator.geolocation.clearWatch(gpsWatchId);
    remoteLog(`GPS watchPosition ?댁젣 ID=${gpsWatchId}`, 'GPS_STOP');
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

// ??? ?댄뻾 ?곹깭 ??대㉧ ?????????????????????????????????????????????
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

// ??? 二쇱냼 異뺤빟 ???????????????????????????????????????????????????
function abbreviateAddr(full) {
  if (!full || full.includes('?뺤씤 以?)) return full;
  return full.split(' ')
    .map(s => s
      .replace(/?밸퀎??愿묒뿭???밸퀎?먯튂???밸퀎?먯튂??g, '')
      .replace(/(????援?????硫?由?$/g, ''))
    .filter(s => s.length > 0)
    .join(' ');
}

// ??? ?곹깭 ?쒖떆以?媛깆떊 (1珥???대㉧ + GPS ?섏떊 ?? ?????????????????
export function updateTripStatusLine() {
  // ?덈? ?쒓컙?쇰줈 ?ㅼ떆媛?紐⑤뱶 留뚮즺 泥댄겕 (諛깃렇?쇱슫??setTimeout 吏?????
  if (State.trip.isRealtime && Date.now() > realtimeExpireAt) {
    State.trip.isRealtime = false;
    remoteLog('?ㅼ떆媛?怨좎젙諛 愿??紐⑤뱶 醫낅즺', 'SYSTEM');
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
      dateDisplay.textContent  = '?댁넚?쒖옉 ?湲곗쨷';
      dateDisplay.style.color  = 'var(--primary)';
      dateDisplay.style.fontWeight = '700';
    }
    if (settingsDateDisplay) {
      settingsDateDisplay.textContent  = '?댁넚?쒖옉 ?湲곗쨷';
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
    gpsText  = '?섏떊以묒?';
  } else if (isDown && State.trip.status === 'driving') {
    if (window._resumeGracePeriod) {
      gpsColor = '#10b981';
      gpsText  = '?섏떊以?;
    } else {
      gpsColor = '#ef4444';
      gpsText  = '?곌껐?덈맖';

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
    gpsText  = '?ㅼ떆媛??섏쭛以?;
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
    addrDisplay.textContent   = addrShort || '?꾩튂 ?뺤씤 以?..';
  }
  if (settingsAddrDisplay) {
    settingsAddrDisplay.style.display = 'inline-block';
    settingsAddrDisplay.textContent   = addrShort || '?꾩튂 ?뺤씤 以?..';
  }

  // ?ㅻ쾭?덉씠 ?꾩젽 ?숆린??  const overlay = Overlay();
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

// ??? GPS ?섏떊 泥섎━ (?쒕쾭 ?꾩넚) ????????????????????????????????????
let lastEmergencyPollMs = 0;

export async function onGpsUpdate(pos, isForced = false, forcedTripId = null, markerType = null) {
  const targetId = forcedTripId || State.trip.id;
  if (!targetId) return;

  // 30珥덈쭏??湲닿툒紐낅졊 ?대쭅
  const _now = Date.now();
  if (_now - lastEmergencyPollMs > 30000 && State.trip.status === 'driving') {
    lastEmergencyPollMs = _now;
    window.App?.pollEmergency?.().catch?.(() => { });
  }

  if (State.trip.status !== 'driving' && !isForced) return;
  const { latitude: lat, longitude: lng, speed, accuracy } = pos.coords;

  // 湲곗?援??ㅽ듃?뚰겕 ?꾩튂 ?먯쿇 李⑤떒 (?띾룄 ?곗씠???놁쓬 = GPS ?꾨떂)
  if (!State.trip.isRealtime && (speed === null || speed === undefined)) {
    remoteLog(`湲곗?援??ㅽ듃?뚰겕 ?꾩튂 ?ㅽ궢 (?띾룄 遺덈챸): acc=${accuracy?.toFixed(0)}m`, 'GPS_SKIP_NETWORK');
    return;
  }

  const speedKph = (speed || 0) * 3.6;
  lastGpsTimestamp = Date.now();

  // ?뺥솗???꾪꽣 (200m 珥덇낵 ???ㅽ궢, ??媛뺤젣?섏떊/?ㅼ떆媛??덉쇅)
  if (!State.trip.isRealtime && !isForced && accuracy && accuracy > 200) {
    remoteLog(`GPS ?뺥솗????쓬: ${accuracy.toFixed(0)}m - ?꾩넚 ?ㅽ궢`, 'GPS_ACCURACY');
    updateTripStatusLine();
    return;
  }

  // ?띾룄 湲곕컲 媛蹂 二쇨린
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
      `GPS?꾩넚[${markerType || 'normal'}]: ${lastKnownAddr} spd=${speedKph.toFixed(0)}kph acc=${accuracy?.toFixed(0)}m gyro=${gyroData.magnitude.toFixed(1)}`,
      'GPS_OK'
    );
  } catch (e) {
    lastKnownAddr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    updateTripStatusLine();
    remoteLog(`GPS ?쒕쾭?꾩넚 ?ㅽ뙣 (?ㅽ봽?쇱씤 罹먯떆 ???: ${e.message}`, 'GPS_SEND_ERR');
    _gpsOfflineQueue.push(payload);
    saveGpsQueue();
  }
}

// ??? ????ㅼ퐫??(?⑤룆 議고쉶?? ????????????????????????????????????
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

