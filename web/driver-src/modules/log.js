/**
 * log.js — 운행 일지 목록, 상세, 수정, 삭제, 사진 추가
 */
import { State, BASE_URL } from './store.js?v=5145';
import { smartFetch } from './bridge.js?v=5145';
import { formatDate, escHtml, showToast } from './utils.js?v=5145';
import { validateISO6346 } from './trip.js?v=5145';

let _currentLogData = null;

function parseBillingAmount(value) {
  const num = Number(String(value || '').replace(/[^0-9]/g, ''));
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatBillingAmount(value) {
  const num = parseBillingAmount(value);
  return num ? num.toLocaleString('ko-KR') : '';
}

// ─── 사진 리사이즈 (log.js 내 독립 사본 — photos.js와 중복 허용) ─
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
    // 캐시 무효화 (GET 캐싱 방지)
    const res    = await smartFetch(`${url}&t=${Date.now()}`);
    const data   = await res.json();
    const trips  = data.trips || [];
    if (!trips.length) {
      document.getElementById('log-list').innerHTML = '<div class="loading">조회 결과가 없습니다.</div>';
      return;
    }

    const statusLabel = { driving: '운송중', paused: '일시정지', completed: '완료' };
    const statusColor = { driving: 'var(--success)', paused: 'var(--warn)', completed: 'var(--text-muted)' };

    // 통계 포매터 계산
    function fmtDuration(startedAt, endedAt) {
      if (!startedAt || !endedAt) return null;
      const ms = new Date(endedAt) - new Date(startedAt);
      if (ms <= 0) return null;
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    }

    document.getElementById('log-list').innerHTML = trips.map(t => {
      let pCount = 0;
      try {
        if (Array.isArray(t.photos)) pCount = t.photos.length;
        else if (typeof t.photos === 'string' && t.photos.trim()) pCount = JSON.parse(t.photos).length;
      } catch { }

      const endedAt = t.ended_at || t.completed_at;
      const duration = fmtDuration(t.started_at, endedAt);
      const maxSpd = t.max_speed != null ? `${Math.round(t.max_speed)}km/h` : null;
      const avgSpd = t.avg_speed != null ? `${Math.round(t.avg_speed)}km/h` : null;

      const statsHtml = (duration || maxSpd || avgSpd) ? `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:5px;font-size:10px;color:#64748b;">
          ${duration ? `<span>⏱ ${duration}</span>` : ''}
          ${maxSpd ? `<span>⚡ 최고 ${maxSpd}</span>` : ''}
          ${avgSpd ? `<span>📊 평균 ${avgSpd}</span>` : ''}
        </div>` : '';

      return `
        <div class="log-item" onclick="App.openLog('${t.id}')">
          <div class="log-item-header">
            <span class="log-item-container">${escHtml((t.cargo_type === 'general' ? (t.cargo_item || t.container_number || '화물명 미입력') : (t.container_number || '컨테이너 미입력')))}</span>
            <span class="log-item-status" style="color:${statusColor[t.status] || 'var(--text-muted)'};border-color:${statusColor[t.status] || 'var(--text-muted)'};">${statusLabel[t.status] || t.status}</span>
          </div>
          <div class="log-item-meta" style="display:flex; justify-content:space-between; align-items:center;">
            <span>${formatDate(new Date(t.started_at))} · ${escHtml(t.vehicle_number || '')}</span>
            ${pCount > 0 ? `<span style="font-size:10px; color:var(--accent); font-weight:700;">📸 ${pCount}장</span>` : ''}
          </div>
          ${statsHtml}
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
    // 캐시 무효화를 위해 t 파라미터 추가
    const res  = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${id}?t=${Date.now()}`);
    const data = await res.json();
    _currentLogData   = data;
    State.currentLogId = id;

    document.getElementById('log-edit-container').value = data.container_number || '';
    document.getElementById('log-edit-seal').value      = data.seal_number      || '';
    document.getElementById('log-edit-memo').value      = data.special_notes    || '';
    document.getElementById('log-edit-transport-type').value = data.transport_type || '왕복';
    document.getElementById('log-edit-billing-amount').value = formatBillingAmount(data.billing_amount);
    document.getElementById('log-edit-work-site').value = data.work_site || '';
    const isGeneral = data.cargo_type === 'general';
    const cLabel = document.getElementById('log-container-label');
    const sLabel = document.getElementById('log-seal-label');
    const cInput = document.getElementById('log-edit-container');
    const sInput = document.getElementById('log-edit-seal');
    if (cLabel) cLabel.textContent = isGeneral ? '화물명' : '컨테이너 번호';
    if (sLabel) sLabel.textContent = isGeneral ? '오더/관리번호' : '씰 번호';
    if (cInput) cInput.placeholder = isGeneral ? '화물명' : '컨테이너 번호';
    if (sInput) sInput.placeholder = isGeneral ? '오더번호' : '씰 번호';

    // [v5.10.42] 관리자 수정 필드 감지: admin_edited_fields 또는 로그 |admin 플래그
    const adminEdited = {};
    // API에서 이미 계산된 admin_edited_fields 사용 (있으면)
    if (Array.isArray(data.admin_edited_fields)) {
      data.admin_edited_fields.forEach(f => { adminEdited[f] = true; });
    }
    // 로그에서도 추가 감지 (한 번이라도 |admin 이력이 있으면 파란색)
    if (data.logs && Array.isArray(data.logs)) {
      data.logs.forEach(log => {
        if (log.modified_by && log.modified_by.includes('|admin')) {
          adminEdited[log.field_name] = true;
        }
      });
    }

    const setAdminBlue = (elId, fieldName) => {
      const el = document.getElementById(elId);
      if (el) {
        if (adminEdited[fieldName]) {
          el.style.color = '#2563eb';
          el.style.fontWeight = '700';
        } else {
          el.style.color = '';
          el.style.fontWeight = '';
        }
      }
    };

    setAdminBlue('log-edit-container', 'container_number');
    setAdminBlue('log-edit-seal', 'seal_number');
    setAdminBlue('log-edit-memo', 'special_notes');
    setAdminBlue('log-edit-transport-type', 'transport_type');
    setAdminBlue('log-edit-billing-amount', 'billing_amount');
    setAdminBlue('log-edit-work-site', 'work_site');

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
          <span>${isGeneral ? `${data.general_payload || data.cargo_weight || '—'} / ${data.general_body_type || '—'}` : `${data.container_type || '—'} / ${data.container_kind || '—'}`}
            <span style="color:#cbd5e1;margin:0 4px;">|</span>
            <span style="color:${isAllChecked ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${isAllChecked ? '점검완료' : '미점검'}</span>
          </span>
        </div>
        <div class="log-detail-info-row"><span class="log-detail-info-label">일보 정보</span><span><span style="${adminEdited['transport_type'] ? 'color:#2563eb;font-weight:700;' : ''}">${escHtml(data.transport_type || '왕복')}</span> · <span style="${adminEdited['billing_amount'] ? 'color:#2563eb;font-weight:700;' : ''}">${data.billing_amount ? Number(data.billing_amount).toLocaleString('ko-KR') + '원' : '청구금액 미입력'}</span> · <span style="${adminEdited['work_site'] ? 'color:#2563eb;font-weight:700;' : ''}">${escHtml(data.work_site || '작업지 미입력')}</span></span></div>
        ${data.is_closed ? `<div class="log-detail-info-row"><span class="log-detail-info-label">마감</span><span style="font-weight:800;color:var(--danger);">마감완료 · 기사 수정 제한</span></div>` : ''}
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
          ? `<img class="photo-thumb" src="${url}" onclick="App.openLogPhoto('${escHtml(url)}', ${i}, ${photos.length})" alt="사진${i + 1}"
              onerror="this.onerror=null; App.loadSafeImage(this, '${escHtml(url)}')">`
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

  const isGeneral = _currentLogData?.cargo_type === 'general';
  cEl.value = isGeneral ? cEl.value.trim() : cEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  sEl.value = isGeneral ? sEl.value.trim() : sEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  const billingEl = document.getElementById('log-edit-billing-amount');
  if (billingEl) billingEl.value = formatBillingAmount(billingEl.value);

  const errEl = document.getElementById('log-container-check-msg');
  if (errEl) errEl.textContent = '';

  const val = cEl.value;
  if (!isGeneral && val.length >= 4 && errEl) {
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
        cargo_type:       _currentLogData?.cargo_type || State.profile.cargoType || 'container',
        cargo_item:       (_currentLogData?.cargo_type === 'general') ? (cEl?.value || '') : '',
        cargo_order_number: (_currentLogData?.cargo_type === 'general') ? (sEl?.value || '') : '',
        transport_type:   document.getElementById('log-edit-transport-type')?.value || '왕복',
        billing_amount:   parseBillingAmount(document.getElementById('log-edit-billing-amount')?.value),
        work_site:        document.getElementById('log-edit-work-site')?.value.trim() || '',
        source:           'driver_app',
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

  showToast(`사진 ${uploadCount}장 압축/업로드 중...`);
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
      showToast(`사진 ${successCount}장 업로드 성공`);
    }
    if (failCount > 0) {
      showToast(`사진 ${failCount}장 업로드 실패했습니다.`);
    }
  } catch (err) {
    console.error('onLogFileSelected error', err);
    showToast('업로드 과정 중 오류가 발생했습니다.');
  }
}
