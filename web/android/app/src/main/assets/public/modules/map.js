/**
 * map.js — Naver Maps JS SDK v3 기반 지도 엔진 (v4.6.0+)
 * Static Maps(DIY) 방식의 한계를 극복하기 위해 Dynamic SDK로 원복.
 * 드래그 중 마커 동기화 및 오토줌 문제를 네이티브 기능을 통해 해결.
 */
import { State, BASE_URL } from './store.js';
import { smartFetch, remoteLog } from './bridge.js';
import { showToast } from './utils.js';
import { showScreen } from './nav.js';

let map = null;
let markers = [];
let polyline = null;
let myMarker = null;
let mapPollTimer = null;
let _mapPanelCollapsed = false;

// ─── 지도 초기화 ─────────────────────────────────────────────────
export function initStaticMap() {
  const el = document.getElementById('driver-map');
  if (!el) return;
  
  if (!window.naver || !window.naver.maps) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;">네이버 지도 SDK 로드 중...<br>(수 초간 반응 없으면 인터넷 및 권한 확인)</div>';
    remoteLog('[MAP] Naver SDK 미로드 상태', 'MAP_ERROR');
    return;
  }
  el.innerHTML = '';

  map = new naver.maps.Map(el, {
    center: new naver.maps.LatLng(36.5, 127.5),
    zoom: 7,
    minZoom: 6,
    maxZoom: 19,
    mapTypeControl: false,
    zoomControl: true,
    zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT }
  });

  remoteLog('[MAP] Naver Dynamic Map 초기화 완료', 'MAP_INIT');
  
  // 버전 HUD
  const vLabel = document.createElement('div');
  vLabel.style.cssText = 'position:absolute;top:3px;right:3px;background:rgba(0,0,0,0.4);color:#fff;font-size:8px;padding:1px 3px;pointer-events:none;z-index:99;';
  vLabel.textContent = 'v4.6.0-DYNAMIC-SDK';
  el.appendChild(vLabel);

  renderStaticMap(); // 데이터 렌더링 호출
}

// ─── 지도 데이터 렌더 ────────────────────────────────────────────
function renderStaticMap() {
  if (!map) return;
  // 마커 초기화
  markers.forEach(m => m.setMap(null));
  markers = [];

  const contracted = isContractedVehicle();
  const trips = State.mapData || [];
  const visibleTrips = trips.filter(trip =>
    trip.lastLocation && (contracted ? true : isMyTrip(trip))
  );

  visibleTrips.forEach(trip => {
    const loc = trip.lastLocation;
    const isMe = isMyTrip(trip);
    const isDone = trip.status === 'completed';
    const color = isDone ? '#94a3b8' : (isMe ? '#10b981' : '#2563eb');
    const vNum = trip.vehicle_number || '';
    const label = isDone ? (vNum.length > 4 ? vNum.slice(-4) : (vNum || '종료')) : (vNum || trip.driverId || '차량');

    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(loc.lat, loc.lng),
      map: map,
      icon: {
        content: `<div style="background:${color};color:#fff;border:2px solid #fff;border-radius:20px;padding:4px 10px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">${label}</div>`,
        anchor: new naver.maps.Point(20, 20)
      }
    });

    naver.maps.Event.addListener(marker, 'click', () => showTripRouteOnMap(trip));
    markers.push(marker);
  });

  // 내 위치
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (myMarker) myMarker.setMap(null);
      myMarker = new naver.maps.Marker({
        position: new naver.maps.LatLng(lat, lng),
        map: map,
        icon: {
          content: `<div style="width:14px;height:14px;background:#2563eb;border:2.5px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(37,99,235,.6);"></div>`,
          anchor: new naver.maps.Point(7, 7)
        },
        zIndex: 100
      });
    }, null, { enableHighAccuracy: true });
  }
}

export function openMap() {
  showScreen('map');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-btn-map')?.classList.add('active');
  remoteLog('[MAP] Dynamic SDK 모드로 지도 열기', 'MAP_OPEN');

  requestAnimationFrame(() => {
    initStaticMap();
    refreshMapData();
  });

  if (mapPollTimer) clearInterval(mapPollTimer);
  mapPollTimer = setInterval(refreshMapData, 30000);
}

export function closeMap() {
  if (mapPollTimer) { clearInterval(mapPollTimer); mapPollTimer = null; }
  showScreen('main');
  window.App?.switchTab('trip');
}

export async function refreshMapData() {
  try {
    const res = await smartFetch(BASE_URL + '/api/vehicle-tracking/trips?mode=active');
    const data = await res.json();
    State.mapData = data.trips || data.data || [];
    renderStaticMap();
    renderMapTripList(State.mapData);
  } catch (e) { console.warn('refreshMapData 오류', e); }
}

export function centerMyLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const coord = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
    map?.setCenter(coord);
    map?.setZoom(15);
    showToast('내 위치로 이동했습니다.');
  });
}

function isContractedVehicle() { return (State.profile.driverId || '').toUpperCase().startsWith('ELSS'); }
function isMyTrip(trip) {
  const myV = (State.profile.vehicleNo || '').replace(/\s/g, '').toUpperCase();
  const myId = (State.profile.driverId || '').toUpperCase();
  const tV = (trip.vehicle_number || trip.vehicleNo || '').replace(/\s/g, '').toUpperCase();
  const tId = (trip.vehicle_id || trip.driverId || '').toUpperCase();
  return tV === myV || tId === myId;
}

function renderMapTripList(trips) {
  const contracted = isContractedVehicle();
  const visibleTrips = trips.filter(t => t.status !== 'completed' && (contracted ? true : isMyTrip(t)));
  const container = document.getElementById('map-trip-items');
  const countEl = document.getElementById('map-panel-count');
  if (!container) return;
  
  if (countEl) {
    countEl.textContent = visibleTrips.length > 0 ? visibleTrips.length + '대 운행 중' : '운행 없음';
    countEl.style.color = visibleTrips.length > 0 ? '#10b981' : '#cbd5e1';
  }

  if (!visibleTrips.length) {
    container.innerHTML = '<div class="map-state-empty">운송 중인 차량이 없습니다.</div>';
    return;
  }

  container.innerHTML = visibleTrips.map(trip => {
    const isMe = isMyTrip(trip);
    const badge = isMe ? '<span style="background:#10b981;color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:10px;margin-left:4px;">내 차량</span>' : '';
    const speed = trip.lastLocation?.speed != null ? Math.round(trip.lastLocation.speed) + ' km/h' : '-';
    return `<div class="map-trip-item" onclick="App.showTripRouteOnMap(${JSON.stringify(trip).replace(/"/g, '&quot;')})">
      <div style="font-weight:800;">${trip.vehicle_number || '-'} ${badge}</div>
      <div style="font-size:12px;color:#64748b;">${speed} · ${trip.lastLocation?.address || '위치 확인 중...'}</div>
    </div>`;
  }).join('');
}

export async function showTripRouteOnMap(trip) {
  clearMapRoute();
  remoteLog(`[MAP] 경로 조회: ${trip.vehicle_number}`, 'MAP_ROUTE');

  let pathData = [];
  try {
    const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${trip.id}/locations`);
    const data = await res.json();
    pathData = data.locations || data.data || [];
  } catch (e) { console.error('fetch 실패', e); }

  if (!pathData.length) { showToast('경로 데이터가 없습니다.'); return; }

  const coords = pathData.map(l => new naver.maps.LatLng(l.lat, l.lng));
  polyline = new naver.maps.Polyline({
    map: map,
    path: coords,
    strokeColor: '#2563eb',
    strokeWeight: 4,
    strokeOpacity: 0.8
  });

  const bounds = new naver.maps.LatLngBounds();
  coords.forEach(c => bounds.extend(c));
  map.fitBounds(bounds);

  const panel = document.getElementById('map-route-panel');
  if (panel) {
    document.getElementById('map-route-title').textContent = trip.vehicle_number;
    panel.classList.remove('hidden');
  }
}

export function clearMapRoute() {
  if (polyline) polyline.setMap(null);
  polyline = null;
  document.getElementById('map-route-panel')?.classList.add('hidden');
}

export function toggleMapPanel() {
  const panel = document.getElementById('map-bottom-panel');
  const icon  = document.getElementById('map-panel-toggle-icon');
  if (!panel) return;
  _mapPanelCollapsed = !_mapPanelCollapsed;
  panel.classList.toggle('collapsed', _mapPanelCollapsed);
  if (icon) icon.textContent = _mapPanelCollapsed ? '▴' : '▾';
}
export const toggleMapTripList = toggleMapPanel;
