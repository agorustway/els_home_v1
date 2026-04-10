/**
 * utils.js — 공통 유틸리티 (formatDate, escHtml, showToast)
 */

export function formatDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

let toastTimer = null;
export function showToast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/**
 * [v4.9.12] loadSafeImage — <img> 태그가 CORS/리다이렉트 등으로 이미지를 못 불러올 때
 * smartFetch(Native Bridge)를 통해 강제로 가져와서 Blob URL로 변환합니다.
 */
export async function loadSafeImage(imgEl, url, smartFetch) {
  if (!imgEl || !url || !smartFetch) return;
  
  // 이미 data: 거나 blob: 이면 통과
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    imgEl.src = url;
    return;
  }

  try {
    const res = await smartFetch(url, { dataType: 'blob' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    
    // 이전 URL 해제 (메모리 관리 필요 시)
    const oldUrl = imgEl.getAttribute('data-safe-src');
    if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
    
    imgEl.src = objectUrl;
    imgEl.setAttribute('data-safe-src', objectUrl);
  } catch (e) {
    console.error('[SAFE-IMG] 로드 실패:', url, e);
    imgEl.style.background = '#fee2e2';
    imgEl.insertAdjacentHTML('afterend', `<span style="position:absolute; font-size:8px; color:red; bottom:0;">Err</span>`);
  }
}
