/**
 * notice.js — 공지 목록, 필터, 상세
 */
import { Store, State, BASE_URL } from './store.js?v=493';
import { smartFetch } from './bridge.js?v=493';
import { formatDate, escHtml, showToast } from './utils.js?v=493';

let _notices             = [];
let _currentNoticeFilter = '';

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
    let raw = n.content || n.body || n.message || '';
    raw = raw
      .replace(/&lt;br\s*\/?&gt;/gi, '\n').replace(/&lt;\/p&gt;/gi, '\n').replace(/&lt;p&gt;/gi, '')
      .replace(/&lt;[^&]*&gt;/g, '')
      .replace(/<\/p>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
    bodyEl.innerHTML = raw.trim().replace(/\n\s*\n/g, '\n').replace(/\n/g, '<br>');
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

export function closeNoticeDetail() {
  document.getElementById('notice-detail').classList.remove('active');
  document.getElementById('notice-list').style.display = '';
}
