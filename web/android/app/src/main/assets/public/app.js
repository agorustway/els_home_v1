/**
 * ELS Driver App v4.0
 * 단일 IIFE 번들 — Capacitor 플러그인 브릿지 사용
 */
(function () {
  'use strict';
  console.log('ELS Driver App Loading... v4.2.59');

  const APP_VERSION = 'v4.2.62';
  const BUILD_CODE = 206; // Build 206 (v4.2.62)
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
        } catch (e) { console.warn(`Manual registration for ${name} failed`, e); }
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

      const payload = { msg, device: 'Mobile', tag };
      fetch(BASE_URL + '/api/debug/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => { });
    } catch (e) { }
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
    set: (k, v) => { try { localStorage.setItem('els_' + k, JSON.stringify(v)); } catch { } },
    rm: (k) => { try { localStorage.removeItem('els_' + k); } catch { } },
  };

  let realtimeExpireAt = 0;
  function startRealtimeMode() {
    State.trip.isRealtime = true;
    realtimeExpireAt = Date.now() + 60000; // 1분 절대 시간
    updateTripStatusLine();
    // [v4.2.48] 네이티브 오버레이에 실시간 모드 즉시 동기화 → GPS 주기 3초로 전환
    _syncRealtimeModeToNative(true);
    remoteLog("실시간 고정밀 관제 모드 시작 (1분)", "SYSTEM");
  }
  function stopRealtimeMode() {
    State.trip.isRealtime = false;
    realtimeExpireAt = 0;
    updateTripStatusLine();
    // [v4.2.48] 네이티브 오버레이에 실시간 모드 종료 동기화 → GPS 주기 60초로 복원
    _syncRealtimeModeToNative(false);
    remoteLog("실시간 고정밀 관제 모드 수동 종료", "SYSTEM");
  }
  function _syncRealtimeModeToNative(isRealtime) {
    const overlay = Overlay();
    if (!overlay) return;
    overlay.updateStatus({
      status: State.trip.status,
      isRealtime: isRealtime,
    }).catch(() => { });
  }

  // ─── 점검체크리스트 ──────────────────────────────────────────
  function openChecklist() {
    document.getElementById('checklist-popup').classList.add('active');
  }
  function closeChecklist() {
    document.getElementById('checklist-popup').classList.remove('active');
  }
  function saveChecklist() {
    const checks = ['chk_brake', 'chk_tire', 'chk_lamp', 'chk_cargo', 'chk_driver'];
    for (const id of checks) {
      if (!document.getElementById(id).checked) {
        showToast('모든 법정 필수 점검 항목에 체크해야 합니다.');
        return;
      }
    }
    State.preTripDone = {
      chk_brake: true,
      chk_tire: true,
      chk_lamp: true,
      chk_cargo: true,
      chk_driver: true
    };
    closeChecklist();
    const btnCheck = document.getElementById('btn-trip-checklist');
    if (btnCheck) {
      btnCheck.style.background = '#2563eb'; // blue
      btnCheck.style.color = '#ffffff';
    }
    showToast('운행 전 점검 완료! 이제 운행 시작이 가능합니다.');
  }

  // ─── 상태 ─────────────────────────────────────────────────────
  const State = {
    profile: { name: '', phone: '', vehicleNo: '', driverId: '' },
    trip: { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '', isRealtime: false },
    photos: [], // { dataUrl, uploaded, serverUrl }
    notices: [],
    logs: [],
    currentNoticeId: null,
    currentLogId: null,
    currentPhotoIdx: 0,
    emergencyIds: new Set(Store.get('emergencyIds') || []),
    pendingUpdate: false, // 운행 중 업데이트 유예 플래그
    preTripDone: null, // 운행 전 점검 항목
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
            // 1. 권한 상태 갱신 (느리게 반영될 수 있어 다중 체크)
            setTimeout(() => { updatePermStatuses(); }, 300);
            setTimeout(() => { updatePermStatuses(); }, 1200);

            // 2. [v4.2.43] 실시간 명령 즉시 수신 (30초 딜레이 제거)
            //    화면 꺼짐->켜짐 직후 대기 없이 폴링하여 웹 실시간 버튼 반응성 향상
            pollEmergency().catch(() => { });

            // 3. [v4.2.48] 백그라운드 GPS 복구 (오탐 방지 강화)
            //    핵심 변경: lastGpsTimestamp를 미리 세팅하지 않음
            //    → getCurrentPosition 성공 콜백에서만 갱신하여 복귀 직후 빨간색 오탐 제거
            //    단, watchPosition 자체는 백그라운드에서도 작동하므로 timestamp는 살아있을 가능성 높음
            if (State.trip.status === 'driving') {
              const resumeDelay = 500; // 앱 포커스 안정화 대기 (800→500ms 단축)
              
              const Prefs = window.Capacitor?.Plugins?.Preferences;
              if (Prefs) {
                Prefs.get({ key: 'LAST_NATIVE_GPS_TIME' }).then(res => {
                  if (res && res.value) {
                    const nativeTime = parseInt(res.value, 10);
                    if (nativeTime && nativeTime > (lastGpsTimestamp || 0)) {
                      lastGpsTimestamp = nativeTime;
                      remoteLog(`포그라운드 복귀: 네이티브 GPS 시간 동기화 (${new Date(nativeTime).toLocaleTimeString()})`, 'GPS_SYNC');
                    }
                  }
                }).catch(() => {});
              }

              setTimeout(() => {
                const now = Date.now();
                const elapsed = now - (lastGpsTimestamp || 0);
                // [v4.2.48] 90초 이상 GPS 공백 시에만 재기동 (과도한 재기동 방지)
                const isGpsDead = !lastGpsTimestamp || elapsed > 90_000;

                if (isGpsDead || !gpsWatchId) {
                  remoteLog(`포그라운드 복귀: GPS 끊김 감지 (${Math.round(elapsed / 1000)}s 공백) → 재기동`, 'GPS_RESUME');
                  stopGPS();
                  startGPS();
                  return; // startGPS() 내부에서 getCurrentPosition 호출하므로 중복 제거
                }

                // [v4.2.48] GPS가 살아있는 경우 강제 1회 수신만 수행 (lastGpsTimestamp는 미리 세팅 안 함)
                // 성공 시에만 타임스탬프 갱신 → 빨간색 오탐 방지
                navigator.geolocation.getCurrentPosition(
                  pos => {
                    lastGpsTimestamp = Date.now(); // 성공 후에만 갱신 (핵심)
                    onGpsUpdate(pos, true, State.trip.id);
                    remoteLog(`포그라운드 복귀 후 GPS 강제수신 성공 (${Math.round(elapsed / 1000)}s 공백)`, 'GPS_RESUME_OK');
                  },
                  err => {
                    // [v4.2.48] 실패해도 기존 timestamp 유지 (음영지역으로 판단, 네이티브 watchdog이 처리)
                    remoteLog(`포그라운드 복귀 강제수신 실패: ${err.code} (네이티브 watchdog 처리 중)`, 'GPS_RESUME_ERR');
                  },
                  { enableHighAccuracy: true, timeout: 6000, maximumAge: 3000 } // maximumAge 3초 허용 (과도한 타임아웃 방지)
                );
              }, resumeDelay);
            }
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
      window.Capacitor.Plugins.StatusBar.setStyle({ style: 'DARK' }).catch(() => { });
      window.Capacitor.Plugins.StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(() => { });
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

    // 일지 기본 필터를 현재 월(YYYY-MM)로 설정
    const now = new Date();
    const monthStr = now.toISOString().slice(0, 7); // YYYY-MM
    const monFilter = document.getElementById('log-month-filter');
    if (monFilter && !monFilter.value) monFilter.value = monthStr;

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

    if (tab === 'notice') loadNotices();
    if (tab === 'log') loadLogs();
  }

  // ─── 프로필 UI ───────────────────────────────────────────────
  function applyProfileToUI() {
    document.getElementById('s-name').value = State.profile.name;
    document.getElementById('s-phone').value = State.profile.phone;
    document.getElementById('s-vehicle').value = State.profile.vehicleNo;
    document.getElementById('s-id').value = State.profile.driverId;
    document.getElementById('header-vehicle').textContent = State.profile.vehicleNo || '—';

    // 프로필 사진 섹션 표시 및 저장된 사진 렌더링
    const pSection = document.getElementById('settings-profile-photos');
    if (pSection && (State.profile.name || State.profile.phone)) {
      pSection.style.display = 'flex';
      updateProfilePhoto('p-photo-driver', State.profile.photo_driver, '운');
      updateProfilePhoto('p-photo-vehicle', State.profile.photo_vehicle, '차');
      updateProfilePhoto('p-photo-chassis', State.profile.photo_chassis, '샤');
    }
  }

  function saveProfile() {
    const name = document.getElementById('s-name').value.trim();
    // [보완] -나 공백 및 글자 등 숫자 외의 모든 특수문자 완전히 제거 후 저장
    const phone = document.getElementById('s-phone').value.replace(/[^0-9]/g, '');
    const vehicleNo = document.getElementById('s-vehicle').value.trim();
    const driverId = document.getElementById('s-id').value.trim().toUpperCase();

    // 화면 필드에 먼저 정상(숫자만) 형태 반영
    document.getElementById('s-phone').value = phone;

    if (!name || !phone || !vehicleNo || !driverId) {
      showToast('이름, 전화번호, 차량번호, 기사 ID를 모두 입력해 주세요.');
      return;
    }

    // 기존 프로필 데이터(사진 등)는 보존하고 입력 필드만 덮어씀
    State.profile = { ...State.profile, name, phone, vehicleNo, driverId };
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
          photo_driver: State.profile.photo_driver,
          photo_vehicle: State.profile.photo_vehicle,
          photo_chassis: State.profile.photo_chassis,
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
        document.getElementById('s-name').value = d.name || '';
        document.getElementById('s-vehicle').value = d.vehicle_number || d.business_number || '';
        document.getElementById('s-id').value = d.vehicle_id || d.driver_id || '';

        // 프로필 사진 업데이트
        const pSection = document.getElementById('settings-profile-photos');
        if (pSection) {
          pSection.style.display = 'flex';
          updateProfilePhoto('p-photo-driver', d.photo_driver, '운');
          updateProfilePhoto('p-photo-vehicle', d.photo_vehicle, '차');
          updateProfilePhoto('p-photo-chassis', d.photo_chassis, '샤');

          // State에도 저장 (저장 버튼 클릭 시 함께 전송되도록)
          State.profile.photo_driver = d.photo_driver;
          State.profile.photo_vehicle = d.photo_vehicle;
          State.profile.photo_chassis = d.photo_chassis;
        }

        showToast('기사 정보를 불러왔습니다.');
      } else {
        showToast('해당 전화번호로 등록된 기사 정보가 없습니다.');
      }
    } catch (e) { showToast('조회 실패: ' + e.message); }
  }

  function updateProfilePhoto(id, url, fallback) {
    const el = document.getElementById(id);
    if (!el) return;
    if (url) {
      const fullUrl = url.startsWith('http') || url.startsWith('data:') ? url : BASE_URL + (url.startsWith('/') ? '' : '/') + url;
      el.style.backgroundImage = `url('${fullUrl}')`;
      el.textContent = '';
      el.style.borderStyle = 'solid';
    } else {
      el.style.backgroundImage = 'none';
      el.textContent = fallback;
      el.style.borderStyle = 'dashed';
    }
  }

  async function pickProfilePhoto(type) {
    try {
      const Camera = window.Capacitor?.Plugins?.Camera;
      if (!Camera) {
        showToast('카메라 기능을 사용할 수 없습니다.');
        return;
      }

      const image = await Camera.getPhoto({
        quality: 70,
        width: 1000,
        height: 1000,
        allowEditing: false,
        resultType: 'base64',
        source: 'PROMPT', // 카메라/갤러리 선택 팝업
        saveToGallery: false,
        promptLabelHeader: '사진 선택',
        promptLabelCancel: '취소',
        promptLabelPhoto: '앨범에서 선택',
        promptLabelPicture: '사진 촬영'
      });

      const dataUrl = `data:image/jpeg;base64,${image.base64String}`;

      if (type === 'driver') State.profile.photo_driver = dataUrl;
      if (type === 'vehicle') State.profile.photo_vehicle = dataUrl;
      if (type === 'chassis') State.profile.photo_chassis = dataUrl;

      updateProfilePhoto('p-photo-' + type, dataUrl, '');
      showToast('사진이 선택되었습니다. 정보 저장 시 업로드됩니다.');
    } catch (e) {
      console.warn('pickProfilePhoto skip', e);
    }
  }

  function handleProfilePhotoClick(type) {
    if (State.profile[`photo_${type}`]) {
      const types = ['driver', 'vehicle', 'chassis'];
      State.profilePhotos = [];
      let idxToOpen = 0;
      for (const t of types) {
        if (State.profile[`photo_${t}`]) {
          if (t === type) idxToOpen = State.profilePhotos.length;
          State.profilePhotos.push({
            type: t,
            dataUrl: State.profile[`photo_${t}`]
          });
        }
      }
      openPhotoViewer(idxToOpen, 'profile');
    } else {
      pickProfilePhoto(type);
    }
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
      // Fallback: browser API check
      try {
        const p = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
        if (p) setPermStatus('loc', p.state === 'granted');
      } catch (e) { }
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
    const Notif = window.Capacitor?.Plugins?.LocalNotifications || window.Capacitor?.Plugins?.PushNotifications;
    if (Notif) {
      try {
        const p = await Notif.checkPermissions().catch(() => ({ display: 'denied', receive: 'denied' }));
        setPermStatus('notif', p.display === 'granted' || p.receive === 'granted' || p.notif === 'granted');
      } catch (e) { console.warn('Notif check fail', e); }
    } else if ('Notification' in window) {
      setPermStatus('notif', Notification.permission === 'granted');
    }

    // 최종 강제 동기화
    for (const k in permStatuses) { setPermStatus(k, permStatuses[k]); }

    const allOk = permStatuses.loc && permStatuses.camera && permStatuses.notif && permStatuses.overlay && permStatuses.battery;
    const btnFinish = document.getElementById('btn-finish-setup');
    if (btnFinish) {
      if (allOk) {
        btnFinish.style.setProperty('background', '#111827', 'important');
        btnFinish.style.setProperty('opacity', '1', 'important');
        btnFinish.style.setProperty('pointer-events', 'auto', 'important');
      } else {
        btnFinish.style.setProperty('background', '#ef4444', 'important');
        btnFinish.style.setProperty('opacity', '0.7', 'important');
        btnFinish.style.setProperty('pointer-events', 'none', 'important');
      }
    }

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
      switch (type) {
        case 'location':
          alert('화면이 꺼졌을 때도 위치 상태를 추적하려면 설정에서 반드시 [항상 허용]을 선택해야 합니다.');
          if (window.Capacitor?.Plugins?.Geolocation) {
            await window.Capacitor.Plugins.Geolocation.requestPermissions();
          }
          break;
        case 'camera':
          if (window.Capacitor?.Plugins?.Camera) {
            await window.Capacitor.Plugins.Camera.requestPermissions();
          } else {
            try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop()); } catch (e) { }
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
    } catch (e) {
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
  let _tripFieldSaveTimer = null;
  function onTripFieldChange() {
    const cEl = document.getElementById('container-no');
    const sEl = document.getElementById('seal-no');

    // [TDD] 무조건 영문 대문자와 숫자만 허용 (공백/특수문자 원천 차단)
    cEl.value = cEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    sEl.value = sEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();

    State.trip.containerNo = cEl.value;
    State.trip.sealNo = sEl.value;

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
            if (errEl) { errEl.textContent = '컨테이너번호 오기입'; errEl.style.color = 'var(--danger)'; }
          }
        } else {
          if (errEl) { errEl.textContent = '입력 중...'; errEl.style.color = 'var(--text-muted)'; }
        }
      } else {
        if (errEl) { errEl.textContent = '영문 4자 + 숫자 7자'; errEl.style.color = 'var(--danger)'; }
      }
    }

    // 운행 중 실시간 정보 수정 시 서버에 전송 (1초 디바운스)
    if (State.trip.id && (State.trip.status === 'driving' || State.trip.status === 'paused')) {
      const cType = document.getElementById('container-type') ? document.getElementById('container-type').value : undefined;
      const cKind = document.getElementById('container-kind') ? document.getElementById('container-kind').value : undefined;

      clearTimeout(_tripFieldSaveTimer);
      _tripFieldSaveTimer = setTimeout(() => {
        smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.trip.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            container_number: cEl.value || '',
            seal_number: sEl.value || '',
            container_type: cType,
            container_kind: cKind
          }),
        }).catch(() => {
          // 조용히 실패 (수시 저장이므로 불필요한 알람 억제)
        });
      }, 1000);
    }
  }

  function validateISO6346(str) {
    const charMap = {
      'A': 10, 'B': 12, 'C': 13, 'D': 14, 'E': 15, 'F': 16, 'G': 17, 'H': 18, 'I': 19, 'J': 20, 'K': 21, 'L': 23, 'M': 24,
      'N': 25, 'O': 26, 'P': 27, 'Q': 28, 'R': 29, 'S': 30, 'T': 31, 'U': 32, 'V': 34, 'W': 35, 'X': 36, 'Y': 37, 'Z': 38
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
        document.getElementById('seal-no').value = State.trip.sealNo;
        document.getElementById('container-type').value = data.container_type || '40FT';
        document.getElementById('container-kind').value = data.container_kind || 'DRY';
        document.getElementById('trip-memo').value = data.special_notes || '';

        // 사진 데이터 복구 (서버 -> 로컬 State)
        let photos = [];
        try {
          if (Array.isArray(data.photos)) photos = data.photos;
          else if (typeof data.photos === 'string' && data.photos.trim()) photos = JSON.parse(data.photos);
        } catch (e) { console.error('loadCurrentTrip photos parse err', e); }

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

    if (!State.preTripDone) {
      openChecklist();
      showToast('안전 운행을 위해 [운행전점검] 필수 항목을 모두 체크해주세요.');
      return;
    }

    const containerNo = document.getElementById('container-no').value.trim();
    const sealNo = document.getElementById('seal-no').value.trim();
    const cType = document.getElementById('container-type').value;
    const cKind = document.getElementById('container-kind').value;
    const memo = document.getElementById('trip-memo').value;

    try {
      const res = await smartFetch(BASE_URL + '/api/vehicle-tracking/trips', {
        method: 'POST',
        body: JSON.stringify({
          driver_name: State.profile.name,
          driver_phone: State.profile.phone,
          vehicle_number: State.profile.vehicleNo,
          vehicle_id: State.profile.driverId,
          container_number: containerNo,
          seal_number: sealNo,
          container_type: cType,
          container_kind: cKind,
          special_notes: memo,
          chk_brake: State.preTripDone.chk_brake || false,
          chk_tire: State.preTripDone.chk_tire || false,
          chk_lamp: State.preTripDone.chk_lamp || false,
          chk_cargo: State.preTripDone.chk_cargo || false,
          chk_driver: State.preTripDone.chk_driver || false,
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
      // [v4.2.48] 시작 즉시 현재 위치 + TRIP_START 이벤트 마킹
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => onGpsUpdate(pos, true, State.trip.id, 'TRIP_START').catch(() => { }),
          null,
          { enableHighAccuracy: true }
        );
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

      // [v4.2.48] 일시정지/재개 이벤트 마킹 (TRIP_PAUSE or TRIP_RESUME)
      if (navigator.geolocation) {
        const marker = action === 'pause' ? 'TRIP_PAUSE' : 'TRIP_RESUME';
        navigator.geolocation.getCurrentPosition(
          pos => onGpsUpdate(pos, true, State.trip.id, marker).catch(() => { }),
          null,
          { enableHighAccuracy: true }
        );
      }

      if (State.trip.status === 'paused') {
        stopGPS();
      } else {
        lastGpsTimestamp = Date.now(); // 재개 시 즉각 수신안됨 오표기 방지
        startGPS();
      }

      updateTripUI();
      updateTripStatusLine(); // 즉시 UI 및 오버레이 반영
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

    // [v4.2.48] 종료 즉시 현재 위치 + TRIP_END 이벤트 마킹
    if (navigator.geolocation) {
      const closingTripId = State.trip.id;
      navigator.geolocation.getCurrentPosition(
        pos => onGpsUpdate(pos, true, closingTripId, 'TRIP_END').catch(() => { }),
        null,
        { enableHighAccuracy: true }
      );
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

      // 완전 초기화 (강제우회 true 필요)
      clearTripData(true);

      // 상태바(운송대기 등) 초기화
      updateTripStatusLine();

      showToast('운행이 안전하게 종료되었습니다.');

      // 유예된 업데이트가 있다면 종료 후 팝업
      if (State.pendingUpdate) {
        State.pendingUpdate = false;
        setTimeout(() => checkUpdate(true), 1500);
      }
    } catch (e) { showToast('종료 실패: ' + e.message); }
  }


  function setTripStatus(status) {
    State.trip.status = status;
    const badge = document.getElementById('header-status');
    const labels = { idle: '대기중', driving: '운행중', paused: '일시정지', completed: '운행종료' };
    const classes = { idle: 'status-idle', driving: 'status-driving', paused: 'status-paused', completed: 'status-done' };
    badge.textContent = labels[status] || '대기중';
    badge.className = 'status-badge ' + (classes[status] || 'status-idle');
  }

  function updateTripUI() {
    const isActive = State.trip.status === 'driving' || State.trip.status === 'paused';
    document.getElementById('trip-start-row').classList.toggle('hidden', isActive);
    document.getElementById('trip-control-row').classList.toggle('hidden', !isActive);
    const pauseBtn = document.getElementById('btn-trip-pause');
    if (pauseBtn) pauseBtn.textContent = State.trip.status === 'paused' ? '운행 재개' : '일시정지';

    if (State.trip.startTime) {
      // 텍스트만 업데이트하도록 변경하여 innerHTML 간섭 최소화
      const dateEl = document.getElementById('trip-date-display');
      if (dateEl && !dateEl.innerHTML.includes('|')) {
        dateEl.textContent = `운송시작: ${formatDate(new Date(State.trip.startTime))}`;
      }
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
    }).catch(() => { });
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
    }).catch(() => { });
  }

  function updateOverlayStatus() {
    const overlay = Overlay();
    if (!overlay) return;
    overlay.updateStatus({
      status: State.trip.status,
      container: State.trip.containerNo || '미입력',
    }).catch(() => { });
  }

  function stopOverlayService() {
    const overlay = Overlay();
    if (!overlay) return;
    overlay.stopService().catch(() => { });
  }

  // ─── GPS (포그라운드 웹뷰 레이어) ────────────────────────────
  let gpsWatchId = null;
  let lastGpsSend = 0;
  let currentGpsInterval = 60_000;
  const gyroData = { magnitude: 0 };

  function startGPS() {
    if (!navigator.geolocation) {
      remoteLog('navigator.geolocation 없음 - GPS 불가', 'GPS_FATAL');
      return;
    }
    if (gpsWatchId) return;

    remoteLog('startGPS() called - watchPosition 시작', 'GPS_INIT');

    // 자이로스코프 리스닝 (DeviceOrientationEvent 사용)
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleGyro, { passive: true });
    }
    // 가속도 센서도 추가 (자이로 없는 기기 대응)
    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', handleMotion, { passive: true });
    }

    // 즉시 1회 강제 수신 (운행 시작 초기 공백 방지)
    navigator.geolocation.getCurrentPosition(
      pos => {
        lastGpsTimestamp = Date.now();
        remoteLog(`GPS 초기수신 성공: ${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)} acc:${pos.coords.accuracy?.toFixed(0)}m`, 'GPS_INIT');
        onGpsUpdate(pos, true, State.trip.id);
      },
      err => remoteLog(`GPS 초기수신 실패: ${err.code} ${err.message}`, 'GPS_INIT_ERR'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    gpsWatchId = navigator.geolocation.watchPosition(
      pos => {
        // [중요] watchPosition 콜백 시점에 즉시 타임스탬프 갱신 → '수신안됨' 오표시 방지
        lastGpsTimestamp = Date.now();
        onGpsUpdate(pos, false);
      },
      err => {
        remoteLog(`GPS watchPosition 에러: code=${err.code} msg=${err.message}`, 'GPS_WATCH_ERR');
        console.warn('GPS watch error', err.code, err.message);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    );
    remoteLog(`GPS watchPosition 등록됨 ID=${gpsWatchId}`, 'GPS_INIT');
  }

  function stopGPS() {
    if (gpsWatchId) {
      navigator.geolocation.clearWatch(gpsWatchId);
      remoteLog(`GPS watchPosition 해제 ID=${gpsWatchId}`, 'GPS_STOP');
      gpsWatchId = null;
    }
    window.removeEventListener('deviceorientation', handleGyro);
    window.removeEventListener('devicemotion', handleMotion);
    lastGpsTimestamp = 0;
  }

  function handleGyro(e) {
    // 방향 변화량을 자이로 magnitude로 사용
    gyroData.magnitude = Math.abs(e.alpha || 0) + Math.abs(e.beta || 0) + Math.abs(e.gamma || 0);
  }

  function handleMotion(e) {
    // 가속도센서 fallback: 급가속/감속 감지
    const acc = e.acceleration;
    if (acc) {
      const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
      // 가속도 기반으로 자이로 값 보정 (자이로 없는 기기)
      if (gyroData.magnitude < 10) gyroData.magnitude = Math.max(gyroData.magnitude, mag * 3);
    }
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

  let lastGpsTimestamp = 0;
  let lastKnownAddr = '위치 확인 중...';

  function abbreviateAddr(full) {
    if (!full || full.includes('확인 중')) return full;
    // [TDD] 서울특별시 강남구 역삼동 -> 서울 강남 역삼 (축약 강화)
    return full.split(' ')
      .map(s => s.replace(/특별시|광역시|특별자치시|특별자치도/g, '')
        .replace(/(도|시|구|동|읍|면|리)$/g, ''))
      .filter(s => s.length > 0)
      .join(' ');
  }

  function updateTripStatusLine() {
    // [신규] 백그라운드 환경에서는 setTimeout이 지연/무시되므로 절대 시간으로 실시간 모드 만료 체크
    if (State.trip.isRealtime && Date.now() > realtimeExpireAt) {
      State.trip.isRealtime = false;
      remoteLog("실시간 고정밀 관제 모드 종료", "SYSTEM");
    }

    const dateDisplay = document.getElementById('trip-date-display');
    const sep1 = document.getElementById('trip-status-sep1');
    const gpsChip = document.getElementById('trip-gps-chip');
    const sep2 = document.getElementById('trip-status-sep2');
    const addrDisplay = document.getElementById('trip-addr-display');

    if (State.trip.status === 'idle') {
      if (dateDisplay) { dateDisplay.textContent = '운송시작 대기중'; dateDisplay.style.color = 'var(--primary)'; dateDisplay.style.fontWeight = '700'; dateDisplay.innerHTML = '운송시작 대기중'; }
      if (sep1) sep1.style.display = 'none';
      if (gpsChip) gpsChip.style.display = 'none';
      if (sep2) sep2.style.display = 'none';
      if (addrDisplay) addrDisplay.style.display = 'none';
      return;
    }

    // 터널/음영지역 즉각 판별을 위해 타임아웃 단축 (현재 주기 + 10초, 최소 30초)
    const deadTimeout = Math.max(currentGpsInterval + 10_000, 30_000);
    const isDown = !lastGpsTimestamp || (Date.now() - lastGpsTimestamp > deadTimeout);
    let gpsColor = '#10b981'; // 초록 (수신중)
    let gpsText = `${Math.round(currentGpsInterval / 1000)}s`;

    if (State.trip.status === 'paused') {
      gpsColor = '#ef4444'; // 빨강 (수신중지)
      gpsText = '수신중지';
    } else if (isDown && State.trip.status === 'driving') {
      gpsColor = '#ef4444'; // 빨강 (수신안됨)
      gpsText = '연결안됨'; // UI에 "GPS 연결안됨" 표시

      // GPS 연결 안될 시 3초마다 강제 재수신 시도
      const now = Date.now();
      if (!window._lastGpsRetry || (now - window._lastGpsRetry > 3000)) {
        window._lastGpsRetry = now;
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => {
              lastGpsTimestamp = Date.now();
              onGpsUpdate(pos, true, State.trip.id);
            },
            () => { /* 음영지역이므로 조용히 실패 무시 */ },
            { enableHighAccuracy: true, timeout: 2500, maximumAge: 0 }
          );
        }
      }
    } else if (State.trip.isRealtime) {
      gpsColor = '#f59e0b'; // 주황 (실시간/웹조회)
      gpsText = '실시간 수집중';
    }

    const addrShort = abbreviateAddr(lastKnownAddr);

    if (dateDisplay && State.trip.startTime) {
      const d = new Date(State.trip.startTime);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const HH = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');

      dateDisplay.textContent = `${mm}/${dd} ${HH}:${min}`;
      dateDisplay.style.color = '#64748b'; // slate-500
      dateDisplay.style.fontWeight = '400';
    }

    if (sep1) sep1.style.display = 'inline-block';

    if (gpsChip) {
      gpsChip.style.display = 'inline-block';
      gpsChip.style.color = gpsColor;
      gpsChip.textContent = `GPS ${gpsText}`;
    }

    if (sep2) sep2.style.display = 'inline-block';

    if (addrDisplay) {
      addrDisplay.style.display = 'inline-block';
      addrDisplay.textContent = addrShort || '위치 확인 중...';
    }

    // 오버레이 위젯에 GPS 상태 전송 (1초 단위 타이머에서 호출되므로 throttle 적용)
    // [v4.2.48] isRealtime 플래그 추가 → 네이티브가 실시간 모드 때 GPS 주기를 3초로 즉시 바꾸도록 동기화
    const overlay = Overlay();
    if (overlay && (State.trip.status === 'driving' || State.trip.status === 'paused')) {
      overlay.updateStatus({
        status: State.trip.status,
        gpsText: gpsText,
        gpsColor: gpsColor,
        address: addrShort,
        isRealtime: State.trip.isRealtime, // [v4.2.48] 네이티브 GPS 주기 동기화
      }).catch(() => { });
    }
  }

  let lastEmergencyPollMs = 0;
  async function onGpsUpdate(pos, isForced = false, forcedTripId = null, markerType = null) {
    const targetId = forcedTripId || State.trip.id;
    if (!targetId) return;

    // 백그라운드에서 깨어날 때마다 긴급명령(실시간명령 등) 폴링 (30초 쿨타임)
    const _now = Date.now();
    if (_now - lastEmergencyPollMs > 30000 && State.trip.status === 'driving') {
      lastEmergencyPollMs = _now;
      pollEmergency().catch(() => { });
    }

    // [TDD] 강제 수집(isForced)인 경우, 일시정지나 종료 중이어도 위치를 전송해야 함 (중환 전환점)
    if (State.trip.status !== 'driving' && !isForced) return;
    const { latitude: lat, longitude: lng, speed, accuracy } = pos.coords;

    // [TDD] 무조건 GPS 기반: 속도(Speed) 값이 없는(null) 데이터는 기지국/Wi-Fi 추정치이므로 원천 차단
    // 단, 실시간 추적 모드(isRealtime) 일 때는 걷거나 정차중이어도 무조건 위치 수집 (필드테스트 대응)
    if (!State.trip.isRealtime && (speed === null || speed === undefined)) {
      remoteLog(`기지국/네트워크 위치 스킵 (속도 불명): acc=${accuracy?.toFixed(0)}m`, 'GPS_SKIP_NETWORK');
      // 타임스탬프를 갱신하지 않으면 '수신안됨' 상태가 되어 5초 폴링(Wake)이 작동함
      return;
    }

    const speedKph = (speed || 0) * 3.6;

    // watchPosition 콜백 시점에 타임스탬프 갱신 (startGPS에서도 하지만 이중 보장)
    lastGpsTimestamp = Date.now();

    // 정확도가 너무 낮으면(>200m) 필터링 (단, 강제수신이나 실시간 추적시는 예외)
    if (!State.trip.isRealtime && !isForced && accuracy && accuracy > 200) {
      remoteLog(`GPS 정확도 낮음: ${accuracy.toFixed(0)}m - 전송 스킵`, 'GPS_ACCURACY');
      updateTripStatusLine(); // 상태표시는 갱신
      return;
    }

    // 속도에 따른 가변 주기 설정
    let interval = 60_000;
    if (State.trip.isRealtime) interval = 3000; // [v4.2.42] 실시간 추적 강제 3초
    else if (speedKph >= 60) interval = 30_000; // 고속: 30초
    else if (speedKph >= 20) interval = 45_000; // 중속: 45초
    else interval = 60_000; // 저속/정지: 60초

    if (interval !== currentGpsInterval) {
      currentGpsInterval = interval;
    }

    // 상태 표시줄 즉시 갱신 (전송 여부과 무관하게 UI는 항상 최신)
    updateTripStatusLine();

    const isSharpTurn = gyroData.magnitude > 25;
    const curTime = Date.now();
    const minInterval = (isForced || markerType) ? 0 : (isSharpTurn ? Math.min(10_000, interval) : interval);
    if (!isForced && !markerType && curTime - lastGpsSend < minInterval) return;

    lastGpsSend = curTime;

    // 서버 전송 + 카카오 역지오코딩 통합 (API 호출 1회로 절감)
    // location API 서버에서 카카오로 이미 주소를 축약해 반환 → 별도 geocode 호출 불필요
    try {
      const gpsRes = await smartFetch(BASE_URL + '/api/vehicle-tracking/location', {
        method: 'POST',
        body: JSON.stringify({
          trip_id: targetId,
          lat, lng,
          speed: speedKph,
          accuracy: accuracy || 0,
          marker_type: markerType || null, // [v4.2.48] 이벤트 마커
          source: isForced ? (markerType || 'webview_forced') : (isSharpTurn ? 'webview_gyro' : 'webview')
        }),
      });
      if (gpsRes.ok) {
        const gpsData = await gpsRes.json().catch(() => ({}));
        lastKnownAddr = gpsData.address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      } else {
        lastKnownAddr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
      updateTripStatusLine();
      remoteLog(`GPS전송[${markerType || 'normal'}]: ${lastKnownAddr} spd=${speedKph.toFixed(0)}kph acc=${accuracy?.toFixed(0)}m gyro=${gyroData.magnitude.toFixed(1)}`, 'GPS_OK');
    } catch (e) {
      lastKnownAddr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      updateTripStatusLine();
      remoteLog(`GPS 서버전송 실패: ${e.message}`, 'GPS_SEND_ERR');
      console.warn('GPS 전송 실패', e);
    }
  }

  // 역지오코딩 (standalone 조회용 — 주소 표시 목적의 단독 호출 시 사용)
  // 운행 중 GPS 전송은 location API 응답에서 address를 직접 받아 사용하므로 이 함수는 미사용
  async function reverseGeocode(lat, lng) {
    try {
      const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/geocode?lat=${lat}&lng=${lng}`);
      if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
      const d = await res.json();
      return (d && d.address) ? d.address : null;
    } catch (e) {
      console.warn('reverseGeocode failed', e);
      return null;
    }
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
          const json1 = await res1.json().catch(() => ({}));
          const d1 = typeof json1 === 'string' ? JSON.parse(json1) : json1;
          console.log('Notice API raw:', d1);
          const rawList = d1.posts || d1.notices || d1.items || (Array.isArray(d1) ? d1 : []);
          norm = Array.isArray(rawList) ? rawList : [];
          console.log('Norm notices count:', norm.length);
        }
      } catch (e) { console.error('Norm load error:', e); }

      try {
        if (res2 && res2.ok) {
          const json2 = await res2.json().catch(() => ({}));
          const d2 = typeof json2 === 'string' ? JSON.parse(json2) : json2;
          emerg = Array.isArray(d2?.items) ? d2.items : (Array.isArray(d2) ? d2 : []);
        }
      } catch (e) { console.error(e); }

      emerg.forEach(e => { e.isEmergency = true; e.category = '긴급알림'; });

      // [v4.2.48] SYSTEM_COMMAND 필터링 — 웹 실시간 제어 명령은 공지 목록에 표시하지 않음
      const isSystemMsg = (item) => {
        const t = (item.title || item.message || '').trim();
        return t === 'SYSTEM_COMMAND' || t.startsWith('SYSTEM_') || item.type === 'SYSTEM_COMMAND';
      };
      const filteredEmerg = emerg.filter(e => !isSystemMsg(e));
      const filteredNorm = norm.filter(n => !isSystemMsg(n));

      const merged = [...filteredEmerg, ...filteredNorm].sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
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

  let _currentNoticeFilter = '';

  function filterNotice(category, btnElement) {
    if (_currentNoticeFilter === category) {
      _currentNoticeFilter = '';
      btnElement = null;
    } else {
      _currentNoticeFilter = category;
    }

    // 탭 UI 스타일 변경
    const tabs = document.querySelectorAll('.notice-filter-tabs button');
    tabs.forEach(btn => {
      btn.style.background = '#f1f5f9';
      btn.style.color = '#64748b';
      btn.style.border = '1px solid #cbd5e1';
    });
    if (btnElement) {
      btnElement.style.background = '#1e293b';
      btnElement.style.color = '#ffffff';
      btnElement.style.border = 'none';
    }

    renderNoticeList();
  }

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
      const cat = n.category || (n.isEmergency ? '긴급알림' : '일반공지');

      const isOld = dateVal && (Date.now() - new Date(dateVal).getTime() > 14 * 24 * 60 * 60 * 1000); // 14일 지난 공지는 자동 읽음 처리
      const isRead = read.includes(n.id) || isOld;

      let prefix = '';
      if (cat === '긴급알림') prefix = '<span style="color:#ef4444; font-weight:700; margin-right:4px;">🚨[긴급]</span>';
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

  function openNotice(id) {
    const n = _notices.find(x => String(x.id) === String(id));
    if (!n) return;

    document.getElementById('notice-detail-title').textContent = n.title || '제목 없음';
    document.getElementById('notice-detail-meta').textContent = formatDate(new Date(n.created_at || n.date));
    const bodyEl = document.getElementById('notice-detail-body');
    if (bodyEl) {
      let raw = n.content || n.body || n.message || '';
      // [TDD] 일반 태그 및 이중 인코딩된 태그(&lt;p&gt;, &lt;br&gt;) 모두 완벽 제거 
      raw = raw.replace(/&lt;br\s*\/?&gt;/gi, '\n')
        .replace(/&lt;\/p&gt;/gi, '\n')
        .replace(/&lt;p&gt;/gi, '')
        .replace(/&lt;[^&]*&gt;/g, '')
        .replace(/<\/p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '');
      bodyEl.innerHTML = raw.trim().replace(/\n\s*\n/g, '\n').replace(/\n/g, '<br>');
    }

    document.getElementById('notice-list').style.display = 'none';
    const detail = document.getElementById('notice-detail');
    detail.classList.add('active');

    const read = Store.get('readNotices') || [];
    if (!read.includes(id)) {
      read.push(id);
      Store.set('readNotices', read);
      // 읽음 처리 즉각 반영 (느림 현상 해결)
      const itemEl = document.getElementById('notice-item-' + id);
      if (itemEl) itemEl.classList.remove('notice-item-unread');
    }
    detail.scrollTop = 0;
  }

  function closeNoticeDetail() {
    const detail = document.getElementById('notice-detail');
    detail.classList.remove('active');
    document.getElementById('notice-list').style.display = '';
  }

  //  // 운행 데이터 및 사진 초기화 (설정 버튼 옆 초기화 버튼 및 수시 호출용)
  function clearTripData(bypassAuth = false) {
    if (!bypassAuth && State.trip.status !== 'idle') {
      showToast('운행 중에는 내용 지움을 사용할 수 없습니다.');
      return;
    }
    // 현재 진행 중인 트립이 있으면 중단
    if (State.trip.id) {
      // 서버에 종료 요청 없이 로컬만 정리
      stopOverlayService();
      stopGPS();
      Store.rm('activeTrip');
    }
    State.trip = { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '' };
    State.photos = [];
    State.preTripDone = null; // 체크리스트 초기화

    // 점검 버튼 초기화
    const btnCheck = document.getElementById('btn-trip-checklist');
    if (btnCheck) {
      btnCheck.style.background = '#ef4444'; // red
      btnCheck.style.color = '#ffffff';
    }

    // UI 초기화
    document.getElementById('container-no').value = '';
    document.getElementById('seal-no').value = '';
    document.getElementById('trip-memo').value = '';
    ['chk_brake', 'chk_tire', 'chk_lamp', 'chk_cargo', 'chk_driver'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });

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
      `<img class="photo-thumb" src="${p.serverUrl || p.dataUrl}" onclick="App.openPhotoViewer(${i})" alt="사진${i + 1}">`
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
    const isProfile = State.viewerType === 'profile';
    const photos = isLog ? (State.logPhotos || []) : (isProfile ? (State.profilePhotos || []) : (State.photos || []));
    const p = photos[State.currentPhotoIdx];
    if (!p) { closePhotoViewer(); return; }

    let url = '';
    if (isProfile) {
      url = p.dataUrl.startsWith('http') || p.dataUrl.startsWith('data:') ? p.dataUrl : BASE_URL + (p.dataUrl.startsWith('/') ? '' : '/') + p.dataUrl;
    } else {
      url = isLog
        ? (p.url ? (p.url.startsWith('http') ? p.url : BASE_URL + p.url) : (p.serverUrl || p.dataUrl || ''))
        : (p.serverUrl || p.dataUrl);
    }

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
    const isProfile = State.viewerType === 'profile';
    const photos = State.viewerType === 'log' ? State.logPhotos : (isProfile ? State.profilePhotos : State.photos);
    if (State.currentPhotoIdx > 0) {
      State.currentPhotoIdx--;
      resetZoom();
      updatePhotoViewerUI();
    }
  }

  function nextPhoto() {
    const isProfile = State.viewerType === 'profile';
    const photos = State.viewerType === 'log' ? State.logPhotos : (isProfile ? State.profilePhotos : State.photos);
    if (State.currentPhotoIdx < photos.length - 1) {
      State.currentPhotoIdx++;
      resetZoom();
      updatePhotoViewerUI();
    }
  }

  async function deleteCurrentPhoto() {
    if (!confirm('현재 보고 있는 사진을 삭제하시겠습니까?')) return;

    if (State.viewerType === 'profile') {
      const p = State.profilePhotos[State.currentPhotoIdx];
      State.profile[`photo_${p.type}`] = '';

      let fallbackText = '';
      if (p.type === 'driver') fallbackText = '운';
      if (p.type === 'vehicle') fallbackText = '차';
      if (p.type === 'chassis') fallbackText = '샤';
      updateProfilePhoto(`p-photo-${p.type}`, '', fallbackText);

      showToast('삭제되었습니다. 정보 저장을 눌러야 완전히 반영됩니다.');
      State.profilePhotos.splice(State.currentPhotoIdx, 1);

      if (State.profilePhotos.length === 0) {
        closePhotoViewer();
      } else {
        if (State.currentPhotoIdx >= State.profilePhotos.length) State.currentPhotoIdx = State.profilePhotos.length - 1;
        updatePhotoViewerUI();
      }
      return;
    }

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
    const date = document.getElementById('log-date-filter').value;
    const month = document.getElementById('log-month-filter').value;
    const phone = State.profile.phone;
    const vNum = State.profile.vehicleNo;

    let url = `${BASE_URL}/api/vehicle-tracking/trips?mode=my`;
    if (date) url += `&date=${date}`;
    else if (month) url += `&month=${month}`;
    if (phone) url += `&phone=${phone}`;
    if (vNum) url += `&vehicle_number=${encodeURIComponent(vNum)}`;

    try {
      const res = await smartFetch(url);
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
        } catch (e) { }

        return `
          <div class="log-item" onclick="App.openLog('${t.id}')">
            <div class="log-item-header">
              <span class="log-item-container">${escHtml(t.container_number || '컨테이너 미입력')}</span>
              <span class="log-item-status" style="color:${statusColor[t.status] || 'var(--text-muted)'};border-color:${statusColor[t.status] || 'var(--text-muted)'};">${statusLabel[t.status] || t.status}</span>
            </div>
            <div class="log-item-meta" style="display:flex; justify-content:space-between; align-items:center;">
              <span>${formatDate(new Date(t.started_at))} · ${escHtml(t.vehicle_number || '')}</span>
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
      const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${id}`);
      const data = await res.json();
      _currentLogData = data;
      State.currentLogId = id;

      document.getElementById('log-edit-container').value = data.container_number || '';
      document.getElementById('log-edit-seal').value = data.seal_number || '';
      document.getElementById('log-edit-memo').value = data.special_notes || '';
      onLogFieldChange(); // 로드 시 즉시 유효성 검사 실행

      // 운행 전 점검 항목(5개) 확인 로직
      const isAllChecked = !!(data.chk_brake && data.chk_tire && data.chk_lamp && data.chk_cargo && data.chk_driver);

      // 기본 정보 (시작/종료 일시 강조) [TDD: ended_at || completed_at fallback]
      const endedAt = data.ended_at || data.completed_at || null;
      document.getElementById('log-detail-content').innerHTML = `
        <div class="log-detail-info-box">
          <div class="log-detail-info-row">
            <span class="log-detail-info-label">번호 / 상태</span>
            <span style="display:flex;align-items:center;gap:6px;">
              <span>${escHtml(data.vehicle_number || '—')}</span>
              <span style="color:#cbd5e1;">|</span>
              <span style="font-weight:700;">${data.status === 'completed' ? '완료' : (data.status === 'driving' ? '운송중' : (data.status === 'paused' ? '일시정지' : data.status))}</span>
              ${data.status !== 'completed' ? `<button onclick="App.forceCompleteLog('${data.id}')" class="btn btn-sm btn-warn" style="font-size:10px;padding:2px 6px;height:auto;margin-left:4px;">종료처리</button>` : ''}
            </span>
          </div>
          <div class="log-detail-info-row"><span class="log-detail-info-label">운행 시작</span><span style="font-weight:700;color:var(--accent);">${formatDate(new Date(data.started_at))}</span></div>
          ${endedAt ? `<div class="log-detail-info-row"><span class="log-detail-info-label">운행 종료</span><span style="font-weight:700;color:var(--danger);">${formatDate(new Date(endedAt))}</span></div>` : ''}
          <div class="log-detail-info-row"><span class="log-detail-info-label">제원 / 점검</span><span>${data.container_type || '—'} / ${data.container_kind || '—'} <span style="color:#cbd5e1;margin:0 4px;">|</span> <span style="color:${isAllChecked ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${isAllChecked ? '점검완료' : '미점검'}</span></span></div>
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
      const photoScroll = document.getElementById('log-photo-scroll');
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
          return url ? `<img class="photo-thumb" src="${url}" onclick="App.openLogPhoto('${escHtml(url)}', ${i}, ${photos.length})" alt="사진${i + 1}">` : '';
        }).join('');
        photoScroll.innerHTML = html;
      }

      document.getElementById('log-list').style.display = 'none';
      document.getElementById('log-detail').classList.add('active');
    } catch (e) { showToast('불러오기 실패'); }
  }

  // 일지 상세 컨테이너/씰 필드 변경 핸들러 (대문자, trim, ISO6346 검증)
  function onLogFieldChange() {
    const cEl = document.getElementById('log-edit-container');
    const sEl = document.getElementById('log-edit-seal');
    if (!cEl || !sEl) return;

    // [TDD] 대문자 및 숫자만 허용
    cEl.value = cEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    sEl.value = sEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();

    const errEl = document.getElementById('log-container-check-msg');
    if (errEl) errEl.textContent = '';

    const val = cEl.value;
    if (val.length >= 4 && errEl) {
      const match = val.match(/^([A-Z]{4})(\d{0,7})$/);
      if (match) {
        if (val.length === 11) {
          if (validateISO6346(val)) {
            errEl.textContent = '유효한 번호입니다'; errEl.style.color = 'var(--primary)';
          } else {
            errEl.textContent = '컨테이너번호 오기입'; errEl.style.color = 'var(--danger)';
          }
        } else {
          errEl.textContent = '입력 중...'; errEl.style.color = 'var(--text-muted)';
        }
      } else {
        errEl.textContent = '영문 4자 + 숫자 7자'; errEl.style.color = 'var(--danger)';
      }
    }
  }

  async function saveLogEdit() {
    if (!State.currentLogId) return;
    const cEl = document.getElementById('log-edit-container');
    const sEl = document.getElementById('log-edit-seal');
    if (cEl) cEl.value = cEl.value.trim().toUpperCase();
    if (sEl) sEl.value = sEl.value.trim().toUpperCase();
    try {
      await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.currentLogId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          container_number: cEl ? cEl.value : '',
          seal_number: sEl ? sEl.value : '',
          special_notes: document.getElementById('log-edit-memo').value,
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
  async function forceCompleteLog(id) {
    if (!confirm('이 운행을 강제로 운행종료 처리하시겠습니까?')) return;
    try {
      const endedAtIso = new Date().toISOString();
      await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', ended_at: endedAtIso })
      });
      showToast('운행종료 되었습니다.');

      // 현재 진행중인 운행이었다면 즉시 idle 상태로 초기화시켜서 꼬임 방지
      if (String(State.trip.id) === String(id)) {
        clearTripData(true); // bypassAuth=true
        updateTripStatusLine();
      }

      closeLogDetail();
      loadLogs();
      // openLog(id); 도 가능하지만 목록 업데이트를 위해 closeLogDetail하는게 깔끔함
    } catch (e) {
      showToast('운행종료 처리 실패');
    }
  }

  function closeLogDetail() {
    document.getElementById('log-detail').classList.remove('active');
    document.getElementById('log-list').style.display = '';
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
      const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/emergency?unread=true`);
      const data = await res.json();
      const items = data.items || [];
      const now = Date.now();
      for (const item of items) {
        if (State.emergencyIds.has(item.id)) continue;
        State.emergencyIds.add(item.id);
        Store.set('emergencyIds', Array.from(State.emergencyIds));

        // 1시간(3600000ms) 이전 알림은 팝업 안 띄움
        const createdMs = new Date(item.created_at || now).getTime();
        if (now - createdMs > 60 * 60 * 1000) {
          continue; // 이미 읽음 처리만 하고 팝업은 패스
        }

        if (item.title === 'SYSTEM_COMMAND') {
          if (item.message && item.message.startsWith('REALTIME_ON:')) {
            const targetId = item.message.split(':')[1];
            if (String(targetId) === String(State.trip.id)) {
              startRealtimeMode();
            }
          } else if (item.message && item.message.startsWith('REALTIME_OFF:')) {
            const targetId = item.message.split(':')[1];
            if (String(targetId) === String(State.trip.id)) {
              stopRealtimeMode();
            }
          }
          continue; // 시스템 명령은 팝업 띄우지 않음
        }

        showEmergencyPopup(item);
        sendNativeEmergencyNotif(item);
      }
    } catch (e) { /* 조용히 실패 */ }
  }

  function stripHtml(html) {
    if (!html) return '';
    return String(html)
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  function showEmergencyPopup(item) {
    const rawVal = item.message || item.content || '';
    document.getElementById('emergency-body').textContent = stripHtml(rawVal);
    document.getElementById('emergency-popup').classList.add('active');
  }

  function closeEmergency() { document.getElementById('emergency-popup').classList.remove('active'); }

  function sendNativeEmergencyNotif(item) {
    const em = Emergency();
    if (em) {
      const rawVal = item.message || item.content || '';
      em.showEmergencyAlert({ title: '⚠️ ELS 긴급알림', message: stripHtml(rawVal), id: item.id }).catch(() => { });
      if (em.bringToForeground) {
        em.bringToForeground().catch(() => {});
      }
    }
  }

  // ─── 업데이트 확인 ────────────────────────────────────────────
  async function checkUpdate(auto = false) {
    try {
      const res = await smartFetch(VERSION_URL + '?t=' + Date.now()).catch(() => null);
      if (!res) return;
      const data = await res.json().catch(() => ({}));

      const remoteVersion = (data.latestVersion || '').trim();
      const localVersion = APP_VERSION.trim();

      const hasUpdate = data.versionCode > BUILD_CODE || (remoteVersion !== localVersion && remoteVersion !== '' && !localVersion.includes(remoteVersion));

      if (!hasUpdate) {
        if (!auto) showToast('이미 최신 버전입니다 (' + APP_VERSION + ')');
        return;
      }

      // [안전 우선] 운행 중이면 팝업을 띄우지 않고 유예 처리
      const isActive = State.trip.status === 'driving' || State.trip.status === 'paused';
      if (auto && isActive) {
        State.pendingUpdate = true;
        console.log('업데이트 유예: 운행 중 팝업 차단. 운행 종료 후 알림 예정.');
        return;
      }

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

    // [v4.2.56] 포그라운드 알림 및 GPS 명시적 종료
    stopOverlayService();
    stopGPS();

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
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    saveProfile, lookupDriver, pickProfilePhoto, handleProfilePhotoClick,
    // 운행
    onTripFieldChange, startTrip, togglePause, endTrip, saveMemo, clearTripData,
    // 네비
    switchTab, showScreen, openSettings, handleBackButton: () => window.handleBackButton(),
    // 공지
    openNotice, closeNoticeDetail, filterNotice,
    // 점검 팝업
    openChecklist, closeChecklist, saveChecklist,
    // 사진
    addPhoto, onFileSelected, openPhotoViewer, closePhotoViewer, prevPhoto, nextPhoto, deleteCurrentPhoto,
    // 일지
    loadLogs, openLog, saveLogEdit, onLogFieldChange, deleteLog, closeLogDetail, openLogPhoto, addLogPhoto, onLogFileSelected, forceCompleteLog,
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
