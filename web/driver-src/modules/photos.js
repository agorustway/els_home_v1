/**
 * photos.js — 사진 업로드, 썸네일, 뷰어, 핀치줌
 */
import { State, BASE_URL } from './store.js?v=493';
import { smartFetch } from './bridge.js?v=493';
import { showToast } from './utils.js?v=493';
import { updateProfilePhoto } from './profile.js?v=493';

// ─── 줌 상태 (뷰어 전용) ─────────────────────────────────────────
let currentZoom   = 1;
let currentTransX = 0;
let currentTransY = 0;

function resetZoom() {
  currentZoom = 1; currentTransX = 0; currentTransY = 0;
  const img = document.getElementById('photo-viewer-img');
  if (img) {
    img.style.transition = 'transform 0.2s ease-out';
    img.style.transform  = 'translate(0px, 0px) scale(1)';
  }
}

// ─── 사진 추가 버튼 ──────────────────────────────────────────────
export function addPhoto() {
  if (State.photos.length >= 10) { showToast('최대 10장까지 첨부 가능합니다.'); return; }
  document.getElementById('file-input-hidden').click();
}

// ─── 파일 선택 핸들러 ────────────────────────────────────────────
export async function onFileSelected(e) {
  const files = Array.from(e.target.files);
  for (const file of files) {
    if (State.photos.length >= 10) break;
    const dataUrl = await readFileAsDataURL(file);
    State.photos.push({ dataUrl, uploaded: false, serverUrl: null, file });
  }
  e.target.value = '';
  renderPhotoThumbs();
  uploadPendingPhotos();
}

// ─── 이미지 리사이즈 (Canvas) ─────────────────────────────────────
export async function resizePhoto(file, maxWidth = 1600, maxHeight = 1600) {
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

function readFileAsDataURL(file) {
  if (typeof file === 'string') return Promise.resolve(file);
  if (!file) return Promise.resolve('');
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

// ─── 썸네일 렌더 ─────────────────────────────────────────────────
export function renderPhotoThumbs() {
  const scroll  = document.getElementById('photo-scroll');
  if (!scroll) return;
  const addBtn  = '<button class="photo-add-btn" id="btn-photo-add" onclick="App.addPhoto()">+</button>';
  const thumbs  = State.photos.map((p, i) => {
    // dataUrl 우선 표시 (서버 URL 접근 실패해도 항상 로컬 이미지 보임)
    let src = p.dataUrl || p.serverUrl || '';
    if (!src && p.serverUrl) src = p.serverUrl;
    return `<img class="photo-thumb" src="${src}" onclick="App.openPhotoViewer(${i})" alt="사진${i + 1}">`;
  }).join('');
  scroll.innerHTML = thumbs + (State.photos.length < 10 ? addBtn : '');
  const cnt = document.getElementById('photo-count-display');
  if (cnt) cnt.textContent = `(${State.photos.length}/10)`;
}

// ─── 미업로드 사진 서버 전송 ─────────────────────────────────────
export async function uploadPendingPhotos() {
  const currentTripId = State.trip.id;
  if (!currentTripId) { console.warn('uploadPendingPhotos: trip.id 없음'); return; }

  const pending = State.photos.filter(p => !p.uploaded);
  console.log(`[PHOTO] 미업로드 사진 ${pending.length}개, 전체 ${State.photos.length}개`);
  if (pending.length === 0) return;

  let uploadedCount = 0;
  for (let i = 0; i < State.photos.length; i++) {
    const p = State.photos[i];
    if (p.uploaded) continue;
    try {
      console.log(`[PHOTO #${i}] 리사이징 시작`, p.file ? '(파일)' : '(dataUrl)');
      const dataUrl = await resizePhoto(p.file || p.dataUrl);
      console.log(`[PHOTO #${i}] 리사이징 완료, 크기: ${dataUrl.length} bytes`);

      const base64  = dataUrl.split(',')[1];
      const mime    = dataUrl.split(';')[0].split(':')[1] || 'image/jpeg';
      const ext     = mime.split('/')[1] || 'jpg';
      console.log(`[PHOTO #${i}] MIME: ${mime}, EXT: ${ext}, BASE64 길이: ${base64?.length || 0}`);

      const uploadUrl = BASE_URL + '/api/vehicle-tracking/photos';
      console.log(`[PHOTO #${i}] 업로드 URL: ${uploadUrl}`);
      const res  = await smartFetch(uploadUrl, {
        method: 'POST',
        body: JSON.stringify({
          trip_id: currentTripId,
          photos:  [{ name: `photo_${Date.now()}_${i}.${ext}`, base64, type: mime }],
        }),
      });
      console.log(`[PHOTO #${i}] HTTP 응답: ${res.status} ${res.statusText}`);

      const data = await res.json().catch(() => ({}));
      console.log(`[PHOTO #${i}] 응답 데이터:`, data);

      if (data.photos && Array.isArray(data.photos)) {
        // 마지막 항목 = 방금 업로드한 사진의 서버 정보
        const sp = data.photos[data.photos.length - 1] || {};
        let finalUrl = sp.url || sp.serverUrl || '';
        if (finalUrl && !finalUrl.startsWith('http') && !finalUrl.startsWith('data:')) {
          finalUrl = BASE_URL + (finalUrl.startsWith('/') ? '' : '/') + finalUrl;
        }
        // 기존 State.photos[i] 유지하며 서버 정보만 업데이트 (dataUrl 보존!)
        State.photos[i] = { ...State.photos[i], uploaded: true, serverUrl: finalUrl };
        renderPhotoThumbs();
        uploadedCount++;
        console.log(`[PHOTO #${i}] ✅ 업로드 성공, serverUrl: ${finalUrl}`);
      } else if (data.error) {
        console.error(`[PHOTO #${i}] ❌ 서버 에러:`, data.error);
        showToast(`사진 업로드 실패: ${data.error}`);
      } else {
        console.warn(`[PHOTO #${i}] ⚠️ 응답 형식 오류:`, data);
        showToast('사진 업로드 응답 오류. 다시 시도해주세요.');
      }
    } catch (e) {
      console.error(`[PHOTO #${i}] ❌ 예외 발생:`, e.message || e);
      showToast(`사진 전송 오류: ${e.message}`);
    }
  }

  if (uploadedCount > 0) showToast(`사진 ${uploadedCount}장 업로드 완료`);
}

// ─── 사진 뷰어 ───────────────────────────────────────────────────
export function openPhotoViewer(idx, type = 'trip') {
  State.currentPhotoIdx = idx;
  State.viewerType      = type;
  resetZoom();
  document.getElementById('photo-viewer-delete-btn')?.style.setProperty('display', 'inline-block');
  document.getElementById('photo-viewer').classList.add('active');
  updatePhotoViewerUI();
}

export function openLogPhoto(url, idx, total) {
  openPhotoViewer(idx, 'log');
}

function updatePhotoViewerUI() {
  const isLog     = State.viewerType === 'log';
  const isProfile = State.viewerType === 'profile';
  const photos    = isLog ? (State.logPhotos || []) : (isProfile ? (State.profilePhotos || []) : (State.photos || []));
  const p         = photos[State.currentPhotoIdx];
  if (!p) { closePhotoViewer(); return; }

  let url = '';
  if (isProfile) {
    url = p.dataUrl?.startsWith('http') || p.dataUrl?.startsWith('data:')
      ? p.dataUrl
      : BASE_URL + (p.dataUrl?.startsWith('/') ? '' : '/') + p.dataUrl;
  } else {
    url = isLog
      ? (p.url ? (p.url.startsWith('http') ? p.url : BASE_URL + p.url) : (p.serverUrl || p.dataUrl || ''))
      : (p.serverUrl || p.dataUrl);
  }

  const img = document.getElementById('photo-viewer-img');
  if (img) img.src = url;
  const idxEl = document.getElementById('photo-viewer-index');
  if (idxEl) idxEl.textContent = `${State.currentPhotoIdx + 1} / ${photos.length}`;
}

export function closePhotoViewer() {
  document.getElementById('photo-viewer').classList.remove('active');
  resetZoom();
}

export function prevPhoto() {
  const photos = _getViewerPhotos();
  if (State.currentPhotoIdx > 0) { State.currentPhotoIdx--; resetZoom(); updatePhotoViewerUI(); }
}

export function nextPhoto() {
  const photos = _getViewerPhotos();
  if (State.currentPhotoIdx < photos.length - 1) { State.currentPhotoIdx++; resetZoom(); updatePhotoViewerUI(); }
}

function _getViewerPhotos() {
  if (State.viewerType === 'log')     return State.logPhotos     || [];
  if (State.viewerType === 'profile') return State.profilePhotos || [];
  return State.photos || [];
}

// ─── 현재 사진 삭제 ──────────────────────────────────────────────
export async function deleteCurrentPhoto() {
  if (!confirm('현재 보고 있는 사진을 삭제하시겠습니까?')) return;

  if (State.viewerType === 'profile') {
    const p        = State.profilePhotos[State.currentPhotoIdx];
    const typeMap  = { driver: '기사', vehicle: '차량', chassis: '샤시' };
    State.profile[`photo_${p.type}`] = '';
    updateProfilePhoto(`p-photo-${p.type}`, '', typeMap[p.type] || '');
    showToast('삭제되었습니다. 정보 저장을 눌러야 완전히 반영됩니다.');
    State.profilePhotos.splice(State.currentPhotoIdx, 1);
    if (!State.profilePhotos.length) { closePhotoViewer(); return; }
    if (State.currentPhotoIdx >= State.profilePhotos.length) State.currentPhotoIdx = State.profilePhotos.length - 1;
    updatePhotoViewerUI();
    return;
  }

  if (State.viewerType === 'log') {
    const photos = [...State.logPhotos];
    photos.splice(State.currentPhotoIdx, 1);
    try {
      const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.currentLogId}`, {
        method: 'PATCH',
        body: JSON.stringify({ photos }),
      });
      if (!res.ok) throw new Error('서버 통신 실패');
      State.logPhotos = photos;
      showToast('사진이 삭제되었습니다.');
      if (!State.logPhotos.length) { closePhotoViewer(); return; }
      if (State.currentPhotoIdx >= State.logPhotos.length) State.currentPhotoIdx = State.logPhotos.length - 1;
      updatePhotoViewerUI();
      window.App?.openLog(State.currentLogId);
    } catch (e) { showToast('사진 삭제 실패: ' + e.message); }
    return;
  }

  State.photos.splice(State.currentPhotoIdx, 1);
  if (!State.photos.length) { closePhotoViewer(); return; }
  if (State.currentPhotoIdx >= State.photos.length) State.currentPhotoIdx = State.photos.length - 1;
  updatePhotoViewerUI();
  renderPhotoThumbs();
}

// ─── 핀치 줌 초기화 ──────────────────────────────────────────────
export function initPinchZoom() {
  const wrap = document.getElementById('photo-viewer-wrap');
  const img  = document.getElementById('photo-viewer-img');
  if (!wrap || !img) return;

  let initialDist = 0, baseScale = 1;
  let pinchMidX = 0, pinchMidY = 0, startTransX = 0, startTransY = 0;
  let isDragging  = false, startX = 0, startY = 0, lastTap = 0;

  wrap.addEventListener('touchstart', e => {
    const now = Date.now();
    // 더블 탭: 줌 토글
    if (e.touches.length === 1 && (now - lastTap) < 300) {
      if (currentZoom > 1.5) resetZoom();
      else {
        currentZoom = 3;
        img.style.transition = 'transform 0.3s ease-out';
        img.style.transform  = `translate(0px, 0px) scale(${currentZoom})`;
      }
      lastTap = 0;
      return;
    }
    lastTap = now;

    if (e.touches.length === 2) {
      e.preventDefault();
      initialDist  = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      baseScale    = currentZoom;
      // 두 손가락 중간점을 wrap 중앙 기준 좌표로 저장 (pivot)
      const wrapRect = wrap.getBoundingClientRect();
      pinchMidX    = (e.touches[0].pageX + e.touches[1].pageX) / 2 - (wrapRect.left + wrapRect.width  / 2);
      pinchMidY    = (e.touches[0].pageY + e.touches[1].pageY) / 2 - (wrapRect.top  + wrapRect.height / 2);
      startTransX  = currentTransX;
      startTransY  = currentTransY;
      img.style.transition = 'none';
    } else if (e.touches.length === 1 && currentZoom > 1) {
      isDragging   = true;
      startX       = e.touches[0].pageX - currentTransX;
      startY       = e.touches[0].pageY - currentTransY;
      img.style.transition = 'none';
    }
  }, { passive: false });

  wrap.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist    = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      const newZoom = Math.min(Math.max(baseScale * (dist / initialDist), 1), 6);
      if (newZoom <= 1.01) {
        currentZoom = 1; currentTransX = 0; currentTransY = 0;
      } else {
        // pivot 기준으로 translate 보정: pivot 위치가 화면에서 고정되도록
        const ratio   = newZoom / baseScale;
        currentTransX = pinchMidX * (1 - ratio) + startTransX * ratio;
        currentTransY = pinchMidY * (1 - ratio) + startTransY * ratio;
        currentZoom   = newZoom;
      }
      img.style.transform = `translate(${currentTransX}px, ${currentTransY}px) scale(${currentZoom})`;
    } else if (e.touches.length === 1 && isDragging && currentZoom > 1) {
      e.preventDefault();
      currentTransX = e.touches[0].pageX - startX;
      currentTransY = e.touches[0].pageY - startY;
      const limitX  = (currentZoom - 1) * (window.innerWidth  / 2);
      const limitY  = (currentZoom - 1) * (window.innerHeight / 2);
      currentTransX = Math.min(Math.max(currentTransX, -limitX), limitX);
      currentTransY = Math.min(Math.max(currentTransY, -limitY), limitY);
      img.style.transform = `translate(${currentTransX}px, ${currentTransY}px) scale(${currentZoom})`;
    }
  }, { passive: false });

  wrap.addEventListener('touchend', e => {
    if (e.touches.length === 0) {
      isDragging = false;
      if (currentZoom <= 1.05) resetZoom();
    }
  });
}
