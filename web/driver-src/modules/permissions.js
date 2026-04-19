/**
 * permissions.js ??沅뚰븳 ?붿껌/?곹깭 愿由? Android 16 媛?대뱶, ???ㅼ젙 ?좏떥
 */
import { Store, State } from './store.js?v=4919';
import { Overlay, remoteLog } from './bridge.js?v=4919';
import { showScreen } from './nav.js?v=4919';

// ??? 肄쒕갚 二쇱엯 (init.js ??setupPermNav ?몄텧濡??쒗솚 李몄“ ?댁냼) ????
let _showMain     = () => showScreen('main');
let _openSettings = () => showScreen('settings');

export function setupPermNav({ showMain, openSettings }) {
  _showMain     = showMain;
  _openSettings = openSettings;
}

// ??? 怨듭쑀 ?좎뒪???ы띁 (??? 李몄“) ????????????????????????????????
function showToast(msg, duration) {
  window.App?.showToast(msg, duration);
}

// ??? ???ш렇?쇱슫??蹂듦? ?湲?(諛고꽣由??ㅻ쾭?덉씠 ?ㅼ젙 ??蹂듦? 媛먯?) ????
function waitForForeground(timeoutMs = 8000) {
  return new Promise(resolve => {
    let done = false;
    let handles = [];
    const finish = () => {
      if (done) return;
      done = true;
      handles.forEach(h => h?.remove?.());
      resolve();
    };
    const CapApp = window.Capacitor?.Plugins?.App;
    if (!CapApp) { setTimeout(finish, timeoutMs); return; }

    let wentBackground = false;
    // 2?④퀎: 癒쇱? 諛깃렇?쇱슫???꾪솚 媛먯? ?? ?ш렇?쇱슫??蹂듦? 媛먯?
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        wentBackground = true;  // 1?④퀎: 諛깃렇?쇱슫???꾪솚 ?뺤씤
      } else if (wentBackground) {
        finish();               // 2?④퀎: ?ш렇?쇱슫??蹂듦? 媛먯?
      }
    }).then(h => { handles.push(h); });

    setTimeout(finish, timeoutMs);
  });
}

// ??? 沅뚰븳 ?곹깭 ???????????????????????????????????????????????????
export const permStatuses = Store.get('permStatuses')
  || { loc: false, camera: false, notif: false, overlay: false, battery: false };

export function setPermStatus(type, ok) {
  if (!permStatuses) return;
  permStatuses[type] = !!ok;
  Store.set('permStatuses', permStatuses);

  const el = document.getElementById('perm-' + type + '-status');
  if (!el) return;

  el.textContent  = permStatuses[type] ? '?덉슜?? : '誘몄꽕??;
  el.className    = 'perm-status ' + (permStatuses[type] ? 'perm-ok' : 'perm-ng');

  const btn = el.nextElementSibling;
  if (btn && (btn.tagName === 'BUTTON' || btn.classList.contains('btn-perm'))) {
    if (!permStatuses[type]) {
      btn.classList.remove('btn-ok', 'btn-primary');
      if (['loc', 'overlay', 'battery'].includes(type)) {
        btn.classList.add('btn-pulse', 'btn-ng');
        btn.textContent = '?ㅼ젙(?꾩닔)';
      } else {
        btn.classList.add('btn-ng');
        btn.textContent = '?ㅼ젙';
      }
    } else {
      btn.classList.remove('btn-pulse', 'btn-ng', 'btn-primary');
      btn.classList.add('btn-ok');
      btn.textContent = '?덉슜?꾨즺';
    }
  }
}

export async function updatePermStatuses() {
  console.log('--- updatePermStatuses start ---');
  for (const k in permStatuses) { setPermStatus(k, permStatuses[k]); }

  // 1. ?ㅻ쾭?덉씠 & 諛고꽣由?(而ㅼ뒪? ?뚮윭洹몄씤)
  const overlay = Overlay();
  if (overlay) {
    try {
      const r = await overlay.checkPermission().catch(() => ({ granted: false }));
      setPermStatus('overlay', !!r.granted);
      const b = await overlay.checkBatteryOptimization().catch(() => ({ granted: false }));
      setPermStatus('battery', !!b.granted);
    } catch (e) { console.warn('Overlay check fail', e); }
  }

  // 2. ?꾩튂
  const Geo = window.Capacitor?.Plugins?.Geolocation;
  if (Geo) {
    try {
      const p = await Geo.checkPermissions().catch(() => ({}));
      setPermStatus('loc', p.location === 'granted');
    } catch (e) { console.warn('Geo check fail', e); }
  } else if ('geolocation' in navigator) {
    try {
      const p = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
      if (p) setPermStatus('loc', p.state === 'granted');
    } catch { }
  }

  // 3. 移대찓??/ 誘몃뵒??  const Cam = window.Capacitor?.Plugins?.Camera;
  if (Cam) {
    try {
      const p = await Cam.checkPermissions().catch(() => ({}));
      setPermStatus('camera', p.camera === 'granted' || p.camera === 'limited');
    } catch (e) { console.warn('Cam check fail', e); }
  }

  // 4. ?뚮┝
  const Notif = window.Capacitor?.Plugins?.LocalNotifications
    || window.Capacitor?.Plugins?.PushNotifications;
  if (Notif) {
    try {
      const p = await Notif.checkPermissions()
        .catch(() => ({ display: 'denied', receive: 'denied' }));
      setPermStatus('notif', p.display === 'granted' || p.receive === 'granted' || p.notif === 'granted');
    } catch (e) { console.warn('Notif check fail', e); }
  } else if ('Notification' in window) {
    setPermStatus('notif', Notification.permission === 'granted');
  }

  // 理쒖쥌 媛뺤젣 ?숆린??  for (const k in permStatuses) { setPermStatus(k, permStatuses[k]); }

  // ?ㅼ젙 ?꾨즺 踰꾪듉 ?됱긽 ?숈쟻 ?낅뜲?댄듃
  const btnFinish = document.getElementById('btn-finish-setup');
  if (btnFinish) {
    const criticalPerms = permStatuses.loc && permStatuses.overlay && permStatuses.battery;
    if (criticalPerms) {
      btnFinish.classList.remove('btn-red');
      btnFinish.classList.add('btn-black');
    } else {
      btnFinish.classList.remove('btn-black');
      btnFinish.classList.add('btn-red');
    }
  }
  console.log('--- updatePermStatuses end --- perms:', JSON.stringify(permStatuses));
}

// ??? ?덈뱶濡쒖씠??16 ?꾩슜 媛?대뱶 ???????????????????????????????????
function showAndroid16Guide(type) {
  const guide      = document.getElementById('modal-guide-android16');
  const confirmBtn = document.getElementById('btn-guide-confirm');
  if (!guide || !confirmBtn) { executeRealRequest(type); return; }

  const bodyEl = document.getElementById('modal-guide-body');
  if (bodyEl) {
    bodyEl.innerHTML = type === 'overlay'
      ? '?ㅻⅨ ???꾩뿉 ?쒖떆 ?ㅼ젙李쎌씠 ?대┰?덈떎.<br>ELS ?깆쓣 李얠븘 ?덉슜 ???뚯븘?ㅼ꽭??'
      : '諛고꽣由?理쒖쟻???쒖쇅 ?ㅼ젙李쎌씠 ?대┰?덈떎.<br>???뺣낫 ??諛고꽣由???<b>?쒗븳 ?놁쓬</b> ?좏깮 ???뚯븘?ㅼ꽭??';
  }
  guide.style.display = 'flex';
  confirmBtn.onclick = (ev) => {
    ev.preventDefault();
    guide.style.display = 'none';
    setTimeout(() => { executeRealRequest(type); }, 300);
  };
}

async function executeRealRequest(type) {
  const overlay = Overlay();
  try {
    switch (type) {
      case 'location':
        // alert ?쒓굅 - ?쒖감 ?먮룞?ㅼ젙 吏꾪뻾
        if (window.Capacitor?.Plugins?.Geolocation) {
          await window.Capacitor.Plugins.Geolocation.requestPermissions();
        }
        break;
      case 'camera':
        if (window.Capacitor?.Plugins?.Camera) {
          await window.Capacitor.Plugins.Camera.requestPermissions();
        } else {
          try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true });
            s.getTracks().forEach(t => t.stop());
          } catch { }
        }
        break;
      case 'notification': {
        const Notif = window.Capacitor?.Plugins?.LocalNotifications
          || window.Capacitor?.Plugins?.PushNotifications;
        if (Notif) {
          await Notif.requestPermissions();
        } else if ('Notification' in window) {
          await Notification.requestPermission();
        }
        break;
      }
      case 'overlay':
        if (overlay) {
          console.log('[OVERLAY] requestPermission ?몄텧 ?쒖옉');
          try {
            const res = await overlay.requestPermission();
            console.log('[OVERLAY] ?묐떟:', JSON.stringify(res));
            remoteLog('Overlay permission requested: ' + JSON.stringify(res), 'OVERLAY_RES');
          } catch (e) {
            console.error('[OVERLAY] ?붿껌 ?ㅽ뙣:', e.message || e);
            remoteLog('Overlay requestPermission error: ' + (e.message || JSON.stringify(e)), 'OVERLAY_ERR');
            throw e;
          }
        } else {
          console.warn('[OVERLAY] ?뚮윭洹몄씤 誘몃줈??- Overlay()媛 null/undefined');
          showToast('?ㅼ젙李쎌쓣 ?????놁뒿?덈떎. (?뚮윭洹몄씤 誘몃줈??');
        }
        break;
      case 'battery':
        if (overlay) {
          showToast("?ㅼ젙李쎌뿉??'?쒗븳 ?놁쓬'???좏깮?댁빞 ?꾩튂 愿?쒓? ?딄린吏 ?딆뒿?덈떎", 4000);
          remoteLog('User clicked Battery Optimization button', 'UI_ACTION');
          try {
            const res = await overlay.requestBatteryOptimization();
            remoteLog('Native requestBatteryOptimization response: ' + JSON.stringify(res), 'NATIVE_RES');
          } catch (e) {
            remoteLog('Native requestBatteryOptimization error: ' + e.message, 'NATIVE_ERR');
          }
        } else {
          showToast('?ㅼ젙李쎌쓣 ?????놁뒿?덈떎. (?뚮윭洹몄씤 誘몃줈??');
        }
        break;
    }
  } catch (err) {
    console.error('executeRealRequest error', type, err);
    if (err.message && (err.message.includes('Permission') || err.message.includes('denied'))) {
      showToast('沅뚰븳??嫄곕??섏뿀?듬땲?? ?덈뱶濡쒖씠??[?ㅼ젙 > ?좏뵆由ъ??댁뀡 > 沅뚰븳] ?먯꽌 吏곸젒 ?덉슜?댁＜?몄슂.', 4000);
    } else {
      showToast('沅뚰븳 ?붿껌 ?ㅽ뙣: ' + err.message);
    }
  } finally {
    setTimeout(() => {
      document.querySelectorAll('.btn-active').forEach(b => b.classList.remove('btn-active'));
    }, 1000);
  }
}

export async function requestPerm(type, event) {
  if (event && event.target) event.target.classList.add('btn-active');
  // ?섎룞 踰꾪듉: 紐⑤떖 ?놁씠 諛붾줈 ?ㅽ뻾 (紐⑤떖? ?쒖감 ?먮룞?ㅼ젙?먯꽌留??ъ슜)
  try {
    await executeRealRequest(type);
  } catch (e) {
    if (event && event.target) event.target.classList.remove('btn-active');
  }
}

export async function requestAllPerms() {
  await updatePermStatuses();
  const permsToAsk = [
    { key: 'loc', type: 'location'},
    { key: 'notif', type: 'notification'},
    { key: 'camera', type: 'camera'}
  ];

  for (const perm of permsToAsk) {
    if (!permStatuses[perm.key]) {
      showToast(perm.type + ' 沅뚰븳???ㅼ젙?⑸땲??..', 1500);
      await executeRealRequest(perm.type);
      await new Promise(r => setTimeout(r, 1000)); // wait for android to settle
      await updatePermStatuses();
    }
  }

  // ?? ?ㅻ쾭?덉씠 (?쒖감 ?먮룞) ??
  if (!permStatuses.overlay) {
    console.log('[PERM] ?ㅻ쾭?덉씠 沅뚰븳 ?쒖옉');
    showToast('?ㅻⅨ ???꾩뿉 ?쒖떆 沅뚰븳???ㅼ젙?⑸땲??..', 1500);

    const guide = document.getElementById('modal-guide-android16');
    const confirmBtn = document.getElementById('btn-guide-confirm');

    if (guide && confirmBtn) {
      await new Promise(resolve => {
        guide.style.display = 'flex';
        const bodyEl = document.getElementById('modal-guide-body');
        if (bodyEl) {
          bodyEl.innerHTML = '?ㅻⅨ ???꾩뿉 ?쒖떆 ?ㅼ젙李쎌씠 ?대┰?덈떎.<br>ELS ?깆쓣 李얠븘 ?덉슜 ???뚯븘?ㅼ꽭??';
        }
        confirmBtn.onclick = async (ev) => {
          ev.preventDefault();
          guide.style.display = 'none';
          await new Promise(r => setTimeout(r, 300));
          await executeRealRequest('overlay');
          await waitForForeground(8000);
          await new Promise(r => setTimeout(r, 3000));
          resolve();
        };
      });
    } else {
      await executeRealRequest('overlay');
      await waitForForeground(8000);
      await new Promise(r => setTimeout(r, 3000));
    }
    await updatePermStatuses();
  }

  // ?? 諛고꽣由?理쒖쟻??(?쒖감 ?먮룞 遺덇? ???섎룞 ?덈궡) ??
  // Android ?쒖뒪???ㅼ씠?쇰줈洹멸? ???ㅼ뿉 ?⑤뒗 臾몄젣濡? ?쒖감 ?먮룞?먯꽌 ?쒖쇅
  if (!permStatuses.battery) {
    showToast('諛고꽣由?理쒖쟻???쒖쇅???꾨옒 [?ㅼ젙] 踰꾪듉??吏곸젒 ?뚮윭二쇱꽭??', 4000);
  }

  showToast('?쒖감 ?ㅼ젙???꾨즺?섏뿀?듬땲?? 諛고꽣由?理쒖쟻?붾뒗 ?섎룞 ?ㅼ젙 ?꾩슂?⑸땲??', 3000);
}

export function manualRefreshPerms() {
  updatePermStatuses();
}

export function showTerms() {
  const m = document.getElementById('modal-terms');
  if (m) m.style.display = 'flex';
}
export function closeTerms() {
  const m = document.getElementById('modal-terms');
  if (m) m.style.display = 'none';
}

export function finishPermSetup() {
  updatePermStatuses().then(() => {
    const missing = [];
    if (!permStatuses.loc)     missing.push('?꾩튂(??긽 ?덉슜)');
    if (!permStatuses.overlay) missing.push('?ㅻⅨ ???꾩뿉 ?쒖떆');
    if (!permStatuses.battery) missing.push('諛고꽣由?理쒖쟻???쒖쇅');

    if (missing.length > 0) {
      alert('?꾨옒 ?꾩닔 沅뚰븳???ㅼ젙?섏? ?딆븯?듬땲??\n\n'
        + missing.join('\n')
        + '\n\n紐⑤뱺 ?꾩닔 沅뚰븳???덉슜?댁빞 ?깆쓣 ?쒖옉?????덉뒿?덈떎.');
      return;
    }

    Store.set('permSetupDone', true);
    // ?꾨줈???꾩꽦??寃??(鍮?媛??쒖쇅, ?낅뜲?댄듃 ??遺???곗씠??諛⑹?)
    const hasProfile = State.profile.name?.trim() && State.profile.phone?.trim()
      && State.profile.vehicleNo?.trim() && State.profile.driverId?.trim();

    if (!hasProfile) {
      showToast('沅뚰븳 ?ㅼ젙 ?꾨즺! 李⑤웾 ?뺣낫瑜?癒쇱? ?깅줉??二쇱꽭??');
      _openSettings();
    } else {
      showToast('諛섍컩?듬땲?? ?덉쟾 ?댁쟾 ?섏꽭??');
      _showMain();
    }
  });
}

export function settingsBack() {
  if (!Store.get('permSetupDone')) {
    showScreen('permission');
    updatePermStatuses();
  } else {
    showScreen('main');
    window.App?.switchTab('trip');
  }
}

export function clearCache() {
  if (confirm('罹먯떆瑜?吏?곌퀬 ?덈줈怨좎묠 ?섏떆寃좎뒿?덇퉴? (?몄뀡???ㅼ떆 ?쒖옉?⑸땲??')) {
    window.location.reload(true);
  }
}

export function openPermissionSetup() {
  showScreen('permission');
  updatePermStatuses();
}

export function resetApp() {
  if (!confirm('?깆쓣 珥덇린?뷀븯硫?紐⑤뱺 ?ㅼ젙怨?諛곗감 湲곕줉????젣?⑸땲?? 怨꾩냽?섏떆寃좎뒿?덇퉴?')) return;
  localStorage.clear();

  State.profile = { name: '', phone: '', vehicleNo: '', driverId: '' };
  State.trip    = { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '' };
  if (permStatuses) {
    for (const key in permStatuses) permStatuses[key] = false;
  }

  showScreen('permission');
  updatePermStatuses().then(() => {
    showToast('?깆씠 珥덇린?붾릺?덉뒿?덈떎. 沅뚰븳???ㅼ떆 ?ㅼ젙?댁＜?몄슂.');
  });
}

