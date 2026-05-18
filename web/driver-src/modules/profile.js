/**
 * profile.js — 프로필 UI, 저장, 기사 조회, 프로필 사진 3종
 */
import { Store, State, BASE_URL } from './store.js?v=5156';
import { smartFetch } from './bridge.js?v=5156';
import {
  GENERAL_BODY_TYPES, GENERAL_PAYLOADS, GENERAL_VEHICLE_TYPES,
} from './cargoOptions.js?v=5156';

function showToast(msg, duration) { window.App?.showToast(msg, duration); }

function setSelectOptions(id, options, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = value || el.value;
  el.innerHTML = options.map(opt => {
    const v = typeof opt === 'string' ? opt : opt.value;
    const label = typeof opt === 'string' ? opt : opt.label;
    return `<option value="${v}">${label}</option>`;
  }).join('');
  el.value = current || options[0]?.value || options[0] || '';
}

export function onCargoTypeChange() {
  const cargoType = document.getElementById('s-cargo-type')?.value || 'container';
  State.profile.cargoType = cargoType;
  updateCargoProfileUI();
  window.App?.updateTripCargoUI?.();
}

export function updateCargoProfileUI() {
  const cargoType = State.profile.cargoType || 'container';
  const idLabel = document.getElementById('s-id-label');
  const idInput = document.getElementById('s-id');
  const generalBox = document.getElementById('s-general-cargo-box');
  if (idLabel) idLabel.textContent = cargoType === 'general' ? '차량 ID' : '차량 ID';
  if (idInput) {
    idInput.placeholder = cargoType === 'general' ? '생략가능' : 'ELSS0000';
    idInput.required = cargoType !== 'general';
  }
  if (generalBox) generalBox.style.display = cargoType === 'general' ? 'grid' : 'none';
}

// ─── 프로필 UI 반영 ──────────────────────────────────────────────
export function applyProfileToUI() {
  setSelectOptions('s-general-vehicle-type', GENERAL_VEHICLE_TYPES, State.profile.generalVehicleType || '트럭');
  setSelectOptions('s-general-payload', GENERAL_PAYLOADS, State.profile.generalPayload || '5ton');
  setSelectOptions('s-general-body-type', GENERAL_BODY_TYPES, State.profile.generalBodyType || '일반');

  document.getElementById('s-name').value    = State.profile.name;
  document.getElementById('s-phone').value   = State.profile.phone;
  document.getElementById('s-vehicle').value = State.profile.vehicleNo;
  document.getElementById('s-id').value      = State.profile.driverId;
  const cargoTypeEl = document.getElementById('s-cargo-type');
  if (cargoTypeEl) cargoTypeEl.value = State.profile.cargoType || 'container';
  const vehicleTypeEl = document.getElementById('s-general-vehicle-type');
  if (vehicleTypeEl) vehicleTypeEl.value = State.profile.generalVehicleType || '트럭';
  const payloadEl = document.getElementById('s-general-payload');
  if (payloadEl) payloadEl.value = State.profile.generalPayload || '5ton';
  const bodyTypeEl = document.getElementById('s-general-body-type');
  if (bodyTypeEl) bodyTypeEl.value = State.profile.generalBodyType || '일반';
  document.getElementById('header-vehicle').textContent = State.profile.vehicleNo || '—';

  updateProfilePhoto('p-photo-driver',  State.profile.photo_driver,  '기사');
  updateProfilePhoto('p-photo-vehicle', State.profile.photo_vehicle, '차량');
  updateProfilePhoto('p-photo-chassis', State.profile.photo_chassis, '샤시');

  // 프로필 저장 여부에 따라 하단 버튼 활성화/비활성화
  const hasProfile = State.profile.name && State.profile.phone
    && State.profile.vehicleNo && (State.profile.cargoType === 'general' || State.profile.driverId);
  updateSettingsButtonState(hasProfile);
  updateCargoProfileUI();
}

// ─── 설정 화면 하단 버튼 활성화/비활성화 ─────────────────────────
export function updateSettingsButtonState(enabled) {
  const saveBtn = document.getElementById('btn-save-profile');
  if (saveBtn) {
    saveBtn.style.background = enabled ? '#2563eb' : '#9ca3af';
    saveBtn.style.color = '#ffffff';
    saveBtn.style.opacity = '1';
    saveBtn.style.pointerEvents = enabled ? 'auto' : 'none';
    saveBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }
  // 부가 버튼 (lookup 버튼 제외)
  const otherBtns = document.querySelectorAll('#screen-settings .btn:not(#btn-lookup-driver):not(#btn-save-profile)');
  otherBtns.forEach(btn => {
    btn.style.opacity = enabled ? '1' : '0.7';
    btn.style.pointerEvents = enabled ? 'auto' : 'none';
  });
}

export function checkProfileForm() {
  const name      = document.getElementById('s-name')?.value.trim();
  const phone     = document.getElementById('s-phone')?.value.replace(/[^0-9]/g, '');
  const vehicleNo = document.getElementById('s-vehicle')?.value.trim();
  const driverId  = document.getElementById('s-id')?.value.trim();
  const cargoType = document.getElementById('s-cargo-type')?.value || 'container';

  const hasProfile = name && phone && vehicleNo && (cargoType === 'general' || driverId);
  updateSettingsButtonState(hasProfile);
}

// ─── 프로필 저장 ─────────────────────────────────────────────────
export function saveProfile() {
  const name      = document.getElementById('s-name').value.trim();
  const phone     = document.getElementById('s-phone').value.replace(/[^0-9]/g, '');
  const vehicleNo = document.getElementById('s-vehicle').value.trim();
  const driverId  = document.getElementById('s-id').value.trim().toUpperCase();
  const cargoType = document.getElementById('s-cargo-type')?.value || 'container';
  const generalVehicleType = document.getElementById('s-general-vehicle-type')?.value || '트럭';
  const generalPayload = document.getElementById('s-general-payload')?.value || '5ton';
  const generalBodyType = document.getElementById('s-general-body-type')?.value || '일반';

  document.getElementById('s-phone').value = phone;

  if (!name || !phone || !vehicleNo || (cargoType !== 'general' && !driverId)) {
    showToast(cargoType === 'general'
      ? '이름, 전화번호, 차량번호를 입력해 주세요.'
      : '이름, 전화번호, 차량번호, 기사 ID를 모두 입력해 주세요.');
    return;
  }

  State.profile = {
    ...State.profile,
    name, phone, vehicleNo, driverId,
    cargoType,
    generalVehicleType,
    generalPayload,
    generalBodyType,
  };
  Store.set('profile', State.profile);
  applyProfileToUI();
  upsertDriverContact();
  showToast('정보가 저장되었습니다.');

  // 하단 버튼 활성화 (저장 완료 후)
  setTimeout(() => {
    updateSettingsButtonState(true);
    window.App?.showMain();
  }, 1000);
}

// ─── 기사 정보 DB 동기화 ─────────────────────────────────────────
export async function upsertDriverContact() {
  try {
    await smartFetch(BASE_URL + '/api/vehicle-tracking/drivers', {
      method: 'POST',
      body: JSON.stringify({
        phone:          State.profile.phone,
        name:           State.profile.name,
        vehicle_number: State.profile.vehicleNo,
        vehicle_id:     State.profile.driverId,
        cargo_type:     State.profile.cargoType || 'container',
        general_vehicle_type: State.profile.generalVehicleType || null,
        general_payload: State.profile.generalPayload || null,
        general_body_type: State.profile.generalBodyType || null,
        photo_driver:   State.profile.photo_driver,
        photo_vehicle:  State.profile.photo_vehicle,
        photo_chassis:  State.profile.photo_chassis,
      }),
    });
  } catch (e) { console.warn('upsertDriverContact', e); }
}

// ─── 전화번호로 기사 조회 ────────────────────────────────────────
export async function lookupDriver() {
  const phone = document.getElementById('s-phone').value.replace(/\D/g, '');
  if (phone.length < 10) { showToast('전화번호를 먼저 입력해 주세요.'); return; }
  showToast('조회 중...');
  try {
    const res  = await smartFetch(`${BASE_URL}/api/vehicle-tracking/drivers?phone=${phone}`);
    const data = await res.json();
    if (data && data.driver) {
      const d = data.driver;
      State.profile.name = d.name || '';
      State.profile.phone = phone;
      State.profile.vehicleNo = d.vehicle_number || d.business_number || '';
      State.profile.driverId = d.vehicle_id || d.driver_id || '';
      State.profile.cargoType = d.cargo_type || 'container';
      State.profile.mapVisibility = d.map_visibility || 'own';
      State.profile.contractType = d.contract_type || 'uncontracted';
      State.profile.generalVehicleType = d.general_vehicle_type || '트럭';
      State.profile.generalPayload = d.general_payload || '5ton';
      State.profile.generalBodyType = d.general_body_type || '일반';

      applyProfileToUI();

      updateProfilePhoto('p-photo-driver',  d.photo_driver,  '기사');
      updateProfilePhoto('p-photo-vehicle', d.photo_vehicle, '차량');
      updateProfilePhoto('p-photo-chassis', d.photo_chassis, '샤시');

      State.profile.photo_driver  = d.photo_driver;
      State.profile.photo_vehicle = d.photo_vehicle;
      State.profile.photo_chassis = d.photo_chassis;

      showToast('기사 정보를 불러왔습니다.');
    } else {
      showToast('해당 전화번호로 등록된 기사 정보가 없습니다.');
    }
  } catch (e) { showToast('조회 실패: ' + e.message); }
}

// ─── 프로필 사진 DOM 업데이트 ────────────────────────────────────
export function updateProfilePhoto(id, url, fallback) {
  const el = document.getElementById(id);
  if (!el) return;
  if (url) {
    const fullUrl = url.startsWith('http') || url.startsWith('data:')
      ? url
      : BASE_URL + (url.startsWith('/') ? '' : '/') + url;
    el.style.backgroundImage = `url('${fullUrl}')`;
    el.textContent   = '';
    el.style.borderStyle = 'solid';
  } else {
    el.style.backgroundImage = 'none';
    el.textContent   = fallback;
    el.style.borderStyle = 'dashed';
  }
}

// ─── 프로필 사진 촬영/선택 ───────────────────────────────────────
export async function pickProfilePhoto(type) {
  try {
    const Camera = window.Capacitor?.Plugins?.Camera;
    if (!Camera) { showToast('카메라 기능을 사용할 수 없습니다.'); return; }

    const image = await Camera.getPhoto({
      quality:       70,
      width:         1000,
      height:        1000,
      allowEditing:  false,
      resultType:    'base64',
      source:        'PROMPT',
      saveToGallery: false,
      promptLabelHeader:  '사진 선택',
      promptLabelCancel:  '취소',
      promptLabelPhoto:   '앨범에서 선택',
      promptLabelPicture: '사진 촬영',
    });

    const dataUrl = `data:image/jpeg;base64,${image.base64String}`;
    if (type === 'driver')  State.profile.photo_driver  = dataUrl;
    if (type === 'vehicle') State.profile.photo_vehicle = dataUrl;
    if (type === 'chassis') State.profile.photo_chassis = dataUrl;

    updateProfilePhoto('p-photo-' + type, dataUrl, '');
    showToast('사진이 선택되었습니다. 정보 저장 시 업로드됩니다.');
  } catch (e) {
    console.warn('pickProfilePhoto skip', e);
  }
}

// ─── 프로필 사진 클릭 핸들러 ─────────────────────────────────────
export function handleProfilePhotoClick(type) {
  if (State.profile[`photo_${type}`]) {
    const types = ['driver', 'vehicle', 'chassis'];
    State.profilePhotos = [];
    let idxToOpen = 0;
    for (const t of types) {
      if (State.profile[`photo_${t}`]) {
        if (t === type) idxToOpen = State.profilePhotos.length;
        State.profilePhotos.push({ type: t, dataUrl: State.profile[`photo_${t}`] });
      }
    }
    window.App?.openPhotoViewer(idxToOpen, 'profile');
  } else {
    pickProfilePhoto(type);
  }
}
