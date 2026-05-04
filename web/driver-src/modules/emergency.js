/**
 * emergency.js — 긴급알림 폴링, 팝업, 네이티브 알림
 */
import { Store, State, BASE_URL } from './store.js?v=5144';
import { smartFetch, Emergency } from './bridge.js?v=5144';
import { startRealtimeMode, stopRealtimeMode } from './gps.js?v=5144';

let emergencyPollTimer = null;

// ─── 긴급알림 폴링 시작 ──────────────────────────────────────────
export function startEmergencyPoll() {
  if (emergencyPollTimer) return;
  pollEmergency();
  emergencyPollTimer = setInterval(pollEmergency, 30_000);
}

// ─── 폴링 1회 실행 ───────────────────────────────────────────────
export async function pollEmergency() {
  try {
    const [resEm, resNo] = await Promise.all([
      smartFetch(`${BASE_URL}/api/vehicle-tracking/emergency?unread=true`).catch(() => null),
      smartFetch(`${BASE_URL}/api/vehicle-tracking/notices`).catch(() => null)
    ]);

    const now = Date.now();
    let items = [];

    if (resEm?.ok) {
      const data = await resEm.json().catch(() => ({}));
      (data.items || []).forEach(i => { i._isEmergency = true; items.push(i); });
    }

    if (resNo?.ok) {
      const data = await resNo.json().catch(() => ({}));
      const rawList = data.notices || data.posts || [];
      (Array.isArray(rawList) ? rawList : []).forEach(i => { i._isNotice = true; items.push(i); });
    }

    for (const item of items) {
      if (item._isEmergency) {
        if (State.emergencyIds.has(item.id)) continue;
        State.emergencyIds.add(item.id);
        Store.set('emergencyIds', Array.from(State.emergencyIds));
      }

      if (item._isNotice) {
        const read = Store.get('readNotices') || [];
        const notified = Store.get('notifiedNotices') || [];
        if (read.includes(item.id) || notified.includes(item.id)) continue;
        
        notified.push(item.id);
        Store.set('notifiedNotices', notified);
      }

      // 1시간 이전 알림은 팝업/푸시 없이 읽음 처리만
      const createdMs = new Date(item.created_at || item.date || now).getTime();
      if (now - createdMs > 60 * 60 * 1000) continue;

      // 시스템 명령 처리 (긴급알림 전용)
      if (item._isEmergency && item.title === 'SYSTEM_COMMAND') {
        if (item.message?.startsWith('REALTIME_ON:')) {
          const targetId = item.message.split(':')[1];
          if (String(targetId) === String(State.trip.id)) startRealtimeMode();
        } else if (item.message?.startsWith('REALTIME_OFF:')) {
          const targetId = item.message.split(':')[1];
          if (String(targetId) === String(State.trip.id)) stopRealtimeMode();
        }
        continue;
      }

      if (item._isEmergency) {
        showEmergencyPopup(item);
      }
      sendNativeEmergencyNotif(item);
    }
  } catch { /* 조용히 실패 */ }
}

// ─── 팝업 표시 / 닫기 ────────────────────────────────────────────
function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function showEmergencyPopup(item) {
  const raw = item.message || item.content || '';
  const bodyEl = document.getElementById('emergency-body');
  if (bodyEl) bodyEl.textContent = stripHtml(raw);
  document.getElementById('emergency-popup')?.classList.add('active');
}

export function closeEmergency() {
  document.getElementById('emergency-popup')?.classList.remove('active');
}

function sendNativeEmergencyNotif(item) {
  const em = Emergency();
  if (em) {
    const raw = item.message || item.content || '';
    const prefix = item._isEmergency ? '🚨 ELS 긴급알림' : 'ℹ️ ELS 공지사항';
    const title = item.title && item.title !== 'SYSTEM_COMMAND' ? item.title : prefix;

    em.showEmergencyAlert({
      title:   title,
      message: stripHtml(raw),
      id:      item.id,
    }).catch(() => { });
  }
}
