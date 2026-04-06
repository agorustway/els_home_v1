/**
 * log.js — 운행 일지 목록, 상세, 수정, 삭제, 사진 추가
 */
import { State, BASE_URL } from './store.js?v=489';
import { smartFetch } from './bridge.js?v=489';
import { formatDate, escHtml, showToast } from './utils.js?v=489';
import { validateISO6346 } from './trip.js?v=489';

let _currentLogData = null;

// ─── 사진 리사이즈 (log.js 내 독립 사본 — photos.js와 중복 허용) ─
async function resizePhoto(file, maxWidth = 1600, maxHeight = 1600) {
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
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── 일지 목록 조회 ──────────────────────────────────────────────
export async function loadLogs() {
  document.getElementById('log-list').innerHTML =
    '<div class="loading"><div class="spinner"></div>불러오는 중...</div>';

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
    const res    = await smartFetch(url);
    const data   = await res.json();
    const trips  = data.trips || [];
    if (!trips.length) {
      document.getElementById('log-list').innerHTML = '<div class="loading">조회 결과가 없습니다.</div>';
      return;
    }

    const statusLabel = { driving: '운송중', paused: '일시정지', completed: '완료' };
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
            <span class="log-item-container">${escHtml(t.container_number || '컨테이너 미입력')}</span>
            <span class="log-item-status" style="color:${statusColor[t.status] || 'var(--text-muted)'};border-color:${statusColor[t.status] || 'var(--text-muted)'};">${statusLabel[t.status] || t.status}</span>
          </div>
          <div class="log-item-meta" style="display:flex; justify-content:space-between; align-items:center;">
            <span>${formatDate(new Date(t.started_at))} · ${escHtml(t.vehicle_number || '')}</span>
            ${pCount > 0 ? `<span style="font-size:10px; color:var(--accent); font-weight:700;">📸 ${pCount}장</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch {
    document.getElementById('log-list').innerHTML = '<div class="loading">불러오기 실패</div>';
  }
}

// ─── 일지 상세 열기 ──────────────────────────────────────────────
export async function openLog(id) {
  try {
    const res  = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${id}`);
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
          <span class="log-detail-info-label">번호 / 상태</span>
          <span style="display:flex;align-items:center;gap:6px;">
            <span>${escHtml(data.vehicle_number || '—')}</span>
            <span style="color:#cbd5e1;">|</span>
            <span style="font-weight:700;">${data.status === 'completed' ? '완료' : (data.status === 'driving' ? '운송중' : (data.status === 'paused' ? '일시정지' : data.status))}</span>
            ${data.status !== 'completed' ? `<button onclick="App.forceCompleteLog('${data.id}')" class="btn btn-sm btn-warn" style="font-size:10px;padding:2px 6px;height:auto;margin-left:4px;">종료처리</button>` : ''}
          </span>
        </div>
        <div class="log-detail-info-row"><span class="log-detail-info-label">운행 시작</span><span style="font-weight:700;color:var(--accent);">${formatDate(new Date(data.started_at))}</span></div>
        ${endedAt ? `<div class="log-detail-info-row"><span class="log-detail-info-label">운행 종료</span><span style="font-weight:700;color:var(--danger);">${formatDate(new Date(endedAt))}</span></div>` : ''}
        <div class="log-detail-info-row">
          <span class="log-detail-info-label">제원 / 점검</span>
          <span>${data.container_type || '—'} / ${data.container_kind || '—'}
            <span style="color:#cbd5e1;margin:0 4px;">|</span>
            <span style="color:${isAllChecked ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${isAllChecked ? '점검완료' : '미점검'}</span>
          </span>
        </div>
      </div>
    `;

    // 사진 목록
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
          ? `<img class="photo-thumb" src="${url}" onclick="App.openLogPhoto('${escHtml(url)}', ${i}, ${photos.length})" alt="사진${i + 1}">`
          : '';
      }).join('');
      photoScroll.innerHTML = html;
    }

    document.getElementById('log-list').style.display = 'none';
    document.getElementById('log-detail').classList.add('active');
  } catch { showToast('불러오기 실패'); }
}

// ─── 일지 필드 변경 핸들러 ───────────────────────────────────────
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
          errEl.textContent = '유효한 번호입니다'; errEl.style.color = 'var(--primary)';
        } else {
          errEl.textContent = '컨테이너번호 오기입'; errEl.style.color = 'var(--danger)';
        }
      } else {
        errEl.textContent = '입력 중...'; errEl.style.color = 'var(--text-muted)';
      }
    } else {
      errEl.textContent = '영문 4자 + 숫자 7자'; errEl.style.color = 'var(--danger)';
    }
  }
}

// ─── 일지 수정 저장 ──────────────────────────────────────────────
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
    showToast('저장되었습니다.');
    closeLogDetail();
    loadLogs();
  } catch { showToast('저장 실패'); }
}

// ─── 일지 삭제 ───────────────────────────────────────────────────
export async function deleteLog() {
  if (!State.currentLogId || !confirm('이 운행 기록을 삭제하시겠습니까?')) return;
  try {
    const res = await smartFetch(
      `${BASE_URL}/api/vehicle-tracking/trips/${State.currentLogId}`,
      { method: 'DELETE' }
    );
    if (res && res.ok === false) throw new Error('서버 권한/응답 오류');

    // 현재 운행 중인 트립을 삭제한 경우 운행 화면도 초기화
    if (String(State.currentLogId) === String(State.trip?.id)) {
      window.App?.clearTripData();
    }

    showToast('삭제되었습니다.');
    closeLogDetail();
    loadLogs();
  } catch { showToast('삭제 실패'); }
}

// ─── 강제 종료 처리 ──────────────────────────────────────────────
export async function forceCompleteLog(id) {
  if (!confirm('이 운행을 강제로 운행종료 처리하시겠습니까?')) return;
  try {
    await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed', ended_at: new Date().toISOString() }),
    });
    showToast('운행종료 되었습니다.');
    if (String(State.trip?.id) === String(id)) {
      window.App?.clearTripData(true);
      window.App?.updateTripStatusLine?.();
    }
    closeLogDetail();
    loadLogs();
  } catch { showToast('운행종료 처리 실패'); }
}

// ─── 일지 상세 닫기 ──────────────────────────────────────────────
export function closeLogDetail() {
  document.getElementById('log-detail').classList.remove('active');
  document.getElementById('log-list').style.display = '';
  State.currentLogId = null;
}

// ─── 일지 사진 추가 ──────────────────────────────────────────────
export function addLogPhoto() {
  if ((State.logPhotos || []).length >= 10) { showToast('최대 10장까지 첨부 가능합니다.'); return; }
  document.getElementById('log-file-input-hidden').click();
}

export async function onLogFileSelected(e) {
  const files = Array.from(e.target.files);
  e.target.value = '';
  if (!State.currentLogId) return;

  const photos = State.logPhotos || [];
  if (photos.length >= 10) { showToast('최대 10장까지만 가능합니다.'); return; }

  const uploadCount = Math.min(files.length, 10 - photos.length);
  if (uploadCount <= 0) return;

  showToast(`사진 ${uploadCount}장을 압축/업로드 중...`, 5000);
  let successCount = 0;

  try {
    for (let i = 0; i < uploadCount; i++) {
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
      }
    }
    if (successCount > 0) {
      await openLog(State.currentLogId);
      showToast(`사진 ${successCount}장 업로드 성공`);
    }
  } catch (err) {
    console.error('onLogFileSelected error', err);
    showToast('업로드 중 오류 발생');
  }
}
