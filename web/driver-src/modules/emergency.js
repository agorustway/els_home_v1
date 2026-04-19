/**
 * emergency.js ??湲닿툒?뚮┝ ?대쭅, ?앹뾽, ?ㅼ씠?곕툕 ?뚮┝
 */
import { Store, State, BASE_URL } from './store.js?v=4919';
import { smartFetch, Emergency } from './bridge.js?v=4919';
import { startRealtimeMode, stopRealtimeMode } from './gps.js?v=4919';

let emergencyPollTimer = null;

// ??? 湲닿툒?뚮┝ ?대쭅 ?쒖옉 ??????????????????????????????????????????
export function startEmergencyPoll() {
  if (emergencyPollTimer) return;
  pollEmergency();
  emergencyPollTimer = setInterval(pollEmergency, 30_000);
}

// ??? ?대쭅 1???ㅽ뻾 ???????????????????????????????????????????????
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

      // 1?쒓컙 ?댁쟾 ?뚮┝? ?앹뾽 ?놁씠 ?쎌쓬 泥섎━留?      const createdMs = new Date(item.created_at || now).getTime();
      if (now - createdMs > 60 * 60 * 1000) continue;

      // ?쒖뒪??紐낅졊 泥섎━ (?ㅼ떆媛?紐⑤뱶 on/off)
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
  } catch { /* 議곗슜???ㅽ뙣 */ }
}

// ??? ?앹뾽 ?쒖떆 / ?リ린 ????????????????????????????????????????????
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
      title:   '?좑툘 ELS 湲닿툒?뚮┝',
      message: stripHtml(raw),
      id:      item.id,
    }).catch(() => { });
  }
}

