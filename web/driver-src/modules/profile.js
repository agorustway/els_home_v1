/**
 * profile.js ???꾨줈??UI, ??? 湲곗궗 議고쉶, ?꾨줈???ъ쭊 3醫? */
import { Store, State, BASE_URL } from './store.js?v=4919';
import { smartFetch } from './bridge.js?v=4919';

function showToast(msg, duration) { window.App?.showToast(msg, duration); }

// ??? ?꾨줈??UI 諛섏쁺 ??????????????????????????????????????????????
export function applyProfileToUI() {
  document.getElementById('s-name').value    = State.profile.name;
  document.getElementById('s-phone').value   = State.profile.phone;
  document.getElementById('s-vehicle').value = State.profile.vehicleNo;
  document.getElementById('s-id').value      = State.profile.driverId;
  document.getElementById('header-vehicle').textContent = State.profile.vehicleNo || '??;

  updateProfilePhoto('p-photo-driver',  State.profile.photo_driver,  '湲곗궗');
  updateProfilePhoto('p-photo-vehicle', State.profile.photo_vehicle, '李⑤웾');
  updateProfilePhoto('p-photo-chassis', State.profile.photo_chassis, '?ㅼ떆');

  // ?꾨줈??????щ????곕씪 ?섎떒 踰꾪듉 ?쒖꽦??鍮꾪솢?깊솕
  const hasProfile = State.profile.name && State.profile.phone
    && State.profile.vehicleNo && State.profile.driverId;
  updateSettingsButtonState(hasProfile);
}

// ??? ?ㅼ젙 ?붾㈃ ?섎떒 踰꾪듉 ?쒖꽦??鍮꾪솢?깊솕 ?????????????????????????
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

// ??? ?꾨줈??????????????????????????????????????????????????????
export function saveProfile() {
  const name      = document.getElementById('s-name').value.trim();
  const phone     = document.getElementById('s-phone').value.replace(/[^0-9]/g, '');
  const vehicleNo = document.getElementById('s-vehicle').value.trim();
  const driverId  = document.getElementById('s-id').value.trim().toUpperCase();

  document.getElementById('s-phone').value = phone;

  if (!name || !phone || !vehicleNo || !driverId) {
    showToast('?대쫫, ?꾪솕踰덊샇, 李⑤웾踰덊샇, 湲곗궗 ID瑜?紐⑤몢 ?낅젰??二쇱꽭??');
    return;
  }

  State.profile = { ...State.profile, name, phone, vehicleNo, driverId };
  Store.set('profile', State.profile);
  applyProfileToUI();
  upsertDriverContact();
  showToast('?뺣낫媛 ??λ릺?덉뒿?덈떎.');

  // ?섎떒 踰꾪듉 ?쒖꽦??(????꾨즺 ??
  setTimeout(() => {
    updateSettingsButtonState(true);
    window.App?.showMain();
  }, 1000);
}

// ??? 湲곗궗 ?뺣낫 DB ?숆린???????????????????????????????????????????
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

// ??? ?꾪솕踰덊샇濡?湲곗궗 議고쉶 ????????????????????????????????????????
export async function lookupDriver() {
  const phone = document.getElementById('s-phone').value.replace(/\D/g, '');
  if (phone.length < 10) { showToast('?꾪솕踰덊샇瑜?癒쇱? ?낅젰??二쇱꽭??'); return; }
  showToast('議고쉶 以?..');
  try {
    const res  = await smartFetch(`${BASE_URL}/api/vehicle-tracking/drivers?phone=${phone}`);
    const data = await res.json();
    if (data && data.driver) {
      const d = data.driver;
      document.getElementById('s-name').value    = d.name || '';
      document.getElementById('s-vehicle').value = d.vehicle_number || d.business_number || '';
      document.getElementById('s-id').value      = d.vehicle_id || d.driver_id || '';

      updateProfilePhoto('p-photo-driver',  d.photo_driver,  '湲곗궗');
      updateProfilePhoto('p-photo-vehicle', d.photo_vehicle, '李⑤웾');
      updateProfilePhoto('p-photo-chassis', d.photo_chassis, '?ㅼ떆');

      State.profile.photo_driver  = d.photo_driver;
      State.profile.photo_vehicle = d.photo_vehicle;
      State.profile.photo_chassis = d.photo_chassis;

      showToast('湲곗궗 ?뺣낫瑜?遺덈윭?붿뒿?덈떎.');
    } else {
      showToast('?대떦 ?꾪솕踰덊샇濡??깅줉??湲곗궗 ?뺣낫媛 ?놁뒿?덈떎.');
    }
  } catch (e) { showToast('議고쉶 ?ㅽ뙣: ' + e.message); }
}

// ??? ?꾨줈???ъ쭊 DOM ?낅뜲?댄듃 ????????????????????????????????????
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

// ??? ?꾨줈???ъ쭊 珥ъ쁺/?좏깮 ???????????????????????????????????????
export async function pickProfilePhoto(type) {
  try {
    const Camera = window.Capacitor?.Plugins?.Camera;
    if (!Camera) { showToast('移대찓??湲곕뒫???ъ슜?????놁뒿?덈떎.'); return; }

    const image = await Camera.getPhoto({
      quality:       70,
      width:         1000,
      height:        1000,
      allowEditing:  false,
      resultType:    'base64',
      source:        'PROMPT',
      saveToGallery: false,
      promptLabelHeader:  '?ъ쭊 ?좏깮',
      promptLabelCancel:  '痍⑥냼',
      promptLabelPhoto:   '?⑤쾾?먯꽌 ?좏깮',
      promptLabelPicture: '?ъ쭊 珥ъ쁺',
    });

    const dataUrl = `data:image/jpeg;base64,${image.base64String}`;
    if (type === 'driver')  State.profile.photo_driver  = dataUrl;
    if (type === 'vehicle') State.profile.photo_vehicle = dataUrl;
    if (type === 'chassis') State.profile.photo_chassis = dataUrl;

    updateProfilePhoto('p-photo-' + type, dataUrl, '');
    showToast('?ъ쭊???좏깮?섏뿀?듬땲?? ?뺣낫 ??????낅줈?쒕맗?덈떎.');
  } catch (e) {
    console.warn('pickProfilePhoto skip', e);
  }
}

// ??? ?꾨줈???ъ쭊 ?대┃ ?몃뱾???????????????????????????????????????
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

