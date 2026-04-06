/**
 * map.js — 고성능 Static Maps 엔진 (v4.7.2)
 * v4.6.1 안정 엔진 기반. HUD 제거, 카운트 갱신, 패널 토글 리사이즈 대응 추가.
 */
import { State, BASE_URL } from './store.js';
import { smartFetch, remoteLog } from './bridge.js';
import { showToast } from './utils.js';
import { showScreen } from './nav.js';

const STATIC_MAP_KEY = 'hxoj79osnj';
const STATIC_BASE    = 'https://maps.apigw.ntruss.com/map-static/v2/raster-cors';

// ─── 지도 실시간 상태 ───────────────────────────────────────────────
let smState = {
  lat: 36.5, lng: 127.5, zoom: 7,
  isDragging: false, dragStart: null, lastX: 0, lastY: 0,
  trips: [], selectedTrip: null,
  myLat: null, myLng: null,
  isMoving: false // 현재 드래그 중인지를 나타냄
};

let smImg = null, smCanvas = null, smOverlay = null, smPanner = null;
let mapPollTimer = null;
let _mapPanelCollapsed = false;

// ─── 유틸: 메르카토르 좌표 ──────────────────────────────────────────
function latLngToPixel(lat, lng, centerLat, centerLng, zoomLevel, w, h) {
  const scale = Math.pow(2, zoomLevel) * 256;
  function toMerc(la, lo) {
    const x = (lo + 180) / 360;
    const sinLat = Math.sin(la * Math.PI / 180);
    const y = (1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2;
    return { x: x * scale, y: y * scale };
  }
  const c = toMerc(centerLat, centerLng);
  const p = toMerc(lat, lng);
  return { x: w / 2 + (p.x - c.x), y: h / 2 + (p.y - c.y) };
}

function getMapSize() {
  const el = document.getElementById('driver-map');
  if (!el) return { w: 360, h: 600 };
  return { w: el.clientWidth || 360, h: el.clientHeight || 600 };
}

// ─── 지도 초기화 ────────────────────────────────────────────────────
export function initStaticMap() {
  const el = document.getElementById('driver-map');
  if (!el) return;
  el.innerHTML = '';
  el.style.cssText = 'position:relative;overflow:hidden;background:#e8eaed;cursor:grab;touch-action:none;';

  const { w, h } = getMapSize();

  // Panner: 지도 이미지 + Canvas만 포함 → 드래그 시 translate3d로 이동
  smPanner = document.createElement('div');
  smPanner.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;transform-origin:0 0;will-change:transform;';
  el.appendChild(smPanner);

  smImg = document.createElement('img');
  smImg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:fill;user-select:none;pointer-events:none;';
  smImg.draggable = false;
  smPanner.appendChild(smImg);

  smCanvas = document.createElement('canvas');
  smCanvas.width = w * 2; smCanvas.height = h * 2;
  smCanvas.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;`;
  smPanner.appendChild(smCanvas);

  // ★ Overlay: panner 바깥에 배치 → 마커가 화면 좌표에 고정됨 (드리프트 방지)
  smOverlay = document.createElement('div');
  smOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
  el.appendChild(smOverlay);

  bindMapTouch(el);
  renderStaticMap();
}

// ─── 렌더링 ────────────────────────────────────────────────────────
function renderStaticMap() {
  if (!smImg) return;
  const { w, h } = getMapSize();
  const level = Math.round(smState.zoom);
  const rw = Math.min(Math.round(w), 1024), rh = Math.min(Math.round(h), 1024);
  const url = `${STATIC_BASE}?w=${rw}&h=${rh}&center=${smState.lng},${smState.lat}&level=${level}&X-NCP-APIGW-API-KEY-ID=${STATIC_MAP_KEY}&scale=2`;

  smImg.onload = () => {
    smPanner.style.transform = 'none';
    if (!smState.isDragging) renderMapOverlay();
  };
  smImg.src = url;
}

function renderMapOverlay() {
  if (!smCanvas || !smOverlay) return;
  const { w, h } = getMapSize();
  const level = Math.round(smState.zoom);

  // 1. 경로 그리기 (Canvas)
  const ctx = smCanvas.getContext('2d');
  ctx.clearRect(0, 0, smCanvas.width, smCanvas.height);
  if (smState.selectedTrip?._path) {
    ctx.save();
    ctx.scale(2, 2);
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 4;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalAlpha = 0.8;
    ctx.beginPath();
    smState.selectedTrip._path.forEach((l, i) => {
      const p = latLngToPixel(l.lat, l.lng, smState.lat, smState.lng, level, w, h);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // 2. 마커 그리기 (DOM)
  smOverlay.innerHTML = '';
  const contracted = (State.profile.driverId || '').toUpperCase().startsWith('ELSS');
  const visibleTrips = smState.trips.filter(t => t.lastLocation && (contracted || isMyTrip(t)));

  visibleTrips.forEach(trip => {
    const loc = trip.lastLocation;
    const isMe = isMyTrip(trip);
    const isDone = trip.status === 'completed';
    const p = latLngToPixel(loc.lat, loc.lng, smState.lat, smState.lng, level, w, h);
    if (p.x < -100 || p.x > w + 100 || p.y < -100 || p.y > h + 100) return;

    const color = isDone ? '#94a3b8' : (isMe ? '#10b981' : '#2563eb');
    const label = trip.vehicle_number || '차량';

    const m = document.createElement('div');
    m.style.cssText = `position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,-100%);pointer-events:auto;`;
    m.innerHTML = `<div style="background:${color};color:#fff;border:2px solid #fff;border-radius:20px;padding:4px 10px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">${label}</div>`;
    m.onclick = (e) => { e.stopPropagation(); showTripRouteOnMap(trip); };
    smOverlay.appendChild(m);
  });

  // 내 위치 마커
  if (smState.myLat && smState.myLng) {
    const p = latLngToPixel(smState.myLat, smState.myLng, smState.lat, smState.lng, level, w, h);
    const dot = document.createElement('div');
    dot.style.cssText = `position:absolute;left:${p.x}px;top:${p.y}px;width:14px;height:14px;background:#2563eb;border:2.5px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(37,99,235,.6);transform:translate(-50%,-50%);`;
    smOverlay.appendChild(dot);
  }
}

// ─── 터치 인터랙션 (마커 드리프트 방지 아키텍처) ──────────────────────
function bindMapTouch(el) {
  let startX, startY, lastDx = 0, lastDy = 0;

  function onMove(x, y) {
    if (!smState.isDragging) return;
    lastDx = x - startX;
    lastDy = y - startY;
    // ★ panner(지도)만 이동, overlay(마커)는 고정 유지
    smPanner.style.transform = `translate3d(${lastDx}px, ${lastDy}px, 0)`;
    if (Math.abs(lastDx) > 5 || Math.abs(lastDy) > 5) smState.isMoving = true;
  }

  function onEnd() {
    if (!smState.isDragging) return;
    smState.isDragging = false;
    el.style.cursor = 'grab';

    if (smState.isMoving) {
      const level = Math.round(smState.zoom);
      const scale = Math.pow(2, level) * 256;
      const res = scale / 360;
      smState.lng -= lastDx / res;
      smState.lat += lastDy / (res * Math.cos(smState.lat * Math.PI / 180));
      // transform 초기화 후 새 이미지 + 마커 재배치
      smPanner.style.transform = 'none';
      renderStaticMap();
    }
    smState.isMoving = false;
    lastDx = 0; lastDy = 0;
  }

  el.addEventListener('mousedown', e => {
    smState.isDragging = true; smState.isMoving = false;
    startX = e.clientX; startY = e.clientY;
    el.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', () => onEnd());

  el.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      smState.isDragging = true; smState.isMoving = false;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    }
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  el.addEventListener('touchend', () => onEnd());
}

// ─── 외부 API ──────────────────────────────────────────────────────
export function openMap() {
  showScreen('map');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-btn-map')?.classList.add('active');
  remoteLog('[MAP] Static Maps 복귀 모드 열기', 'MAP_OPEN');

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
}

export async function refreshMapData() {
  try {
    const res = await smartFetch(BASE_URL + '/api/vehicle-tracking/trips?mode=active');
    const data = await res.json();
    smState.trips = data.trips || data.data || [];
    if (!smState.isDragging) renderMapOverlay();
    renderMapTripList(smState.trips);
    // 카운트 갱신
    const countEl = document.getElementById('map-panel-count');
    if (countEl) {
      const active = (smState.trips || []).filter(t => t.status !== 'completed');
      countEl.textContent = active.length > 0 ? `${active.length}대 운행 중` : '운행 차량 없음';
    }
  } catch (e) { console.warn('refreshMapData 오류', e); }
}

export function centerMyLocation() {
  navigator.geolocation.getCurrentPosition(pos => {
    smState.myLat = pos.coords.latitude;
    smState.myLng = pos.coords.longitude;
    smState.lat = smState.myLat;
    smState.lng = smState.myLng;
    smState.zoom = 15;
    renderStaticMap();
    showToast('내 위치로 이동했습니다.');
  });
}

function isMyTrip(trip) {
  const myV = (State.profile.vehicleNo || '').replace(/\s/g, '').toUpperCase();
  const tV = (trip.vehicle_number || '').replace(/\s/g, '').toUpperCase();
  return tV && tV === myV;
}

function renderMapTripList(trips) {
  const contracted = (State.profile.driverId || '').toUpperCase().startsWith('ELSS');
  const visibleTrips = trips.filter(t => t.status !== 'completed' && (contracted || isMyTrip(t)));
  const container = document.getElementById('map-trip-items');
  if (!container) return;
  container.innerHTML = visibleTrips.map(trip => `
    <div class="map-trip-item" onclick="App.showTripRouteOnMap(${JSON.stringify(trip).replace(/"/g, '&quot;')})">
      <div style="font-weight:800;">${trip.vehicle_number || '-'}</div>
      <div style="font-size:12px;color:#64748b;">${trip.lastLocation?.address || '위치 정보 없음'}</div>
    </div>
  `).join('');
}

export async function showTripRouteOnMap(trip) {
  remoteLog(`[MAP] 경로 조회: ${trip.vehicle_number}`, 'MAP_ROUTE');
  let path = [];
  try {
    const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${trip.id}/locations`);
    const data = await res.json();
    path = data.locations || data.data || [];
  } catch (e) { console.error('fetch 실패', e); }

  if (!path.length) { showToast('경로 데이터가 없습니다.'); return; }

  // 오토줌 구현
  const lats = path.map(p => p.lat), lngs = path.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  smState.lat = (minLat + maxLat) / 2;
  smState.lng = (minLng + maxLng) / 2;

  const { w, h } = getMapSize();
  const dLat = maxLat - minLat, dLng = maxLng - minLng;
  smState.zoom = Math.max(5, Math.min(16, Math.floor(Math.min(
    Math.log2(360 * w / (dLng * 256)),
    Math.log2(180 * h / (dLat * 256))
  ))));

  smState.selectedTrip = { ...trip, _path: path };
  renderStaticMap();

  const panel = document.getElementById('map-route-panel');
  if (panel) {
    document.getElementById('map-route-title').textContent = trip.vehicle_number;
    panel.classList.remove('hidden');
  }
}

export function clearMapRoute() {
  smState.selectedTrip = null;
  document.getElementById('map-route-panel')?.classList.add('hidden');
  renderMapOverlay();
}

export function toggleMapPanel() {
  document.getElementById('map-bottom-panel')?.classList.toggle('collapsed');
  // 레이아웃 변경 후 지도 리사이즈 대응
  setTimeout(() => { if (!smState.isDragging) renderStaticMap(); }, 350);
}
export const toggleMapTripList = toggleMapPanel;
