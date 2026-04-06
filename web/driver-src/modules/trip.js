/**
 * trip.js — 운행 관리, 체크리스트, 오버레이 서비스
 */
import { Store, State, BASE_URL } from './store.js?v=490';
import { Overlay, smartFetch, remoteLog } from './bridge.js?v=490';
import {
  startGPS, stopGPS,
  startTripStatusTimer, updateTripStatusLine, onGpsUpdate,
} from './gps.js?v=490';

function showToast(msg, d) { window.App?.showToast(msg, d); }
function formatDate(d) { return window.App?.formatDate(d) ?? d.toLocaleString(); }

// ─── 운행 전 점검 체크리스트 ──────────────────────────────────────
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
      showToast('모든 법정 필수 점검 항목에 체크해야 합니다.');
      return;
    }
  }
  State.preTripDone = { chk_brake: true, chk_tire: true, chk_lamp: true, chk_cargo: true, chk_driver: true };
  closeChecklist();
  const btn = document.getElementById('btn-trip-checklist');
  if (btn) { btn.style.background = '#2563eb'; btn.style.color = '#ffffff'; }
  showToast('운행 전 점검 완료! 이제 운행 시작이 가능합니다.');
}

// ─── 오버레이 서비스 ─────────────────────────────────────────────
export function startOverlayService() {
  const overlay = Overlay();
  if (!overlay) return;
  overlay.startService({
    tripId:          State.trip.id,
    container:       State.trip.containerNo || '미입력',
    status:          'driving',
    startTimeMillis: State.trip.startTime,
  }).catch(() => { });
}

export function updateOverlayStatus() {
  const overlay = Overlay();
  if (!overlay) return;
  overlay.updateStatus({
    status:    State.trip.status,
    container: State.trip.containerNo || '미입력',
  }).catch(() => { });
}

export function stopOverlayService() {
  Overlay()?.stopService().catch(() => { });
}

// ─── 컨테이너 번호 ISO 6346 검증 ─────────────────────────────────
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

// ─── 운행 필드 입력 핸들러 ───────────────────────────────────────
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
          if (errEl) { errEl.textContent = '유효한 번호입니다'; errEl.style.color = 'var(--primary)'; }
        } else {
          if (errEl) { errEl.textContent = '컨테이너번호 오기입'; errEl.style.color = 'var(--danger)'; }
        }
      } else {
        if (errEl) { errEl.textContent = '입력 중...'; errEl.style.color = 'var(--text-muted)'; }
      }
    } else {
      if (errEl) { errEl.textContent = '영문 4자 + 숫자 7자'; errEl.style.color = 'var(--danger)'; }
    }
  }

  // 운행 중 실시간 서버 패치 (1초 디바운스)
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

// ─── 진행 중 운행 복구 ───────────────────────────────────────────
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

// ─── 운행 시작 ───────────────────────────────────────────────────
export async function startTrip() {
  if (!State.profile.name || !State.profile.phone
    || !State.profile.vehicleNo || !State.profile.driverId) {
    showToast('차량 정보를 먼저 모두 입력해 주세요.');
    window.App?.openSettings();
    return;
  }
  if (!State.preTripDone) {
    openChecklist();
    showToast('안전 운행을 위해 [운행전점검] 필수 항목을 모두 체크해주세요.');
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
    if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);

    const finalId = data.id || (data.trip && data.trip.id) || (Array.isArray(data) && data[0]?.id);
    if (!finalId) throw new Error('ID 누락 (서버에서 기록 아이디를 받지 못함)');

    State.trip.id        = finalId;
    State.trip.status    = 'driving';
    State.trip.startTime = Date.now();
    Store.set('activeTrip', { id: finalId, startTime: State.trip.startTime });

    document.getElementById('trip-date-display').textContent = `운송시작: ${formatDate(new Date())}`;
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
    showToast(data.message || '운행이 시작되었습니다.');
  } catch (e) { showToast('오류: ' + e.message); }
}

// ─── 일시정지 / 재개 ─────────────────────────────────────────────
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
      // 재개 시 즉각 수신안됨 오표기 방지
      import('./gps.js').then(g => { g.lastGpsTimestamp = Date.now(); });
      startGPS();
    }
    updateTripUI();
    updateTripStatusLine();
  } catch { showToast('상태 변경 실패'); }
}

// ─── 운행 종료 ───────────────────────────────────────────────────
export async function endTrip() {
  if (!State.trip.id) return;

  const isUploading = State.photos.some(p => !p.uploaded);
  if (isUploading) {
    if (!confirm('아직 서버에 전송 중인 사진이 있습니다. 그래도 운행을 종료하시겠습니까? (미전송 사진은 유실될 수 있습니다)')) return;
  } else {
    if (!confirm('운행을 종료하시겠습니까?')) return;
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
    showToast('운행이 안전하게 종료되었습니다.');

    if (State.pendingUpdate) {
      State.pendingUpdate = false;
      setTimeout(() => window.App?.checkUpdate(true), 1500);
    }
  } catch (e) { showToast('종료 실패: ' + e.message); }
}

// ─── 운행 상태 뱃지 ─────────────────────────────────────────────
export function setTripStatus(status) {
  State.trip.status = status;
  const badge   = document.getElementById('header-status');
  const labels  = { idle: '대기중', driving: '운행중', paused: '일시정지', completed: '운행종료' };
  const classes = { idle: 'status-idle', driving: 'status-driving', paused: 'status-paused', completed: 'status-done' };
  if (badge) {
    badge.textContent = labels[status] || '대기중';
    badge.className   = 'status-badge ' + (classes[status] || 'status-idle');
  }
}

// ─── 운행 UI 업데이트 ────────────────────────────────────────────
export function updateTripUI() {
  const isActive = State.trip.status === 'driving' || State.trip.status === 'paused';
  document.getElementById('trip-start-row')?.classList.toggle('hidden', isActive);
  document.getElementById('trip-control-row')?.classList.toggle('hidden', !isActive);
  const pauseBtn = document.getElementById('btn-trip-pause');
  if (pauseBtn) pauseBtn.textContent = State.trip.status === 'paused' ? '운행 재개' : '일시정지';

  if (State.trip.startTime) {
    const dateEl = document.getElementById('trip-date-display');
    if (dateEl && !dateEl.innerHTML.includes('|')) {
      dateEl.textContent = `운송시작: ${formatDate(new Date(State.trip.startTime))}`;
    }
  }
}

// ─── 메모 저장 ───────────────────────────────────────────────────
export function saveMemo() {
  if (!State.trip.id) return;
  smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.trip.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ special_notes: document.getElementById('trip-memo').value }),
  }).catch(() => { });
}

// ─── 운행 데이터 초기화 ──────────────────────────────────────────
export function clearTripData(bypassAuth = false) {
  if (!bypassAuth && State.trip.status !== 'idle') {
    showToast('운행 중에는 내용 지움을 사용할 수 없습니다.');
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
  showToast('운행 데이터가 초기화되었습니다.');
}

// ─── 네이티브 뒤로가기 핸들러 ────────────────────────────────────
export function registerBackHandler() {
  window.isTripActive = () => State.trip.status === 'driving' || State.trip.status === 'paused';
  window.handleBackButton = () => {
    const App = window.App;
    if (document.getElementById('photo-viewer')?.classList.contains('active'))    { App?.closePhotoViewer(); return true; }
    if (document.getElementById('emergency-popup')?.classList.contains('active')) { App?.closeEmergency();   return true; }
    if (document.getElementById('notice-detail')?.classList.contains('active'))   { App?.closeNoticeDetail(); return true; }
    if (document.getElementById('log-detail')?.classList.contains('active'))      { App?.closeLogDetail();   return true; }
    if (document.getElementById('checklist-popup')?.classList.contains('active')) { App?.closeChecklist();   return true; }

    // 지도 화면 뒤로가기 로직 (1.상세경로 -> 2.운행목록 -> 3.지도종료/운행탭이동)
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
      // 운행 탭인 경우 모달도 없으면 false를 반환하여 네이티브에서 앱을 종료하도록 함
      return false;
    }
    return false;
  };
}
