/**
 * profile.js — 프로필 UI, 저장, 기사 조회, 프로필 사진 3종
 */
import { Store, State, BASE_URL } from './store.js?v=4918';
import { smartFetch } from './bridge.js?v=4918';

function showToast(msg, duration) { window.App?.showToast(msg, duration); }

// ─── 프로필 UI 반영 ──────────────────────────────────────────────
export function applyProfileToUI() {
  document.getElementById('s-name').value    = State.profile.name;
  document.getElementById('s-phone').value   = State.profile.phone;
  document.getElementById('s-vehicle').value = State.profile.vehicleNo;
  document.getElementById('s-id').value      = State.profile.driverId;
  document.getElementById('header-vehicle').textContent = State.profile.vehicleNo || '—';

  updateProfilePhoto('p-photo-driver',  State.profile.photo_driver,  '기사');
  updateProfilePhoto('p-photo-vehicle', State.profile.photo_vehicle, '차량');
  updateProfilePhoto('p-photo-chassis', State.profile.photo_chassis, '샤시');

  // 프로필 저장 여부에 따라 하단 버튼 활성화/비활성화
  const hasProfile = State.profile.name && State.profile.phone
    && State.profile.vehicleNo && State.profile.driverId;
  updateSettingsButtonState(hasProfile);
}

// ─── 설정 화면 하단 버튼 활성화/비활성화 ─────────────────────────
function updateSettingsButtonState(enabled) {
  const buttons = document.querySelectorAll('#tab-settings .field:last-of-type .btn');
  buttons.forEach(btn => {
    if (enabled) {
      btn.removeAttribute('disabled');
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    } else {
      btn.setAttribute('disabled', 'disabled');
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
      btn.style.cursor = 'not-allowed';
    }
  });
}

// ─── 프로필 저장 ─────────────────────────────────────────────────
export function saveProfile() {
  const name      = document.getElementById('s-name').value.trim();
  const phone     = document.getElementById('s-phone').value.replace(/[^0-9]/g, '');
  const vehicleNo = document.getElementById('s-vehicle').value.trim();
  const driverId  = document.getElementById('s-id').value.trim().toUpperCase();

  document.getElementById('s-phone').value = phone;

  if (!name || !phone || !vehicleNo || !driverId) {
    showToast('이름, 전화번호, 차량번호, 기사 ID를 모두 입력해 주세요.');
    return;
  }

  State.profile = { ...State.profile, name, phone, vehicleNo, driverId };
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
      document.getElementById('s-name').value    = d.name || '';
      document.getElementById('s-vehicle').value = d.vehicle_number || d.business_number || '';
      document.getElementById('s-id').value      = d.vehicle_id || d.driver_id || '';

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
