/**
 * map.js — 네이버 지도 Dynamic SDK v3 엔진 (v4.8.0)
 *
 * ✅ Static Maps (raster-cors) 이미지 방식 완전 폐기
 * ✅ Naver Maps JS SDK v3 기반 네이티브 렌더링
 * ✅ naver.maps.Marker가 지도 내부에서 좌표를 직접 추적 → 마커 드리프트 원천 차단
 * ✅ 하단 패널 오버레이 방식 → 패널 토글 시 지도 리사이즈 불필요 (고무줄 현상 제거)
 */
import { State, BASE_URL } from './store.js?v=485';
import { smartFetch, remoteLog } from './bridge.js?v=485';
import { showToast } from './utils.js?v=485';
import { showScreen } from './nav.js?v=485';

// ─── 상수 ──────────────────────────────────────────────────────────
const NCP_KEY_ID   = 'hxoj79osnj';
const SDK_SCRIPT_ID = 'naver-map-sdk';

// ─── 모듈 내부 상태 ────────────────────────────────────────────────
let _map         = null;           // naver.maps.Map 인스턴스
let _markers     = new Map();      // tripId → naver.maps.Marker
let _myMarker    = null;           // 내 위치 마커
let _polyline    = null;           // 경로 Polyline
let _startMarker = null;           // 경로 출발점 마커
let _endMarker   = null;           // 경로 현재위치 마커
let _trips       = [];             // 최신 운행 데이터
let _mapPollTimer = null;          // 폴링 타이머
let _sdkReady    = false;          // SDK 로드 완료 여부

// ─── SDK 동적 로드 (openMap 시점에 lazy) ───────────────────────────
function loadNaverSDK() {
  return new Promise((resolve, reject) => {
    // 이미 로드된 경우
    if (window.naver?.maps?.Map) {
      _sdkReady = true;
      resolve();
      return;
    }

    // 이미 script 태그가 추가된 경우 → onload 대기
    const existing = document.getElementById(SDK_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => { _sdkReady = true; resolve(); });
      existing.addEventListener('error', reject);
      return;
    }

    // 새로 script 삽입
    const script = document.createElement('script');
    script.id    = SDK_SCRIPT_ID;
    script.src   = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NCP_KEY_ID}`;
    script.onload = () => {
      _sdkReady = true;
      remoteLog('[MAP] Naver SDK v3 로드 완료', 'MAP_SDK_OK');
      resolve();
    };
    script.onerror = (e) => {
      remoteLog('[MAP] Naver SDK v3 로드 실패', 'MAP_SDK_ERR');
      reject(e);
    };
    document.head.appendChild(script);
  });
}

// ─── 지도 초기화 ────────────────────────────────────────────────────
function initNaverMap() {
  const el = document.getElementById('driver-map');
  if (!el) return;

  // 이미 초기화된 경우 — DOM에 인스턴스가 살아있으면 재사용
  if (_map) {
    // 화면이 다시 보인 후 지도 크기 동기화
    naver.maps.Event.trigger(_map, 'resize');
    return;
  }

  _map = new naver.maps.Map(el, {
    center : new naver.maps.LatLng(36.5, 127.5),
    zoom   : 7,
    // 불필요한 UI 제거 (자체 back-btn, my-loc-btn 있음)
    mapDataControl   : false,
    scaleControl     : true,
    scaleControlOptions : {
      position: naver.maps.Position.BOTTOM_RIGHT,
    },
    zoomControlOptions : {
      position: naver.maps.Position.RIGHT_CENTER,
    },
  });

  remoteLog('[MAP] naver.maps.Map 초기화 완료', 'MAP_INIT');
}

// ─── 마커 아이콘 헬퍼 ───────────────────────────────────────────────
function makeVehicleIcon(label, color) {
  const html = [
    '<div style="',
    `background:${color};`,
    'color:#fff;',
    'border:2.5px solid #fff;',
    'border-radius:20px;',
    'padding:5px 12px;',
    'font-size:11px;',
    'font-weight:800;',
    'white-space:nowrap;',
    "box-shadow:0 2px 8px rgba(0,0,0,0.35);",
    "font-family:'Noto Sans KR',sans-serif;",
    '">',
    label,
    '</div>',
  ].join('');

  return {
    content: html,
    // 말풍선 아랫 꼭짓점이 좌표에 맞도록 앵커 설정
    anchor : new naver.maps.Point(18, 36),
  };
}

function makeMyLocIcon() {
  const html = [
    '<div style="',
    'width:16px;height:16px;',
    'background:#2563eb;',
    'border:3px solid #fff;',
    'border-radius:50%;',
    'box-shadow:0 2px 8px rgba(37,99,235,.6);',
    '"></div>',
  ].join('');

  return { content: html, anchor: new naver.maps.Point(8, 8) };
}

function makeWaypointIcon(label, color) {
  const html = [
    '<div style="',
    `background:${color};`,
    'color:#fff;',
    'border:2px solid #fff;',
    'border-radius:6px;',
    'padding:3px 8px;',
    'font-size:10px;',
    'font-weight:800;',
    'box-shadow:0 2px 6px rgba(0,0,0,0.3);',
    "font-family:'Noto Sans KR',sans-serif;",
    '">',
    label,
    '</div>',
  ].join('');

  return { content: html, anchor: new naver.maps.Point(20, 24) };
}

// ─── 마커 갱신 ──────────────────────────────────────────────────────
function updateVehicleMarkers(trips) {
  if (!_map) return;

  const contracted = (State.profile.driverId || '').toUpperCase().startsWith('ELSS');
  const visible    = trips.filter(t => t.lastLocation && (contracted || isMyTrip(t)));
  const visibleIds = new Set(visible.map(t => t.id));

  // 사라진 마커 제거
  for (const [id, marker] of _markers) {
    if (!visibleIds.has(id)) {
      marker.setMap(null);
      _markers.delete(id);
    }
  }

  // 갱신 또는 신규 추가
  for (const trip of visible) {
    const { lat, lng } = trip.lastLocation;
    const pos   = new naver.maps.LatLng(lat, lng);
    const isDone = trip.status === 'completed';
    const isMe   = isMyTrip(trip);
    const color  = isDone ? '#94a3b8' : (isMe ? '#10b981' : '#2563eb');
    const label  = trip.vehicle_number ? trip.vehicle_number.slice(-4) : '차량';

    if (_markers.has(trip.id)) {
      const m = _markers.get(trip.id);
      m.setPosition(pos);
      m.setIcon(makeVehicleIcon(label, color));
    } else {
      const m = new naver.maps.Marker({
        position : pos,
        map      : _map,
        icon     : makeVehicleIcon(label, color),
        title    : label,
        zIndex   : 100,
      });
      // 클릭 시 경로 조회
      naver.maps.Event.addListener(m, 'click', () => showTripRouteOnMap(trip));
      _markers.set(trip.id, m);
    }
  }
}

// ─── 경로(Polyline) 그리기 ───────────────────────────────────────────
function drawPolyline(path) {
  // 기존 경로/시작종료 마커 제거
  if (_polyline)    { _polyline.setMap(null);    _polyline    = null; }
  if (_startMarker) { _startMarker.setMap(null); _startMarker = null; }
  if (_endMarker)   { _endMarker.setMap(null);   _endMarker   = null; }

  if (!path.length || !_map) return;

  const haversine = (lat1, lng1, lat2, lng2) => {
    const p = 0.017453292519943295, c = Math.cos;
    const a = 0.5 - c((lat2 - lat1) * p) / 2 + c(lat1 * p) * c(lat2 * p) * (1 - c((lng2 - lng1) * p)) / 2;
    return 12742 * Math.asin(Math.sqrt(a));
  };

  const filteredPath = [];
  const SPEED_LIMIT_KMH = 150;

  for (let i = 0; i < path.length; i++) {
    const curr = path[i];
    if (filteredPath.length === 0) { filteredPath.push(curr); continue; }

    const prev = filteredPath[filteredPath.length - 1];
    const distKm = haversine(prev.lat, prev.lng, curr.lat, curr.lng);
    const timeSec = (new Date(curr.timestamp || curr.recorded_at) - new Date(prev.timestamp || prev.recorded_at)) / 1000;
    
    // 비정상적으로 빠른 속도(스파이크) 제거
    if (timeSec > 0) {
      const speed = distKm / (timeSec / 3600);
      if (speed > SPEED_LIMIT_KMH && distKm > 0.5) continue;
    } else {
      if (distKm > 0.5) continue; // 시간이 차이없는데 500m이상 튀면 제거
    }
    filteredPath.push(curr);
  }

  if (filteredPath.length === 0) return;

  const latLngs = filteredPath.map(l => new naver.maps.LatLng(l.lat, l.lng));

  _polyline = new naver.maps.Polyline({
    path          : latLngs,
    strokeColor   : '#2563eb',
    strokeWeight  : 4,
    strokeOpacity : 0.85,
    strokeStyle   : 'solid',
    map           : _map,
    zIndex        : 50,
  });

  // 출발 / 현재위치 마커
  _startMarker = new naver.maps.Marker({
    position : latLngs[0],
    map      : _map,
    icon     : makeWaypointIcon('출발', '#16a34a'),
    zIndex   : 200,
  });

  _endMarker = new naver.maps.Marker({
    position : latLngs[latLngs.length - 1],
    map      : _map,
    icon     : makeWaypointIcon('현재', '#dc2626'),
    zIndex   : 201,
  });

  // 하단 패널 높이를 감안한 여백으로 fitBounds
  try {
    const bounds = _polyline.getBounds();
    _map.fitBounds(bounds, { top: 60, right: 20, bottom: 230, left: 20 });
  } catch (_) {
    _map.setCenter(latLngs[latLngs.length - 1]);
    _map.setZoom(13, true);
  }
}

// ─── 하단 차량 목록 렌더링 ───────────────────────────────────────────
function renderTripList(trips) {
  const contracted = (State.profile.driverId || '').toUpperCase().startsWith('ELSS');
  const visible    = trips.filter(t => t.status !== 'completed' && (contracted || isMyTrip(t)));

  const countEl = document.getElementById('map-panel-count');
  if (countEl) countEl.textContent = visible.length > 0 ? `${visible.length}대 운행 중` : '운행 차량 없음';

  const container = document.getElementById('map-trip-items');
  if (!container) return;

  if (!visible.length) {
    container.innerHTML = `
      <div class="map-state-empty">
        <span class="map-empty-icon">🚛</span>
        <span>운행 중인 차량이 없습니다.</span>
      </div>`;
    return;
  }

  container.innerHTML = visible.map(trip => `
    <div class="map-trip-item"
         onclick="App.showTripRouteOnMap(${JSON.stringify(trip).replace(/"/g, '&quot;')})">
      <div style="font-weight:800;">${trip.vehicle_number || '-'}</div>
      <div style="font-size:12px;color:#64748b;">
        ${trip.lastLocation?.address || '위치 정보 없음'}
      </div>
    </div>
  `).join('');
}

// ─── 유틸 ───────────────────────────────────────────────────────────
function isMyTrip(trip) {
  const myV = (State.profile.vehicleNo || '').replace(/\s/g, '').toUpperCase();
  const tV  = (trip.vehicle_number  || '').replace(/\s/g, '').toUpperCase();
  return tV && tV === myV;
}

// ─── 외부 공개 API ───────────────────────────────────────────────────

/**
 * 지도 화면 열기
 * 1) showScreen('map')
 * 2) Naver SDK lazy-load
 * 3) 지도 초기화
 * 4) 차량 데이터 폴링 시작
 */
export async function openMap() {
  showScreen('map');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-btn-map')?.classList.add('active');

  // SDK 로드 (이미 로드된 경우 즉시 resolve)
  try {
    await loadNaverSDK();
  } catch (e) {
    showToast('지도 로드 실패. 네트워크를 확인해주세요.');
    remoteLog('[MAP] SDK 로드 실패: ' + (e?.message || e), 'MAP_SDK_ERR');
    return;
  }

  // DOM 페인팅 보장 후 초기화 (2-frame 딜레이)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initNaverMap();
      refreshMapData();
    });
  });

  // 30초 폴링
  if (_mapPollTimer) clearInterval(_mapPollTimer);
  _mapPollTimer = setInterval(refreshMapData, 30000);

  remoteLog('[MAP] openMap 완료 (Dynamic SDK v3)', 'MAP_OPEN');
}

/** 지도 화면 닫기 */
export function closeMap() {
  if (_mapPollTimer) { clearInterval(_mapPollTimer); _mapPollTimer = null; }
  showScreen('main');
}

/** 차량 위치 데이터 갱신 */
export async function refreshMapData() {
  try {
    const res  = await smartFetch(BASE_URL + '/api/vehicle-tracking/trips?mode=active');
    const data = await res.json();
    _trips = data.trips || data.data || [];
    updateVehicleMarkers(_trips);
    renderTripList(_trips);
  } catch (e) {
    console.warn('[MAP] refreshMapData 오류', e);
  }
}

/** 내 위치로 이동 */
export function centerMyLocation() {
  navigator.geolocation.getCurrentPosition(
    pos => {
      if (!_map) return;
      const { latitude: lat, longitude: lng } = pos.coords;
      const position = new naver.maps.LatLng(lat, lng);

      if (_myMarker) {
        _myMarker.setPosition(position);
      } else {
        _myMarker = new naver.maps.Marker({
          position,
          map   : _map,
          icon  : makeMyLocIcon(),
          zIndex: 150,
        });
      }

      _map.setCenter(position);
      _map.setZoom(15, true);
      showToast('내 위치로 이동했습니다.');
    },
    () => showToast('위치 정보를 가져올 수 없습니다.')
  );
}

/** 특정 차량의 경로를 지도 위에 표시 */
export async function showTripRouteOnMap(trip) {
  remoteLog(`[MAP] 경로 조회: ${trip.vehicle_number}`, 'MAP_ROUTE');

  let path = [];
  try {
    const res  = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${trip.id}/locations`);
    const data = await res.json();
    path = data.locations || data.data || [];
  } catch (e) {
    console.error('[MAP] 경로 fetch 실패', e);
  }

  if (!path.length) { showToast('경로 데이터가 없습니다.'); return; }

  drawPolyline(path);

  // 경로 패널 표시
  const panel = document.getElementById('map-route-panel');
  if (panel) {
    const titleEl = document.getElementById('map-route-title');
    if (titleEl) titleEl.textContent = trip.vehicle_number || '경로 정보';

    const bodyEl = document.getElementById('map-route-body');
    if (bodyEl) {
      const s = path[0];
      const e = path[path.length - 1];
      bodyEl.innerHTML = `
        <div style="font-size:12px;color:#64748b;line-height:1.9;">
          <div>🟢 <b>출발</b>: ${s.address  || `${s.lat?.toFixed(5)}, ${s.lng?.toFixed(5)}`}</div>
          <div>🔴 <b>현재</b>: ${e.address  || `${e.lat?.toFixed(5)}, ${e.lng?.toFixed(5)}`}</div>
          <div>📊 <b>기록</b>: ${path.length}개 포인트</div>
        </div>`;
    }

    panel.classList.remove('hidden');
  }
}

/** 경로 표시 초기화 */
export function clearMapRoute() {
  if (_polyline)    { _polyline.setMap(null);    _polyline    = null; }
  if (_startMarker) { _startMarker.setMap(null); _startMarker = null; }
  if (_endMarker)   { _endMarker.setMap(null);   _endMarker   = null; }
  document.getElementById('map-route-panel')?.classList.add('hidden');
}

/** 하단 차량 목록 패널 토글 */
export function toggleMapPanel() {
  const panel = document.getElementById('map-bottom-panel');
  if (!panel) return;
  panel.classList.toggle('collapsed');
  // ★ 오버레이 방식이므로 지도 resize 불필요
}

export const toggleMapTripList = toggleMapPanel;
