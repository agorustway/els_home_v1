/**
 * notice.js — 공지 목록, 필터, 상세
 */
import { Store, State, BASE_URL } from './store.js?v=5136';
import { smartFetch } from './bridge.js?v=5136';
import { formatDate, escHtml, showToast } from './utils.js?v=5136';

let _notices             = [];
let _currentNoticeFilter = '';

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

function renderEducationMedia(notice) {
  const attachments = Array.isArray(notice.attachments) ? notice.attachments : [];
  const textSource = `${notice.education_url || ''}\n${notice.content || notice.body || notice.message || ''}\n${attachments.map(a => `${a.url || ''} ${a.name || ''}`).join('\n')}`;
  const youtubeUrls = [...new Set(extractYouTubeUrls(textSource))];
  const videoHtml = youtubeUrls.map(url => `<iframe title="안전교육 영상" src="${escHtml(toYouTubeEmbedUrl(url))}" style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;background:#000;margin-top:12px;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`).join('');
  const attachHtml = attachments.map(a => {
    const url = escHtml(a.url || '');
    const name = escHtml(a.name || '첨부파일');
    const type = String(a.type || '').toLowerCase();
    if (type.startsWith('image/')) return `<img src="${url}" alt="${name}" style="display:block;width:100%;max-height:260px;object-fit:contain;margin-top:8px;border-radius:8px;background:#f8fafc;">`;
    if (type.startsWith('video/')) return `<video controls src="${url}" style="display:block;width:100%;margin-top:8px;border-radius:8px;background:#000;"></video>`;
    if (type.includes('pdf') || name.toLowerCase().endsWith('.pdf')) return `<iframe title="${name}" src="${url}" style="width:100%;height:360px;border:1px solid #e2e8f0;border-radius:8px;margin-top:8px;background:#fff;"></iframe><a href="${url}" target="_blank" style="display:block;padding:10px;margin-top:6px;border-radius:8px;background:#f8fafc;color:#2563eb;font-weight:700;text-decoration:none;">PDF 열기: ${name}</a>`;
    return `<a href="${url}" target="_blank" style="display:block;padding:10px;margin-top:8px;border-radius:8px;background:#f8fafc;color:#2563eb;font-weight:700;text-decoration:none;">자료: ${name}</a>`;
  }).join('');
  return videoHtml + attachHtml;
}

function normalizeNoticeBody(notice) {
  let raw = notice.content || notice.body || notice.message || '';
  raw = raw
    .replace(/&lt;br\s*\/?&gt;/gi, '\n').replace(/&lt;\/p&gt;/gi, '\n').replace(/&lt;p&gt;/gi, '')
    .replace(/&lt;[^&]*&gt;/g, '')
    .replace(/<\/p>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
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

    let title = escHtml(n.title || n.message || '제목 없음');
    if (title.startsWith('[긴급] ')) title = title.replace('[긴급] ', '');

    return `
      <div id="notice-item-${n.id}" class="notice-item ${isRead ? '' : 'notice-item-unread'}" onclick="App.openNotice('${n.id}')">
        <div class="notice-item-title" style="display:flex; align-items:flex-start;">
          <span style="flex-shrink:0;">${prefix}</span>
          <span style="flex:1; line-height:1.4;">${title}</span>
        </div>
        <div class="notice-item-meta" style="margin-top:4px;">${dateStr}</div>
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
    const completeBtn = n.category === '안전교육'
      ? `<button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="App.completeSafetyEducation('${n.id}')">시청 완료 및 이수 기록</button>`
      : '';
    mediaEl.innerHTML = `${renderEducationMedia(n)}${completeBtn}`;
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

export async function completeSafetyEducation(id) {
  const n = _notices.find(x => String(x.id) === String(id));
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
    showToast('안전교육 이수 기록 저장 완료');
  } catch (e) {
    showToast(`이수 기록 저장 실패: ${e.message || e}`);
  }
}

export function closeNoticeDetail() {
  document.getElementById('notice-detail').classList.remove('active');
  document.getElementById('notice-list').style.display = '';
}
