/**
 * trip.js — 운행 관리, 체크리스트, 오버레이 서비스
 */
import { Store, State, BASE_URL } from './store.js?v=5143';
import { Overlay, smartFetch, remoteLog } from './bridge.js?v=5143';
import {
  startGPS, stopGPS,
  startTripStatusTimer, updateTripStatusLine, onGpsUpdate,
} from './gps.js?v=5143';
import { GENERAL_TRANSPORT_TYPES } from './cargoOptions.js?v=5143';

function showToast(msg, d) { window.App?.showToast(msg, d); }
function formatDate(d) { return window.App?.formatDate(d) ?? d.toLocaleString(); }

function parseBillingAmount(value) {
  const num = Number(String(value || '').replace(/[^0-9]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatBillingAmount(value) {
  const num = parseBillingAmount(value);
  return num ? num.toLocaleString('ko-KR') : '';
}

function getTripExtraFields() {
  const billingEl = document.getElementById('billing-amount');
  if (billingEl) billingEl.value = formatBillingAmount(billingEl.value);
  const isGeneral = (State.profile.cargoType || 'container') === 'general';
  return {
    cargo_type: State.profile.cargoType || 'container',
    cargo_item: isGeneral ? document.getElementById('container-no')?.value.trim() || '' : '',
    cargo_order_number: isGeneral ? document.getElementById('seal-no')?.value.trim() || '' : '',
    cargo_weight: isGeneral ? (State.profile.generalPayload || '') : '',
    general_vehicle_type: isGeneral ? (State.profile.generalVehicleType || '') : '',
    general_payload: isGeneral ? (State.profile.generalPayload || '') : '',
    general_body_type: isGeneral ? (State.profile.generalBodyType || '') : '',
    transport_type: document.getElementById('transport-type')?.value || '왕복',
    billing_amount: parseBillingAmount(billingEl?.value),
    work_site: document.getElementById('work-site')?.value.trim() || '',
  };
}

function setTripExtraFields(data = {}) {
  const transportEl = document.getElementById('transport-type');
  const billingEl = document.getElementById('billing-amount');
  const workSiteEl = document.getElementById('work-site');
  if (transportEl) transportEl.value = data.transport_type || '왕복';
  if (billingEl) billingEl.value = formatBillingAmount(data.billing_amount);
  if (workSiteEl) workSiteEl.value = data.work_site || '';
}

export function updateTripCargoUI() {
  const isGeneral = (State.profile.cargoType || 'container') === 'general';
  const containerLabel = document.getElementById('trip-container-label');
  const sealLabel = document.getElementById('trip-seal-label');
  const typeLabel = document.getElementById('trip-type-label');
  const kindLabel = document.getElementById('trip-kind-label');
  const containerInput = document.getElementById('container-no');
  const sealInput = document.getElementById('seal-no');
  const typeSelect = document.getElementById('container-type');
  const kindSelect = document.getElementById('container-kind');
  const transportSelect = document.getElementById('transport-type');
  if (containerLabel) containerLabel.textContent = isGeneral ? '화물명' : '컨테이너 번호';
  if (sealLabel) sealLabel.textContent = isGeneral ? '오더/관리번호' : '씰 번호';
  if (typeLabel) typeLabel.textContent = isGeneral ? '적재중량' : '타입';
  if (kindLabel) kindLabel.textContent = isGeneral ? '특장구분' : '종류';
  if (containerInput) {
    containerInput.placeholder = isGeneral ? '예: 파렛트, 기계, 일반잡화' : 'ABCD1234567';
    containerInput.maxLength = isGeneral ? 60 : 20;
  }
  if (sealInput) {
    sealInput.placeholder = isGeneral ? '오더번호' : '씰번호';
    sealInput.maxLength = isGeneral ? 60 : 30;
  }
  if (typeSelect) {
    if (isGeneral) {
      typeSelect.innerHTML = `<option value="${State.profile.generalPayload || '5ton'}">${State.profile.generalPayload || '5ton'}</option>`;
    } else {
      typeSelect.innerHTML = '<option value="20FT">20FT</option><option value="40FT" selected>40FT</option>';
    }
  }
  if (kindSelect) {
    if (isGeneral) {
      kindSelect.innerHTML = `<option value="${State.profile.generalBodyType || '일반'}">${State.profile.generalBodyType || '일반'}</option>`;
    } else {
      kindSelect.innerHTML = '<option value="DRY" selected>DRY</option><option value="REEFER">REEFER</option><option value="TANK">TANK</option><option value="OPEN_TOP">OPEN TOP</option><option value="FLAT">FLAT RACK</option>';
    }
  }
  if (transportSelect && isGeneral) {
    const current = transportSelect.value || '편도';
    transportSelect.innerHTML = GENERAL_TRANSPORT_TYPES.map(v => `<option value="${v}">${v}</option>`).join('');
    transportSelect.value = GENERAL_TRANSPORT_TYPES.includes(current) ? current : '편도';
  } else if (transportSelect) {
    const current = transportSelect.value || '왕복';
    transportSelect.innerHTML = '<option value="왕복">왕복</option><option value="편도">편도</option><option value="복화">복화</option><option value="기타">기타</option>';
    transportSelect.value = ['왕복', '편도', '복화', '기타'].includes(current) ? current : '왕복';
  }
}

// ─── 운행 전 점검 체크리스트 ──────────────────────────────────────
export function openChecklist() {
  document.getElementById('checklist-popup')?.classList.add('active');
  checkChecklistValid(); // Update initial state
}
export function closeChecklist() {
  document.getElementById('checklist-popup')?.classList.remove('active');
}
export function checkChecklistValid() {
  const checks = ['chk_brake', 'chk_tire', 'chk_lamp', 'chk_cargo', 'chk_driver'];
  const allChecked = checks.every(id => document.getElementById(id)?.checked);
  const btn = document.getElementById('btn-save-checklist');
  if (btn) {
    if (allChecked) {
      btn.style.background = '#2563eb'; // blue
      btn.style.color = '#ffffff';
    } else {
      btn.style.background = '#ef4444'; // red
      btn.style.color = '#ffffff';
    }
  }
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
  // 점검 완료 버튼 검은색
  const btn = document.getElementById('btn-trip-checklist');
  if (btn) { btn.style.background = '#111827'; btn.style.color = '#ffffff'; }
  // 운행시작 버튼을 파란색으로 전환 (점검 완료 = 운행 준비 완료)
  const startBtn = document.getElementById('btn-trip-start');
  if (startBtn) {
    startBtn.style.background = '#2563eb';
    startBtn.style.color = '#ffffff';
  }
  showToast('운행 전 점검 완료! 운행 시작 버튼을 눌러주세요.');
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

  const isGeneral = (State.profile.cargoType || 'container') === 'general';
  if (isGeneral) {
    cEl.value = cEl.value.trim();
    sEl.value = sEl.value.trim();
  } else {
    cEl.value = cEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    sEl.value = sEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  }
  State.trip.containerNo = cEl.value;
  State.trip.sealNo      = sEl.value;
  const extras = getTripExtraFields();

  if (errEl) errEl.textContent = '';
  if (!isGeneral && cEl.value.length >= 4) {
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
          container_type:   isGeneral ? '40FT' : cType,
          container_kind:   isGeneral ? 'DRY' : cKind,
          ...extras,
          source:           'driver_app',
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
      setTripExtraFields(data);
      State.profile.cargoType = data.cargo_type || State.profile.cargoType || 'container';
      updateTripCargoUI();

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
    || !State.profile.vehicleNo || (State.profile.cargoType !== 'general' && !State.profile.driverId)) {
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
  const isGeneral   = (State.profile.cargoType || 'container') === 'general';
  const memo        = document.getElementById('trip-memo').value;
  const extras      = getTripExtraFields();

  try {
    const res = await smartFetch(BASE_URL + '/api/vehicle-tracking/trips', {
      method: 'POST',
      body: JSON.stringify({
        driver_name:      State.profile.name,
        driver_phone:     State.profile.phone,
        vehicle_number:   State.profile.vehicleNo,
        vehicle_id:       State.profile.driverId,
        cargo_type:       State.profile.cargoType || 'container',
        general_vehicle_type: State.profile.generalVehicleType || null,
        general_payload:      State.profile.generalPayload || null,
        general_body_type:    State.profile.generalBodyType || null,
        container_number: containerNo,
        seal_number:      sealNo,
        container_type:   isGeneral ? '40FT' : cType,
        container_kind:   isGeneral ? 'DRY' : cKind,
        ...extras,
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

    // [v4.9.32] 서버 응답 무결성 확보 - 상세 디버그 로깅 추가
    console.log('🚀 Trip API Response Data:', data);
    console.log('🚀 Trip API Response Status:', res.status);
    
    // 헤더 정보 추출 시도 (debug 전용)
    const debugId = res.headers?.['x-debug-id'] || res.headers?.get?.('x-debug-id');
    const debugErr = res.headers?.['x-debug-error'] || res.headers?.get?.('x-debug-error');
    
    const finalId = data.id || data.trip?.id || debugId;
    if (!finalId) {
        if (State.trip.id) {
            console.warn('⚠️ ID 누락 - 기존 ID 사용', State.trip.id);
        } else {
            const detail = `Status:${res.status}, Data:${JSON.stringify(data)}, DebugH:${debugId||'N/A'}, ErrH:${debugErr||'N/A'}`;
            throw new Error(`ID 누락 (상세: ${detail})`);
        }
    } else {
        State.trip.id = finalId;
    }
    State.trip.status    = 'driving';
    State.trip.startTime = Date.now();
    Store.set('activeTrip', { id: State.trip.id, startTime: State.trip.startTime });

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
        ...getTripExtraFields(),
        source:           'driver_app',
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
  // 운행 중 내용비움 버튼 숨기기
  document.getElementById('btn-clear-trip')?.classList.toggle('hidden', isActive);

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

  // 점검 버튼 빨간색으로 복원
  const btnCheck = document.getElementById('btn-trip-checklist');
  if (btnCheck) { btnCheck.style.background = '#ef4444'; btnCheck.style.color = '#ffffff'; }
  // 운행시작 버튼은 대기 상태 기본 검은색
  const startBtn = document.getElementById('btn-trip-start');
  if (startBtn) { startBtn.style.background = '#111827'; startBtn.style.color = '#ffffff'; }

  document.getElementById('container-no').value = '';
  document.getElementById('seal-no').value      = '';
  document.getElementById('trip-memo').value    = '';
  document.getElementById('transport-type').value = '왕복';
  document.getElementById('container-type').value = '40FT';
  document.getElementById('container-kind').value = 'DRY';
  document.getElementById('billing-amount').value = '';
  document.getElementById('work-site').value    = '';
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
