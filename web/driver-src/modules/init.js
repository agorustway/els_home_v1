/**
 * init.js — 앱 초기화, 화면 전환 오케스트레이션
 */
import { Store, State, AppConfig } from './store.js?v=490';
import { remoteLog } from './bridge.js?v=490';
import { showScreen } from './nav.js?v=490';
import {
  updatePermStatuses, permStatuses, setupPermNav, requestAllPerms,
} from './permissions.js?v=490';
import { applyProfileToUI } from './profile.js?v=490';
import { loadCurrentTrip, registerBackHandler } from './trip.js?v=490';
import { startGPS, stopGPS, onGpsUpdate, lastGpsTimestamp } from './gps.js?v=490';
import { loadNotices } from './notice.js?v=490';
import { startEmergencyPoll, pollEmergency } from './emergency.js?v=490';
import { checkUpdate } from './update.js?v=490';
import { openMap } from './map.js?v=490';
import { loadLogs } from './log.js?v=490';

let isAppInitialized = false;

// ─── 공개 네비게이션 함수 (permissions.js에 콜백 주입) ────────────
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
  if (tab === 'map') { openMap(); return; }
  showScreen('main');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.getElementById('tab-btn-' + tab)?.classList.add('active');
  if (tab === 'notice') loadNotices();
  if (tab === 'log')    loadLogs();
}

// permissions.js에 네비게이션 콜백 주입
setupPermNav({ showMain, openSettings });

// ─── 앱 초기화 ───────────────────────────────────────────────────
export async function init() {
  try {
    // 0. Capacitor 브릿지 대기 (단 1회)
    if (window.Capacitor && !isAppInitialized) {
      await new Promise(r => {
        if (window.Capacitor.isPluginAvailable('CapacitorHttp')) { r(); return; }
        window.addEventListener('load', r, { once: true });
        setTimeout(r, 800);
      });
    }

    // 1. 네이티브 버전 정보 동적 패치 (버전 하드코딩 제거)
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

    // 버전 단일 소스 자동 주입 (CSS 캐시버스터 + 앱 버전 표시)
    const cssLink = document.querySelector('link[href*="style.css"]');
    if (cssLink) cssLink.href = `style.css?v=${AppConfig.BUILD_CODE}`;
    const vDisplay = document.getElementById('app-version-display');
    if (vDisplay) vDisplay.textContent = AppConfig.APP_VERSION;


    // 앱 생명주기 리스너 (설정 화면 복귀 시 권한 갱신, GPS 재기동)
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
                    // gps.js의 lastGpsTimestamp는 import로 읽기만 가능 → window.App 경유
                    if (nativeTime && nativeTime > (window.App?._lastGpsTs || 0)) {
                      remoteLog(`포그라운드 복귀: 네이티브 GPS 시간 동기화 (${new Date(nativeTime).toLocaleTimeString()})`, 'GPS_SYNC');
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
                  remoteLog(`포그라운드 복귀: GPS 끊김 감지 (${Math.round(elapsed / 1000)}s 공백) → 재기동`, 'GPS_RESUME');
                  stopGPS();
                  startGPS();
                  return;
                }

                navigator.geolocation.getCurrentPosition(
                  pos => {
                    window.App._lastGpsTs = Date.now();
                    onGpsUpdate(pos, true, State.trip.id);
                    remoteLog(`포그라운드 복귀 후 GPS 강제수신 성공 (${Math.round(elapsed / 1000)}s 공백)`, 'GPS_RESUME_OK');
                  },
                  err => remoteLog(`포그라운드 복귀 강제수신 실패: ${err.code}`, 'GPS_RESUME_ERR'),
                  { enableHighAccuracy: true, timeout: 6000, maximumAge: 3000 }
                );
              }, 500);
            }
          }
        });
      }
    }

    // 2. 권한 확인 → 없으면 자동 설정 시작
    await updatePermStatuses();
    const criticalPerms = permStatuses.loc && permStatuses.overlay && permStatuses.battery;
    const firstRun      = !Store.get('permSetupDone');

    if (firstRun || !criticalPerms) {
      showScreen('permission');
      // 권한 설정 화면 로드 후 자동으로 순차 설정 시작
      setTimeout(() => requestAllPerms(), 500);
      return;
    }
    if (isAppInitialized) return;
    isAppInitialized = true;

    // 3. 권한 확보 후 초기화
    if (window.Capacitor?.Plugins?.StatusBar) {
      window.Capacitor.Plugins.StatusBar.setStyle({ style: 'DARK' }).catch(() => { });
      window.Capacitor.Plugins.StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(() => { });
    }

    const profile = Store.get('profile');
    if (profile) {
      Object.assign(State.profile, profile);
      applyProfileToUI();
    }

    const hasProfile = State.profile.name && State.profile.phone && State.profile.vehicleNo && State.profile.driverId;
    if (!hasProfile) { openSettings(); } else { showMain(); }

    // 월별 필터 초기값
    const monFilter = document.getElementById('log-month-filter');
    if (monFilter && !monFilter.value) monFilter.value = new Date().toISOString().slice(0, 7);

    checkUpdate(true);

    const gotoTab = new URLSearchParams(window.location.search).get('goto_tab');
    if (gotoTab) switchTab(gotoTab);

    registerBackHandler();

  } catch (e) {
    console.error('init 크래시 방어:', e);
    showScreen('permission');
  }
}

// ─── 앱 종료 ─────────────────────────────────────────────────────
export function exitApp() {
  if (window.isTripActive?.()) {
    window.App?.showToast('운행 중에는 종료할 수 없습니다. 운행 종료 후 앱 종료가 가능합니다.');
    return;
  }
  if (!confirm('앱을 종료하시겠습니까?')) return;
  const overlayPlugin = window.Capacitor?.Plugins?.Overlay;
  if (overlayPlugin?.exitAppForce) {
    overlayPlugin.exitAppForce();
  } else if (window.Capacitor?.Plugins?.App) {
    window.Capacitor.Plugins.App.exitApp();
  } else {
    window.App?.showToast('앱을 직접 닫아주세요.');
  }
}
