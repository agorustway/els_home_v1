/**
 * log.js ???댄뻾 ?쇱? 紐⑸줉, ?곸꽭, ?섏젙, ??젣, ?ъ쭊 異붽?
 */
import { State, BASE_URL } from './store.js?v=4919';
import { smartFetch } from './bridge.js?v=4919';
import { formatDate, escHtml, showToast } from './utils.js?v=4919';
import { validateISO6346 } from './trip.js?v=4919';

let _currentLogData = null;

// ??? ?ъ쭊 由ъ궗?댁쫰 (log.js ???낅┰ ?щ낯 ??photos.js? 以묐났 ?덉슜) ?
async function resizePhoto(file, maxWidth = 1024, maxHeight = 1024) {
  if (typeof file === 'string') return file;
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxWidth)  { h *= maxWidth / w;  w = maxWidth;  } }
        else        { if (h > maxHeight) { w *= maxHeight / h; h = maxHeight; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ??? ?쇱? 紐⑸줉 議고쉶 ??????????????????????????????????????????????
export async function loadLogs() {
  document.getElementById('log-list').innerHTML =
    '<div class="loading"><div class="spinner"></div>遺덈윭?ㅻ뒗 以?..</div>';

  const date  = document.getElementById('log-date-filter').value;
  const month = document.getElementById('log-month-filter').value;
  const phone = State.profile.phone;
  const vNum  = State.profile.vehicleNo;

  let url = `${BASE_URL}/api/vehicle-tracking/trips?mode=my`;
  if (date)  url += `&date=${date}`;
  else if (month) url += `&month=${month}`;
  if (phone) url += `&phone=${phone}`;
  if (vNum)  url += `&vehicle_number=${encodeURIComponent(vNum)}`;

  try {
    // 罹먯떆 臾댄슚??(GET 罹먯떛 諛⑹?)
    const res    = await smartFetch(`${url}&t=${Date.now()}`);
    const data   = await res.json();
    const trips  = data.trips || [];
    if (!trips.length) {
      document.getElementById('log-list').innerHTML = '<div class="loading">議고쉶 寃곌낵媛 ?놁뒿?덈떎.</div>';
      return;
    }

    const statusLabel = { driving: '?댁넚以?, paused: '?쇱떆?뺤?', completed: '?꾨즺' };
    const statusColor = { driving: 'var(--success)', paused: 'var(--warn)', completed: 'var(--text-muted)' };

    document.getElementById('log-list').innerHTML = trips.map(t => {
      let pCount = 0;
      try {
        if (Array.isArray(t.photos)) pCount = t.photos.length;
        else if (typeof t.photos === 'string' && t.photos.trim()) pCount = JSON.parse(t.photos).length;
      } catch { }

      return `
        <div class="log-item" onclick="App.openLog('${t.id}')">
          <div class="log-item-header">
            <span class="log-item-container">${escHtml(t.container_number || '而⑦뀒?대꼫 誘몄엯??)}</span>
            <span class="log-item-status" style="color:${statusColor[t.status] || 'var(--text-muted)'};border-color:${statusColor[t.status] || 'var(--text-muted)'};">${statusLabel[t.status] || t.status}</span>
          </div>
          <div class="log-item-meta" style="display:flex; justify-content:space-between; align-items:center;">
            <span>${formatDate(new Date(t.started_at))} 쨌 ${escHtml(t.vehicle_number || '')}</span>
            ${pCount > 0 ? `<span style="font-size:10px; color:var(--accent); font-weight:700;">?벝 ${pCount}??/span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch {
    document.getElementById('log-list').innerHTML = '<div class="loading">遺덈윭?ㅺ린 ?ㅽ뙣</div>';
  }
}

// ??? ?쇱? ?곸꽭 ?닿린 ??????????????????????????????????????????????
export async function openLog(id) {
  try {
    // 罹먯떆 臾댄슚?붾? ?꾪빐 t ?뚮씪誘명꽣 異붽?
    const res  = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${id}?t=${Date.now()}`);
    const data = await res.json();
    _currentLogData   = data;
    State.currentLogId = id;

    document.getElementById('log-edit-container').value = data.container_number || '';
    document.getElementById('log-edit-seal').value      = data.seal_number      || '';
    document.getElementById('log-edit-memo').value      = data.special_notes    || '';
    onLogFieldChange();

    const isAllChecked = !!(data.chk_brake && data.chk_tire && data.chk_lamp && data.chk_cargo && data.chk_driver);
    const endedAt      = data.ended_at || data.completed_at || null;

    document.getElementById('log-detail-content').innerHTML = `
      <div class="log-detail-info-box">
        <div class="log-detail-info-row">
          <span class="log-detail-info-label">踰덊샇 / ?곹깭</span>
          <span style="display:flex;align-items:center;gap:6px;">
            <span>${escHtml(data.vehicle_number || '??)}</span>
            <span style="color:#cbd5e1;">|</span>
            <span style="font-weight:700;">${data.status === 'completed' ? '?꾨즺' : (data.status === 'driving' ? '?댁넚以? : (data.status === 'paused' ? '?쇱떆?뺤?' : data.status))}</span>
            ${data.status !== 'completed' ? `<button onclick="App.forceCompleteLog('${data.id}')" class="btn btn-sm btn-warn" style="font-size:10px;padding:2px 6px;height:auto;margin-left:4px;">醫낅즺泥섎━</button>` : ''}
          </span>
        </div>
        <div class="log-detail-info-row"><span class="log-detail-info-label">?댄뻾 ?쒖옉</span><span style="font-weight:700;color:var(--accent);">${formatDate(new Date(data.started_at))}</span></div>
        ${endedAt ? `<div class="log-detail-info-row"><span class="log-detail-info-label">?댄뻾 醫낅즺</span><span style="font-weight:700;color:var(--danger);">${formatDate(new Date(endedAt))}</span></div>` : ''}
        <div class="log-detail-info-row">
          <span class="log-detail-info-label">?쒖썝 / ?먭?</span>
          <span>${data.container_type || '??} / ${data.container_kind || '??}
            <span style="color:#cbd5e1;margin:0 4px;">|</span>
            <span style="color:${isAllChecked ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${isAllChecked ? '?먭??꾨즺' : '誘몄젏寃'}</span>
          </span>
        </div>
      </div>
    `;

    // ?ъ쭊 紐⑸줉
    let photos = [];
    try {
      if (Array.isArray(data.photos)) photos = data.photos;
      else if (typeof data.photos === 'string' && data.photos.trim()) photos = JSON.parse(data.photos);
    } catch (e) { console.error('Photos parsing failed', e); }
    if (!Array.isArray(photos)) photos = [];
    State.logPhotos = photos;

    const photoScroll = document.getElementById('log-photo-scroll');
    const cnt         = document.getElementById('log-photo-count-display');
    if (cnt) cnt.textContent = `(${photos.length}/10)`;
    if (photoScroll) {
      let html = '<button class="photo-add-btn" onclick="App.addLogPhoto()">+</button>';
      html += photos.map((p, i) => {
        let url = typeof p === 'string' ? p : (p?.url || p?.serverUrl || p?.dataUrl || '');
        if (url && !url.startsWith('http') && !url.startsWith('data:')) {
          url = BASE_URL + (url.startsWith('/') ? '' : '/') + url;
        }
        return url
          ? `<img class="photo-thumb" src="${url}" onclick="App.openLogPhoto('${escHtml(url)}', ${i}, ${photos.length})" alt="?ъ쭊${i + 1}"
              onerror="this.onerror=null; App.loadSafeImage(this, '${escHtml(url)}')">`
          : '';
      }).join('');
      photoScroll.innerHTML = html;
    }

    document.getElementById('log-list').style.display = 'none';
    document.getElementById('log-detail').classList.add('active');
  } catch { showToast('遺덈윭?ㅺ린 ?ㅽ뙣'); }
}

// ??? ?쇱? ?꾨뱶 蹂寃??몃뱾?????????????????????????????????????????
export function onLogFieldChange() {
  const cEl  = document.getElementById('log-edit-container');
  const sEl  = document.getElementById('log-edit-seal');
  if (!cEl || !sEl) return;

  cEl.value = cEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  sEl.value = sEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();

  const errEl = document.getElementById('log-container-check-msg');
  if (errEl) errEl.textContent = '';

  const val = cEl.value;
  if (val.length >= 4 && errEl) {
    const match = val.match(/^([A-Z]{4})(\d{0,7})$/);
    if (match) {
      if (val.length === 11) {
        if (validateISO6346(val)) {
          errEl.textContent = '?좏슚??踰덊샇?낅땲??; errEl.style.color = 'var(--primary)';
        } else {
          errEl.textContent = '而⑦뀒?대꼫踰덊샇 ?ㅺ린??; errEl.style.color = 'var(--danger)';
        }
      } else {
        errEl.textContent = '?낅젰 以?..'; errEl.style.color = 'var(--text-muted)';
      }
    } else {
      errEl.textContent = '?곷Ц 4??+ ?レ옄 7??; errEl.style.color = 'var(--danger)';
    }
  }
}

// ??? ?쇱? ?섏젙 ?????????????????????????????????????????????????
export async function saveLogEdit() {
  if (!State.currentLogId) return;
  const cEl = document.getElementById('log-edit-container');
  const sEl = document.getElementById('log-edit-seal');
  if (cEl) cEl.value = cEl.value.trim().toUpperCase();
  if (sEl) sEl.value = sEl.value.trim().toUpperCase();
  try {
    await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.currentLogId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        container_number: cEl?.value || '',
        seal_number:      sEl?.value || '',
        special_notes:    document.getElementById('log-edit-memo').value,
      }),
    });
    showToast('??λ릺?덉뒿?덈떎.');
    closeLogDetail();
    loadLogs();
  } catch { showToast('????ㅽ뙣'); }
}

// ??? ?쇱? ??젣 ???????????????????????????????????????????????????
export async function deleteLog() {
  if (!State.currentLogId || !confirm('???댄뻾 湲곕줉????젣?섏떆寃좎뒿?덇퉴?')) return;
  try {
    const res = await smartFetch(
      `${BASE_URL}/api/vehicle-tracking/trips/${State.currentLogId}`,
      { method: 'DELETE' }
    );
    if (res && res.ok === false) throw new Error('?쒕쾭 沅뚰븳/?묐떟 ?ㅻ쪟');

    // ?꾩옱 ?댄뻾 以묒씤 ?몃┰????젣??寃쎌슦 ?댄뻾 ?붾㈃??珥덇린??    if (String(State.currentLogId) === String(State.trip?.id)) {
      window.App?.clearTripData();
    }

    showToast('??젣?섏뿀?듬땲??');
    closeLogDetail();
    loadLogs();
  } catch { showToast('??젣 ?ㅽ뙣'); }
}

// ??? 媛뺤젣 醫낅즺 泥섎━ ??????????????????????????????????????????????
export async function forceCompleteLog(id) {
  if (!confirm('???댄뻾??媛뺤젣濡??댄뻾醫낅즺 泥섎━?섏떆寃좎뒿?덇퉴?')) return;
  try {
    await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed', ended_at: new Date().toISOString() }),
    });
    showToast('?댄뻾醫낅즺 ?섏뿀?듬땲??');
    if (String(State.trip?.id) === String(id)) {
      window.App?.clearTripData(true);
      window.App?.updateTripStatusLine?.();
    }
    closeLogDetail();
    loadLogs();
  } catch { showToast('?댄뻾醫낅즺 泥섎━ ?ㅽ뙣'); }
}

// ??? ?쇱? ?곸꽭 ?リ린 ??????????????????????????????????????????????
export function closeLogDetail() {
  document.getElementById('log-detail').classList.remove('active');
  document.getElementById('log-list').style.display = '';
  State.currentLogId = null;
}

// ??? ?쇱? ?ъ쭊 異붽? ??????????????????????????????????????????????
export function addLogPhoto() {
  if ((State.logPhotos || []).length >= 10) { showToast('理쒕? 10?κ퉴吏 泥⑤? 媛?ν빀?덈떎.'); return; }
  document.getElementById('log-file-input-hidden').click();
}

export async function onLogFileSelected(e) {
  const files = Array.from(e.target.files);
  e.target.value = '';
  if (!State.currentLogId) return;

  const photos = State.logPhotos || [];
  if (photos.length >= 10) { showToast('理쒕? 10?κ퉴吏留?媛?ν빀?덈떎.'); return; }

  const uploadCount = Math.min(files.length, 10 - photos.length);
  if (uploadCount <= 0) return;

  showToast(`?ъ쭊 ${uploadCount}???뺤텞/?낅줈??以?..`);
  let successCount = 0;
  let failCount = 0;

  try {
    for (let i = 0; i < uploadCount; i++) {
      try {
        const dataUrl = await resizePhoto(files[i]);
        const base64  = dataUrl.split(',')[1];
        const mime    = dataUrl.split(';')[0].split(':')[1] || 'image/jpeg';
        const ext     = mime.split('/')[1] || 'jpg';

        const res  = await smartFetch(BASE_URL + '/api/vehicle-tracking/photos', {
          method: 'POST',
          body: JSON.stringify({
            trip_id: State.currentLogId,
            photos:  [{ name: `photo_${Date.now()}_${i}.${ext}`, base64, type: mime }],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.photos && Array.isArray(data.photos)) {
          State.logPhotos = data.photos;
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        console.error('onLogFileSelected item error', err);
        failCount++;
      }
    }
    if (successCount > 0) {
      await openLog(State.currentLogId);
      showToast(`?ъ쭊 ${successCount}???낅줈???깃났`);
    }
    if (failCount > 0) {
      showToast(`?ъ쭊 ${failCount}???낅줈???ㅽ뙣?덉뒿?덈떎.`);
    }
  } catch (err) {
    console.error('onLogFileSelected error', err);
    showToast('?낅줈??怨쇱젙 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
  }
}

