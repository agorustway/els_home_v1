/**
 * trip.js ???댄뻾 愿由? 泥댄겕由ъ뒪?? ?ㅻ쾭?덉씠 ?쒕퉬?? */
import { Store, State, BASE_URL } from './store.js?v=4919';
import { Overlay, smartFetch, remoteLog } from './bridge.js?v=4919';
import {
  startGPS, stopGPS,
  startTripStatusTimer, updateTripStatusLine, onGpsUpdate,
} from './gps.js?v=4919';

function showToast(msg, d) { window.App?.showToast(msg, d); }
function formatDate(d) { return window.App?.formatDate(d) ?? d.toLocaleString(); }

// ??? ?댄뻾 ???먭? 泥댄겕由ъ뒪????????????????????????????????????????
export function openChecklist() {
  document.getElementById('checklist-popup')?.classList.add('active');
}
export function closeChecklist() {
  document.getElementById('checklist-popup')?.classList.remove('active');
}
export function saveChecklist() {
  const checks = ['chk_brake', 'chk_tire', 'chk_lamp', 'chk_cargo', 'chk_driver'];
  for (const id of checks) {
    if (!document.getElementById(id)?.checked) {
      showToast('紐⑤뱺 踰뺤젙 ?꾩닔 ?먭? ??ぉ??泥댄겕?댁빞 ?⑸땲??');
      return;
    }
  }
  State.preTripDone = { chk_brake: true, chk_tire: true, chk_lamp: true, chk_cargo: true, chk_driver: true };
  closeChecklist();
  const btn = document.getElementById('btn-trip-checklist');
  if (btn) { btn.style.background = '#2563eb'; btn.style.color = '#ffffff'; }
  showToast('?댄뻾 ???먭? ?꾨즺! ?댄뻾???쒖옉?⑸땲??');
  // ?먭? ?꾨즺 ???먮룞 ?댄뻾 ?쒖옉
  setTimeout(() => startTrip(), 300);
}

// ??? ?ㅻ쾭?덉씠 ?쒕퉬???????????????????????????????????????????????
export function startOverlayService() {
  const overlay = Overlay();
  if (!overlay) return;
  overlay.startService({
    tripId:          State.trip.id,
    container:       State.trip.containerNo || '誘몄엯??,
    status:          'driving',
    startTimeMillis: State.trip.startTime,
  }).catch(() => { });
}

export function updateOverlayStatus() {
  const overlay = Overlay();
  if (!overlay) return;
  overlay.updateStatus({
    status:    State.trip.status,
    container: State.trip.containerNo || '誘몄엯??,
  }).catch(() => { });
}

export function stopOverlayService() {
  Overlay()?.stopService().catch(() => { });
}

// ??? 而⑦뀒?대꼫 踰덊샇 ISO 6346 寃利??????????????????????????????????
export function validateISO6346(str) {
  const charMap = {
    A:10,B:12,C:13,D:14,E:15,F:16,G:17,H:18,I:19,J:20,K:21,L:23,M:24,
    N:25,O:26,P:27,Q:28,R:29,S:30,T:31,U:32,V:34,W:35,X:36,Y:37,Z:38,
  };
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const val = charMap[str[i]] ?? parseInt(str[i], 10);
    sum += val * Math.pow(2, i);
  }
  return (sum % 11) % 10 === parseInt(str[10], 10);
}

// ??? ?댄뻾 ?꾨뱶 ?낅젰 ?몃뱾?????????????????????????????????????????
let _tripFieldSaveTimer = null;
export function onTripFieldChange() {
  const cEl   = document.getElementById('container-no');
  const sEl   = document.getElementById('seal-no');
  const errEl = document.getElementById('container-check-msg');

  cEl.value = cEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  sEl.value = sEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  State.trip.containerNo = cEl.value;
  State.trip.sealNo      = sEl.value;

  if (errEl) errEl.textContent = '';
  if (cEl.value.length >= 4) {
    const match = cEl.value.match(/^([A-Z]{4})(\d{0,7})$/);
    if (match) {
      if (cEl.value.length === 11) {
        if (validateISO6346(cEl.value)) {
          if (errEl) { errEl.textContent = '?좏슚??踰덊샇?낅땲??; errEl.style.color = 'var(--primary)'; }
        } else {
          if (errEl) { errEl.textContent = '而⑦뀒?대꼫踰덊샇 ?ㅺ린??; errEl.style.color = 'var(--danger)'; }
        }
      } else {
        if (errEl) { errEl.textContent = '?낅젰 以?..'; errEl.style.color = 'var(--text-muted)'; }
      }
    } else {
      if (errEl) { errEl.textContent = '?곷Ц 4??+ ?レ옄 7??; errEl.style.color = 'var(--danger)'; }
    }
  }

  // ?댄뻾 以??ㅼ떆媛??쒕쾭 ?⑥튂 (1珥??붾컮?댁뒪)
  if (State.trip.id && (State.trip.status === 'driving' || State.trip.status === 'paused')) {
    const cType = document.getElementById('container-type')?.value;
    const cKind = document.getElementById('container-kind')?.value;
    clearTimeout(_tripFieldSaveTimer);
    _tripFieldSaveTimer = setTimeout(() => {
      smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.trip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          container_number: cEl.value || '',
          seal_number:      sEl.value || '',
          container_type:   cType,
          container_kind:   cKind,
        }),
      }).catch(() => { });
    }, 1000);
  }
}

// ??? 吏꾪뻾 以??댄뻾 蹂듦뎄 ???????????????????????????????????????????
export async function loadCurrentTrip() {
  const saved = Store.get('activeTrip');
  if (!saved) return;
  try {
    const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${saved.id}`).catch(() => null);
    if (!res) return;
    const data = await res.json().catch(() => null);
    if (data && (data.status === 'driving' || data.status === 'paused')) {
      State.trip.id          = saved.id;
      State.trip.status      = data.status;
      State.trip.startTime   = new Date(data.started_at).getTime();
      State.trip.containerNo = data.container_number || '';
      State.trip.sealNo      = data.seal_number || '';

      document.getElementById('container-no').value    = State.trip.containerNo;
      document.getElementById('seal-no').value         = State.trip.sealNo;
      document.getElementById('container-type').value  = data.container_type || '40FT';
      document.getElementById('container-kind').value  = data.container_kind || 'DRY';
      document.getElementById('trip-memo').value       = data.special_notes || '';

      let photos = [];
      try {
        if (Array.isArray(data.photos)) photos = data.photos;
        else if (typeof data.photos === 'string' && data.photos.trim()) photos = JSON.parse(data.photos);
      } catch (e) { console.error('loadCurrentTrip photos parse err', e); }

      State.photos = photos.map(p => ({
        ...p,
        uploaded:  true,
        serverUrl: p.url
          ? (p.url.startsWith('http') ? p.url : BASE_URL + (p.url.startsWith('/') ? '' : '/') + p.url)
          : (p.serverUrl || p.dataUrl || ''),
      }));

      setTripStatus(data.status);
      updateTripUI();
      window.App?.renderPhotoThumbs();
      if (data.status === 'driving') {
        startGPS();
        startOverlayService();
        startTripStatusTimer();
      }
    } else {
      Store.rm('activeTrip');
    }
  } catch (e) { console.warn('loadCurrentTrip error', e); }
}

// ??? ?댄뻾 ?쒖옉 ???????????????????????????????????????????????????
export async function startTrip() {
  if (!State.profile.name || !State.profile.phone
    || !State.profile.vehicleNo || !State.profile.driverId) {
    showToast('李⑤웾 ?뺣낫瑜?癒쇱? 紐⑤몢 ?낅젰??二쇱꽭??');
    window.App?.openSettings();
    return;
  }
  if (!State.preTripDone) {
    openChecklist();
    showToast('?덉쟾 ?댄뻾???꾪빐 [?댄뻾?꾩젏寃] ?꾩닔 ??ぉ??紐⑤몢 泥댄겕?댁＜?몄슂.');
    return;
  }

  const containerNo = document.getElementById('container-no').value.trim();
  const sealNo      = document.getElementById('seal-no').value.trim();
  const cType       = document.getElementById('container-type').value;
  const cKind       = document.getElementById('container-kind').value;
  const memo        = document.getElementById('trip-memo').value;

  try {
    const res = await smartFetch(BASE_URL + '/api/vehicle-tracking/trips', {
      method: 'POST',
      body: JSON.stringify({
        driver_name:      State.profile.name,
        driver_phone:     State.profile.phone,
        vehicle_number:   State.profile.vehicleNo,
        vehicle_id:       State.profile.driverId,
        container_number: containerNo,
        seal_number:      sealNo,
        container_type:   cType,
        container_kind:   cKind,
        special_notes:    memo,
        chk_brake:  State.preTripDone.chk_brake  || false,
        chk_tire:   State.preTripDone.chk_tire   || false,
        chk_lamp:   State.preTripDone.chk_lamp   || false,
        chk_cargo:  State.preTripDone.chk_cargo  || false,
        chk_driver: State.preTripDone.chk_driver || false,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `?쒕쾭 ?ㅻ쪟 (${res.status})`);

    const finalId = data.id || (data.trip && data.trip.id) || (Array.isArray(data) && data[0]?.id);
    if (!finalId) throw new Error(`ID ?꾨씫 (?쒕쾭 ?묐떟: ${JSON.stringify(data)})`);

    State.trip.id        = finalId;
    State.trip.status    = 'driving';
    State.trip.startTime = Date.now();
    Store.set('activeTrip', { id: finalId, startTime: State.trip.startTime });

    document.getElementById('trip-date-display').textContent = `?댁넚?쒖옉: ${formatDate(new Date())}`;
    setTripStatus('driving');
    updateTripUI();
    startOverlayService();
    startGPS();
    startTripStatusTimer();

    if (State.photos.some(p => !p.uploaded)) {
      await window.App?.uploadPendingPhotos?.();
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => onGpsUpdate(pos, true, State.trip.id, 'TRIP_START').catch?.(() => { }),
        null,
        { enableHighAccuracy: true }
      );
    }
    showToast(data.message || '?댄뻾???쒖옉?섏뿀?듬땲??');
  } catch (e) { showToast('?ㅻ쪟: ' + e.message); }
}

// ??? ?쇱떆?뺤? / ?ш컻 ?????????????????????????????????????????????
export async function togglePause() {
  if (!State.trip.id) return;
  const action = State.trip.status === 'driving' ? 'pause' : 'resume';
  try {
    await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.trip.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    });
    State.trip.status = action === 'pause' ? 'paused' : 'driving';
    setTripStatus(State.trip.status);

    if (navigator.geolocation) {
      const marker = action === 'pause' ? 'TRIP_PAUSE' : 'TRIP_RESUME';
      navigator.geolocation.getCurrentPosition(
        pos => onGpsUpdate(pos, true, State.trip.id, marker).catch?.(() => { }),
        null,
        { enableHighAccuracy: true }
      );
    }

    if (State.trip.status === 'paused') {
      stopGPS();
    } else {
      // ?ш컻 ??利됯컖 ?섏떊?덈맖 ?ㅽ몴湲?諛⑹?
      import('./gps.js').then(g => { g.lastGpsTimestamp = Date.now(); });
      startGPS();
    }
    updateTripUI();
    updateTripStatusLine();
  } catch { showToast('?곹깭 蹂寃??ㅽ뙣'); }
}

// ??? ?댄뻾 醫낅즺 ???????????????????????????????????????????????????
export async function endTrip() {
  if (!State.trip.id) return;

  const isUploading = State.photos.some(p => !p.uploaded);
  if (isUploading) {
    if (!confirm('?꾩쭅 ?쒕쾭???꾩넚 以묒씤 ?ъ쭊???덉뒿?덈떎. 洹몃옒???댄뻾??醫낅즺?섏떆寃좎뒿?덇퉴? (誘몄쟾???ъ쭊? ?좎떎?????덉뒿?덈떎)')) return;
  } else {
    if (!confirm('?댄뻾??醫낅즺?섏떆寃좎뒿?덇퉴?')) return;
  }

  if (navigator.geolocation) {
    const closingTripId = State.trip.id;
    navigator.geolocation.getCurrentPosition(
      pos => onGpsUpdate(pos, true, closingTripId, 'TRIP_END').catch?.(() => { }),
      null,
      { enableHighAccuracy: true }
    );
  }

  try {
    await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.trip.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action:           'complete',
        container_number: document.getElementById('container-no')?.value.trim() || undefined,
        seal_number:      document.getElementById('seal-no')?.value.trim()      || undefined,
        special_notes:    document.getElementById('trip-memo')?.value.trim()    || undefined,
      }),
    });
    stopOverlayService();
    stopGPS();
    Store.rm('activeTrip');
    clearTripData(true);
    updateTripStatusLine();
    showToast('?댄뻾???덉쟾?섍쾶 醫낅즺?섏뿀?듬땲??');

    if (State.pendingUpdate) {
      State.pendingUpdate = false;
      setTimeout(() => window.App?.checkUpdate(true), 1500);
    }
  } catch (e) { showToast('醫낅즺 ?ㅽ뙣: ' + e.message); }
}

// ??? ?댄뻾 ?곹깭 諭껋? ?????????????????????????????????????????????
export function setTripStatus(status) {
  State.trip.status = status;
  const badge   = document.getElementById('header-status');
  const labels  = { idle: '?湲곗쨷', driving: '?댄뻾以?, paused: '?쇱떆?뺤?', completed: '?댄뻾醫낅즺' };
  const classes = { idle: 'status-idle', driving: 'status-driving', paused: 'status-paused', completed: 'status-done' };
  if (badge) {
    badge.textContent = labels[status] || '?湲곗쨷';
    badge.className   = 'status-badge ' + (classes[status] || 'status-idle');
  }
}

// ??? ?댄뻾 UI ?낅뜲?댄듃 ????????????????????????????????????????????
export function updateTripUI() {
  const isActive = State.trip.status === 'driving' || State.trip.status === 'paused';
  document.getElementById('trip-start-row')?.classList.toggle('hidden', isActive);
  document.getElementById('trip-control-row')?.classList.toggle('hidden', !isActive);
  // ?댄뻾 以??댁슜鍮꾩? 踰꾪듉 ?④린湲?  document.getElementById('btn-clear-trip')?.classList.toggle('hidden', isActive);

  const pauseBtn = document.getElementById('btn-trip-pause');
  if (pauseBtn) pauseBtn.textContent = State.trip.status === 'paused' ? '?댄뻾 ?ш컻' : '?쇱떆?뺤?';

  if (State.trip.startTime) {
    const dateEl = document.getElementById('trip-date-display');
    if (dateEl && !dateEl.innerHTML.includes('|')) {
      dateEl.textContent = `?댁넚?쒖옉: ${formatDate(new Date(State.trip.startTime))}`;
    }
  }
}

// ??? 硫붾え ??????????????????????????????????????????????????????
export function saveMemo() {
  if (!State.trip.id) return;
  smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.trip.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ special_notes: document.getElementById('trip-memo').value }),
  }).catch(() => { });
}

// ??? ?댄뻾 ?곗씠??珥덇린????????????????????????????????????????????
export function clearTripData(bypassAuth = false) {
  if (!bypassAuth && State.trip.status !== 'idle') {
    showToast('?댄뻾 以묒뿉???댁슜 吏????ъ슜?????놁뒿?덈떎.');
    return;
  }
  if (State.trip.id) {
    stopOverlayService();
    stopGPS();
    Store.rm('activeTrip');
  }
  State.trip       = { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '' };
  State.photos     = [];
  State.preTripDone = null;

  const btnCheck = document.getElementById('btn-trip-checklist');
  if (btnCheck) { btnCheck.style.background = '#ef4444'; btnCheck.style.color = '#ffffff'; }

  document.getElementById('container-no').value = '';
  document.getElementById('seal-no').value      = '';
  document.getElementById('trip-memo').value    = '';
  ['chk_brake', 'chk_tire', 'chk_lamp', 'chk_cargo', 'chk_driver'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });

  window.App?.renderPhotoThumbs();
  setTripStatus('idle');
  updateTripUI();
  showToast('?댄뻾 ?곗씠?곌? 珥덇린?붾릺?덉뒿?덈떎.');
}

// ??? ?ㅼ씠?곕툕 ?ㅻ줈媛湲??몃뱾??????????????????????????????????????
export function registerBackHandler() {
  window.isTripActive = () => State.trip.status === 'driving' || State.trip.status === 'paused';
  window.handleBackButton = () => {
    const App = window.App;
    if (document.getElementById('photo-viewer')?.classList.contains('active'))    { App?.closePhotoViewer(); return true; }
    if (document.getElementById('emergency-popup')?.classList.contains('active')) { App?.closeEmergency();   return true; }
    if (document.getElementById('notice-detail')?.classList.contains('active'))   { App?.closeNoticeDetail(); return true; }
    if (document.getElementById('log-detail')?.classList.contains('active'))      { App?.closeLogDetail();   return true; }
    if (document.getElementById('checklist-popup')?.classList.contains('active')) { App?.closeChecklist();   return true; }

    // 吏???붾㈃ ?ㅻ줈媛湲?濡쒖쭅 (1.?곸꽭寃쎈줈 -> 2.?댄뻾紐⑸줉 -> 3.吏?꾩쥌猷??댄뻾??씠??
    if (document.getElementById('screen-map')?.classList.contains('active')) {
      const routePanel = document.getElementById('map-route-panel');
      const bottomPanel = document.getElementById('map-bottom-panel');

      if (routePanel && !routePanel.classList.contains('hidden')) {
        App?.clearMapRoute();
        return true;
      }
      if (bottomPanel && !bottomPanel.classList.contains('collapsed')) {
        App?.toggleMapPanel();
        return true;
      }
      App?.closeMap();
      App?.switchTab('trip');
      return true;
    }

    if (document.getElementById('screen-settings')?.classList.contains('active')) {
      if (!State.profile.name || !State.profile.phone || !State.profile.vehicleNo || !State.profile.driverId) return false;
      window.App?.switchTab('trip'); return true;
    }

    if (document.getElementById('screen-main')?.classList.contains('active')) {
      if (!document.getElementById('tab-trip')?.classList.contains('active')) {
        App?.switchTab('trip'); return true;
      }
      // ?댄뻾 ??씤 寃쎌슦 紐⑤떖???놁쑝硫?false瑜?諛섑솚?섏뿬 ?ㅼ씠?곕툕?먯꽌 ?깆쓣 醫낅즺?섎룄濡???      return false;
    }
    return false;
  };
}

