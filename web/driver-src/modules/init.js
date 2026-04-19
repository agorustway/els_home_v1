/**
 * init.js ????珥덇린?? ?붾㈃ ?꾪솚 ?ㅼ??ㅽ듃?덉씠?? */
import { Store, State, AppConfig } from './store.js?v=4919';
import { remoteLog } from './bridge.js?v=4919';
import { showScreen } from './nav.js?v=4919';
import {
  updatePermStatuses, permStatuses, setupPermNav, requestAllPerms,
} from './permissions.js?v=4919';
import { applyProfileToUI } from './profile.js?v=4919';
import { loadCurrentTrip, registerBackHandler } from './trip.js?v=4919';
import { startGPS, stopGPS, onGpsUpdate, lastGpsTimestamp } from './gps.js?v=4919';
import { loadNotices } from './notice.js?v=4919';
import { startEmergencyPoll, pollEmergency } from './emergency.js?v=4919';
import { checkUpdate } from './update.js?v=4919';
import { openMap } from './map.js?v=4919';
import { loadLogs } from './log.js?v=4919';

let isAppInitialized = false;

// ??? 怨듦컻 ?ㅻ퉬寃뚯씠???⑥닔 (permissions.js??肄쒕갚 二쇱엯) ????????????
export function showMain() {
  showScreen('main');
  switchTab('trip');
  loadCurrentTrip();
  loadNotices();
  startEmergencyPoll();
}

export function openSettings() {
  showScreen('settings');
}

export function switchTab(tab) {
  // ?꾨줈??誘몄셿?깆씠硫????꾪솚 李⑤떒
  const profileDone = State.profile.name?.trim() && State.profile.phone?.trim()
    && State.profile.vehicleNo?.trim() && State.profile.driverId?.trim();
  if (!profileDone) {
    window.App?.showToast('李⑤웾 ?뺣낫瑜?癒쇱? ??ν빐 二쇱꽭??');
    return;
  }

  if (tab === 'map') { openMap(); return; }
  showScreen('main');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.getElementById('tab-btn-' + tab)?.classList.add('active');
  if (tab === 'notice') loadNotices();
  if (tab === 'log')    loadLogs();
}

// permissions.js???ㅻ퉬寃뚯씠??肄쒕갚 二쇱엯
setupPermNav({ showMain, openSettings });

// ??? ??珥덇린?????????????????????????????????????????????????????
export async function init() {
  try {
    // 0. Capacitor 釉뚮┸吏 ?湲?(??1??
    if (window.Capacitor && !isAppInitialized) {
      await new Promise(r => {
        if (window.Capacitor.isPluginAvailable('CapacitorHttp')) { r(); return; }
        window.addEventListener('load', r, { once: true });
        setTimeout(r, 800);
      });
    }

    // 1. ?ㅼ씠?곕툕 踰꾩쟾 ?뺣낫 ?숈쟻 ?⑥튂 (踰꾩쟾 ?섎뱶肄붾뵫 ?쒓굅)
    if (window.Capacitor?.Plugins?.App?.getInfo) {
      try {
        const info = await window.Capacitor.Plugins.App.getInfo();
        if (info.version) {
          AppConfig.APP_VERSION = `v${info.version}`;
          AppConfig.BUILD_CODE = parseInt(info.build, 10) || AppConfig.BUILD_CODE;
        }
      } catch (e) {
        console.warn('Failed to parse Native App Info', e);
      }
    }

    // 踰꾩쟾 ?⑥씪 ?뚯뒪 ?먮룞 二쇱엯 (CSS 罹먯떆踰꾩뒪??+ ??踰꾩쟾 ?쒖떆)
    const cssLink = document.querySelector('link[href*="style.css"]');
    if (cssLink) cssLink.href = `style.css?v=${AppConfig.BUILD_CODE}`;
    const vDisplay = document.getElementById('app-version-display');
    if (vDisplay) vDisplay.textContent = AppConfig.APP_VERSION;


    // ???앸챸二쇨린 由ъ뒪??(?ㅼ젙 ?붾㈃ 蹂듦? ??沅뚰븳 媛깆떊, GPS ?ш린??
    if (window.Capacitor && !window._appStateRegistered) {
      window._appStateRegistered = true;
      const CapApp = window.Capacitor.Plugins.App;
      if (CapApp) {
        CapApp.addListener('appStateChange', ({ isActive }) => {
          console.log('App State Change - isActive:', isActive);
          if (isActive) {
            window._resumeGracePeriod = true;
            setTimeout(() => { window._resumeGracePeriod = false; }, 3000);
            setTimeout(() => updatePermStatuses(), 300);
            setTimeout(() => updatePermStatuses(), 1200);
            pollEmergency().catch(() => { });

            if (State.trip.status === 'driving') {
              const Prefs = window.Capacitor?.Plugins?.Preferences;
              if (Prefs) {
                Prefs.get({ key: 'LAST_NATIVE_GPS_TIME' }).then(res => {
                  if (res?.value) {
                    const nativeTime = parseInt(res.value, 10);
                    // gps.js??lastGpsTimestamp??import濡??쎄린留?媛????window.App 寃쎌쑀
                    if (nativeTime && nativeTime > (window.App?._lastGpsTs || 0)) {
                      remoteLog(`?ш렇?쇱슫??蹂듦?: ?ㅼ씠?곕툕 GPS ?쒓컙 ?숆린??(${new Date(nativeTime).toLocaleTimeString()})`, 'GPS_SYNC');
                    }
                  }
                }).catch(() => { });
              }

              setTimeout(() => {
                const now     = Date.now();
                const lastTs  = window.App?._lastGpsTs || 0;
                const elapsed = now - lastTs;
                const isGpsDead = !lastTs || elapsed > 90_000;

                if (isGpsDead || !window.App?._gpsWatchId) {
                  remoteLog(`?ш렇?쇱슫??蹂듦?: GPS ?딄? 媛먯? (${Math.round(elapsed / 1000)}s 怨듬갚) ???ш린??, 'GPS_RESUME');
                  stopGPS();
                  startGPS();
                  return;
                }

                navigator.geolocation.getCurrentPosition(
                  pos => {
                    window.App._lastGpsTs = Date.now();
                    onGpsUpdate(pos, true, State.trip.id);
                    remoteLog(`?ш렇?쇱슫??蹂듦? ??GPS 媛뺤젣?섏떊 ?깃났 (${Math.round(elapsed / 1000)}s 怨듬갚)`, 'GPS_RESUME_OK');
                  },
                  err => remoteLog(`?ш렇?쇱슫??蹂듦? 媛뺤젣?섏떊 ?ㅽ뙣: ${err.code}`, 'GPS_RESUME_ERR'),
                  { enableHighAccuracy: true, timeout: 6000, maximumAge: 3000 }
                );
              }, 500);
            }
          }
        });
      }
    }

    // 2. 沅뚰븳 ?뺤씤 ???놁쑝硫??먮룞 ?ㅼ젙 ?쒖옉
    await updatePermStatuses();
    const criticalPerms = permStatuses.loc && permStatuses.overlay && permStatuses.battery;
    const firstRun      = !Store.get('permSetupDone');

    if (firstRun || !criticalPerms) {
      showScreen('permission');
      // 沅뚰븳 ?ㅼ젙 ?붾㈃ 濡쒕뱶 ???먮룞?쇰줈 ?쒖감 ?ㅼ젙 ?쒖옉
      setTimeout(() => requestAllPerms(), 500);
      return;
    }
    if (isAppInitialized) return;
    isAppInitialized = true;

    // 3. 沅뚰븳 ?뺣낫 ??珥덇린??    if (window.Capacitor?.Plugins?.StatusBar) {
      window.Capacitor.Plugins.StatusBar.setStyle({ style: 'DARK' }).catch(() => { });
      window.Capacitor.Plugins.StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(() => { });
    }

    const profile = Store.get('profile');
    if (profile) {
      Object.assign(State.profile, profile);
      applyProfileToUI();
    }

    // ?꾨줈???꾩꽦??寃??(鍮?媛??쒖쇅, ?낅뜲?댄듃 ??遺???곗씠??諛⑹?)
    const hasProfile = State.profile.name?.trim() && State.profile.phone?.trim()
      && State.profile.vehicleNo?.trim() && State.profile.driverId?.trim();

    if (!hasProfile) {
      openSettings();
    } else {
      showMain();
    }

    // ?붾퀎 ?꾪꽣 珥덇린媛?    const monFilter = document.getElementById('log-month-filter');
    if (monFilter && !monFilter.value) monFilter.value = new Date().toISOString().slice(0, 7);

    checkUpdate(true);

    const gotoTab = new URLSearchParams(window.location.search).get('goto_tab');
    if (gotoTab) switchTab(gotoTab);

    registerBackHandler();

  } catch (e) {
    console.error('init ?щ옒??諛⑹뼱:', e);
    showScreen('permission');
  }
}

// ??? ??醫낅즺 ?????????????????????????????????????????????????????
export function exitApp() {
  if (window.isTripActive?.()) {
    window.App?.showToast('?댄뻾 以묒뿉??醫낅즺?????놁뒿?덈떎. ?댄뻾 醫낅즺 ????醫낅즺媛 媛?ν빀?덈떎.');
    return;
  }
  if (!confirm('?깆쓣 醫낅즺?섏떆寃좎뒿?덇퉴?')) return;
  const overlayPlugin = window.Capacitor?.Plugins?.Overlay;
  if (overlayPlugin?.exitAppForce) {
    overlayPlugin.exitAppForce();
  } else if (window.Capacitor?.Plugins?.App) {
    window.Capacitor.Plugins.App.exitApp();
  } else {
    window.App?.showToast('?깆쓣 吏곸젒 ?レ븘二쇱꽭??');
  }
}

