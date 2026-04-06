/**
 * permissions.js — 권한 요청/상태 관리, Android 16 가이드, 앱 설정 유틸
 */
import { Store, State } from './store.js?v=491';
import { Overlay, remoteLog } from './bridge.js?v=491';
import { showScreen } from './nav.js?v=491';

// ─── 콜백 주입 (init.js → setupPermNav 호출로 순환 참조 해소) ────
let _showMain     = () => showScreen('main');
let _openSettings = () => showScreen('settings');

export function setupPermNav({ showMain, openSettings }) {
  _showMain     = showMain;
  _openSettings = openSettings;
}

// ─── 공유 토스트 헬퍼 (늦은 참조) ────────────────────────────────
function showToast(msg, duration) {
  window.App?.showToast(msg, duration);
}

// ─── 앱 포그라운드 복귀 대기 (배터리/오버레이 설정 후 복귀 감지) ────
function waitForForeground(timeoutMs = 30000) {
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
    // 2단계: 먼저 백그라운드 전환 감지 후, 포그라운드 복귀 감지
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        wentBackground = true;  // 1단계: 백그라운드 전환 확인
      } else if (wentBackground) {
        finish();               // 2단계: 포그라운드 복귀 감지
      }
    }).then(h => { handles.push(h); });

    setTimeout(finish, timeoutMs);
  });
}

// ─── 권한 상태 ───────────────────────────────────────────────────
export const permStatuses = Store.get('permStatuses')
  || { loc: false, camera: false, notif: false, overlay: false, battery: false };

export function setPermStatus(type, ok) {
  if (!permStatuses) return;
  permStatuses[type] = !!ok;
  Store.set('permStatuses', permStatuses);

  const el = document.getElementById('perm-' + type + '-status');
  if (!el) return;

  el.textContent  = permStatuses[type] ? '허용됨' : '미설정';
  el.className    = 'perm-status ' + (permStatuses[type] ? 'perm-ok' : 'perm-ng');

  const btn = el.nextElementSibling;
  if (btn && (btn.tagName === 'BUTTON' || btn.classList.contains('btn-perm'))) {
    if (!permStatuses[type]) {
      btn.classList.remove('btn-ok', 'btn-primary');
      if (['loc', 'overlay', 'battery'].includes(type)) {
        btn.classList.add('btn-pulse', 'btn-ng');
        btn.textContent = '설정(필수)';
      } else {
        btn.classList.add('btn-ng');
        btn.textContent = '설정';
      }
    } else {
      btn.classList.remove('btn-pulse', 'btn-ng', 'btn-primary');
      btn.classList.add('btn-ok');
      btn.textContent = '허용완료';
    }
  }
}

export async function updatePermStatuses() {
  console.log('--- updatePermStatuses start ---');
  for (const k in permStatuses) { setPermStatus(k, permStatuses[k]); }

  // 1. 오버레이 & 배터리 (커스텀 플러그인)
  const overlay = Overlay();
  if (overlay) {
    try {
      const r = await overlay.checkPermission().catch(() => ({ granted: false }));
      setPermStatus('overlay', !!r.granted);
      const b = await overlay.checkBatteryOptimization().catch(() => ({ granted: false }));
      setPermStatus('battery', !!b.granted);
    } catch (e) { console.warn('Overlay check fail', e); }
  }

  // 2. 위치
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

  // 3. 카메라 / 미디어
  const Cam = window.Capacitor?.Plugins?.Camera;
  if (Cam) {
    try {
      const p = await Cam.checkPermissions().catch(() => ({}));
      setPermStatus('camera', p.camera === 'granted' || p.camera === 'limited');
    } catch (e) { console.warn('Cam check fail', e); }
  }

  // 4. 알림
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

  // 최종 강제 동기화
  for (const k in permStatuses) { setPermStatus(k, permStatuses[k]); }

  // 설정 완료 버튼 색상 동적 업데이트
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

// ─── 안드로이드 16 전용 가이드 ───────────────────────────────────
function showAndroid16Guide(type) {
  const guide      = document.getElementById('modal-guide-android16');
  const confirmBtn = document.getElementById('btn-guide-confirm');
  if (!guide || !confirmBtn) return;

  guide.classList.add('active');
  confirmBtn.onclick = (ev) => {
    ev.preventDefault();
    guide.classList.remove('active');
    setTimeout(() => { executeRealRequest(type); }, 300);
  };
}

async function executeRealRequest(type) {
  const overlay = Overlay();
  try {
    switch (type) {
      case 'location':
        // alert 제거 - 순차 자동설정 진행
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
          await overlay.requestPermission();
        } else {
          showToast('설정창을 열 수 없습니다. (플러그인 미로드)');
        }
        break;
      case 'battery':
        if (overlay) {
          showToast("설정창에서 '제한 없음'을 선택해야 위치 관제가 끊기지 않습니다", 4000);
          remoteLog('User clicked Battery Optimization button', 'UI_ACTION');
          try {
            const res = await overlay.requestBatteryOptimization();
            remoteLog('Native requestBatteryOptimization response: ' + JSON.stringify(res), 'NATIVE_RES');
          } catch (e) {
            remoteLog('Native requestBatteryOptimization error: ' + e.message, 'NATIVE_ERR');
          }
        } else {
          showToast('설정창을 열 수 없습니다. (플러그인 미로드)');
        }
        break;
    }
  } catch (err) {
    console.error('executeRealRequest error', type, err);
    if (err.message && (err.message.includes('Permission') || err.message.includes('denied'))) {
      showToast('권한이 거부되었습니다. 안드로이드 [설정 > 애플리케이션 > 권한] 에서 직접 허용해주세요.', 4000);
    } else {
      showToast('권한 요청 실패: ' + err.message);
    }
  } finally {
    setTimeout(() => {
      document.querySelectorAll('.btn-active').forEach(b => b.classList.remove('btn-active'));
    }, 1000);
  }
}

export async function requestPerm(type, event) {
  if (event && event.target) event.target.classList.add('btn-active');

  if (type === 'overlay' || type === 'battery') {
    showAndroid16Guide(type);
    return;
  }
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
      showToast(perm.type + ' 권한을 설정합니다...', 1500);
      await executeRealRequest(perm.type);
      await new Promise(r => setTimeout(r, 1000)); // wait for android to settle
      await updatePermStatuses();
    }
  }

  const specialPerms = [
    { key: 'battery', type: 'battery'},
    { key: 'overlay', type: 'overlay'}
  ];

  for (const perm of specialPerms) {
    if (!permStatuses[perm.key]) {
      showToast(perm.type + ' 권한을 설정합니다...', 1500);

      // 모달이 있으면 UI로 안내, 없으면 바로 요청
      const guide = document.getElementById('modal-guide-android16');
      const confirmBtn = document.getElementById('btn-guide-confirm');

      if (guide && confirmBtn) {
        await new Promise(resolve => {
          guide.classList.add('active');
          confirmBtn.onclick = async (ev) => {
            ev.preventDefault();
            guide.classList.remove('active');
            await new Promise(r => setTimeout(r, 300));
            await executeRealRequest(perm.type);
            await waitForForeground(30_000);   // 앱 포그라운드 복귀 대기
            await new Promise(r => setTimeout(r, 600));
            resolve();
          };
        });
      } else {
        // 모달 없으면 바로 요청
        await executeRealRequest(perm.type);
        await waitForForeground(30_000);      // 앱 포그라운드 복귀 대기
        await new Promise(r => setTimeout(r, 600));
      }

      await updatePermStatuses();
    }
  }

  showToast('순차 설정이 완료되었습니다. 확인을 눌러주세요.');
}

export function manualRefreshPerms() {
  updatePermStatuses();
}

export function showTerms() {
  document.getElementById('modal-terms')?.classList.add('active');
}
export function closeTerms() {
  document.getElementById('modal-terms')?.classList.remove('active');
}

export function finishPermSetup() {
  updatePermStatuses().then(() => {
    const missing = [];
    if (!permStatuses.loc)     missing.push('위치(항상 허용)');
    if (!permStatuses.overlay) missing.push('다른 앱 위에 표시');
    if (!permStatuses.battery) missing.push('배터리 최적화 제외');

    if (missing.length > 0) {
      alert('아래 필수 권한이 설정되지 않았습니다:\n\n'
        + missing.join('\n')
        + '\n\n모든 필수 권한을 허용해야 앱을 시작할 수 있습니다.');
      return;
    }

    Store.set('permSetupDone', true);
    // 프로필 완성도 검사 (빈 값 제외, 업데이트 후 부실 데이터 방지)
    const hasProfile = State.profile.name?.trim() && State.profile.phone?.trim()
      && State.profile.vehicleNo?.trim() && State.profile.driverId?.trim();

    if (!hasProfile) {
      showToast('권한 설정 완료! 차량 정보를 먼저 등록해 주세요.');
      _openSettings();
    } else {
      showToast('반갑습니다! 안전 운전 하세요.');
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
  if (confirm('캐시를 지우고 새로고침 하시겠습니까? (세션이 다시 시작됩니다)')) {
    window.location.reload(true);
  }
}

export function openPermissionSetup() {
  showScreen('permission');
  updatePermStatuses();
}

export function resetApp() {
  if (!confirm('앱을 초기화하면 모든 설정과 배차 기록이 삭제됩니다. 계속하시겠습니까?')) return;
  localStorage.clear();

  State.profile = { name: '', phone: '', vehicleNo: '', driverId: '' };
  State.trip    = { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '' };
  if (permStatuses) {
    for (const key in permStatuses) permStatuses[key] = false;
  }

  showScreen('permission');
  updatePermStatuses().then(() => {
    showToast('앱이 초기화되었습니다. 권한을 다시 설정해주세요.');
  });
}
