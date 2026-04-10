/**
 * emergency.js — 긴급알림 폴링, 팝업, 네이티브 알림
 */
import { Store, State, BASE_URL } from './store.js?v=4916';
import { smartFetch, Emergency } from './bridge.js?v=4916';
import { startRealtimeMode, stopRealtimeMode } from './gps.js?v=4916';

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
    const res   = await smartFetch(`${BASE_URL}/api/vehicle-tracking/emergency?unread=true`);
    const data  = await res.json();
    const items = data.items || [];
    const now   = Date.now();

    for (const item of items) {
      if (State.emergencyIds.has(item.id)) continue;
      State.emergencyIds.add(item.id);
      Store.set('emergencyIds', Array.from(State.emergencyIds));

      // 1시간 이전 알림은 팝업 없이 읽음 처리만
      const createdMs = new Date(item.created_at || now).getTime();
      if (now - createdMs > 60 * 60 * 1000) continue;

      // 시스템 명령 처리 (실시간 모드 on/off)
      if (item.title === 'SYSTEM_COMMAND') {
        if (item.message?.startsWith('REALTIME_ON:')) {
          const targetId = item.message.split(':')[1];
          if (String(targetId) === String(State.trip.id)) startRealtimeMode();
        } else if (item.message?.startsWith('REALTIME_OFF:')) {
          const targetId = item.message.split(':')[1];
          if (String(targetId) === String(State.trip.id)) stopRealtimeMode();
        }
        continue;
      }

      showEmergencyPopup(item);
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
    em.showEmergencyAlert({
      title:   '⚠️ ELS 긴급알림',
      message: stripHtml(raw),
      id:      item.id,
    }).catch(() => { });
  }
}
