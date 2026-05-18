/**
 * notice.js — 공지 목록, 필터, 상세
 */
import { Store, State, BASE_URL } from './store.js?v=5157';
import { smartFetch } from './bridge.js?v=5157';
import { formatDate, escHtml, showToast } from './utils.js?v=5157';

let _notices             = [];
let _currentNoticeFilter = '';
let _currentEducationProgress = null;
const EDUCATION_FALLBACK_SECONDS = 60;

function toYouTubeEmbedUrl(rawUrl = '') {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return `https://www.youtube.com/embed/${url.pathname.replace('/', '')}`;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch' && url.searchParams.get('v')) return `https://www.youtube.com/embed/${url.searchParams.get('v')}`;
      if (url.pathname.startsWith('/shorts/')) return `https://www.youtube.com/embed/${url.pathname.split('/')[2] || ''}`;
      if (url.pathname.startsWith('/embed/')) return raw;
    }
  } catch {
    return raw.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/');
  }
  return raw;
}

function extractYouTubeUrls(text = '') {
  const source = String(text || '');
  return [...source.matchAll(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)[^\s"'<>]+|youtu\.be\/[^\s"'<>]+)/gi)]
    .map(match => match[0]);
}

function stripYouTubeUrls(text = '') {
  return String(text || '')
    .replace(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)[^\s"'<>]+|youtu\.be\/[^\s"'<>]+)/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderEducationMedia(notice) {
  const attachments = Array.isArray(notice.attachments) ? notice.attachments : [];
  const textSource = `${notice.education_url || ''}\n${notice.content || notice.body || notice.message || ''}\n${attachments.map(a => `${a.url || ''} ${a.name || ''}`).join('\n')}`;
  const youtubeUrls = [...new Set(extractYouTubeUrls(textSource))];
  const videoAttachments = attachments.filter(a => String(a.type || '').toLowerCase().startsWith('video/'));
  const totalVideoCount = youtubeUrls.length + videoAttachments.length;
  const videoHtml = youtubeUrls.map((url, idx) => `<iframe title="안전교육 영상" src="${escHtml(toYouTubeEmbedUrl(url))}" data-edu-video="${idx}" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;background:#000;margin-top:12px;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`).join('');
  const attachHtml = attachments.map((a, idx) => {
    const url = escHtml(a.url || '');
    const name = escHtml(a.name || '첨부파일');
    const type = String(a.type || '').toLowerCase();
    if (type.startsWith('image/')) return `<img src="${url}" alt="${name}" style="display:block;width:100%;max-height:260px;object-fit:contain;margin-top:8px;border-radius:8px;background:#f8fafc;">`;
    if (type.startsWith('video/')) return `<video controls playsinline src="${url}" data-edu-video="${youtubeUrls.length + idx}" style="display:block;width:100%;margin-top:8px;border-radius:8px;background:#000;"></video>`;
    if (type.includes('pdf') || name.toLowerCase().endsWith('.pdf')) return `<iframe title="${name}" src="${url}" style="width:100%;height:360px;border:1px solid #e2e8f0;border-radius:8px;margin-top:8px;background:#fff;"></iframe><a href="${url}" target="_blank" style="display:block;padding:10px;margin-top:6px;border-radius:8px;background:#f8fafc;color:#2563eb;font-weight:700;text-decoration:none;">PDF 열기: ${name}</a>`;
    return `<a href="${url}" target="_blank" style="display:block;padding:10px;margin-top:8px;border-radius:8px;background:#f8fafc;color:#2563eb;font-weight:700;text-decoration:none;">자료: ${name}</a>`;
  }).join('');
  const hint = notice.category === '안전교육'
    ? `<div id="education-complete-hint" style="font-size:12px;color:#64748b;line-height:1.5;margin-top:10px;">교육 시청/본문 확인 완료 후 아래 버튼을 눌러주세요.</div>`
    : '';
  return `${videoHtml}${attachHtml}${hint}<span id="education-video-count" data-count="${totalVideoCount}" style="display:none;"></span>`;
}

function getEducationCompletedMap() {
  return Store.get('educationCompleted') || {};
}

function setEducationCompleted(id, payload) {
  const map = getEducationCompletedMap();
  map[id] = payload;
  Store.set('educationCompleted', map);
}

function isEducationCompleted(id) {
  return !!getEducationCompletedMap()[id];
}

function updateEducationButtonState() {
  const btn = document.getElementById('education-complete-btn');
  if (!btn || !_currentEducationProgress) return;
  if (_currentEducationProgress.completed) {
    btn.disabled = true;
    btn.style.background = '#059669';
    btn.style.opacity = '1';
    btn.textContent = '이수완료';
    return;
  }
  const videoReady = _currentEducationProgress.videoTotal === 0 || _currentEducationProgress.videoWatched.size >= _currentEducationProgress.videoTotal;
  const ready = videoReady && _currentEducationProgress.timerDone;
  btn.disabled = !ready;
  btn.style.background = ready ? '#2563eb' : '#ef4444';
  btn.style.opacity = ready ? '1' : '0.85';
  btn.textContent = ready ? '시청 완료 및 이수 기록' : `자료 확인 중 ${_currentEducationProgress.remainingSeconds}초`;
  const hint = document.getElementById('education-complete-hint');
  if (hint) {
    hint.textContent = ready
      ? '교육 확인이 완료되었습니다. 아래 버튼으로 이수 기록을 저장하세요.'
      : '동영상은 80% 이상 시청, 유튜브/PDF/본문 자료는 1분 확인 후 이수 기록이 가능합니다.';
  }
}

function bindEducationProgress(noticeId) {
  const countEl = document.getElementById('education-video-count');
  const videoTotal = Number(countEl?.dataset?.count || 0);
  if (_currentEducationProgress?.timer) clearInterval(_currentEducationProgress.timer);
  const completed = isEducationCompleted(noticeId);
  _currentEducationProgress = {
    videoTotal,
    videoWatched: new Set(),
    readConfirmed: true,
    timerDone: completed,
    remainingSeconds: completed ? 0 : EDUCATION_FALLBACK_SECONDS,
    completed,
    timer: null,
  };

  document.querySelectorAll('[data-edu-video]').forEach((el) => {
    if (el.tagName === 'VIDEO') {
      el.addEventListener('timeupdate', () => {
        if (el.duration > 0 && el.currentTime / el.duration >= 0.8) {
          _currentEducationProgress.videoWatched.add(el.dataset.eduVideo);
          updateEducationButtonState();
        }
      });
    } else {
      _currentEducationProgress.videoWatched.add(el.dataset.eduVideo);
    }
  });
  if (!completed) {
    _currentEducationProgress.timer = setInterval(() => {
      if (!_currentEducationProgress) return;
      _currentEducationProgress.remainingSeconds = Math.max(0, _currentEducationProgress.remainingSeconds - 1);
      if (_currentEducationProgress.remainingSeconds <= 0) {
        _currentEducationProgress.timerDone = true;
        clearInterval(_currentEducationProgress.timer);
        _currentEducationProgress.timer = null;
      }
      updateEducationButtonState();
    }, 1000);
  }
  updateEducationButtonState();
}

function normalizeNoticeBody(notice) {
  let raw = notice.content || notice.body || notice.message || '';
  raw = raw
    .replace(/&lt;br\s*\/?&gt;/gi, '\n').replace(/&lt;\/p&gt;/gi, '\n').replace(/&lt;p&gt;/gi, '')
    .replace(/&lt;[^&]*&gt;/g, '')
    .replace(/<\/p>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
  raw = stripYouTubeUrls(raw);
  return raw.trim().replace(/\n\s*\n/g, '\n').replace(/\n/g, '<br>');
}

// ─── 공지 로드 ───────────────────────────────────────────────────
export async function loadNotices() {
  document.getElementById('notice-list').innerHTML =
    '<div class="loading"><div class="spinner"></div>불러오는 중...</div>';
  try {
    const [res1, res2] = await Promise.all([
      smartFetch(`${BASE_URL}/api/vehicle-tracking/notices`).catch(() => null),
      smartFetch(`${BASE_URL}/api/vehicle-tracking/emergency?unread=false`).catch(() => null),
    ]);

    let norm = [], emerg = [];
    try {
      if (res1) {
        const json1  = await res1.json().catch(() => ({}));
        const d1     = typeof json1 === 'string' ? JSON.parse(json1) : json1;
        const rawList = d1.posts || d1.notices || d1.items || (Array.isArray(d1) ? d1 : []);
        norm = Array.isArray(rawList) ? rawList : [];
      }
    } catch (e) { console.error('Norm load error:', e); }

    try {
      if (res2 && res2.ok) {
        const json2 = await res2.json().catch(() => ({}));
        const d2    = typeof json2 === 'string' ? JSON.parse(json2) : json2;
        emerg = Array.isArray(d2?.items) ? d2.items : (Array.isArray(d2) ? d2 : []);
      }
    } catch (e) { console.error(e); }

    emerg.forEach(e => { e.isEmergency = true; e.category = '긴급알림'; });

    // SYSTEM_COMMAND 필터링 — 실시간 제어 명령은 공지 목록에 미노출
    const isSystemMsg = (item) => {
      const t = (item.title || item.message || '').trim();
      return t === 'SYSTEM_COMMAND' || t.startsWith('SYSTEM_') || item.type === 'SYSTEM_COMMAND';
    };

    const merged = [
      ...emerg.filter(e => !isSystemMsg(e)),
      ...norm.filter(n => !isSystemMsg(n)),
    ].sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

    _notices = merged;
    renderNoticeList();

    if (merged.length === 0) {
      document.getElementById('notice-list').innerHTML =
        '<div class="loading">등록된 공지사항이 없습니다.</div>';
    }
  } catch {
    document.getElementById('notice-list').innerHTML =
      '<div class="loading">불러오기 실패</div>';
  }
}

// ─── 필터 ────────────────────────────────────────────────────────
export function filterNotice(category, btnElement) {
  if (document.getElementById('notice-detail')?.classList.contains('active')) {
    closeNoticeDetail();
  }

  if (_currentNoticeFilter === category) {
    _currentNoticeFilter = '';
    btnElement = null;
  } else {
    _currentNoticeFilter = category;
  }

  document.querySelectorAll('.notice-filter-tabs button').forEach(btn => {
    btn.style.background = '#f1f5f9';
    btn.style.color      = '#64748b';
    btn.style.border     = '1px solid #cbd5e1';
  });
  if (btnElement) {
    btnElement.style.background = '#1e293b';
    btnElement.style.color      = '#ffffff';
    btnElement.style.border     = 'none';
  }
  renderNoticeList();
  const listEl = document.getElementById('notice-list');
  if (listEl) listEl.scrollTop = 0;
}

// ─── 목록 렌더 ───────────────────────────────────────────────────
function renderNoticeList() {
  const read = Store.get('readNotices') || [];
  const filtered = _notices.filter(n => {
    if (!_currentNoticeFilter) return true;
    const cat = n.category || (n.isEmergency ? '긴급알림' : '일반공지');
    return cat === _currentNoticeFilter;
  });

  const html = filtered.map(n => {
    const dateVal = n.created_at || n.date || n.started_at;
    const dateStr = dateVal ? formatDate(new Date(dateVal)) : '—';
    const cat     = n.category || (n.isEmergency ? '긴급알림' : '일반공지');
    const isOld   = dateVal && (Date.now() - new Date(dateVal).getTime() > 14 * 24 * 60 * 60 * 1000);
    const isRead  = read.includes(n.id) || isOld;

    let prefix = '';
    if (cat === '긴급알림')      prefix = '<span style="color:#ef4444; font-weight:700; margin-right:4px;">🚨[긴급]</span>';
    else if (cat !== '일반공지') prefix = `<span style="color:#0ea5e9; font-weight:700; margin-right:4px;">[${escHtml(cat)}]</span>`;
    const completed = cat === '안전교육' && isEducationCompleted(n.id);

    let title = escHtml(n.title || n.message || '제목 없음');
    if (title.startsWith('[긴급] ')) title = title.replace('[긴급] ', '');

    return `
      <div id="notice-item-${n.id}" class="notice-item ${isRead ? '' : 'notice-item-unread'}" onclick="App.openNotice('${n.id}')">
        <div class="notice-item-title" style="display:flex; align-items:flex-start;">
          <span style="flex-shrink:0;">${prefix}</span>
          <span style="flex:1; line-height:1.4;">${title}</span>
        </div>
        <div class="notice-item-meta" style="margin-top:4px;">${dateStr}</div>
        ${completed ? '<div style="font-size:12px;color:#059669;font-weight:800;margin-top:4px;">이수완료</div>' : ''}
      </div>
    `;
  }).join('') || '<div class="loading" style="margin-top:20px;">공지사항이 없습니다.</div>';

  document.getElementById('notice-list').innerHTML = html;
}

// ─── 공지 상세 ───────────────────────────────────────────────────
export function openNotice(id) {
  const n = _notices.find(x => String(x.id) === String(id));
  if (!n) return;

  document.getElementById('notice-detail-title').textContent = n.title || '제목 없음';
  document.getElementById('notice-detail-meta').textContent  = formatDate(new Date(n.created_at || n.date));

  const bodyEl = document.getElementById('notice-detail-body');
  if (bodyEl) {
    bodyEl.innerHTML = normalizeNoticeBody(n);
  }
  const mediaEl = document.getElementById('notice-detail-media');
  if (mediaEl) {
    const completed = n.category === '안전교육' && isEducationCompleted(n.id);
    const completeBtn = n.category === '안전교육'
      ? `<button id="education-complete-btn" class="btn btn-primary" style="width:100%;margin-top:12px;background:${completed ? '#059669' : '#ef4444'};" onclick="App.completeSafetyEducation('${n.id}')" disabled>${completed ? '이수완료' : `자료 확인 중 ${EDUCATION_FALLBACK_SECONDS}초`}</button>`
      : '';
    mediaEl.innerHTML = `${renderEducationMedia(n)}${completeBtn}`;
    if (n.category === '안전교육') setTimeout(() => bindEducationProgress(n.id), 0);
  }

  document.getElementById('notice-list').style.display = 'none';
  const detail = document.getElementById('notice-detail');
  detail.classList.add('active');

  const read = Store.get('readNotices') || [];
  if (!read.includes(id)) {
    read.push(id);
    Store.set('readNotices', read);
    document.getElementById('notice-item-' + id)?.classList.remove('notice-item-unread');
  }
  detail.scrollTop = 0;
}

export function confirmEducationRead() {
  if (!_currentEducationProgress) return;
  _currentEducationProgress.readConfirmed = true;
  updateEducationButtonState();
}

export async function completeSafetyEducation(id) {
  const n = _notices.find(x => String(x.id) === String(id));
  if (isEducationCompleted(id)) {
    showToast('이미 이수 완료된 교육입니다.');
    updateEducationButtonState();
    return;
  }
  const trip = State.trip || {};
  try {
    const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/education/complete`, {
      method: 'POST',
      body: JSON.stringify({
        trip_id: trip.id || null,
        notice_id: n.id,
        title: n.title,
        driver_name: State.profile?.name,
        vehicle_number: State.profile?.vehicleNo,
        completed_by: State.profile?.name || State.profile?.vehicleNo,
      }),
    });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.error || `서버 오류 ${res.status}`);
    }
    const saved = await res.json().catch(() => ({}));
    const completedAt = saved.completed_at || new Date().toISOString();
    setEducationCompleted(id, { completed_at: completedAt, trip_id: saved.trip_id || trip.id || null, title: n.title });
    if (_currentEducationProgress) _currentEducationProgress.completed = true;
    updateEducationButtonState();
    renderNoticeList();
    showToast('안전교육 이수 기록 저장 완료');
  } catch (e) {
    showToast(`이수 기록 저장 실패: ${e.message || e}`);
  }
}

export function closeNoticeDetail() {
  if (_currentEducationProgress?.timer) clearInterval(_currentEducationProgress.timer);
  _currentEducationProgress = null;
  document.getElementById('notice-detail').classList.remove('active');
  document.getElementById('notice-list').style.display = '';
}
