/**
 * ELS Driver App v4.0
 * ?⑥씪 IIFE 踰덈뱾 ??Capacitor ?뚮윭洹몄씤 釉뚮┸吏 ?ъ슜
 */
(function () {
  'use strict';
  console.log('ELS Driver App Loading... v4.2.34');

  const APP_VERSION = 'v4.2.34';
  const BUILD_CODE = 177; // Build 178 (v4.2.34)
  const BASE_URL = 'https://www.nollae.com';
  const VERSION_URL = BASE_URL + '/apk/version.json';

  // ??? Capacitor ?뚮윭洹몄씤 ?ы띁 ??????????????????????????????????
  function getPlugin(name) {
    try {
      const plugins = window.Capacitor?.Plugins;
      if (!plugins) {
        console.warn('Capacitor.Plugins not available yet.');
        return null;
      }

      // 1. ?대? ?깅줉???뚮윭洹몄씤 ?뺤씤
      let found = plugins[name] || plugins[name.toLowerCase()] || plugins[name.toUpperCase()] || plugins[name + 'Plugin'];

      // 2. [以묒슂] Capacitor 4+ 諛⑹떇: 紐낆떆???깅줉 ?쒕룄 (?ㅼ씠?곕툕 釉뚮┸吏 媛뺤젣 ?곌껐)
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
      // [TDD] 濡쒖뺄 濡쒓렇 罹≫븨 (釉뚮씪?곗? 硫붾え由???＜ 諛⑹?)
      const logHistory = Store.get('logHistory') || [];
      if (logHistory.length > 50) logHistory.shift();

      // KST ?쒓컙 ?щ㎎ (ISO 8601 + 9?쒓컙)
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

  // ??? localStorage ?ы띁 ????????????????????????????????????????
  const Store = {
    get: (k, def = null) => { try { const v = localStorage.getItem('els_' + k); return v ? JSON.parse(v) : def; } catch { return def; } },
    set: (k, v) => { try { localStorage.setItem('els_' + k, JSON.stringify(v)); } catch { } },
    rm: (k) => { try { localStorage.removeItem('els_' + k); } catch { } },
  };

  // ??? ?먭?泥댄겕由ъ뒪????????????????????????????????????????????
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
        showToast('紐⑤뱺 踰뺤젙 ?꾩닔 ?먭? ??ぉ??泥댄겕?댁빞 ?⑸땲??');
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
    showToast('?댄뻾 ???먭? ?꾨즺! ?댁젣 ?댄뻾 ?쒖옉??媛?ν빀?덈떎.');
  }

  // ??? ?곹깭 ?????????????????????????????????????????????????????
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
    pendingUpdate: false, // ?댄뻾 以??낅뜲?댄듃 ?좎삁 ?뚮옒洹?
    preTripDone: null, // ?댄뻾 ???먭? ??ぉ
  };

  // ??? 沅뚰븳 ?곹깭 ????????????????????????????????????????????????
  const permStatuses = Store.get('permStatuses') || { loc: false, camera: false, notif: false, overlay: false, battery: false };

  function setPermStatus(type, ok) {
    // 沅뚰븳 媛앹껜媛 ?놁쑝硫?珥덇린??
    if (!permStatuses) return;
    permStatuses[type] = !!ok;
    Store.set('permStatuses', permStatuses);

    const el = document.getElementById('perm-' + type + '-status');
    if (!el) return;

    el.textContent = permStatuses[type] ? '?덉슜?? : '誘몄꽕??;
    el.className = 'perm-status ' + (permStatuses[type] ? 'perm-ok' : 'perm-ng');

    const btn = el.nextElementSibling;
    if (btn && (btn.tagName === 'BUTTON' || btn.classList.contains('btn-perm'))) {
      if (!permStatuses[type]) {
        btn.classList.remove('btn-ok', 'btn-primary'); // primary ?꾩쟾 ?쒓굅
        if (['loc', 'overlay', 'battery'].includes(type)) {
          btn.classList.add('btn-pulse', 'btn-ng');
          btn.textContent = '?ㅼ젙(?꾩닔)';
        } else {
          btn.classList.add('btn-ng');
          btn.textContent = '?ㅼ젙';
        }
      } else {
        btn.classList.remove('btn-pulse', 'btn-ng', 'btn-primary'); // primary ?꾩쟾 ?쒓굅
        btn.classList.add('btn-ok');
        btn.textContent = '?덉슜?꾨즺';
      }
    }
  }

  // ??? ??珥덇린??????????????????????????????????????????????????
  async function init() {
    // Capacitor 釉뚮┸吏 ?湲?
    if (window.Capacitor) {
      const CapApp = window.Capacitor.Plugins.App;
      if (CapApp) {
        CapApp.addListener('appStateChange', ({ isActive }) => {
          console.log('App State Change - isActive:', isActive);
          if (isActive) {
            // ?ㅼ쨷 泥댄겕 (沅뚰븳 ?ㅼ젙???먮━寃?諛섏쁺?????덉쓬)
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
      window.Capacitor.Plugins.StatusBar.setStyle({ style: 'DARK' }).catch(() => { });
      window.Capacitor.Plugins.StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(() => { });
    }

    if (document.getElementById('app-version-display')) {
      document.getElementById('app-version-display').textContent = APP_VERSION;
    }

    // ?꾨줈??濡쒕뱶
    const profile = Store.get('profile');
    if (profile) {
      Object.assign(State.profile, profile);
      applyProfileToUI();
    }

    // 理쒖큹 ?ㅽ뻾 ?щ? 諛?沅뚰븳 ?곹깭 泥댄겕
    const firstRun = !Store.get('permSetupDone');
    const hasProfile = State.profile.name && State.profile.phone && State.profile.vehicleNo && State.profile.driverId;

    // 沅뚰븳 ?곹깭 癒쇱? ?뺤씤 ???붾㈃ 寃곗젙
    await updatePermStatuses();
    const criticalPerms = permStatuses.loc && permStatuses.overlay && permStatuses.battery;

    if (firstRun || !criticalPerms) {
      showScreen('permission');
    } else if (!hasProfile) {
      openSettings();
    } else {
      showMain();
    }

    // ?쇱? 湲곕낯 ?꾪꽣瑜??꾩옱 ??YYYY-MM)濡??ㅼ젙
    const now = new Date();
    const monthStr = now.toISOString().slice(0, 7); // YYYY-MM
    const monFilter = document.getElementById('log-month-filter');
    if (monFilter && !monFilter.value) monFilter.value = monthStr;

    // ?낅뜲?댄듃 ?뺤씤? 硫붿씤 吏꾩엯 ?쒖뿉留??섑뻾
    checkUpdate(true);

    // goto_tab ?λ쭅??(?쒕퉬?ㅼ뿉??蹂듦?)
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
      backBtn.style.display = hasProfile ? '' : 'none'; // ?꾨줈??遺議깆떆 ?ㅻ줈媛湲??④?
    }
  }

  // ??? ?붾㈃ ?꾪솚 ????????????????????????????????????????????????
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

  // ??? ?꾨줈??UI ???????????????????????????????????????????????
  function applyProfileToUI() {
    document.getElementById('s-name').value = State.profile.name;
    document.getElementById('s-phone').value = State.profile.phone;
    document.getElementById('s-vehicle').value = State.profile.vehicleNo;
    document.getElementById('s-id').value = State.profile.driverId;
    document.getElementById('header-vehicle').textContent = State.profile.vehicleNo || '??;

    // ?꾨줈???ъ쭊 ?뱀뀡 ?쒖떆 諛???λ맂 ?ъ쭊 ?뚮뜑留?
    const pSection = document.getElementById('settings-profile-photos');
    if (pSection && (State.profile.name || State.profile.phone)) {
      pSection.style.display = 'flex';
      updateProfilePhoto('p-photo-driver', State.profile.photo_driver, '??);
      updateProfilePhoto('p-photo-vehicle', State.profile.photo_vehicle, '李?);
      updateProfilePhoto('p-photo-chassis', State.profile.photo_chassis, '??);
    }
  }

  function saveProfile() {
    const name = document.getElementById('s-name').value.trim();
    // [蹂댁셿] -??怨듬갚 諛?湲?????レ옄 ?몄쓽 紐⑤뱺 ?뱀닔臾몄옄 ?꾩쟾???쒓굅 ?????
    const phone = document.getElementById('s-phone').value.replace(/[^0-9]/g, '');
    const vehicleNo = document.getElementById('s-vehicle').value.trim();
    const driverId = document.getElementById('s-id').value.trim().toUpperCase();

    // ?붾㈃ ?꾨뱶??癒쇱? ?뺤긽(?レ옄留? ?뺥깭 諛섏쁺
    document.getElementById('s-phone').value = phone;

    if (!name || !phone || !vehicleNo || !driverId) {
      showToast('?대쫫, ?꾪솕踰덊샇, 李⑤웾踰덊샇, 湲곗궗 ID瑜?紐⑤몢 ?낅젰??二쇱꽭??');
      return;
    }

    // 湲곗〈 ?꾨줈???곗씠???ъ쭊 ????蹂댁〈?섍퀬 ?낅젰 ?꾨뱶留???뼱?
    State.profile = { ...State.profile, name, phone, vehicleNo, driverId };
    Store.set('profile', State.profile);
    applyProfileToUI();
    upsertDriverContact();
    showToast('?뺣낫媛 ??λ릺?덉뒿?덈떎.');

    // ????깃났 ??硫붿씤?쇰줈 媛뺤젣 ?대룞
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
    if (phone.length < 10) { showToast('?꾪솕踰덊샇瑜?癒쇱? ?낅젰??二쇱꽭??'); return; }
    showToast('議고쉶 以?..');
    try {
      const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/drivers?phone=${phone}`);
      const data = await res.json();
      if (data && data.driver) {
        const d = data.driver;
        document.getElementById('s-name').value = d.name || '';
        document.getElementById('s-vehicle').value = d.vehicle_number || d.business_number || '';
        document.getElementById('s-id').value = d.vehicle_id || d.driver_id || '';

        // ?꾨줈???ъ쭊 ?낅뜲?댄듃
        const pSection = document.getElementById('settings-profile-photos');
        if (pSection) {
          pSection.style.display = 'flex';
          updateProfilePhoto('p-photo-driver', d.photo_driver, '??);
          updateProfilePhoto('p-photo-vehicle', d.photo_vehicle, '李?);
          updateProfilePhoto('p-photo-chassis', d.photo_chassis, '??);

          // State?먮룄 ???(???踰꾪듉 ?대┃ ???④퍡 ?꾩넚?섎룄濡?
          State.profile.photo_driver = d.photo_driver;
          State.profile.photo_vehicle = d.photo_vehicle;
          State.profile.photo_chassis = d.photo_chassis;
        }

        showToast('湲곗궗 ?뺣낫瑜?遺덈윭?붿뒿?덈떎.');
      } else {
        showToast('?대떦 ?꾪솕踰덊샇濡??깅줉??湲곗궗 ?뺣낫媛 ?놁뒿?덈떎.');
      }
    } catch (e) { showToast('議고쉶 ?ㅽ뙣: ' + e.message); }
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
        showToast('移대찓??湲곕뒫???ъ슜?????놁뒿?덈떎.');
        return;
      }

      const image = await Camera.getPhoto({
        quality: 70,
        width: 1000,
        height: 1000,
        allowEditing: false,
        resultType: 'base64',
        source: 'PROMPT', // 移대찓??媛ㅻ윭由??좏깮 ?앹뾽
        saveToGallery: false,
        promptLabelHeader: '?ъ쭊 ?좏깮',
        promptLabelCancel: '痍⑥냼',
        promptLabelPhoto: '?⑤쾾?먯꽌 ?좏깮',
        promptLabelPicture: '?ъ쭊 珥ъ쁺'
      });

      const dataUrl = `data:image/jpeg;base64,${image.base64String}`;

      if (type === 'driver') State.profile.photo_driver = dataUrl;
      if (type === 'vehicle') State.profile.photo_vehicle = dataUrl;
      if (type === 'chassis') State.profile.photo_chassis = dataUrl;

      updateProfilePhoto('p-photo-' + type, dataUrl, '');
      showToast('?ъ쭊???좏깮?섏뿀?듬땲?? ?뺣낫 ??????낅줈?쒕맗?덈떎.');
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

  // ??? 沅뚰븳 ?ㅼ젙 ????????????????????????????????????????????????

  async function updatePermStatuses() {
    console.log('--- updatePermStatuses start ---');
    // 珥덇린??(UI ?숆린??蹂댁옣??
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
      // Fallback: browser API check
      try {
        const p = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
        if (p) setPermStatus('loc', p.state === 'granted');
      } catch (e) { }
    }

    // 3. 移대찓??/ 誘몃뵒??
    const Cam = window.Capacitor?.Plugins?.Camera;
    if (Cam) {
      try {
        const p = await Cam.checkPermissions().catch(() => ({}));
        setPermStatus('camera', p.camera === 'granted' || p.camera === 'limited');
      } catch (e) { console.warn('Cam check fail', e); }
    }

    // 4. ?뚮┝
    const Notif = window.Capacitor?.Plugins?.LocalNotifications || window.Capacitor?.Plugins?.PushNotifications;
    if (Notif) {
      try {
        const p = await Notif.checkPermissions().catch(() => ({ display: 'denied', receive: 'denied' }));
        setPermStatus('notif', p.display === 'granted' || p.receive === 'granted' || p.notif === 'granted');
      } catch (e) { console.warn('Notif check fail', e); }
    } else if ('Notification' in window) {
      setPermStatus('notif', Notification.permission === 'granted');
    }

    // 理쒖쥌 媛뺤젣 ?숆린??
    for (const k in permStatuses) { setPermStatus(k, permStatuses[k]); }
    console.log('--- updatePermStatuses end --- perms:', JSON.stringify(permStatuses));
  }

  // ??? ?덈뱶濡쒖씠??16 ?꾩슜 媛?대뱶 ??????????????????????????????
  function showAndroid16Guide(type) {
    const guide = document.getElementById('modal-guide-android16');
    const confirmBtn = document.getElementById('btn-guide-confirm');
    if (!guide || !confirmBtn) return;

    guide.classList.add('active');
    confirmBtn.onclick = (ev) => {
      ev.preventDefault();
      guide.classList.remove('active');
      // 300ms ???二쇱뼱 紐⑤떖???ロ엺 ???붿껌???먰솢?섍쾶 ?꾨떖?섎룄濡???
      setTimeout(() => { executeRealRequest(type); }, 300);
    };
  }

  async function executeRealRequest(type) {
    const overlay = Overlay();
    try {
      switch (type) {
        case 'location':
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
      // [TDD] ?ㅼ젙 ?붾㈃?먯꽌 ?뚯븘?ㅻ뒗 ?쒓컙 怨좊젮 (S25/Android 16 ???1000ms)
      setTimeout(async () => {
        await updatePermStatuses();
        showToast('沅뚰븳 ?곹깭瑜??뺤씤?덉뒿?덈떎.');
        // 踰꾪듉 ?곹깭 珥덇린??
        const activeBtns = document.querySelectorAll('.btn-active');
        activeBtns.forEach(b => b.classList.remove('btn-active'));
      }, 1000);
    }
  }

  async function requestPerm(type, event) {
    if (event && event.target) event.target.classList.add('btn-active');

    // ?덈뱶濡쒖씠??16 ?댁긽?닿굅???ㅻ쾭?덉씠/諛고꽣由?沅뚰븳??寃쎌슦 媛?대뱶 癒쇱? ?몄텧 ???대룞
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
      // ?꾩닔 沅뚰븳 泥댄겕 (?꾩튂, ?ㅻ쾭?덉씠, 諛고꽣由?
      const missing = [];
      if (!permStatuses.loc) missing.push('?꾩튂(??긽 ?덉슜)');
      if (!permStatuses.overlay) missing.push('?ㅻⅨ ???꾩뿉 ?쒖떆');
      if (!permStatuses.battery) missing.push('諛고꽣由?理쒖쟻???쒖쇅');

      if (missing.length > 0) {
        alert('?꾨옒 ?꾩닔 沅뚰븳???ㅼ젙?섏? ?딆븯?듬땲??\n\n' + missing.join('\n') + '\n\n紐⑤뱺 ?꾩닔 沅뚰븳???덉슜?댁빞 ?깆쓣 ?쒖옉?????덉뒿?덈떎.');
        return;
      }

      Store.set('permSetupDone', true);

      // [TDD] 沅뚰븳 ?꾨즺 ??李⑤웾 ?뺣낫(?꾨줈??媛 ?놁쑝硫??ㅼ젙 ?섏씠吏濡?媛뺤젣 ?대룞
      const hasProfile = State.profile.name && State.profile.phone && State.profile.vehicleNo && State.profile.driverId;
      if (!hasProfile) {
        openSettings();
        showToast('沅뚰븳 ?ㅼ젙 ?꾨즺! 李⑤웾 ?뺣낫瑜?癒쇱? ?낅젰??二쇱꽭??');
      } else {
        showMain();
        showToast('諛섍컩?듬땲?? ?덉쟾 ?댁쟾 ?섏꽭??');
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
    if (confirm('罹먯떆瑜?吏?곌퀬 ?덈줈怨좎묠 ?섏떆寃좎뒿?덇퉴? (?몄뀡???ㅼ떆 ?쒖옉?⑸땲??')) {
      window.location.reload(true);
    }
  }

  // ?ㅼ젙 ?붾㈃?먯꽌 沅뚰븳 ?ㅼ젙 ?붾㈃?쇰줈 ?대룞 (??踰꾪듉??
  function openPermissionSetup() {
    // 沅뚰븳 ?붾㈃?쇰줈 ?꾪솚?섍퀬 ?꾩옱 ?곹깭瑜??ㅼ떆 ?뺤씤
    showScreen('permission');
    updatePermStatuses();
  }

  function resetApp() {
    if (!confirm('?깆쓣 珥덇린?뷀븯硫?紐⑤뱺 ?ㅼ젙怨?諛곗감 湲곕줉????젣?⑸땲?? 怨꾩냽?섏떆寃좎뒿?덇퉴?')) return;
    localStorage.clear(); // ?꾩껜 珥덇린??

    // 硫붾え由????곹깭??紐낆떆?곸쑝濡?珥덇린??
    State.profile = { name: '', phone: '', vehicleNo: '', driverId: '' };
    State.trip = { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '' };
    for (const key in permStatuses) permStatuses[key] = false;

    showScreen('permission');
    updatePermStatuses().then(() => {
      showToast('?깆씠 珥덇린?붾릺?덉뒿?덈떎. 沅뚰븳???ㅼ떆 ?ㅼ젙?댁＜?몄슂.');
    });
  }

  // ??? ?댄뻾 愿由?????????????????????????????????????????????????
  function onTripFieldChange() {
    const cEl = document.getElementById('container-no');
    const sEl = document.getElementById('seal-no');

    // [TDD] 臾댁“嫄??곷Ц ?臾몄옄? ?レ옄留??덉슜 (怨듬갚/?뱀닔臾몄옄 ?먯쿇 李⑤떒)
    cEl.value = cEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    sEl.value = sEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();

    State.trip.containerNo = cEl.value;
    State.trip.sealNo = sEl.value;

    // ISO 6346 泥댄겕 (11?먮━???? - ?뚰뙆踰?4 + ?レ옄 7
    const errEl = document.getElementById('container-check-msg');
    if (errEl) errEl.textContent = '';

    if (cEl.value.length >= 4) {
      const match = cEl.value.match(/^([A-Z]{4})(\d{0,7})$/);
      if (match) {
        if (cEl.value.length === 11) {
          if (validateISO6346(cEl.value)) {
            if (errEl) { errEl.textContent = '?좏슚??踰덊샇?낅땲??; errEl.style.color = 'var(--primary)'; }
          } else {
            if (errEl) { errEl.textContent = '而⑦뀒?대꼫踰덊샇 ?ㅺ린??; errEl.style.color = 'var(--danger)'; }
          }
        } else {
          if (errEl) { errEl.textContent = '?낅젰 以?..'; errEl.style.color = 'var(--text-muted)'; }
        }
      } else {
        if (errEl) { errEl.textContent = '?곷Ц 4??+ ?レ옄 7??; errEl.style.color = 'var(--danger)'; }
      }
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

        // ?ъ쭊 ?곗씠??蹂듦뎄 (?쒕쾭 -> 濡쒖뺄 State)
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
      showToast('李⑤웾 ?뺣낫瑜?癒쇱? 紐⑤몢 ?낅젰??二쇱꽭??');
      openSettings();
      return;
    }

    if (!State.preTripDone) {
      openChecklist();
      showToast('?덉쟾 ?댄뻾???꾪빐 [?댄뻾?꾩젏寃] ?꾩닔 ??ぉ??紐⑤몢 泥댄겕?댁＜?몄슂.');
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
        throw new Error(data.error || `?쒕쾭 ?ㅻ쪟 (${res.status})`);
      }

      // ?쒕쾭 ?묐떟 援ъ“媛 ?щ윭 ?뺥깭?????덉쑝誘濡??꾩닔 議곗궗
      // 1. {id: 123} 2. {trip: {id: 123}} 3. ?⑥씪 媛앹껜媛 ?꾨땶 諛곗뿴??寃쎌슦 ??
      const finalId = data.id || (data.trip && data.trip.id) || (Array.isArray(data) && data[0]?.id);

      if (!finalId) {
        console.error('startTrip ID fail. data:', data);
        throw new Error('ID ?꾨씫 (?쒕쾭?먯꽌 湲곕줉 ?꾩씠?붾? 諛쏆? 紐삵븿)');
      }

      State.trip.id = finalId;
      State.trip.status = 'driving';
      State.trip.startTime = Date.now();
      Store.set('activeTrip', { id: finalId, startTime: State.trip.startTime });

      const startD = new Date();
      document.getElementById('trip-date-display').textContent = `?댁넚?쒖옉: ${formatDate(startD)}`;
      setTripStatus('driving');
      updateTripUI();
      startOverlayService();
      startGPS();
      startTripStatusTimer();

      if (State.photos.some(p => !p.uploaded)) {
        await uploadPendingPhotos();
      }
      // [TDD] ?쒖옉 利됱떆 ?꾩옱 ?꾩튂 ??踰?蹂댁젙 (?댄뻾 ?쒖옉 ?쒖젏???꾩튂 湲곕줉)
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => onGpsUpdate(pos, true, State.trip.id).catch(() => { }), null, { enableHighAccuracy: true });
      }

      showToast(data.message || '?댄뻾???쒖옉?섏뿀?듬땲??');

    } catch (e) { showToast('?ㅻ쪟: ' + e.message); }
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

      // [TDD] ?쇱떆?뺤?/?ш컻 ??利됱떆 ?꾩옱 ?꾩튂 ??踰????섏쭛 (?꾪솚 ?쒖젏???꾩튂 湲곕줉)
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => onGpsUpdate(pos, true, State.trip.id).catch(() => { }), null, { enableHighAccuracy: true });
      }

      if (State.trip.status === 'paused') {
        stopGPS();
      } else {
        lastGpsTimestamp = Date.now(); // ?ш컻 ??利됯컖 ?섏떊?덈맖 ?ㅽ몴湲?諛⑹?
        startGPS();
      }

      updateTripUI();
      updateTripStatusLine(); // 利됱떆 UI 諛??ㅻ쾭?덉씠 諛섏쁺
    } catch (e) { showToast('?곹깭 蹂寃??ㅽ뙣'); }
  }

  async function endTrip() {
    if (!State.trip.id) return;

    // ?낅줈??以묒씤 ?ъ쭊???덈뒗吏 泥댄겕
    const isUploading = State.photos.some(p => !p.uploaded);
    if (isUploading) {
      if (!confirm('?꾩쭅 ?쒕쾭???꾩넚 以묒씤 ?ъ쭊???덉뒿?덈떎. 洹몃옒???댄뻾??醫낅즺?섏떆寃좎뒿?덇퉴? (誘몄쟾???ъ쭊? ?좎떎?????덉뒿?덈떎)')) return;
    } else {
      if (!confirm('?댄뻾??醫낅즺?섏떆寃좎뒿?덇퉴?')) return;
    }

    // [TDD] 醫낅즺 利됱떆 ?꾩옱 ?꾩튂 ??踰????섏쭛 (?댄뻾 醫낅즺 ?쒖젏???꾩튂 湲곕줉)
    if (navigator.geolocation) {
      // [TDD] 醫낅즺 ???곗씠??珥덇린?????꾩옱 ID 罹≪쿂?섏뿬 鍮꾨룞湲??꾩넚 蹂댁옣
      const closingTripId = State.trip.id;
      navigator.geolocation.getCurrentPosition(pos => onGpsUpdate(pos, true, closingTripId).catch(() => { }), null, { enableHighAccuracy: true });
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

      // ?꾩쟾 珥덇린??(媛뺤젣?고쉶 true ?꾩슂)
      clearTripData(true);

      // ?곹깭諛??댁넚?湲??? 珥덇린??
      updateTripStatusLine();

      showToast('?댄뻾???덉쟾?섍쾶 醫낅즺?섏뿀?듬땲??');

      // ?좎삁???낅뜲?댄듃媛 ?덈떎硫?醫낅즺 ???앹뾽
      if (State.pendingUpdate) {
        State.pendingUpdate = false;
        setTimeout(() => checkUpdate(true), 1500);
      }
    } catch (e) { showToast('醫낅즺 ?ㅽ뙣: ' + e.message); }
  }


  function setTripStatus(status) {
    State.trip.status = status;
    const badge = document.getElementById('header-status');
    const labels = { idle: '?湲곗쨷', driving: '?댄뻾以?, paused: '?쇱떆?뺤?', completed: '?댄뻾醫낅즺' };
    const classes = { idle: 'status-idle', driving: 'status-driving', paused: 'status-paused', completed: 'status-done' };
    badge.textContent = labels[status] || '?湲곗쨷';
    badge.className = 'status-badge ' + (classes[status] || 'status-idle');
  }

  function updateTripUI() {
    const isActive = State.trip.status === 'driving' || State.trip.status === 'paused';
    document.getElementById('trip-start-row').classList.toggle('hidden', isActive);
    document.getElementById('trip-control-row').classList.toggle('hidden', !isActive);
    const pauseBtn = document.getElementById('btn-trip-pause');
    if (pauseBtn) pauseBtn.textContent = State.trip.status === 'paused' ? '?댄뻾 ?ш컻' : '?쇱떆?뺤?';

    if (State.trip.startTime) {
      // ?띿뒪?몃쭔 ?낅뜲?댄듃?섎룄濡?蹂寃쏀븯??innerHTML 媛꾩꽠 理쒖냼??
      const dateEl = document.getElementById('trip-date-display');
      if (dateEl && !dateEl.innerHTML.includes('|')) {
        dateEl.textContent = `?댁넚?쒖옉: ${formatDate(new Date(State.trip.startTime))}`;
      }
    }
  }

  // JS?먯꽌 ?댄뻾 ?곹깭 ?뺤씤 (?ㅼ씠?곕툕 ?ㅻ줈媛湲?泥섎━??
  window.isTripActive = () => State.trip.status === 'driving' || State.trip.status === 'paused';

  // ?ㅻ줈媛湲??뚮퉬 (Consumed) ?щ? 諛섑솚
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

  // ??? ?ㅻ쾭?덉씠 ?쒕퉬????????????????????????????????????????????
  function startOverlayService() {
    const overlay = Overlay();
    if (!overlay) return;
    overlay.startService({
      tripId: State.trip.id,
      container: State.trip.containerNo || '誘몄엯??,
      status: 'driving',
      startTimeMillis: State.trip.startTime,
    }).catch(() => { });
  }

  function updateOverlayStatus() {
    const overlay = Overlay();
    if (!overlay) return;
    overlay.updateStatus({
      status: State.trip.status,
      container: State.trip.containerNo || '誘몄엯??,
    }).catch(() => { });
  }

  function stopOverlayService() {
    const overlay = Overlay();
    if (!overlay) return;
    overlay.stopService().catch(() => { });
  }

  // ??? GPS (?ш렇?쇱슫???밸럭 ?덉씠?? ????????????????????????????
  let gpsWatchId = null;
  let lastGpsSend = 0;
  let currentGpsInterval = 60_000;
  const gyroData = { magnitude: 0 };

  function startGPS() {
    if (!navigator.geolocation) {
      remoteLog('navigator.geolocation ?놁쓬 - GPS 遺덇?', 'GPS_FATAL');
      return;
    }
    if (gpsWatchId) return;

    remoteLog('startGPS() called - watchPosition ?쒖옉', 'GPS_INIT');

    // ?먯씠濡쒖뒪肄뷀봽 由ъ뒪??(DeviceOrientationEvent ?ъ슜)
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleGyro, { passive: true });
    }
    // 媛?띾룄 ?쇱꽌??異붽? (?먯씠濡??녿뒗 湲곌린 ???
    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', handleMotion, { passive: true });
    }

    // 利됱떆 1??媛뺤젣 ?섏떊 (?댄뻾 ?쒖옉 珥덇린 怨듬갚 諛⑹?)
    navigator.geolocation.getCurrentPosition(
      pos => {
        lastGpsTimestamp = Date.now();
        remoteLog(`GPS 珥덇린?섏떊 ?깃났: ${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)} acc:${pos.coords.accuracy?.toFixed(0)}m`, 'GPS_INIT');
        onGpsUpdate(pos, true, State.trip.id);
      },
      err => remoteLog(`GPS 珥덇린?섏떊 ?ㅽ뙣: ${err.code} ${err.message}`, 'GPS_INIT_ERR'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    gpsWatchId = navigator.geolocation.watchPosition(
      pos => {
        // [以묒슂] watchPosition 肄쒕갚 ?쒖젏??利됱떆 ??꾩뒪?ы봽 媛깆떊 ??'?섏떊?덈맖' ?ㅽ몴??諛⑹?
        lastGpsTimestamp = Date.now();
        onGpsUpdate(pos, false);
      },
      err => {
        remoteLog(`GPS watchPosition ?먮윭: code=${err.code} msg=${err.message}`, 'GPS_WATCH_ERR');
        console.warn('GPS watch error', err.code, err.message);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    );
    remoteLog(`GPS watchPosition ?깅줉??ID=${gpsWatchId}`, 'GPS_INIT');
  }

  function stopGPS() {
    if (gpsWatchId) {
      navigator.geolocation.clearWatch(gpsWatchId);
      remoteLog(`GPS watchPosition ?댁젣 ID=${gpsWatchId}`, 'GPS_STOP');
      gpsWatchId = null;
    }
    window.removeEventListener('deviceorientation', handleGyro);
    window.removeEventListener('devicemotion', handleMotion);
    lastGpsTimestamp = 0;
  }

  function handleGyro(e) {
    // 諛⑺뼢 蹂?붾웾???먯씠濡?magnitude濡??ъ슜
    gyroData.magnitude = Math.abs(e.alpha || 0) + Math.abs(e.beta || 0) + Math.abs(e.gamma || 0);
  }

  function handleMotion(e) {
    // 媛?띾룄?쇱꽌 fallback: 湲됯???媛먯냽 媛먯?
    const acc = e.acceleration;
    if (acc) {
      const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
      // 媛?띾룄 湲곕컲?쇰줈 ?먯씠濡?媛?蹂댁젙 (?먯씠濡??녿뒗 湲곌린)
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
  let lastKnownAddr = '?꾩튂 ?뺤씤 以?..';

  function abbreviateAddr(full) {
    if (!full || full.includes('?뺤씤 以?)) return full;
    // [TDD] ?쒖슱?밸퀎??媛뺣궓援???궪??-> ?쒖슱 媛뺣궓 ??궪 (異뺤빟 媛뺥솕)
    return full.split(' ')
      .map(s => s.replace(/?밸퀎??愿묒뿭???밸퀎?먯튂???밸퀎?먯튂??g, '')
        .replace(/(????援?????硫?由?$/g, ''))
      .filter(s => s.length > 0)
      .join(' ');
  }

  function updateTripStatusLine() {
    const dateDisplay = document.getElementById('trip-date-display');
    const sep1 = document.getElementById('trip-status-sep1');
    const gpsChip = document.getElementById('trip-gps-chip');
    const sep2 = document.getElementById('trip-status-sep2');
    const addrDisplay = document.getElementById('trip-addr-display');

    if (State.trip.status === 'idle') {
      if (dateDisplay) { dateDisplay.textContent = '?댁넚?쒖옉 ?湲곗쨷'; dateDisplay.style.color = 'var(--primary)'; dateDisplay.style.fontWeight = '700'; dateDisplay.innerHTML = '?댁넚?쒖옉 ?湲곗쨷'; }
      if (sep1) sep1.style.display = 'none';
      if (gpsChip) gpsChip.style.display = 'none';
      if (sep2) sep2.style.display = 'none';
      if (addrDisplay) addrDisplay.style.display = 'none';
      return;
    }

    // GPS ?곹깭 ?먮퀎 (?섏떊 ??interval * 2 ?대궡媛 ?꾨땲硫?down)
    const deadTimeout = Math.max(currentGpsInterval * 2, 90_000); // 理쒖냼 90珥덈뒗 ?덉슜
    const isDown = !lastGpsTimestamp || (Date.now() - lastGpsTimestamp > deadTimeout);
    let gpsColor = '#10b981'; // 珥덈줉 (?섏떊以?
    let gpsText = `${Math.round(currentGpsInterval / 1000)}s`;

    if (State.trip.status === 'paused') {
      gpsColor = '#ef4444'; // 鍮④컯 (?섏떊以묒?)
      gpsText = '?섏떊以묒?';
    } else if (isDown) {
      gpsColor = '#ef4444'; // 鍮④컯 (?섏떊?덈맖)
      gpsText = '?섏떊?덈맖';
    } else if (State.trip.isRealtime) {
      gpsColor = '#f59e0b'; // 二쇳솴 (?ㅼ떆媛??뱀“??
      gpsText = '?ㅼ떆媛?;
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
      addrDisplay.textContent = addrShort || '?꾩튂 ?뺤씤 以?..';
    }

    // ?ㅻ쾭?덉씠 ?꾩젽??GPS ?곹깭 ?꾩넚 (1珥??⑥쐞 ??대㉧?먯꽌 ?몄텧?섎?濡?throttle ?곸슜)
    const overlay = Overlay();
    if (overlay && (State.trip.status === 'driving' || State.trip.status === 'paused')) {
      overlay.updateStatus({
        status: State.trip.status,
        gpsText: gpsText,
        gpsColor: gpsColor,
        address: addrShort
      }).catch(() => { });
    }
  }

  async function onGpsUpdate(pos, isForced = false, forcedTripId = null) {
    const targetId = forcedTripId || State.trip.id;
    if (!targetId) return;

    // [TDD] 媛뺤젣 ?섏쭛(isForced)??寃쎌슦, ?쇱떆?뺤???醫낅즺 以묒씠?대룄 ?꾩튂瑜??꾩넚?댁빞 ??(以묓솚 ?꾪솚??
    if (State.trip.status !== 'driving' && !isForced) return;
    const { latitude: lat, longitude: lng, speed, accuracy } = pos.coords;
    const speedKph = (speed || 0) * 3.6;

    // watchPosition 肄쒕갚 ?쒖젏????꾩뒪?ы봽 媛깆떊 (startGPS?먯꽌???섏?留??댁쨷 蹂댁옣)
    lastGpsTimestamp = Date.now();

    // ?뺥솗?꾧? ?덈Т ??쑝硫?>200m) ?꾪꽣留?(?? 媛뺤젣?섏떊? ?덉쇅)
    if (!isForced && accuracy && accuracy > 200) {
      remoteLog(`GPS ?뺥솗????쓬: ${accuracy.toFixed(0)}m - ?꾩넚 ?ㅽ궢`, 'GPS_ACCURACY');
      updateTripStatusLine(); // ?곹깭?쒖떆??媛깆떊
      return;
    }

    // ?띾룄???곕Ⅸ 媛蹂 二쇨린 ?ㅼ젙
    let interval = 60_000;
    if (speedKph >= 60) interval = 30_000; // 怨좎냽: 30珥?
    else if (speedKph >= 20) interval = 45_000; // 以묒냽: 45珥?
    else interval = 60_000; // ????뺤?: 60珥?

    if (interval !== currentGpsInterval) {
      currentGpsInterval = interval;
    }

    // ?곹깭 ?쒖떆以?利됱떆 媛깆떊 (?꾩넚 ?щ?怨?臾닿??섍쾶 UI????긽 理쒖떊)
    updateTripStatusLine();

    const isSharpTurn = gyroData.magnitude > 25;
    const now = Date.now();
    const minInterval = isForced ? 0 : (isSharpTurn ? 10_000 : interval);
    if (!isForced && now - lastGpsSend < minInterval) return;

    lastGpsSend = now;

    // ?쒕쾭 ?꾩넚 + 移댁뭅??????ㅼ퐫???듯빀 (API ?몄텧 1?뚮줈 ?덇컧)
    // location API ?쒕쾭?먯꽌 移댁뭅?ㅻ줈 ?대? 二쇱냼瑜?異뺤빟??諛섑솚 ??蹂꾨룄 geocode ?몄텧 遺덊븘??
    try {
      const gpsRes = await smartFetch(BASE_URL + '/api/vehicle-tracking/location', {
        method: 'POST',
        body: JSON.stringify({
          trip_id: targetId,
          lat, lng,
          speed: speedKph,
          accuracy: accuracy || 0,
          source: isForced ? 'webview_forced' : (isSharpTurn ? 'webview_gyro' : 'webview')
        }),
      });
      // ?쒕쾭 ?묐떟?먯꽌 移댁뭅??????ㅼ퐫??二쇱냼 諛섏쁺 (?대? '?쒖슱 媛뺣궓 ??궪' ?뺥깭濡?異뺤빟)
      if (gpsRes.ok) {
        const gpsData = await gpsRes.json().catch(() => ({}));
        lastKnownAddr = gpsData.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      } else {
        lastKnownAddr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }
      updateTripStatusLine();
      remoteLog(`GPS?꾩넚: ${lastKnownAddr} spd=${speedKph.toFixed(0)}kph acc=${accuracy?.toFixed(0)}m gyro=${gyroData.magnitude.toFixed(1)} force=${isForced}`, 'GPS_OK');
    } catch (e) {
      lastKnownAddr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      updateTripStatusLine();
      remoteLog(`GPS ?쒕쾭?꾩넚 ?ㅽ뙣: ${e.message}`, 'GPS_SEND_ERR');
      console.warn('GPS ?꾩넚 ?ㅽ뙣', e);
    }
  }

  // ????ㅼ퐫??(standalone 議고쉶????二쇱냼 ?쒖떆 紐⑹쟻???⑤룆 ?몄텧 ???ъ슜)
  // ?댄뻾 以?GPS ?꾩넚? location API ?묐떟?먯꽌 address瑜?吏곸젒 諛쏆븘 ?ъ슜?섎?濡????⑥닔??誘몄궗??
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

  // ??? 怨듭? ?????????????????????????????????????????????????????
  let _notices = [];

  async function loadNotices() {
    document.getElementById('notice-list').innerHTML = '<div class="loading"><div class="spinner"></div>遺덈윭?ㅻ뒗 以?..</div>';
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

      emerg.forEach(e => { e.isEmergency = true; e.category = '湲닿툒?뚮┝'; });

      const merged = [...emerg, ...norm].sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
      _notices = merged;
      renderNoticeList();

      if (merged.length === 0) {
        console.log('No notices found. norm:', norm.length, 'emerg:', emerg.length);
        document.getElementById('notice-list').innerHTML = '<div class="loading">?깅줉??怨듭??ы빆???놁뒿?덈떎.</div>';
      }
    } catch (e) {
      document.getElementById('notice-list').innerHTML = '<div class="loading">遺덈윭?ㅺ린 ?ㅽ뙣</div>';
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

    // ??UI ?ㅽ???蹂寃?
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
      const cat = n.category || (n.isEmergency ? '湲닿툒?뚮┝' : '?쇰컲怨듭?');
      return cat === _currentNoticeFilter;
    });

    const html = filtered.map(n => {
      const dateVal = n.created_at || n.date || n.started_at;
      const dateStr = dateVal ? formatDate(new Date(dateVal)) : '??;
      const cat = n.category || (n.isEmergency ? '湲닿툒?뚮┝' : '?쇰컲怨듭?');

      let prefix = '';
      if (cat === '湲닿툒?뚮┝') prefix = '<span style="color:#ef4444; font-weight:700; margin-right:4px;">?슚[湲닿툒]</span>';
      else if (cat !== '?쇰컲怨듭?') prefix = `<span style="color:#0ea5e9; font-weight:700; margin-right:4px;">[${escHtml(cat)}]</span>`;

      let title = escHtml(n.title || n.message || '?쒕ぉ ?놁쓬');
      if (title.startsWith('[湲닿툒] ')) title = title.replace('[湲닿툒] ', '');

      return `
        <div class="notice-item ${read.includes(n.id) ? '' : 'notice-item-unread'}" onclick="App.openNotice('${n.id}')">
          <div class="notice-item-title" style="display:flex; align-items:flex-start;">
             <span style="flex-shrink:0;">${prefix}</span>
             <span style="flex:1; line-height:1.4;">${title}</span>
          </div>
          <div class="notice-item-meta" style="margin-top:4px;">${dateStr}</div>
        </div>
      `;
    }).join('') || '<div class="loading" style="margin-top:20px;">怨듭??ы빆???놁뒿?덈떎.</div>';

    document.getElementById('notice-list').innerHTML = html;
  }

  function openNotice(id) {
    const n = _notices.find(x => String(x.id) === String(id));
    if (!n) return;

    document.getElementById('notice-detail-title').textContent = n.title || '?쒕ぉ ?놁쓬';
    document.getElementById('notice-detail-meta').textContent = formatDate(new Date(n.created_at || n.date));
    const bodyEl = document.getElementById('notice-detail-body');
    if (bodyEl) {
      let raw = n.content || n.body || n.message || '';
      // [TDD] ?쇰컲 ?쒓렇 諛??댁쨷 ?몄퐫?⑸맂 ?쒓렇(&lt;p&gt;, &lt;br&gt;) 紐⑤몢 ?꾨꼍 ?쒓굅
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
    if (!read.includes(id)) { read.push(id); Store.set('readNotices', read); }
    detail.scrollTop = 0;
  }

  function closeNoticeDetail() {
    const detail = document.getElementById('notice-detail');
    detail.classList.remove('active');
    document.getElementById('notice-list').style.display = '';
  }

  //  // ?댄뻾 ?곗씠??諛??ъ쭊 珥덇린??(?ㅼ젙 踰꾪듉 ??珥덇린??踰꾪듉 諛??섏떆 ?몄텧??
  function clearTripData(bypassAuth = false) {
    if (!bypassAuth && State.trip.status !== 'idle') {
      showToast('?댄뻾 以묒뿉???댁슜 吏????ъ슜?????놁뒿?덈떎.');
      return;
    }
    // ?꾩옱 吏꾪뻾 以묒씤 ?몃┰???덉쑝硫?以묐떒
    if (State.trip.id) {
      // ?쒕쾭??醫낅즺 ?붿껌 ?놁씠 濡쒖뺄留??뺣━
      stopOverlayService();
      stopGPS();
      Store.rm('activeTrip');
    }
    State.trip = { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '' };
    State.photos = [];
    State.preTripDone = null; // 泥댄겕由ъ뒪??珥덇린??

    // ?먭? 踰꾪듉 珥덇린??
    const btnCheck = document.getElementById('btn-trip-checklist');
    if (btnCheck) {
      btnCheck.style.background = '#ef4444'; // red
      btnCheck.style.color = '#ffffff';
    }

    // UI 珥덇린??
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
    showToast('?댄뻾 ?곗씠?곌? 珥덇린?붾릺?덉뒿?덈떎.');
  }
  // ??? ?ъ쭊 ?낅줈????????????????????????????????????????????????
  function addPhoto() {
    if (State.photos.length >= 10) { showToast('理쒕? 10?κ퉴吏 泥⑤? 媛?ν빀?덈떎.'); return; }
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
          resolve(canvas.toDataURL('image/jpeg', 0.8)); // 80% ?덉쭏 ?뺤텞
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
      `<img class="photo-thumb" src="${p.serverUrl || p.dataUrl}" onclick="App.openPhotoViewer(${i})" alt="?ъ쭊${i + 1}">`
    ).join('');
    scroll.innerHTML = thumbs + (State.photos.length < 10 ? addBtn : '');
    document.getElementById('photo-count-display').textContent = `(${State.photos.length}/10)`;
  }

  async function uploadPendingPhotos() {
    const currentTripId = State.trip.id;
    if (!currentTripId) { console.warn('uploadPendingPhotos: trip.id ?놁쓬'); return; }

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
          // ?쒕쾭?먯꽌 ???꾩껜 紐⑸줉?쇰줈 濡쒖뺄 ?곹깭 ?숆린??
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
      showToast(`?ъ쭊 ${uploadedCount}???낅줈???꾨즺`);
    }
  }


  function openPhotoViewer(idx, type = 'trip') {
    State.currentPhotoIdx = idx;
    State.viewerType = type;
    resetZoom();

    const delBtn = document.getElementById('photo-viewer-delete-btn');
    // ?쇱? ??뿉?쒕룄 ?ъ쭊 ??젣媛 媛?ν븯?꾨줉 ?붿껌?섏뀲?쇰?濡???긽 ?쒖떆?섍굅??議곌굔遺 ?쒖떆
    if (delBtn) delBtn.style.display = 'inline-block';

    document.getElementById('photo-viewer').classList.add('active');
    updatePhotoViewerUI();
  }

  // ?쇱? ?꾩슜 酉곗뼱 ?닿린 (湲곗〈 肄붾뱶 ?명솚??
  function openLogPhoto(url, idx, total) {
    // url ?몄옄??臾댁떆?섍퀬 State.logPhotos瑜?湲곕컲?쇰줈 ?숈옉?섎룄濡??듯빀
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
    if (!confirm('?꾩옱 蹂닿퀬 ?덈뒗 ?ъ쭊????젣?섏떆寃좎뒿?덇퉴?')) return;

    if (State.viewerType === 'profile') {
      const p = State.profilePhotos[State.currentPhotoIdx];
      State.profile[`photo_${p.type}`] = '';

      let fallbackText = '';
      if (p.type === 'driver') fallbackText = '??;
      if (p.type === 'vehicle') fallbackText = '李?;
      if (p.type === 'chassis') fallbackText = '??;
      updateProfilePhoto(`p-photo-${p.type}`, '', fallbackText);

      showToast('??젣?섏뿀?듬땲?? ?뺣낫 ??μ쓣 ?뚮윭???꾩쟾??諛섏쁺?⑸땲??');
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
        if (!res.ok) throw new Error('?쒕쾭 ?듭떊 ?ㅽ뙣');
        State.logPhotos = photos;
        showToast('?ъ쭊????젣?섏뿀?듬땲??');

        if (State.logPhotos.length === 0) {
          closePhotoViewer();
        } else {
          if (State.currentPhotoIdx >= State.logPhotos.length) State.currentPhotoIdx = State.logPhotos.length - 1;
          updatePhotoViewerUI();
        }
        openLog(State.currentLogId); // 由ъ뒪??UI 媛깆떊
      } catch (e) {
        showToast('?ъ쭊 ??젣 ?ㅽ뙣: ' + e.message);
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

  // ??? ?쇱? ?????????????????????????????????????????????????????
  let _currentLogData = null;

  async function loadLogs() {
    document.getElementById('log-list').innerHTML = '<div class="loading"><div class="spinner"></div>遺덈윭?ㅻ뒗 以?..</div>';
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
      if (!trips.length) { document.getElementById('log-list').innerHTML = '<div class="loading">議고쉶 寃곌낵媛 ?놁뒿?덈떎.</div>'; return; }
      const statusLabel = { driving: '?댁넚以?, paused: '?쇱떆?뺤?', completed: '?꾨즺' };
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
              <span class="log-item-container">${escHtml(t.container_number || '而⑦뀒?대꼫 誘몄엯??)}</span>
              <span class="log-item-status" style="color:${statusColor[t.status] || 'var(--text-muted)'};border-color:${statusColor[t.status] || 'var(--text-muted)'};">${statusLabel[t.status] || t.status}</span>
            </div>
            <div class="log-item-meta" style="display:flex; justify-content:space-between; align-items:center;">
              <span>${formatDate(new Date(t.started_at))} 쨌 ${escHtml(t.vehicle_number || '')}</span>
              ${pCount > 0 ? `<span style="font-size:10px; color:var(--accent); font-weight:700;">?벝 ${pCount}??/span>` : ''}
            </div>
          </div>
        `;
      }).join('');

    } catch (e) {
      document.getElementById('log-list').innerHTML = '<div class="loading">遺덈윭?ㅺ린 ?ㅽ뙣</div>';
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
      onLogFieldChange(); // 濡쒕뱶 ??利됱떆 ?좏슚??寃???ㅽ뻾

      // ?댄뻾 ???먭? ??ぉ(5媛? ?뺤씤 濡쒖쭅
      const isAllChecked = !!(data.chk_brake && data.chk_tire && data.chk_lamp && data.chk_cargo && data.chk_driver);

      // 湲곕낯 ?뺣낫 (?쒖옉/醫낅즺 ?쇱떆 媛뺤“) [TDD: ended_at || completed_at fallback]
      const endedAt = data.ended_at || data.completed_at || null;
      document.getElementById('log-detail-content').innerHTML = `
        <div class="log-detail-info-box">
          <div class="log-detail-info-row">
            <span class="log-detail-info-label">踰덊샇 / ?곹깭</span>
            <span style="display:flex;align-items:center;gap:6px;">
              <span>${escHtml(data.vehicle_number || '??)}</span>
              <span style="color:#cbd5e1;">|</span>
              <span style="font-weight:700;">${data.status === 'completed' ? '?꾨즺' : (data.status === 'driving' ? '?댁넚以? : (data.status === 'paused' ? '?쇱떆?뺤?' : data.status))}</span>
              ${data.status !== 'completed' ? `<button onclick="App.forceCompleteLog('${data.id}')" class="btn btn-sm btn-warn" style="font-size:10px;padding:2px 6px;height:auto;margin-left:4px;">醫낅즺泥섎━</button>` : ''}
            </span>
          </div>
          <div class="log-detail-info-row"><span class="log-detail-info-label">?댄뻾 ?쒖옉</span><span style="font-weight:700;color:var(--accent);">${formatDate(new Date(data.started_at))}</span></div>
          ${endedAt ? `<div class="log-detail-info-row"><span class="log-detail-info-label">?댄뻾 醫낅즺</span><span style="font-weight:700;color:var(--danger);">${formatDate(new Date(endedAt))}</span></div>` : ''}
          <div class="log-detail-info-row"><span class="log-detail-info-label">?쒖썝 / ?먭?</span><span>${data.container_type || '??} / ${data.container_kind || '??} <span style="color:#cbd5e1;margin:0 4px;">|</span> <span style="color:${isAllChecked ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${isAllChecked ? '?먭??꾨즺' : '誘몄젏寃'}</span></span></div>
        </div>
      `;


      // ?ъ쭊 紐⑸줉 ?뚮뜑留?
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
          return url ? `<img class="photo-thumb" src="${url}" onclick="App.openLogPhoto('${escHtml(url)}', ${i}, ${photos.length})" alt="?ъ쭊${i + 1}">` : '';
        }).join('');
        photoScroll.innerHTML = html;
      }

      document.getElementById('log-list').style.display = 'none';
      document.getElementById('log-detail').classList.add('active');
    } catch (e) { showToast('遺덈윭?ㅺ린 ?ㅽ뙣'); }
  }

  // ?쇱? ?곸꽭 而⑦뀒?대꼫/???꾨뱶 蹂寃??몃뱾??(?臾몄옄, trim, ISO6346 寃利?
  function onLogFieldChange() {
    const cEl = document.getElementById('log-edit-container');
    const sEl = document.getElementById('log-edit-seal');
    if (!cEl || !sEl) return;

    // [TDD] ?臾몄옄 諛??レ옄留??덉슜
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
            errEl.textContent = '?좏슚??踰덊샇?낅땲??; errEl.style.color = 'var(--primary)';
          } else {
            errEl.textContent = '而⑦뀒?대꼫踰덊샇 ?ㅺ린??; errEl.style.color = 'var(--danger)';
          }
        } else {
          errEl.textContent = '?낅젰 以?..'; errEl.style.color = 'var(--text-muted)';
        }
      } else {
        errEl.textContent = '?곷Ц 4??+ ?レ옄 7??; errEl.style.color = 'var(--danger)';
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
      showToast('??λ릺?덉뒿?덈떎.');
      closeLogDetail();
      loadLogs();
    } catch (e) { showToast('????ㅽ뙣'); }
  }

  async function deleteLog() {
    if (!State.currentLogId || !confirm('???댄뻾 湲곕줉????젣?섏떆寃좎뒿?덇퉴?')) return;
    try {
      const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.currentLogId}`, { method: 'DELETE' });
      if (res && res.ok === false) throw new Error('?쒕쾭 沅뚰븳/?묐떟 ?ㅻ쪟');

      // [TDD] ?꾩옱 ?댄뻾 以묒씤 ?몃┰????젣??寃쎌슦, ?댄뻾 ?붾㈃??珥덇린??(?숆린???댁뒋 ?닿껐)
      if (String(State.currentLogId) === String(State.trip.id)) {
        console.log('Active trip deleted from log. Resetting current trip state.');
        clearTripData();
      }

      showToast('??젣?섏뿀?듬땲??');
      closeLogDetail();
      loadLogs();
    } catch (e) { showToast('??젣 ?ㅽ뙣'); }
  }
  async function forceCompleteLog(id) {
    if (!confirm('???댄뻾??媛뺤젣濡??댄뻾醫낅즺 泥섎━?섏떆寃좎뒿?덇퉴?')) return;
    try {
      const endedAtIso = new Date().toISOString();
      await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', ended_at: endedAtIso })
      });
      showToast('?댄뻾醫낅즺 ?섏뿀?듬땲??');

      // ?꾩옱 吏꾪뻾以묒씤 ?댄뻾?댁뿀?ㅻ㈃ 利됱떆 idle ?곹깭濡?珥덇린?붿떆耳쒖꽌 瑗ъ엫 諛⑹?
      if (String(State.trip.id) === String(id)) {
        clearTripData(true); // bypassAuth=true
        updateTripStatusLine();
      }

      closeLogDetail();
      loadLogs();
      // openLog(id); ??媛?ν븯吏留?紐⑸줉 ?낅뜲?댄듃瑜??꾪빐 closeLogDetail?섎뒗寃?源붾걫??
    } catch (e) {
      showToast('?댄뻾醫낅즺 泥섎━ ?ㅽ뙣');
    }
  }

  function closeLogDetail() {
    document.getElementById('log-detail').classList.remove('active');
    document.getElementById('log-list').style.display = '';
    State.currentLogId = null;
  }

  function addLogPhoto() {
    if ((State.logPhotos || []).length >= 10) { showToast('理쒕? 10?κ퉴吏 泥⑤? 媛?ν빀?덈떎.'); return; }
    document.getElementById('log-file-input-hidden').click();
  }

  async function onLogFileSelected(e) {
    const files = Array.from(e.target.files);
    e.target.value = '';

    if (!State.currentLogId) return;

    const photos = State.logPhotos || [];
    if (photos.length >= 10) { showToast('理쒕? 10?κ퉴吏留?媛?ν빀?덈떎.'); return; }

    const uploadCount = Math.min(files.length, 10 - photos.length);
    if (uploadCount <= 0) return;

    showToast(`?ъ쭊 ${uploadCount}?μ쓣 ?낅줈??以묒엯?덈떎...`, 5000);

    try {
      showToast(`?ъ쭊 ${uploadCount}?μ쓣 ?뺤텞/?낅줈??以?..`, 5000);
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
          renderPhotoThumbs(); // ?몃꽕??利됱떆 媛깆떊
        }
      }

      if (successCount > 0) {
        await openLog(State.currentLogId); // UI 理쒖쥌 媛깆떊
        showToast(`?ъ쭊 ${successCount}???낅줈???깃났`);
      }
    } catch (err) {
      console.error('onLogFileSelected error', err);
      showToast('?낅줈??以??ㅻ쪟 諛쒖깮');
    }
  }


  // ??? 湲닿툒?뚮┝ ?????????????????????????????????????????????????
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
      for (const item of items) {
        if (State.emergencyIds.has(item.id)) continue;
        State.emergencyIds.add(item.id);
        Store.set('emergencyIds', Array.from(State.emergencyIds));
        showEmergencyPopup(item);
        sendNativeEmergencyNotif(item);
      }
    } catch (e) { /* 議곗슜???ㅽ뙣 */ }
  }

  function showEmergencyPopup(item) {
    document.getElementById('emergency-body').textContent = item.message || item.content || '';
    document.getElementById('emergency-popup').classList.add('active');
  }

  function closeEmergency() { document.getElementById('emergency-popup').classList.remove('active'); }

  function sendNativeEmergencyNotif(item) {
    const em = Emergency();
    if (em) {
      em.showEmergencyAlert({ title: '?좑툘 ELS 湲닿툒?뚮┝', message: item.message || '', id: item.id }).catch(() => { });
    }
  }

  // ??? ?낅뜲?댄듃 ?뺤씤 ????????????????????????????????????????????
  async function checkUpdate(auto = false) {
    try {
      const res = await smartFetch(VERSION_URL + '?t=' + Date.now()).catch(() => null);
      if (!res) return;
      const data = await res.json().catch(() => ({}));

      const remoteVersion = (data.latestVersion || '').trim();
      const localVersion = APP_VERSION.trim();

      const hasUpdate = data.versionCode > BUILD_CODE || (remoteVersion !== localVersion && remoteVersion !== '' && !localVersion.includes(remoteVersion));

      if (!hasUpdate) {
        if (!auto) showToast('?대? 理쒖떊 踰꾩쟾?낅땲??(' + APP_VERSION + ')');
        return;
      }

      // [?덉쟾 ?곗꽑] ?댄뻾 以묒씠硫??앹뾽???꾩슦吏 ?딄퀬 ?좎삁 泥섎━
      const isActive = State.trip.status === 'driving' || State.trip.status === 'paused';
      if (auto && isActive) {
        State.pendingUpdate = true;
        console.log('?낅뜲?댄듃 ?좎삁: ?댄뻾 以??앹뾽 李⑤떒. ?댄뻾 醫낅즺 ???뚮┝ ?덉젙.');
        return;
      }

      const msg = `?덈줈??踰꾩쟾(${data.latestVersion})??異쒖떆?섏뿀?듬땲??\n\n[蹂寃쎈궡??\n${data.changeLog}\n\n吏湲??ㅼ튂?섏떆寃좎뒿?덇퉴? (誘몄꽕移????쇰? 湲곕뒫???쒗븳?????덉뒿?덈떎.)`;
      if (confirm(msg)) {
        if (window.Capacitor?.Plugins?.Browser) {
          window.Capacitor.Plugins.Browser.open({ url: data.downloadUrl });
        } else {
          window.open(data.downloadUrl, '_blank');
        }
      } else if (auto) {
        showToast('?먰솢???섍꼍???꾪빐 理쒖떊 踰꾩쟾?쇰줈 ?낅뜲?댄듃 ??二쇱꽭??', 5000);
      }
    } catch (e) {
      if (!auto) console.error('?낅뜲?댄듃 ?뺤씤 ?ㅽ뙣', e);
    }
  }

  // ??? ??醫낅즺 ??????????????????????????????????????????????????
  function exitApp() {
    if (window.isTripActive()) {
      showToast('?댄뻾 以묒뿉??醫낅즺?????놁뒿?덈떎. ?댄뻾 醫낅즺 ????醫낅즺媛 媛?ν빀?덈떎.');
      return;
    }
    if (!confirm('?깆쓣 醫낅즺?섏떆寃좎뒿?덇퉴?')) return;

    if (window.Capacitor?.Plugins?.App) {
      window.Capacitor.Plugins.App.exitApp();
    } else {
      showToast('?깆쓣 吏곸젒 ?レ븘二쇱꽭??');
    }
  }

  // ??? ?좏떥 ?????????????????????????????????????????????????????
  function formatDate(d) {
    if (!(d instanceof Date) || isNaN(d)) return '??;
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
    showToast('沅뚰븳 ?곹깭瑜??뺤씤 以묒엯?덈떎...');
    await updatePermStatuses();
    showToast('沅뚰븳 ?곹깭媛 ?덈줈怨좎묠?섏뿀?듬땲??');
  }


  // ??? 怨듦컻 API ?????????????????????????????????????????????????
  window.App = {
    // 沅뚰븳
    requestPerm, updatePermStatuses, manualRefreshPerms, finishPermSetup, openPermissionSetup, clearCache, settingsBack, resetApp,
    showTerms, closeTerms,
    // ?꾨줈??
    saveProfile, lookupDriver, pickProfilePhoto, handleProfilePhotoClick,
    // ?댄뻾
    onTripFieldChange, startTrip, togglePause, endTrip, saveMemo, clearTripData,
    // ?ㅻ퉬
    switchTab, showScreen, openSettings, handleBackButton: () => window.handleBackButton(),
    // 怨듭?
    openNotice, closeNoticeDetail, filterNotice,
    // ?먭? ?앹뾽
    openChecklist, closeChecklist, saveChecklist,
    // ?ъ쭊
    addPhoto, onFileSelected, openPhotoViewer, closePhotoViewer, prevPhoto, nextPhoto, deleteCurrentPhoto,
    // ?쇱?
    loadLogs, openLog, saveLogEdit, onLogFieldChange, deleteLog, closeLogDetail, openLogPhoto, addLogPhoto, onLogFileSelected, forceCompleteLog,
    // 湲닿툒
    closeEmergency,
    // ?낅뜲?댄듃/醫낅즺
    checkUpdate, exitApp,
  };

  // ??? ?移?以?(?ъ쭊 ???먭????뺣?) ??????????????????????????????????????????
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
      // ?붾툝 ??泥댄겕
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

        // 異뺤냼媛 1???섎㈃ 以묒떖 珥덇린??
        if (currentZoom <= 1.01) { currentTransX = 0; currentTransY = 0; }

        img.style.transform = `translate(${currentTransX}px, ${currentTransY}px) scale(${currentZoom})`;
      } else if (e.touches.length === 1 && isDragging && currentZoom > 1) {
        e.preventDefault();
        currentTransX = e.touches[0].pageX - startX;
        currentTransY = e.touches[0].pageY - startY;

        // 寃쎄퀎 ?쒗븳 (??듭쟻??蹂댁젙)
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


  // ?쒖옉
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); initPinchZoom(); });
  } else {
    init(); initPinchZoom();
  }

})();
