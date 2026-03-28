/**
 * ELS Driver App v4.0
 * 단일 IIFE 번들 — Capacitor 플러그인 브릿지 사용
 */
(function () {
  'use strict';
  console.log('ELS Driver App Loading... v4.1.64');

  const APP_VERSION = 'v4.1.64';
  const BASE_URL = 'https://www.nollae.com';
  const VERSION_URL = BASE_URL + '/apk/version.json';

  // ─── Capacitor 플러그인 헬퍼 ──────────────────────────────────
  function getPlugin(name) {
    try { 
      const plugins = window.Capacitor?.Plugins;
      if (!plugins) {
        console.warn('Capacitor.Plugins not available yet.');
        return null;
      }
      
      // 1. 이미 등록된 플러그인 확인
      let found = plugins[name] || plugins[name.toLowerCase()] || plugins[name.toUpperCase()] || plugins[name + 'Plugin'];
      
      // 2. [중요] Capacitor 4+ 방식: 명시적 등록 시도 (네이티브 브릿지 강제 연결)
      if (!found && window.Capacitor?.registerPlugin) {
        try {
          found = window.Capacitor.registerPlugin(name);
          console.log(`Plugin ${name} registered manually via registerPlugin()`);
        } catch(e) { console.warn(`Manual registration for ${name} failed`, e); }
      }

      if (!found) {
        console.group('Plugin Search Failed: ' + name);
        console.log('Available Plugins:', Object.keys(plugins).join(', '));
        console.groupEnd();
        remoteLog(`Plugin Search Failed: ${name} (Available: ${Object.keys(plugins).join(', ')})`, 'JS_BRIDGE_ERR');
      }
      return found || null;
    } catch { return null; }
  }

  async function remoteLog(msg, tag = 'JS') {
    if (!msg) return;
    try {
        // [TDD] 로컬 로그 캡핑 (브라우저 메모리 폭주 방지)
        const logHistory = Store.get('logHistory') || [];
        if (logHistory.length > 50) logHistory.shift(); 
        
        // KST 시간 포맷 (ISO 8601 + 9시간)
        const now = new Date();
        const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00');
        
        logHistory.push(`[${kst}] [${tag}] ${msg}`);
        Store.set('logHistory', logHistory);

        const payload = { msg: `[KST ${kst}] ${msg}`, device: 'Mobile', tag };
        fetch(BASE_URL + '/api/debug/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(() => {});
    } catch(e) {}
  }
  const Overlay = () => getPlugin('Overlay');
  const Emergency = () => getPlugin('Emergency');
  const CapHttp = () => getPlugin('CapacitorHttp');

  async function smartFetch(url, options = {}) {
    const http = CapHttp();
    if (http && window.Capacitor?.isNativePlatform()) {
      try {
        const res = await http.request({
          url, method: options.method || 'GET',
          headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
          data: options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : undefined,
        });
        return { 
          ok: res.status < 400, 
          status: res.status, 
          json: async () => (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) 
        };
      } catch (e) {
        console.error('smartFetch CapHttp error', e);
      }
    }
    return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  }

  // ─── localStorage 헬퍼 ────────────────────────────────────────
  const Store = {
    get: (k, def = null) => { try { const v = localStorage.getItem('els_' + k); return v ? JSON.parse(v) : def; } catch { return def; } },
    set: (k, v) => { try { localStorage.setItem('els_' + k, JSON.stringify(v)); } catch {} },
    rm:  (k) => { try { localStorage.removeItem('els_' + k); } catch {} },
  };

  // ─── 상태 ─────────────────────────────────────────────────────
  const State = {
    profile: { name: '', phone: '', vehicleNo: '', driverId: '' },
    trip: { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '' },
    photos: [], // { dataUrl, uploaded, serverUrl }
    notices: [],
    logs: [],
    currentNoticeId: null,
    currentLogId: null,
    currentPhotoIdx: 0,
    emergencyIds: new Set(),
  };

  // ─── 권한 상태 ────────────────────────────────────────────────
  const permStatuses = Store.get('permStatuses') || { loc: false, camera: false, notif: false, overlay: false, battery: false };
  
  function setPermStatus(type, ok) {
    // 권한 객체가 없으면 초기화
    if (!permStatuses) return; 
    permStatuses[type] = !!ok;
    Store.set('permStatuses', permStatuses);
    
    const el = document.getElementById('perm-' + type + '-status');
    if (!el) return;
    
    el.textContent = permStatuses[type] ? '허용됨' : '미설정';
    el.className = 'perm-status ' + (permStatuses[type] ? 'perm-ok' : 'perm-ng');

    const btn = el.nextElementSibling;
    if (btn && (btn.tagName === 'BUTTON' || btn.classList.contains('btn-perm'))) {
      if (!permStatuses[type]) {
         btn.classList.remove('btn-ok', 'btn-primary'); // primary 완전 제거
         if (['loc', 'overlay', 'battery'].includes(type)) {
            btn.classList.add('btn-pulse', 'btn-ng');
            btn.textContent = '설정(필수)';
         } else {
            btn.classList.add('btn-ng');
            btn.textContent = '설정';
         }
      } else {
         btn.classList.remove('btn-pulse', 'btn-ng', 'btn-primary'); // primary 완전 제거
         btn.classList.add('btn-ok');
         btn.textContent = '허용완료';
      }
    }
  }

  // ─── 앱 초기화 ────────────────────────────────────────────────
  async function init() {
    // Capacitor 브릿지 대기
    if (window.Capacitor) {
      const CapApp = window.Capacitor.Plugins.App;
      if (CapApp) {
        CapApp.addListener('appStateChange', ({ isActive }) => {
          console.log('App State Change - isActive:', isActive);
          if (isActive) {
            // 다중 체크 (권한 설정이 느리게 반영될 수 있음)
            setTimeout(() => { updatePermStatuses(); }, 300);
            setTimeout(() => { updatePermStatuses(); }, 1200);
          }
        });
      }
      
      await new Promise(r => {
        if (window.Capacitor.isPluginAvailable('CapacitorHttp')) { r(); return; }
        window.addEventListener('load', r, { once: true });
        setTimeout(r, 800);
      });
    }

    if (window.Capacitor?.Plugins?.StatusBar) {
      window.Capacitor.Plugins.StatusBar.setStyle({ style: 'DARK' }).catch(()=>{});
      window.Capacitor.Plugins.StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(()=>{});
    }

    if (document.getElementById('app-version-display')) {
      document.getElementById('app-version-display').textContent = APP_VERSION;
    }

    // 프로필 로드
    const profile = Store.get('profile');
    if (profile) {
      Object.assign(State.profile, profile);
      applyProfileToUI();
    }

    // 최초 실행 여부 및 권한 상태 체크
    const firstRun = !Store.get('permSetupDone');
    const hasProfile = State.profile.name && State.profile.phone && State.profile.vehicleNo && State.profile.driverId;
    
    // 권한 상태 먼저 확인 후 화면 결정
    await updatePermStatuses();
    const criticalPerms = permStatuses.loc && permStatuses.overlay && permStatuses.battery;
    
    if (firstRun || !criticalPerms) {
      showScreen('permission');
    } else if (!hasProfile) {
      openSettings();
    } else {
      showMain();
    }
    
    // 업데이트 확인은 메인 진입 시에만 수행
    checkUpdate(true);

    // goto_tab 딥링크 (서비스에서 복귀)
    const gotoTab = new URLSearchParams(window.location.search).get('goto_tab');
    if (gotoTab) switchTab(gotoTab);
  }

  function showMain() {
    showScreen('main');
    switchTab('trip');
    loadCurrentTrip();
    loadNotices();
    startEmergencyPoll();
  }

  function openSettings() {
    showScreen('settings');
    const hasProfile = State.profile.name && State.profile.phone && State.profile.vehicleNo && State.profile.driverId;
    const backBtn = document.getElementById('settings-back-btn');
    if (backBtn) {
      backBtn.style.display = hasProfile ? '' : 'none'; // 프로필 부족시 뒤로가기 숨김
    }
  }

  // ─── 화면 전환 ────────────────────────────────────────────────
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + name)?.classList.add('active');
  }

  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('[id^="tab-"]').forEach(t => t.classList.remove('active'));
    const tabEl = document.getElementById('tab-' + tab);
    const btnEl = document.getElementById('tab-btn-' + tab);
    if (tabEl) tabEl.classList.add('active');
    if (btnEl) btnEl.classList.add('active');
    document.getElementById('header-back').classList.add('hidden');

    if (tab === 'notice') loadNotices();
    if (tab === 'log')    loadLogs();
  }

  function headerBack() {
    closeNoticeDetail();
    closeLogDetail();
  }

  // ─── 프로필 UI ───────────────────────────────────────────────
  function applyProfileToUI() {
    document.getElementById('s-name').value    = State.profile.name;
    document.getElementById('s-phone').value   = State.profile.phone;
    document.getElementById('s-vehicle').value = State.profile.vehicleNo;
    document.getElementById('s-id').value      = State.profile.driverId;
    document.getElementById('header-vehicle').textContent = State.profile.vehicleNo || '—';
  }

  function saveProfile() {
    const name = document.getElementById('s-name').value.trim();
    const phone = document.getElementById('s-phone').value.replace(/\D/g, '');
    const vehicleNo = document.getElementById('s-vehicle').value.trim();
    const driverId  = document.getElementById('s-id').value.trim().toUpperCase();

    if (!name || !phone || !vehicleNo || !driverId) { 
      showToast('이름, 전화번호, 차량번호, 기사 ID를 모두 입력해 주세요.'); 
      return; 
    }

    State.profile = { name, phone, vehicleNo, driverId };
    Store.set('profile', State.profile);
    applyProfileToUI();
    upsertDriverContact();
    showToast('정보가 저장되었습니다.');
    
    // 저장 성공 시 메인으로 강제 이동
    showMain();
  }

  async function upsertDriverContact() {
    try {
      await smartFetch(BASE_URL + '/api/vehicle-tracking/drivers', {
        method: 'POST',
        body: JSON.stringify({
          phone: State.profile.phone,
          name: State.profile.name,
          vehicle_number: State.profile.vehicleNo,
          vehicle_id: State.profile.driverId,
        }),
      });
    } catch (e) { console.warn('upsertDriverContact', e); }
  }

  async function lookupDriver() {
    const phone = document.getElementById('s-phone').value.replace(/\D/g, '');
    if (phone.length < 10) { showToast('전화번호를 먼저 입력해 주세요.'); return; }
    showToast('조회 중...');
    try {
      const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/drivers?phone=${phone}`);
      const data = await res.json();
      if (data && data.driver) {
        const d = data.driver;
        document.getElementById('s-name').value    = d.name || '';
        document.getElementById('s-vehicle').value = d.vehicle_number || d.business_number || '';
        document.getElementById('s-id').value      = d.vehicle_id || d.driver_id || '';
        showToast('기사 정보를 불러왔습니다.');
      } else {
        showToast('해당 전화번호로 등록된 기사 정보가 없습니다.');
      }
    } catch (e) { showToast('조회 실패: ' + e.message); }
  }

  // ─── 권한 설정 ────────────────────────────────────────────────

  async function updatePermStatuses() {
    console.log('--- updatePermStatuses start ---');
    // 초기화 (UI 동기화 보장용)
    for (const k in permStatuses) { setPermStatus(k, permStatuses[k]); }
    // 1. 오버레이 & 배터리 (커스텀 플러그인)
    const overlay = Overlay();
    if (overlay) {
      try {
        const r = await overlay.checkPermission().catch(() => ({ granted: false }));
        setPermStatus('overlay', !!r.granted);
        
        const b = await overlay.checkBatteryOptimization().catch(() => ({ granted: false }));
        setPermStatus('battery', !!b.granted);
      } catch(e) { console.warn('Overlay check fail', e); }
    }

    // 2. 위치
    const Geo = window.Capacitor?.Plugins?.Geolocation;
    if (Geo) {
        try {
            const p = await Geo.checkPermissions().catch(() => ({}));
            setPermStatus('loc', p.location === 'granted');
        } catch(e) { console.warn('Geo check fail', e); }
    } else if ('geolocation' in navigator) {
        // Fallback: browser API check
        try {
            const p = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
            if (p) setPermStatus('loc', p.state === 'granted');
        } catch(e) {}
    }

    // 3. 카메라 / 미디어
    const Cam = window.Capacitor?.Plugins?.Camera;
    if (Cam) {
        try {
            const p = await Cam.checkPermissions().catch(() => ({}));
            setPermStatus('camera', p.camera === 'granted' || p.camera === 'limited');
        } catch(e) { console.warn('Cam check fail', e); }
    }

    // 4. 알림
    const Notif = window.Capacitor?.Plugins?.LocalNotifications || window.Capacitor?.Plugins?.PushNotifications;
    if (Notif) {
        try {
            const p = await Notif.checkPermissions().catch(() => ({ display: 'denied', receive: 'denied' }));
            setPermStatus('notif', p.display === 'granted' || p.receive === 'granted' || p.notif === 'granted');
        } catch(e) { console.warn('Notif check fail', e); }
    } else if ('Notification' in window) {
      setPermStatus('notif', Notification.permission === 'granted');
    }
    
    // 최종 강제 동기화
    for (const k in permStatuses) { setPermStatus(k, permStatuses[k]); }
    console.log('--- updatePermStatuses end --- perms:', JSON.stringify(permStatuses));
  }

  // ─── 안드로이드 16 전용 가이드 ──────────────────────────────
  function showAndroid16Guide(type) {
    const guide = document.getElementById('modal-guide-android16');
    const confirmBtn = document.getElementById('btn-guide-confirm');
    if (!guide || !confirmBtn) return;
    
    guide.classList.add('active');
    confirmBtn.onclick = (ev) => {
      ev.preventDefault();
      guide.classList.remove('active');
      // 300ms 텀을 주어 모달이 닫힌 후 요청이 원활하게 전달되도록 함
      setTimeout(() => { executeRealRequest(type); }, 300);
    };
  }

  async function executeRealRequest(type) {
    const overlay = Overlay();
    try {
        switch(type) {
          case 'location':
            if (window.Capacitor?.Plugins?.Geolocation) {
                await window.Capacitor.Plugins.Geolocation.requestPermissions();
            }
            break;
          case 'camera':
            if (window.Capacitor?.Plugins?.Camera) {
                await window.Capacitor.Plugins.Camera.requestPermissions();
            } else {
                try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach(t=>t.stop()); } catch(e){}
            }
            break;
          case 'notification':
            const Notif = window.Capacitor?.Plugins?.LocalNotifications || window.Capacitor?.Plugins?.PushNotifications;
            if (Notif) {
                await Notif.requestPermissions();
            } else if ('Notification' in window) {
              await Notification.requestPermission();
            }
            break;
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
                } catch(e) {
                  remoteLog('Native requestBatteryOptimization error: ' + e.message, 'NATIVE_ERR');
                }
            } else {
                showToast('설정창을 열 수 없습니다. (플러그인 미로드)');
            }
            break;
        }
    } catch(err) {
        console.error('executeRealRequest error', type, err);
        if (err.message && (err.message.includes('Permission') || err.message.includes('denied'))) {
            showToast('권한이 거부되었습니다. 안드로이드 [설정 > 애플리케이션 > 권한] 에서 직접 허용해주세요.', 4000);
        } else {
            showToast('권한 요청 실패: ' + err.message);
        }
    } finally {
        // [TDD] 설정 화면에서 돌아오는 시간 고려 (S25/Android 16 대응 1000ms)
        setTimeout(async () => {
            await updatePermStatuses();
            showToast('권한 상태를 확인했습니다.');
            // 버튼 상태 초기화
            const activeBtns = document.querySelectorAll('.btn-active');
            activeBtns.forEach(b => b.classList.remove('btn-active'));
        }, 1000);
    }
  }

  async function requestPerm(type, event) {
    if (event && event.target) event.target.classList.add('btn-active');
    
    // 안드로이드 16 이상이거나 오버레이/배터리 권한인 경우 가이드 먼저 노출 후 이동
    if (type === 'overlay' || type === 'battery') {
        showAndroid16Guide(type);
        return;
    }
    
    try {
        await executeRealRequest(type);
    } catch(e) {
        if (event && event.target) event.target.classList.remove('btn-active');
    }
  }

  function showTerms() {
    const el = document.getElementById('modal-terms');
    if (el) el.classList.add('active');
  }

  function closeTerms() {
    const el = document.getElementById('modal-terms');
    if (el) el.classList.remove('active');
  }

  function finishPermSetup() {
    updatePermStatuses().then(() => {
      // 필수 권한 체크 (위치, 오버레이, 배터리)
      const missing = [];
      if (!permStatuses.loc) missing.push('위치(항상 허용)');
      if (!permStatuses.overlay) missing.push('다른 앱 위에 표시');
      if (!permStatuses.battery) missing.push('배터리 최적화 제외');

      if (missing.length > 0) {
        alert('아래 필수 권한이 설정되지 않았습니다:\n\n' + missing.join('\n') + '\n\n모든 필수 권한을 허용해야 앱을 시작할 수 있습니다.');
        return;
      }
      
      Store.set('permSetupDone', true);
      
      // [TDD] 권한 완료 후 차량 정보(프로필)가 없으면 설정 페이지로 강제 이동
      const hasProfile = State.profile.name && State.profile.phone && State.profile.vehicleNo && State.profile.driverId;
      if (!hasProfile) {
        openSettings();
        showToast('권한 설정 완료! 차량 정보를 먼저 입력해 주세요.');
      } else {
        showMain();
        showToast('반갑습니다! 안전 운전 하세요.');
      }
    });
  }

  function settingsBack() {
    if (!Store.get('permSetupDone')) {
      showScreen('permission');
      updatePermStatuses();
    } else {
      showScreen('main'); switchTab('trip');
    }
  }

  function clearCache() {
    if (confirm('캐시를 지우고 새로고침 하시겠습니까? (세션이 다시 시작됩니다)')) {
      window.location.reload(true);
    }
  }

  // 설정 화면에서 권한 설정 화면으로 이동 (새 버튼용)
  function openPermissionSetup() {
    // 권한 화면으로 전환하고 현재 상태를 다시 확인
    showScreen('permission');
    updatePermStatuses();
  }

  function resetApp() {
    if (!confirm('앱을 초기화하면 모든 설정과 배차 기록이 삭제됩니다. 계속하시겠습니까?')) return;
    localStorage.clear(); // 전체 초기화
    
    // 메모리 내 상태도 명시적으로 초기화
    State.profile = { name: '', phone: '', vehicleNo: '', driverId: '' };
    State.trip = { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '' };
    for (const key in permStatuses) permStatuses[key] = false;
    
    showScreen('permission');
    updatePermStatuses().then(() => {
        showToast('앱이 초기화되었습니다. 권한을 다시 설정해주세요.');
    });
  }

  // ─── 운행 관리 ────────────────────────────────────────────────
  function onTripFieldChange() {
    const cEl = document.getElementById('container-no');
    const sEl = document.getElementById('seal-no');
    
    // 대문자 변환 & 공백 제거
    cEl.value = cEl.value.trim().toUpperCase();
    sEl.value = sEl.value.trim().toUpperCase();

    State.trip.containerNo = cEl.value;
    State.trip.sealNo      = sEl.value;

    // ISO 6346 체크 (11자리일 때) - 알파벳 4 + 숫자 7
    const errEl = document.getElementById('container-check-msg');
    if (errEl) errEl.textContent = '';
    
    if (cEl.value.length >= 4) {
      const match = cEl.value.match(/^([A-Z]{4})(\d{0,7})$/);
      if (match) {
        if (cEl.value.length === 11) {
          if (validateISO6346(cEl.value)) {
            if (errEl) { errEl.textContent = '유효한 번호입니다'; errEl.style.color = 'var(--primary)'; }
          } else {
            if (errEl) { errEl.textContent = '컨테이너번호 오기입 넘버를 확인해주세요'; errEl.style.color = 'var(--danger)'; }
          }
        } else {
          if (errEl) { errEl.textContent = '입력 중...'; errEl.style.color = 'var(--text-muted)'; }
        }
      } else {
        if (errEl) { errEl.textContent = '영문 4자 + 숫자 7자'; errEl.style.color = 'var(--danger)'; }
      }
    }
  }

  function validateISO6346(str) {
    const charMap = {
      'A':10,'B':12,'C':13,'D':14,'E':15,'F':16,'G':17,'H':18,'I':19,'J':20,'K':21,'L':23,'M':24,
      'N':25,'O':26,'P':27,'Q':28,'R':29,'S':30,'T':31,'U':32,'V':34,'W':35,'X':36,'Y':37,'Z':38
    };
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      let val = charMap[str[i]] || parseInt(str[i], 10);
      sum += val * Math.pow(2, i);
    }
    const checkDigit = (sum % 11) % 10;
    return checkDigit === parseInt(str[10], 10);
  }

  async function loadCurrentTrip() {
    const saved = Store.get('activeTrip');
    if (!saved) return;
    try {
      const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${saved.id}`).catch(() => null);
      if (!res) return;
      const data = await res.json().catch(() => null);
      if (data && (data.status === 'driving' || data.status === 'paused')) {
        State.trip.id = saved.id;
        State.trip.status = data.status;
        State.trip.startTime = new Date(data.started_at).getTime();
        State.trip.containerNo = data.container_number || '';
        State.trip.sealNo = data.seal_number || '';
        
        document.getElementById('container-no').value = State.trip.containerNo;
        document.getElementById('seal-no').value      = State.trip.sealNo;
        document.getElementById('container-type').value = data.container_type || '40FT';
        document.getElementById('container-kind').value = data.container_kind || 'DRY';
        document.getElementById('trip-memo').value = data.special_notes || '';
        
        // 사진 데이터 복구 (서버 -> 로컬 State)
        let photos = [];
        try {
          if (Array.isArray(data.photos)) photos = data.photos;
          else if (typeof data.photos === 'string' && data.photos.trim()) photos = JSON.parse(data.photos);
        } catch(e) { console.error('loadCurrentTrip photos parse err', e); }
        
        State.photos = photos.map(p => ({
          ...p,
          uploaded: true,
          serverUrl: p.url ? (p.url.startsWith('http') ? p.url : BASE_URL + (p.url.startsWith('/') ? '' : '/') + p.url) : (p.serverUrl || p.dataUrl || '')
        }));
        
        setTripStatus(data.status);
        updateTripUI();
        renderPhotoThumbs();
        if (data.status === 'driving') {
           startGPS();
           startOverlayService();
           startTripStatusTimer();
        }
      } else {
        Store.rm('activeTrip');
      }
    } catch (e) {
      console.warn('loadCurrentTrip error', e);
    }
  }


  async function startTrip() {
    if (!State.profile.name || !State.profile.phone || !State.profile.vehicleNo || !State.profile.driverId) {
      showToast('차량 정보를 먼저 모두 입력해 주세요.');
      openSettings();
      return;
    }
    const containerNo = document.getElementById('container-no').value.trim();
    const sealNo      = document.getElementById('seal-no').value.trim();
    const cType       = document.getElementById('container-type').value;
    const cKind       = document.getElementById('container-kind').value;
    const memo        = document.getElementById('trip-memo').value;

    try {
        const res = await smartFetch(BASE_URL + '/api/vehicle-tracking/trips', {
          method: 'POST',
          body: JSON.stringify({
            driver_name:      State.profile.name,
            driver_phone:     State.profile.phone,
            vehicle_number:   State.profile.vehicleNo,
            vehicle_id:       State.profile.driverId,
            container_number: containerNo,
            seal_number:      sealNo,
            container_type:   cType,
            container_kind:   cKind,
            special_notes:    memo,
          }),
        });
        let data = await res.json().catch(() => ({}));
        console.log('startTrip server raw response:', JSON.stringify(data));
        
        if (!res.ok) {
          throw new Error(data.error || `서버 오류 (${res.status})`);
        }
        
        // 서버 응답 구조가 여러 형태일 수 있으므로 전수 조사
        // 1. {id: 123} 2. {trip: {id: 123}} 3. 단일 객체가 아닌 배열일 경우 등
        const finalId = data.id || (data.trip && data.trip.id) || (Array.isArray(data) && data[0]?.id);
        
        if (!finalId) {
           console.error('startTrip ID fail. data:', data);
           throw new Error('ID 누락 (서버에서 기록 아이디를 받지 못함)');
        }

        State.trip.id = finalId;
        State.trip.status = 'driving';
        State.trip.startTime = Date.now();
        Store.set('activeTrip', { id: finalId, startTime: State.trip.startTime });

        const startD = new Date();
        document.getElementById('trip-date-display').textContent = `운송시작: ${formatDate(startD)}`;
        setTripStatus('driving');
        updateTripUI();
        startOverlayService();
        startGPS();
        startTripStatusTimer();

        if (State.photos.some(p => !p.uploaded)) {
          await uploadPendingPhotos();
        }
        showToast(data.message || '운행이 시작되었습니다.');

    } catch (e) { showToast('오류: ' + e.message); }
  }

  async function togglePause() {
    if (!State.trip.id) return;
    const action = State.trip.status === 'driving' ? 'pause' : 'resume';
    try {
      await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.trip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      State.trip.status = action === 'pause' ? 'paused' : 'driving';
      setTripStatus(State.trip.status);
      updateTripUI();
      updateOverlayStatus();
    } catch (e) { showToast('상태 변경 실패'); }
  }

  async function endTrip() {
    if (!State.trip.id) return;
    
    // 업로드 중인 사진이 있는지 체크
    const isUploading = State.photos.some(p => !p.uploaded);
    if (isUploading) {
      if (!confirm('아직 서버에 전송 중인 사진이 있습니다. 그래도 운행을 종료하시겠습니까? (미전송 사진은 유실될 수 있습니다)')) return;
    } else {
      if (!confirm('운행을 종료하시겠습니까?')) return;
    }
    
    try {
      const cNo = document.getElementById('container-no')?.value.trim();
      const sNo = document.getElementById('seal-no')?.value.trim();
      const mNo = document.getElementById('trip-memo')?.value.trim();
      
      await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.trip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ 
            action: 'complete',
            container_number: cNo || undefined,
            seal_number: sNo || undefined,
            special_notes: mNo || undefined
        }),
      });
      stopOverlayService();
      stopGPS();
      Store.rm('activeTrip');
      
      // 완전 초기화
      clearTripData();
      
      // 초기화 후, 화면 상단에 종료 일시 표시
      const endTime = new Date();
      const disp = `운송종료: ${formatDate(endTime)}`;
      document.getElementById('trip-date-display').textContent = disp;
      
      showToast('운행이 종료되었습니다.');
    } catch (e) { showToast('종료 실패: ' + e.message); }
  }


  function setTripStatus(status) {
    State.trip.status = status;
    const badge = document.getElementById('header-status');
    const labels = { idle: '대기중', driving: '운송중', paused: '일시정지', completed: '운송종료' };
    const classes = { idle: 'status-idle', driving: 'status-driving', paused: 'status-paused', completed: 'status-done' };
    badge.textContent = labels[status] || '대기중';
    badge.className = 'status-badge ' + (classes[status] || 'status-idle');
  }

  function updateTripUI() {
    const isActive = State.trip.status === 'driving' || State.trip.status === 'paused';
    document.getElementById('trip-start-row').classList.toggle('hidden', isActive);
    document.getElementById('trip-control-row').classList.toggle('hidden', !isActive);
    const pauseBtn = document.getElementById('btn-trip-pause');
    if (pauseBtn) pauseBtn.textContent = State.trip.status === 'paused' ? '재개' : '일시정지';

    if (State.trip.startTime) {
      document.getElementById('trip-date-display').textContent = `운송시작: ${formatDate(new Date(State.trip.startTime))}`;
    }
  }

  // JS에서 운행 상태 확인 (네이티브 뒤로가기 처리용)
  window.isTripActive = () => State.trip.status === 'driving' || State.trip.status === 'paused';

  // 뒤로가기 소비 (Consumed) 여부 반환
  window.handleBackButton = () => {
    if (document.getElementById('photo-viewer').classList.contains('active')) { App.closePhotoViewer(); return true; }
    if (document.getElementById('emergency-popup').classList.contains('active')) { App.closeEmergency(); return true; }
    if (document.getElementById('notice-detail').classList.contains('active')) { App.closeNoticeDetail(); return true; }
    if (document.getElementById('log-detail').classList.contains('active')) { App.closeLogDetail(); return true; }
    if (document.getElementById('screen-settings').classList.contains('active')) {
      if (!State.profile.name || !State.profile.phone || !State.profile.vehicleNo || !State.profile.driverId) return false;
      showScreen('main'); switchTab('trip'); return true;
    }
    if (document.getElementById('screen-main').classList.contains('active')) {
      if (!document.getElementById('tab-trip').classList.contains('active')) {
        switchTab('trip'); return true;
      }
    }
    return false;
  };

  function saveMemo() {
    if (!State.trip.id) return;
    const memo = document.getElementById('trip-memo').value;
    smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.trip.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ special_notes: memo }),
    }).catch(() => {});
  }

  // ─── 오버레이 서비스 ──────────────────────────────────────────
  function startOverlayService() {
    const overlay = Overlay();
    if (!overlay) return;
    overlay.startService({
      tripId: State.trip.id,
      container: State.trip.containerNo || '미입력',
      status: 'driving',
      startTimeMillis: State.trip.startTime,
    }).catch(() => {});
  }

  function updateOverlayStatus() {
    const overlay = Overlay();
    if (!overlay) return;
    overlay.updateStatus({
      status: State.trip.status,
      container: State.trip.containerNo || '미입력',
    }).catch(() => {});
  }

  function stopOverlayService() {
    const overlay = Overlay();
    if (!overlay) return;
    overlay.stopService().catch(() => {});
  }

  // ─── GPS (포그라운드 웹뷰 레이어) ────────────────────────────
  let gpsWatchId = null;
  let lastGpsSend = 0;
  let currentGpsInterval = 60_000;
  const gyroData = { magnitude: 0 };

  function startGPS() {
    if (!navigator.geolocation) return;
    if (gpsWatchId) return;

    // 자이로스코프 리스닝
    if (window.DeviceMotionEvent) {
      window.addEventListener('deviceorientation', handleGyro, { passive: true });
    }

    gpsWatchId = navigator.geolocation.watchPosition(
      pos => onGpsUpdate(pos),
      err => console.warn('GPS error', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  }

  function stopGPS() {
    if (gpsWatchId) { navigator.geolocation.clearWatch(gpsWatchId); gpsWatchId = null; }
    window.removeEventListener('deviceorientation', handleGyro);
  }

  function handleGyro(e) {
    gyroData.magnitude = Math.abs(e.alpha || 0) + Math.abs(e.beta || 0) + Math.abs(e.gamma || 0);
  }

  let tripStatusTimer = null;
  function startTripStatusTimer() {
    if (tripStatusTimer) clearInterval(tripStatusTimer);
    tripStatusTimer = setInterval(updateTripStatusLine, 1000);
  }

  function formatDuration(ms) {
    if (!ms || ms < 0) return '00:00:00';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return [h, m, ss].map(v => String(v).padStart(2, '0')).join(':');
  }

  let lastKnownAddr = '위치 확인 중';
  function updateTripStatusLine() {
    const el = document.getElementById('trip-addr-text');
    const container = document.getElementById('trip-addr-display');
    if (!el || State.trip.status === 'idle') {
      if (container) container.classList.add('hidden');
      return;
    }
    
    const timeStr = formatDuration(Date.now() - State.trip.startTime);
    const gpsStr = `GPS ${Math.round(currentGpsInterval/1000)}s`;
    
    el.textContent = `${timeStr} | ${gpsStr} | ${lastKnownAddr}`;
    if (container) container.classList.remove('hidden');
  }

  async function onGpsUpdate(pos) {
    if (State.trip.status !== 'driving') return;
    const { latitude: lat, longitude: lng, speed } = pos.coords;
    const speedKph = (speed || 0) * 3.6;

    let interval;
    if (speedKph >= 60) interval = 30_000;
    else if (speedKph >= 20) interval = 60_000;
    else if (speedKph >= 5)  interval = 120_000;
    else                      interval = 300_000;

    const isSharpTurn = gyroData.magnitude > 30;
    const now = Date.now();
    if (now - lastGpsSend < (isSharpTurn ? 10_000 : interval)) return;

    lastGpsSend = now;
    currentGpsInterval = interval;

    // 주소 역지오코딩 & 캐싱
    reverseGeocode(lat, lng).then(addr => {
      if (addr) { 
        lastKnownAddr = addr;
        updateTripStatusLine();
      }
    });

    // 서버 전송
    try {
      await smartFetch(BASE_URL + '/api/vehicle-tracking/location', {
        method: 'POST',
        body: JSON.stringify({ trip_id: State.trip.id, lat, lng, speed: speedKph, source: 'webview' }),
      });
    } catch (e) { console.warn('GPS 전송 실패', e); }
  }

  async function reverseGeocode(lat, lng) {
    try {
      const key = Store.get('naverMapKey');
      const url = `https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${lng},${lat}&output=json&orders=legalcode,admcode`;
      // 네이버 지도 API 키가 있을 때만 (없으면 생략)
      if (!key) return null;
      const res = await fetch(url, { headers: { 'X-NCP-APIGW-API-KEY-ID': key } });
      const d = await res.json();
      const area = d?.results?.[0]?.region;
      if (!area) return null;
      return [area.area1?.name, area.area2?.name, area.area3?.name].filter(Boolean).join(' ');
    } catch { return null; }
  }

  // ─── 공지 ─────────────────────────────────────────────────────
  let _notices = [];

  async function loadNotices() {
    document.getElementById('notice-list').innerHTML = '<div class="loading"><div class="spinner"></div>불러오는 중...</div>';
    try {
      const [res1, res2] = await Promise.all([
        smartFetch(`${BASE_URL}/api/vehicle-tracking/notices`).catch(() => null),
        smartFetch(`${BASE_URL}/api/vehicle-tracking/emergency?unread=false`).catch(() => null)
      ]);
      
      let norm = [], emerg = [];
      try {
        if (res1) { 
          const json1 = await res1.json().catch(()=>({})); 
          const d1 = typeof json1 === 'string' ? JSON.parse(json1) : json1;
          console.log('Notice API raw:', d1);
          const rawList = d1.posts || d1.notices || d1.items || (Array.isArray(d1) ? d1 : []);
          norm = Array.isArray(rawList) ? rawList : [];
          console.log('Norm notices count:', norm.length);
        }
      } catch(e) { console.error('Norm load error:', e); }

      try {
        if (res2 && res2.ok) { 
          const json2 = await res2.json().catch(()=>({})); 
          const d2 = typeof json2 === 'string' ? JSON.parse(json2) : json2;
          emerg = Array.isArray(d2?.items) ? d2.items : (Array.isArray(d2) ? d2 : []); 
        }
      } catch(e) { console.error(e); }

      emerg.forEach(e => { e.isEmergency = true; e.title = '[긴급] ' + (e.title||'긴급알림'); });
      
      const merged = [...emerg, ...norm].sort((a,b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
      _notices = merged;
      renderNoticeList();
      
      if (merged.length === 0) {
        console.log('No notices found. norm:', norm.length, 'emerg:', emerg.length);
        document.getElementById('notice-list').innerHTML = '<div class="loading">등록된 공지사항이 없습니다.</div>';
      }
    } catch (e) {
      document.getElementById('notice-list').innerHTML = '<div class="loading">불러오기 실패</div>';
    }
  }

  function renderNoticeList() {
    const read = Store.get('readNotices') || [];
    const html = _notices.map(n => {
      const dateVal = n.created_at || n.date || n.started_at;
      const dateStr = dateVal ? formatDate(new Date(dateVal)) : '—';
      return `
        <div class="notice-item ${read.includes(n.id) ? '' : 'notice-item-unread'}" onclick="App.openNotice('${n.id}')">
          <div class="notice-item-title">${escHtml(n.title || n.message || '제목 없음')}</div>
          <div class="notice-item-meta">${dateStr}</div>
        </div>
      `;
    }).join('') || '<div class="loading">공지사항이 없습니다.</div>';
    document.getElementById('notice-list').innerHTML = html;
  }

  function openNotice(id) {
    // id가 숫자형으로 들어올 수 있으므로 문자열로 찾아보기
    const n = _notices.find(x => String(x.id) === String(id));
    if (!n) return;
    
    document.getElementById('notice-detail-title').textContent = n.title || '제목 없음';
    document.getElementById('notice-detail-meta').textContent  = formatDate(new Date(n.created_at || n.date));
    const bodyText = n.content || n.body || n.message || '';
    document.getElementById('notice-detail-body').innerHTML = escHtml(bodyText).replace(/\n/g, '<br>');
    
    // UI 전환
    document.getElementById('notice-list').style.display = 'none';
    const detail = document.getElementById('notice-detail');
    detail.classList.add('active');
    detail.style.display = 'flex'; // 명시적으로 flex 가동
    document.getElementById('header-back').classList.remove('hidden');

    // 읽음 처리
    const read = Store.get('readNotices') || [];
    if (!read.includes(id)) { read.push(id); Store.set('readNotices', read); }
    detail.scrollTop = 0; // 최상단으로 스크롤 고정
  }

  function closeNoticeDetail() {
    const detail = document.getElementById('notice-detail');
    detail.classList.remove('active');
    detail.style.display = 'none';
    document.getElementById('notice-list').style.display = 'block';
    document.getElementById('header-back').classList.add('hidden');
  }

  //  // 운행 데이터 및 사진 초기화 (설정 버튼 옆 초기화 버튼 및 수시 호출용)
  function clearTripData() {
    // 현재 진행 중인 트립이 있으면 중단
    if (State.trip.id) {
      // 서버에 종료 요청 없이 로컬만 정리
      stopOverlayService();
      stopGPS();
      Store.rm('activeTrip');
    }
    State.trip = { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '' };
    State.photos = [];
    // UI 초기화
    document.getElementById('container-no').value = '';
    document.getElementById('seal-no').value = '';
    document.getElementById('trip-memo').value = '';
    
    renderPhotoThumbs();
    setTripStatus('idle');
    updateTripUI();
    showToast('운행 데이터가 초기화되었습니다.');
  }
  // ─── 사진 업로드 ──────────────────────────────────────────────
  function addPhoto() {
    if (State.photos.length >= 10) { showToast('최대 10장까지 첨부 가능합니다.'); return; }
    document.getElementById('file-input-hidden').click();
  }

  async function onFileSelected(e) {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (State.photos.length >= 10) break;
      const dataUrl = await readFileAsDataURL(file);
      State.photos.push({ dataUrl, uploaded: false, serverUrl: null, file });
    }
    e.target.value = '';
    renderPhotoThumbs();
    uploadPendingPhotos();
  }

  async function resizePhoto(file, maxWidth = 1600, maxHeight = 1600) {
    if (typeof file === 'string') return file;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
          } else {
            if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8)); // 80% 품질 압축
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function readFileAsDataURL(file) {
    if (typeof file === 'string') return Promise.resolve(file);
    if (!file) return Promise.resolve('');
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }


  function renderPhotoThumbs() {
    const scroll = document.getElementById('photo-scroll');
    const addBtn = '<button class="photo-add-btn" id="btn-photo-add" onclick="App.addPhoto()">+</button>';
    const thumbs = State.photos.map((p, i) =>
      `<img class="photo-thumb" src="${p.serverUrl || p.dataUrl}" onclick="App.openPhotoViewer(${i})" alt="사진${i+1}">`
    ).join('');
    scroll.innerHTML = thumbs + (State.photos.length < 10 ? addBtn : '');
    document.getElementById('photo-count-display').textContent = `(${State.photos.length}/10)`;
  }

  async function uploadPendingPhotos() {
    const currentTripId = State.trip.id;
    if (!currentTripId) { console.warn('uploadPendingPhotos: trip.id 없음'); return; }
    
    const pending = State.photos.filter(p => !p.uploaded);
    if (pending.length === 0) return;
    
    let uploadedCount = 0;
    for (let i = 0; i < State.photos.length; i++) {
        const p = State.photos[i];
        if (p.uploaded) continue;

        try {
            const dataUrl = await resizePhoto(p.file || p.dataUrl);
            const base64 = dataUrl.split(',')[1];
            const mime = dataUrl.split(';')[0].split(':')[1] || 'image/jpeg';
            const ext = mime.split('/')[1] || 'jpg';
            const payload = { 
                trip_id: currentTripId, 
                photos: [{ name: `photo_${Date.now()}_${i}.${ext}`, base64, type: mime }] 
            };
            
            const res = await smartFetch(BASE_URL + '/api/vehicle-tracking/photos', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));

            if (data.photos && Array.isArray(data.photos)) {
                // 서버에서 온 전체 목록으로 로컬 상태 동기화
                State.photos = data.photos.map(sp => ({
                    ...sp,
                    uploaded: true,
                    serverUrl: sp.url ? (sp.url.startsWith('http') ? sp.url : BASE_URL + (sp.url.startsWith('/') ? '' : '/') + sp.url) : (sp.serverUrl || sp.dataUrl || '')
                }));
                renderPhotoThumbs();
                uploadedCount++;
            } else if (data.error) {
                console.error('Photo upload error:', data.error);
            }
        } catch (e) {
            console.error('Photo upload catch:', e);
        }
    }

    if (uploadedCount > 0) {
        showToast(`사진 ${uploadedCount}장 업로드 완료`);
    }
  }


  function openPhotoViewer(idx, type = 'trip') {
    State.currentPhotoIdx = idx;
    State.viewerType = type;
    resetZoom();
    
    const delBtn = document.getElementById('photo-viewer-delete-btn');
    // 일지 탭에서도 사진 삭제가 가능하도록 요청하셨으므로 항상 표시하거나 조건부 표시
    if (delBtn) delBtn.style.display = 'inline-block';
    
    document.getElementById('photo-viewer').classList.add('active');
    updatePhotoViewerUI();
  }

  // 일지 전용 뷰어 열기 (기존 코드 호환용)
  function openLogPhoto(url, idx, total) {
    // url 인자는 무시하고 State.logPhotos를 기반으로 동작하도록 통합
    openPhotoViewer(idx, 'log');
  }

  function updatePhotoViewerUI() {
    const isLog = State.viewerType === 'log';
    const photos = isLog ? (State.logPhotos || []) : (State.photos || []);
    const p = photos[State.currentPhotoIdx];
    if (!p) { closePhotoViewer(); return; }

    const url = isLog 
      ? (p.url ? (p.url.startsWith('http') ? p.url : BASE_URL + p.url) : (p.serverUrl || p.dataUrl || ''))
      : (p.serverUrl || p.dataUrl);

    const img = document.getElementById('photo-viewer-img');
    img.src = url;
    document.getElementById('photo-viewer-index').textContent = `${State.currentPhotoIdx + 1} / ${photos.length}`;
  }

  function closePhotoViewer() { 
    document.getElementById('photo-viewer').classList.remove('active'); 
    resetZoom();
  }

  let currentZoom = 1;
  let currentTransX = 0;
  let currentTransY = 0;

  function resetZoom() {
    currentZoom = 1; currentTransX = 0; currentTransY = 0;
    const img = document.getElementById('photo-viewer-img');
    if (img) {
      img.style.transition = 'transform 0.2s ease-out';
      img.style.transform = `translate(0px, 0px) scale(1)`;
    }
  }

  function prevPhoto() { 
    const photos = State.viewerType === 'log' ? State.logPhotos : State.photos;
    if (State.currentPhotoIdx > 0) { 
      State.currentPhotoIdx--; 
      resetZoom();
      updatePhotoViewerUI(); 
    }
  }

  function nextPhoto() {
    const photos = State.viewerType === 'log' ? State.logPhotos : State.photos;
    if (State.currentPhotoIdx < photos.length - 1) { 
      State.currentPhotoIdx++; 
      resetZoom();
      updatePhotoViewerUI(); 
    }
  }

  async function deleteCurrentPhoto() {
    if (!confirm('현재 보고 있는 사진을 삭제하시겠습니까?')) return;
    
    if (State.viewerType === 'log') {
      const photos = [...State.logPhotos];
      photos.splice(State.currentPhotoIdx, 1);
      
      try {
        const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.currentLogId}`, {
          method: 'PATCH',
          body: JSON.stringify({ photos: photos }),
        });
        if (!res.ok) throw new Error('서버 통신 실패');
        State.logPhotos = photos;
        showToast('사진이 삭제되었습니다.');
        
        if (State.logPhotos.length === 0) {
          closePhotoViewer();
        } else {
          if (State.currentPhotoIdx >= State.logPhotos.length) State.currentPhotoIdx = State.logPhotos.length - 1;
          updatePhotoViewerUI();
        }
        openLog(State.currentLogId); // 리스트 UI 갱신
      } catch (e) {
        showToast('사진 삭제 실패: ' + e.message);
      }
      return;
    }

    State.photos.splice(State.currentPhotoIdx, 1);
    if (State.photos.length === 0) {
      closePhotoViewer();
    } else {
      if (State.currentPhotoIdx >= State.photos.length) { State.currentPhotoIdx = State.photos.length - 1; }
      updatePhotoViewerUI();
    }
    renderPhotoThumbs();
  }


  // ─── 일지 ─────────────────────────────────────────────────────
  let _currentLogData = null;

  async function loadLogs() {
    document.getElementById('log-list').innerHTML = '<div class="loading"><div class="spinner"></div>불러오는 중...</div>';
    const date  = document.getElementById('log-date-filter').value;
    const month = document.getElementById('log-month-filter').value;
    const phone = State.profile.phone;
    const vNum  = State.profile.vehicleNo;

    let url = `${BASE_URL}/api/vehicle-tracking/trips?mode=my`;
    if (date)  url += `&date=${date}`;
    else if (month) url += `&month=${month}`;
    if (phone) url += `&phone=${phone}`;
    if (vNum)  url += `&vehicle_number=${encodeURIComponent(vNum)}`;

    try {
      const res  = await smartFetch(url);
      const data = await res.json();
      const trips = data.trips || [];
      if (!trips.length) { document.getElementById('log-list').innerHTML = '<div class="loading">조회 결과가 없습니다.</div>'; return; }
      const statusLabel = { driving: '운송중', paused: '일시정지', completed: '완료' };
      const statusColor = { driving: 'var(--success)', paused: 'var(--warn)', completed: 'var(--text-muted)' };
      document.getElementById('log-list').innerHTML = trips.map(t => {
        let pCount = 0;
        try {
          if (Array.isArray(t.photos)) pCount = t.photos.length;
          else if (typeof t.photos === 'string' && t.photos.trim()) pCount = JSON.parse(t.photos).length;
        } catch(e) {}
        
        return `
          <div class="log-item" onclick="App.openLog('${t.id}')">
            <div class="log-item-header">
              <span class="log-item-container">${escHtml(t.container_number || '컨테이너 미입력')}</span>
              <span class="log-item-status" style="color:${statusColor[t.status]||'var(--text-muted)'};border-color:${statusColor[t.status]||'var(--text-muted)'};">${statusLabel[t.status]||t.status}</span>
            </div>
            <div class="log-item-meta" style="display:flex; justify-content:space-between; align-items:center;">
              <span>${formatDate(new Date(t.started_at))} · ${escHtml(t.vehicle_number||'')}</span>
              ${pCount > 0 ? `<span style="font-size:10px; color:var(--accent); font-weight:700;">📸 ${pCount}장</span>` : ''}
            </div>
          </div>
        `;
      }).join('');

    } catch (e) {
      document.getElementById('log-list').innerHTML = '<div class="loading">불러오기 실패</div>';
    }
  }

  async function openLog(id) {
    try {
      const res  = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${id}`);
      const data = await res.json();
      _currentLogData = data;
      State.currentLogId = id;

      document.getElementById('log-edit-container').value = data.container_number || '';
      document.getElementById('log-edit-seal').value      = data.seal_number || '';
      document.getElementById('log-edit-memo').value      = data.special_notes || '';

      // 기본 정보 (시작/종료 일시 강조)
      document.getElementById('log-detail-content').innerHTML = `
        <div class="log-detail-info-box">
          <div class="log-detail-info-row"><span class="log-detail-info-label">번호</span><span>${escHtml(data.vehicle_number||'—')}</span></div>
          <div class="log-detail-info-row"><span class="log-detail-info-label">시작</span><span style="font-weight:700;color:var(--accent);">${formatDate(new Date(data.started_at))}</span></div>
          ${data.ended_at ? `<div class="log-detail-info-row"><span class="log-detail-info-label">종료</span><span style="font-weight:700;color:var(--danger);">${formatDate(new Date(data.ended_at))}</span></div>` : ''}
          <div class="log-detail-info-row"><span class="log-detail-info-label">상태</span><span>${data.status === 'completed' ? '완료' : (data.status === 'driving' ? '운송중' : (data.status === 'paused' ? '일시정지' : data.status))}</span></div>
          <div class="log-detail-info-row"><span class="log-detail-info-label">제원</span><span>${data.container_type||'—'} / ${data.container_kind||'—'}</span></div>
        </div>
      `;

      // 사진 목록 렌더링
      let photos = [];
      try {
        if (Array.isArray(data.photos)) {
          photos = data.photos;
        } else if (typeof data.photos === 'string' && data.photos.trim() !== '') {
          photos = JSON.parse(data.photos);
        }
      } catch (e) { console.error('Photos parsing failed', e); }
      if (!Array.isArray(photos)) photos = [];
      State.logPhotos = photos;
      const photoSection = document.getElementById('log-photo-section');
      const photoScroll  = document.getElementById('log-photo-scroll');
      if (photoSection && photoScroll) {
        const cnt = document.getElementById('log-photo-count-display');
        if (cnt) cnt.textContent = `(${photos.length}/10)`;

        let html = '<button class="photo-add-btn" onclick="App.addLogPhoto()">+</button>';
        html += photos.map((p, i) => {
          let url = '';
          if (typeof p === 'string') url = p;
          else if (p && p.url) url = p.url;
          else if (p && p.serverUrl) url = p.serverUrl;
          else if (p && p.dataUrl) url = p.dataUrl;

          if (url && !url.startsWith('http') && !url.startsWith('data:')) {
            url = BASE_URL + (url.startsWith('/') ? '' : '/') + url;
          }
          return url ? `<img class="photo-thumb" src="${url}" onclick="App.openLogPhoto('${escHtml(url)}', ${i}, ${photos.length})" alt="사진${i+1}">` : '';
        }).join('');
        photoScroll.innerHTML = html;
      }

      document.getElementById('log-list').style.display = 'none';
      document.getElementById('log-detail').classList.add('active');
      document.getElementById('header-back').classList.remove('hidden');
    } catch (e) { showToast('불러오기 실패'); }
  }

  async function saveLogEdit() {
    if (!State.currentLogId) return;
    try {
      await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.currentLogId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          container_number: document.getElementById('log-edit-container').value,
          seal_number:      document.getElementById('log-edit-seal').value,
          special_notes:    document.getElementById('log-edit-memo').value,
        }),
      });
      showToast('저장되었습니다.');
      closeLogDetail();
      loadLogs();
    } catch (e) { showToast('저장 실패'); }
  }

  async function deleteLog() {
    if (!State.currentLogId || !confirm('이 운행 기록을 삭제하시겠습니까?')) return;
    try {
      const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.currentLogId}`, { method: 'DELETE' });
      if (res && res.ok === false) throw new Error('서버 권한/응답 오류');
      
      // [TDD] 현재 운행 중인 트립을 삭제한 경우, 운행 화면도 초기화 (동기화 이슈 해결)
      if (String(State.currentLogId) === String(State.trip.id)) {
        console.log('Active trip deleted from log. Resetting current trip state.');
        clearTripData(); 
      }

      showToast('삭제되었습니다.');
      closeLogDetail();
      loadLogs();
    } catch (e) { showToast('삭제 실패'); }
  }

  function closeLogDetail() {
    document.getElementById('log-detail').classList.remove('active');
    document.getElementById('log-list').style.display = '';
    document.getElementById('header-back').classList.add('hidden');
    State.currentLogId = null;
  }

  function addLogPhoto() {
    if ((State.logPhotos || []).length >= 10) { showToast('최대 10장까지 첨부 가능합니다.'); return; }
    document.getElementById('log-file-input-hidden').click();
  }

  async function onLogFileSelected(e) {
    const files = Array.from(e.target.files);
    e.target.value = '';
    
    if (!State.currentLogId) return;
    
    const photos = State.logPhotos || [];
    if (photos.length >= 10) { showToast('최대 10장까지만 가능합니다.'); return; }
    
    const uploadCount = Math.min(files.length, 10 - photos.length);
    if (uploadCount <= 0) return;

    showToast(`사진 ${uploadCount}장을 업로드 중입니다...`, 5000);
    
    try {
      showToast(`사진 ${uploadCount}장을 압축/업로드 중...`, 5000);
      let successCount = 0;
      
      for (let i = 0; i < uploadCount; i++) {
        const file = files[i];
        const dataUrl = await resizePhoto(file);
        const base64 = dataUrl.split(',')[1];
        const mime = dataUrl.split(';')[0].split(':')[1] || 'image/jpeg';
        const ext = mime.split('/')[1] || 'jpg';
        
        const payload = { 
            trip_id: State.currentLogId, 
            photos: [{ name: `photo_${Date.now()}_${i}.${ext}`, base64, type: mime }] 
        };
        
        const res = await smartFetch(BASE_URL + '/api/vehicle-tracking/photos', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        
        if (data.photos && Array.isArray(data.photos)) {
          State.logPhotos = data.photos;
          successCount++;
          renderPhotoThumbs(); // 썸네일 즉시 갱신
        }
      }

      if (successCount > 0) {
        await openLog(State.currentLogId); // UI 최종 갱신
        showToast(`사진 ${successCount}장 업로드 성공`);
      }
    } catch (err) {
      console.error('onLogFileSelected error', err);
      showToast('업로드 중 오류 발생');
    }
  }


  // ─── 긴급알림 ─────────────────────────────────────────────────
  let emergencyPollTimer = null;

  function startEmergencyPoll() {
    if (emergencyPollTimer) return;
    pollEmergency();
    emergencyPollTimer = setInterval(pollEmergency, 30_000);
  }

  async function pollEmergency() {
    try {
      const res  = await smartFetch(`${BASE_URL}/api/vehicle-tracking/emergency?unread=true`);
      const data = await res.json();
      const items = data.items || [];
      for (const item of items) {
        if (State.emergencyIds.has(item.id)) continue;
        State.emergencyIds.add(item.id);
        showEmergencyPopup(item);
        sendNativeEmergencyNotif(item);
      }
    } catch (e) { /* 조용히 실패 */ }
  }

  function showEmergencyPopup(item) {
    document.getElementById('emergency-body').textContent = item.message || item.content || '';
    document.getElementById('emergency-popup').classList.add('active');
  }

  function closeEmergency() { document.getElementById('emergency-popup').classList.remove('active'); }

  function sendNativeEmergencyNotif(item) {
    const em = Emergency();
    if (em) {
      em.showEmergencyAlert({ title: '⚠️ ELS 긴급알림', message: item.message || '', id: item.id }).catch(() => {});
    }
  }

  // ─── 업데이트 확인 ────────────────────────────────────────────
  async function checkUpdate(auto = false) {
    try {
      const res = await smartFetch(VERSION_URL + '?t=' + Date.now()).catch(() => null);
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      
      const currentCode = 110; // Build 110 (v4.1.64)
      const remoteVersion = (data.latestVersion || '').trim();
      const localVersion = APP_VERSION.trim();

      if (data.versionCode > currentCode || (remoteVersion !== localVersion && remoteVersion !== '' && !localVersion.includes(remoteVersion))) {
        const msg = `새로운 버전(${data.latestVersion})이 출시되었습니다.\n\n[변경내용]\n${data.changeLog}\n\n지금 설치하시겠습니까? (미설치 시 일부 기능이 제한될 수 있습니다.)`;
        if (confirm(msg)) {
          if (window.Capacitor?.Plugins?.Browser) {
            window.Capacitor.Plugins.Browser.open({ url: data.downloadUrl });
          } else {
            window.open(data.downloadUrl, '_blank');
          }
        } else if (auto) {
          showToast('원활한 환경을 위해 최신 버전으로 업데이트 해 주세요.', 5000);
        }
      } else if (!auto) {
        showToast('이미 최신 버전입니다 (v' + APP_VERSION + ')');
      }
    } catch (e) {
      if (!auto) console.error('업데이트 확인 실패', e);
    }
  }

  // ─── 앱 종료 ──────────────────────────────────────────────────
  function exitApp() {
    if (window.isTripActive()) {
      showToast('운행 중에는 종료할 수 없습니다. 운행 종료 후 앱 종료가 가능합니다.');
      return;
    }
    if (!confirm('앱을 종료하시겠습니까?')) return;
    
    if (window.Capacitor?.Plugins?.App) {
      window.Capacitor.Plugins.App.exitApp();
    } else {
      showToast('앱을 직접 닫아주세요.');
    }
  }

  // ─── 유틸 ─────────────────────────────────────────────────────
  function formatDate(d) {
    if (!(d instanceof Date) || isNaN(d)) return '—';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  let toastTimer = null;
  function showToast(msg, ms = 2500) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }


  async function manualRefreshPerms() {
    showToast('권한 상태를 확인 중입니다...');
    await updatePermStatuses();
    showToast('권한 상태가 새로고침되었습니다.');
  }


  // ─── 공개 API ─────────────────────────────────────────────────
  window.App = {
    // 권한
    requestPerm, updatePermStatuses, manualRefreshPerms, finishPermSetup, openPermissionSetup, clearCache, settingsBack, resetApp,
    showTerms, closeTerms,
    // 프로필
    saveProfile, lookupDriver,
    // 운행
    onTripFieldChange, startTrip, togglePause, endTrip, saveMemo, clearTripData,
    // 네비
    switchTab, headerBack, showScreen, openSettings, handleBackButton: () => window.handleBackButton(),
    // 공지
    openNotice, closeNoticeDetail,
    // 사진
    addPhoto, onFileSelected, openPhotoViewer, closePhotoViewer, prevPhoto, nextPhoto, deleteCurrentPhoto,
    // 일지
    loadLogs, openLog, saveLogEdit, deleteLog, closeLogDetail, openLogPhoto, addLogPhoto, onLogFileSelected,
    // 긴급
    closeEmergency,
    // 업데이트/종료
    checkUpdate, exitApp,
  };

  // ─── 핀치 줌 (사진 두 손가락 확대) ──────────────────────────────────────────
  function initPinchZoom() {
    const wrap = document.getElementById('photo-viewer-wrap');
    const img = document.getElementById('photo-viewer-img');
    if (!wrap || !img) return;

    let initialDist = 0;
    let baseScale = 1;
    let isDragging = false;
    let startX = 0; let startY = 0;
    let lastTap = 0;

    wrap.addEventListener('touchstart', e => {
      // 더블 탭 체크
      const now = Date.now();
      if (e.touches.length === 1 && (now - lastTap) < 300) {
        if (currentZoom > 1.5) resetZoom();
        else {
          currentZoom = 3;
          img.style.transition = 'transform 0.3s ease-out';
          img.style.transform = `translate(0px, 0px) scale(${currentZoom})`;
        }
        lastTap = 0;
        return;
      }
      lastTap = now;

      if (e.touches.length === 2) {
        e.preventDefault();
        initialDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        baseScale = currentZoom;
        img.style.transition = 'none';
      } else if (e.touches.length === 1 && currentZoom > 1) {
        isDragging = true;
        startX = e.touches[0].pageX - currentTransX;
        startY = e.touches[0].pageY - currentTransY;
        img.style.transition = 'none';
      }
    }, { passive: false });

    wrap.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        currentZoom = Math.min(Math.max(baseScale * (dist / initialDist), 1), 6);
        
        // 축소가 1이 되면 중심 초기화
        if (currentZoom <= 1.01) { currentTransX = 0; currentTransY = 0; }
        
        img.style.transform = `translate(${currentTransX}px, ${currentTransY}px) scale(${currentZoom})`;
      } else if (e.touches.length === 1 && isDragging && currentZoom > 1) {
        e.preventDefault();
        currentTransX = e.touches[0].pageX - startX;
        currentTransY = e.touches[0].pageY - startY;
        
        // 경계 제한 (대략적인 보정)
        const limitX = (currentZoom - 1) * (window.innerWidth / 2);
        const limitY = (currentZoom - 1) * (window.innerHeight / 2);
        currentTransX = Math.min(Math.max(currentTransX, -limitX), limitX);
        currentTransY = Math.min(Math.max(currentTransY, -limitY), limitY);
        
        img.style.transform = `translate(${currentTransX}px, ${currentTransY}px) scale(${currentZoom})`;
      }
    }, { passive: false });

    wrap.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        isDragging = false;
        if (currentZoom <= 1.05) {
          resetZoom();
        }
      }
    });
  }


  // 시작
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); initPinchZoom(); });
  } else {
    init(); initPinchZoom();
  }

})();
