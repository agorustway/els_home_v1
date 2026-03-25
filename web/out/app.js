/**
 * ELS Driver App v4.0
 * 단일 IIFE 번들 — Capacitor 플러그인 브릿지 사용
 */
(function () {
  'use strict';

  const APP_VERSION = 'v4.0.0';
  const BASE_URL = 'https://nollae.com';
  const VERSION_URL = BASE_URL + '/apk/version.json';

  // ─── Capacitor 플러그인 헬퍼 ──────────────────────────────────
  function getPlugin(name) {
    try { return window.Capacitor?.Plugins?.[name] || null; } catch { return null; }
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
          data: options.body || undefined,
        });
        return { ok: res.status < 400, status: res.status, json: async () => res.data };
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

  // ─── 앱 초기화 ────────────────────────────────────────────────
  async function init() {
    // Capacitor 브릿지 대기
    if (window.Capacitor) {
      await new Promise(r => {
        if (window.Capacitor.isPluginAvailable('CapacitorHttp')) { r(); return; }
        window.addEventListener('load', r, { once: true });
        setTimeout(r, 800);
      });
    }

    document.getElementById('app-version-display').textContent = APP_VERSION;

    // 프로필 로드
    const profile = Store.get('profile');
    if (profile) {
      Object.assign(State.profile, profile);
      applyProfileToUI();
    }

    // 최초 실행 여부 체크
    const firstRun = !Store.get('permSetupDone');
    if (firstRun) {
      showScreen('permission');
      updatePermStatuses();
    } else {
      showScreen('main');
      switchTab('trip');
      loadCurrentTrip();
      loadNotices();
      startEmergencyPoll();
    }

    // goto_tab 딥링크 (서비스에서 복귀)
    const gotoTab = new URLSearchParams(window.location.search).get('goto_tab');
    if (gotoTab) switchTab(gotoTab);
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
    const driverId  = document.getElementById('s-id').value.trim();
    if (!name || !phone || !vehicleNo) { showToast('이름, 전화번호, 차량번호는 필수입니다.'); return; }
    State.profile = { name, phone, vehicleNo, driverId };
    Store.set('profile', State.profile);
    applyProfileToUI();
    upsertDriverContact();
    showToast('정보가 저장되었습니다.');
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
    const overlay = Overlay();
    if (overlay) {
      const r = await overlay.checkPermission().catch(() => ({ granted: false }));
      setPermStatus('overlay', r.granted);
    }
  }

  function setPermStatus(type, ok) {
    const el = document.getElementById('perm-' + type + '-status');
    if (!el) return;
    el.textContent = ok ? '허용' : '미설정';
    el.className = 'perm-status ' + (ok ? 'perm-ok' : 'perm-ng');
  }

  async function requestPerm(type) {
    const overlay = Overlay();
    switch (type) {
      case 'location':
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            () => setPermStatus('loc', true),
            () => showToast('위치 권한을 설정에서 허용해 주세요.')
          );
        }
        break;
      case 'overlay':
        if (overlay) {
          const r = await overlay.requestPermission().catch(e => ({ opened: false, error: e.message }));
          if (!r.opened) showToast('오버레이 설정 화면 진입 실패');
        }
        break;
      case 'battery':
        if (overlay) { await overlay.requestBatteryOptimization().catch(() => {}); }
        break;
      case 'camera':
        try {
          await navigator.mediaDevices.getUserMedia({ video: true });
          setPermStatus('camera', true);
        } catch {}
        break;
      case 'notification':
        if ('Notification' in window) {
          const r = await Notification.requestPermission();
          setPermStatus('notif', r === 'granted');
        }
        break;
    }
    setTimeout(updatePermStatuses, 1500);
  }

  function finishPermSetup() {
    Store.set('permSetupDone', true);
    showScreen('main');
    switchTab('trip');
    loadNotices();
    startEmergencyPoll();
  }

  function resetApp() {
    if (!confirm('앱을 초기화하면 저장된 정보가 모두 삭제됩니다. 계속하시겠습니까?')) return;
    localStorage.clear();
    State.profile = { name: '', phone: '', vehicleNo: '', driverId: '' };
    showScreen('permission');
    updatePermStatuses();
  }

  // ─── 운행 관리 ────────────────────────────────────────────────
  function onTripFieldChange() {
    State.trip.containerNo = document.getElementById('container-no').value;
    State.trip.sealNo      = document.getElementById('seal-no').value;
  }

  async function loadCurrentTrip() {
    const saved = Store.get('activeTrip');
    if (!saved) return;
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
      setTripStatus(data.status);
      updateTripUI();
    } else {
      Store.rm('activeTrip');
    }
  }

  async function startTrip() {
    if (!State.profile.name || !State.profile.vehicleNo) {
      showToast('차량 정보(이름/차량번호)를 먼저 설정 탭에서 입력해 주세요.');
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
      const data = await res.json();
      if (!data.id) throw new Error(data.error || '운행 시작 실패');

      State.trip.id = data.id;
      State.trip.status = 'driving';
      State.trip.startTime = Date.now();
      Store.set('activeTrip', { id: data.id, startTime: State.trip.startTime });

      document.getElementById('trip-date-display').textContent = formatDate(new Date());
      setTripStatus('driving');
      updateTripUI();
      startOverlayService();
      startGPS();
      showToast('운행이 시작되었습니다.');
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
    if (!confirm('운행을 종료하시겠습니까?')) return;
    try {
      await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.trip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'finish' }),
      });
      stopOverlayService();
      stopGPS();
      Store.rm('activeTrip');
      State.trip = { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '' };
      setTripStatus('idle');
      updateTripUI();
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

    // 운행 날짜
    if (State.trip.startTime) {
      document.getElementById('trip-date-display').textContent = formatDate(new Date(State.trip.startTime));
    }
  }

  // JS에서 운행 상태 확인 (네이티브 뒤로가기 처리용)
  window.isTripActive = () => State.trip.status === 'driving' || State.trip.status === 'paused';

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

  async function onGpsUpdate(pos) {
    if (State.trip.status !== 'driving') return;
    const { latitude: lat, longitude: lng, speed } = pos.coords;
    const speedKph = (speed || 0) * 3.6;

    let interval;
    if (speedKph >= 60) interval = 30_000;
    else if (speedKph >= 20) interval = 60_000;
    else if (speedKph >= 5)  interval = 120_000;
    else                      interval = 300_000;

    // 급회전 감지 즉시 전송
    const isSharpTurn = gyroData.magnitude > 30;
    const now = Date.now();
    if (now - lastGpsSend < (isSharpTurn ? 10_000 : interval)) return;

    lastGpsSend = now;
    currentGpsInterval = interval;

    // 주소 역지오코딩 (현위치 헤더 표시)
    reverseGeocode(lat, lng).then(addr => {
      const el = document.getElementById('trip-addr-display');
      if (addr && el) { el.textContent = addr; el.classList.remove('hidden'); }
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
      const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/notices`);
      const data = await res.json();
      _notices = data.notices || data || [];
      renderNoticeList();
    } catch (e) {
      document.getElementById('notice-list').innerHTML = '<div class="loading">불러오기 실패</div>';
    }
  }

  function renderNoticeList() {
    const read = Store.get('readNotices') || [];
    const html = _notices.map(n => `
      <div class="notice-item ${read.includes(n.id) ? '' : 'notice-item-unread'}" onclick="App.openNotice(${n.id})">
        <div class="notice-item-title">${escHtml(n.title)}</div>
        <div class="notice-item-meta">${formatDate(new Date(n.created_at || n.date))}</div>
      </div>
    `).join('') || '<div class="loading">공지사항이 없습니다.</div>';
    document.getElementById('notice-list').innerHTML = html;
  }

  function openNotice(id) {
    const n = _notices.find(x => x.id === id);
    if (!n) return;
    document.getElementById('notice-detail-title').textContent = n.title;
    document.getElementById('notice-detail-meta').textContent  = formatDate(new Date(n.created_at || n.date));
    document.getElementById('notice-detail-body').textContent  = n.content || n.body || '';
    document.getElementById('notice-list').style.display   = 'none';
    document.getElementById('notice-detail').classList.add('active');
    document.getElementById('header-back').classList.remove('hidden');

    // 읽음 처리
    const read = Store.get('readNotices') || [];
    if (!read.includes(id)) { read.push(id); Store.set('readNotices', read); }
  }

  function closeNoticeDetail() {
    document.getElementById('notice-detail').classList.remove('active');
    document.getElementById('notice-list').style.display = '';
    document.getElementById('header-back').classList.add('hidden');
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

  function readFileAsDataURL(file) {
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
    if (!State.trip.id) return;
    for (let i = 0; i < State.photos.length; i++) {
      const p = State.photos[i];
      if (p.uploaded) continue;
      try {
        const base64 = p.dataUrl.split(',')[1];
        const res = await smartFetch(BASE_URL + '/api/vehicle-tracking/photos', {
          method: 'POST',
          body: JSON.stringify({
            trip_id:   State.trip.id,
            image_data: base64,
            mime_type:  p.dataUrl.split(';')[0].split(':')[1],
          }),
        });
        const data = await res.json();
        if (data.url) { State.photos[i].serverUrl = data.url; State.photos[i].uploaded = true; }
      } catch (e) { console.warn('사진 업로드 실패', e); }
    }
  }

  // 사진 뷰어
  function openPhotoViewer(idx) {
    State.currentPhotoIdx = idx;
    document.getElementById('photo-viewer').classList.add('active');
    showPhotoViewerImage();
  }
  function showPhotoViewerImage() {
    const p = State.photos[State.currentPhotoIdx];
    if (!p) return;
    document.getElementById('photo-viewer-img').src = p.serverUrl || p.dataUrl;
    document.getElementById('photo-viewer-index').textContent = `${State.currentPhotoIdx + 1} / ${State.photos.length}`;
  }
  function closePhotoViewer() { document.getElementById('photo-viewer').classList.remove('active'); }
  function prevPhoto() { if (State.currentPhotoIdx > 0) { State.currentPhotoIdx--; showPhotoViewerImage(); } }
  function nextPhoto() { if (State.currentPhotoIdx < State.photos.length - 1) { State.currentPhotoIdx++; showPhotoViewerImage(); } }

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
      document.getElementById('log-list').innerHTML = trips.map(t => `
        <div class="log-item" onclick="App.openLog('${t.id}')">
          <div class="log-item-header">
            <span class="log-item-container">${escHtml(t.container_number || '컨테이너 미입력')}</span>
            <span class="log-item-status" style="color:${statusColor[t.status]||'var(--text-muted)'};border-color:${statusColor[t.status]||'var(--text-muted)'};">${statusLabel[t.status]||t.status}</span>
          </div>
          <div class="log-item-meta">${formatDate(new Date(t.started_at))} · ${escHtml(t.vehicle_number||'')} · 씰 ${escHtml(t.seal_number||'—')}</div>
        </div>
      `).join('');
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
      document.getElementById('log-detail-content').innerHTML = `
        <div style="font-size:13px;color:var(--text-2);line-height:1.8;">
          <b>차량번호:</b> ${escHtml(data.vehicle_number||'—')}<br>
          <b>운행일:</b> ${formatDate(new Date(data.started_at))}<br>
          <b>상태:</b> ${data.status||'—'}<br>
          <b>타입:</b> ${data.container_type||'—'} / ${data.container_kind||'—'}
        </div>
      `;
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
      await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${State.currentLogId}`, { method: 'DELETE' });
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
  async function checkUpdate() {
    try {
      const res  = await smartFetch(VERSION_URL);
      const data = await res.json();
      const latest = data.latestVersion;
      if (latest && latest !== APP_VERSION) {
        if (confirm(`새 버전(${latest})이 있습니다. 지금 업데이트하시겠습니까?`)) {
          window.open(BASE_URL + '/apk/els_driver.apk', '_blank');
        }
      } else {
        showToast('최신 버전입니다: ' + APP_VERSION);
      }
    } catch (e) { showToast('업데이트 확인 실패'); }
  }

  // ─── 앱 종료 ──────────────────────────────────────────────────
  function exitApp() {
    if (window.isTripActive()) {
      showToast('운행 중에는 종료할 수 없습니다. 운행 종료 후 앱 종료가 가능합니다.');
      return;
    }
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

  // ─── 공개 API ─────────────────────────────────────────────────
  window.App = {
    // 권한
    requestPerm, finishPermSetup, updatePermStatuses, resetApp,
    // 프로필
    saveProfile, lookupDriver,
    // 운행
    onTripFieldChange, startTrip, togglePause, endTrip, saveMemo,
    // 네비
    switchTab, headerBack,
    // 공지
    openNotice, closeNoticeDetail,
    // 사진
    addPhoto, onFileSelected, openPhotoViewer, closePhotoViewer, prevPhoto, nextPhoto,
    // 일지
    loadLogs, openLog, saveLogEdit, deleteLog, closeLogDetail,
    // 긴급
    closeEmergency,
    // 업데이트/종료
    checkUpdate, exitApp,
  };

  // 시작
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
