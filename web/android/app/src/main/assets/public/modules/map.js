/**
 * map.js — Static Maps 지도 엔진 (v4.3.35+)
 * JS SDK 방식은 Capacitor WebView Referer 인증 실패로 사용 불가.
 * NCP Static Maps(raster-cors) 이미지 URL + 터치 드래그 + 핀치줌 직접 구현.
 */
import { State, BASE_URL } from './store.js';
import { smartFetch, remoteLog } from './bridge.js';
import { showToast } from './utils.js';
import { showScreen } from './nav.js';

const STATIC_MAP_KEY = 'hxoj79osnj';
const STATIC_BASE    = 'https://maps.apigw.ntruss.com/map-static/v2/raster-cors';

// ─── 지도 상태 ───────────────────────────────────────────────────
let smState = {
  lat: 36.5, lng: 127.5, zoom: 7,
  isDragging: false, dragStart: null, lastX: 0, lastY: 0,
  pinchDist: 0,
  trips: [], selectedTrip: null,
  myLat: null, myLng: null,
  pollTimer: null,
};

let smContainer = null, smImg = null, smCanvas = null, smOverlay = null;
let mapPollTimer = null;
let _mapPanelCollapsed = false;

// ─── 줌 정수 변환 ────────────────────────────────────────────────
function smZoomToLevel(z) { return Math.max(1, Math.min(20, Math.round(z))); }

// ─── 메르카토르 좌표 변환 ─────────────────────────────────────────
function latLngToPixel(lat, lng, centerLat, centerLng, zoomLevel, w, h) {
  const scale = Math.pow(2, zoomLevel) * 256;
  function toMerc(la, lo) {
    const x      = (lo + 180) / 360;
    const sinLat = Math.sin(la * Math.PI / 180);
    const y      = (1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2;
    return { x: x * scale, y: y * scale };
  }
  const c = toMerc(centerLat, centerLng);
  const p = toMerc(lat, lng);
  return { x: w / 2 + (p.x - c.x), y: h / 2 + (p.y - c.y) };
}

function buildStaticMapUrl(lat, lng, zoom, w, h) {
  const level = smZoomToLevel(zoom);
  return `${STATIC_BASE}?w=${w}&h=${h}&center=${lng},${lat}&level=${level}&X-NCP-APIGW-API-KEY-ID=${STATIC_MAP_KEY}&scale=2`;
}

function getMapSize() {
  const el = document.getElementById('driver-map');
  if (!el) return { w: 360, h: 600 };
  return { w: el.clientWidth || 360, h: el.clientHeight || 600 };
}

// ─── 지도 DOM 초기화 ─────────────────────────────────────────────
function initStaticMap() {
  const el = document.getElementById('driver-map');
  if (!el) return;
  el.innerHTML     = '';
  el.style.cssText = 'position:relative;overflow:hidden;background:#e8eaed;cursor:grab;';

  const { w, h } = getMapSize();

  smImg = document.createElement('img');
  smImg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:fill;user-select:none;pointer-events:none;';
  smImg.draggable = false;
  el.appendChild(smImg);

  smCanvas = document.createElement('canvas');
  smCanvas.width  = w * 2;
  smCanvas.height = h * 2;
  smCanvas.style.cssText = `position:absolute;top:0;left:0;width:${w}px;height:${h}px;pointer-events:none;`;
  el.appendChild(smCanvas);

  smOverlay = document.createElement('div');
  smOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
  el.appendChild(smOverlay);

  smContainer = el;
  bindMapTouch(el);
  renderStaticMap();
}

// ─── 지도 이미지 렌더 ─────────────────────────────────────────────
function renderStaticMap() {
  if (!smImg || !smContainer) return;
  const { w, h } = getMapSize();
  const rw  = Math.min(Math.round(w), 1024);
  const rh  = Math.min(Math.round(h), 1024);
  const url = buildStaticMapUrl(smState.lat, smState.lng, smState.zoom, rw, rh);

  smImg.onload = () => {
    if (smImg)   smImg.style.transform   = 'none';
    if (smCanvas) smCanvas.style.transform = 'none';
    // 드래그 중 onload 발화 시 오버레이 초기화하면 _markerBases 캐시가 무효화됨 → 마커 고정 버그
    if (!smState.isDragging) renderMapOverlay();
  };
  smImg.onerror = () => {
    smImg.src = '';
    const ctx = smCanvas?.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 0, smCanvas.width, smCanvas.height);
      ctx.fillStyle = '#6b7280';
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('지도를 불러오는 중...', smCanvas.width / 2, smCanvas.height / 2);
    }
  };
  smImg.src = url;
}

// ─── 오버레이 (마커 + 경로) 렌더 ─────────────────────────────────
function renderMapOverlay() {
  if (!smCanvas || !smOverlay) return;
  const { w, h } = getMapSize();
  const level     = smZoomToLevel(smState.zoom);

  smCanvas.width  = w * 2;
  smCanvas.height = h * 2;
  smCanvas.style.width  = w + 'px';
  smCanvas.style.height = h + 'px';

  const ctx = smCanvas.getContext('2d');
  ctx.clearRect(0, 0, smCanvas.width, smCanvas.height);
  smOverlay.innerHTML = '';

  if (smState.selectedTrip?._path) {
    drawPathOnCanvas(ctx, smState.selectedTrip._path, w, h, level);
  }

  const contracted    = isContractedVehicle();
  const visibleTrips  = smState.trips.filter(trip =>
    trip.lastLocation && (contracted ? true : isMyTrip(trip))
  );

  visibleTrips.forEach(trip => {
    const loc    = trip.lastLocation;
    const isMe   = isMyTrip(trip);
    const isDone = trip.status === 'completed';
    const px     = latLngToPixel(loc.lat, loc.lng, smState.lat, smState.lng, level, w, h);
    if (px.x < -60 || px.x > w + 60 || px.y < -40 || px.y > h + 40) return;

    let color, label, zIndex;
    if (isDone) {
      color  = '#94a3b8';
      const vNum = trip.vehicle_number || '';
      label  = vNum.length > 4 ? vNum.slice(-4) : (vNum || '종료');
      zIndex = 10;
    } else {
      color  = isMe ? '#10b981' : '#2563eb';
      label  = trip.vehicle_number || trip.driverId || '차량';
      zIndex = 20;
    }

    const marker = document.createElement('div');
    marker.dataset.marker   = '1';
    marker.dataset.baseLeft = px.x;
    marker.dataset.baseTop  = px.y;
    marker.style.cssText    = `position:absolute;left:${px.x}px;top:${px.y}px;transform:translate(-50%,-100%);pointer-events:auto;z-index:${zIndex};`;
    marker.innerHTML = `<div style="background:${color};color:#fff;border:2px solid #fff;border-radius:20px;padding:4px 10px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">${label}</div>`;
    marker.addEventListener('click', () => showTripRouteOnMap(trip));
    smOverlay.appendChild(marker);
  });

  // 내 위치 마커 (파란 점)
  if (smState.myLat !== null && smState.myLng !== null) {
    const px = latLngToPixel(smState.myLat, smState.myLng, smState.lat, smState.lng, level, w, h);
    if (px.x >= -20 && px.x <= w + 20 && px.y >= -20 && px.y <= h + 20) {
      const halo = document.createElement('div');
      halo.dataset.marker = '1'; halo.dataset.baseLeft = px.x - 16; halo.dataset.baseTop = px.y - 16;
      halo.style.cssText  = `position:absolute;left:${px.x - 16}px;top:${px.y - 16}px;width:32px;height:32px;background:rgba(37,99,235,0.15);border-radius:50%;pointer-events:none;z-index:28;`;
      smOverlay.appendChild(halo);
      const dot = document.createElement('div');
      dot.dataset.marker = '1'; dot.dataset.baseLeft = px.x - 7; dot.dataset.baseTop = px.y - 7;
      dot.style.cssText  = `position:absolute;left:${px.x - 7}px;top:${px.y - 7}px;width:14px;height:14px;background:#2563eb;border:2.5px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(37,99,235,.6);pointer-events:none;z-index:29;`;
      smOverlay.appendChild(dot);
    }
  }
}

// ─── Canvas 경로 그리기 ───────────────────────────────────────────
function drawPathOnCanvas(ctx, path, w, h, level) {
  if (!path || path.length < 2) return;
  ctx.save();
  ctx.scale(2, 2);
  ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 3;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalAlpha = 0.85;
  ctx.beginPath();
  path.forEach((loc, i) => {
    const px = latLngToPixel(loc.lat, loc.lng, smState.lat, smState.lng, level, w, h);
    i === 0 ? ctx.moveTo(px.x, px.y) : ctx.lineTo(px.x, px.y);
  });
  ctx.stroke();

  const drawDot = (loc, color) => {
    const px = latLngToPixel(loc.lat, loc.lng, smState.lat, smState.lng, level, w, h);
    ctx.beginPath(); ctx.arc(px.x, px.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.globalAlpha = 1; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  };
  drawDot(path[0], '#10b981');
  drawDot(path[path.length - 1], '#ef4444');
  ctx.restore();
}

// ─── 터치/마우스 드래그 & 핀치줌 ────────────────────────────────
// v4.3.45 핵심 원칙:
//   드래그 중: img+canvas만 translate. overlay 마커는 개별 오프셋.
//   드래그 종료: smState.lat/lng 확정 → overlay 즉시 재렌더 → img 새로 요청.
function bindMapTouch(el) {
  let startLat, startLng, startX, startY;
  let pinchStartDist = 0, pinchStartZoom = smState.zoom;
  let rafId = null, _markerBases = [];

  function _cacheMarkerBases() {
    _markerBases = [];
    if (!smOverlay) return;
    smOverlay.querySelectorAll('[data-marker]').forEach(m => {
      _markerBases.push({ el: m, baseLeft: parseFloat(m.dataset.baseLeft) || 0, baseTop: parseFloat(m.dataset.baseTop) || 0 });
    });
  }

  function onDragStart(x, y) {
    smState.isDragging = true;
    startX = x; startY = y; startLat = smState.lat; startLng = smState.lng;
    el.style.cursor = 'grabbing';
    if (smImg)   smImg.style.transition   = 'none';
    if (smCanvas) smCanvas.style.transition = 'none';
    _cacheMarkerBases();
  }

  function onDragMove(x, y) {
    if (!smState.isDragging) return;
    const dx = x - startX, dy = y - startY;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (smImg)   smImg.style.transform   = `translate3d(${dx}px,${dy}px,0)`;
      if (smCanvas) smCanvas.style.transform = `translate3d(${dx}px,${dy}px,0)`;
      _markerBases.forEach(item => {
        item.el.style.left = (item.baseLeft + dx) + 'px';
        item.el.style.top  = (item.baseTop  + dy) + 'px';
      });
    });
  }

  function pixelDeltaToLatLng(dx, dy, cLat, cLng, zoomLevel) {
    const scale = Math.pow(2, zoomLevel) * 256;
    function toMerc(la, lo) {
      const x = (lo + 180) / 360;
      const sinLat = Math.sin(la * Math.PI / 180);
      const y = (1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2;
      return { x: x * scale, y: y * scale };
    }
    const c    = toMerc(cLat, cLng);
    const nx   = c.x - dx, ny = c.y - dy;
    const newLng   = (nx / scale) * 360 - 180;
    const nYNorm   = ny / scale;
    const exp      = Math.exp((1 - 2 * nYNorm) * 2 * Math.PI);
    const sinLat   = (exp - 1) / (exp + 1);
    return { lat: Math.asin(sinLat) * 180 / Math.PI, lng: newLng };
  }

  function onDragEnd(x, y) {
    if (!smState.isDragging) return;
    smState.isDragging = false;
    el.style.cursor = 'grab';
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    let didDrag = false;
    if (x != null && y != null && startX != null && startY != null) {
      const dx = x - startX, dy = y - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        didDrag = true;
        const newPos = pixelDeltaToLatLng(dx, dy, startLat, startLng, smZoomToLevel(smState.zoom));
        smState.lat = newPos.lat; smState.lng = newPos.lng;
      }
    }
    smCanvas.style.transform = 'none';
    // 탭(tap)인 경우 오버레이 재렌더 금지 → touchend 후 click 이벤트가 마커에 도달할 수 있도록 보존
    if (didDrag) {
      renderMapOverlay();
      renderStaticMap();
    }
  }

  el.addEventListener('mousedown',  e => { if (e.button === 0) onDragStart(e.clientX, e.clientY); });
  el.addEventListener('mousemove',  e => { if (smState.isDragging) onDragMove(e.clientX, e.clientY); });
  el.addEventListener('mouseup',    e => onDragEnd(e.clientX, e.clientY));
  el.addEventListener('mouseleave', e => onDragEnd(e.clientX, e.clientY));

  el.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      onDragStart(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      if (smState.isDragging) onDragEnd(e.touches[0].clientX, e.touches[0].clientY);
      pinchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchStartZoom = smState.zoom;
    }
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    if (e.cancelable) e.preventDefault();
    if (e.touches.length === 1 && smState.isDragging) {
      onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      const dist    = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const newZoom = Math.round(Math.max(1, Math.min(20, pinchStartZoom + Math.log2(dist / pinchStartDist) * 1.5)));
      if (newZoom !== smState.zoom) { smState.zoom = newZoom; renderStaticMap(); }
    }
  }, { passive: false });

  el.addEventListener('touchend', e => {
    if (smState.isDragging) {
      const t = e.changedTouches[0];
      onDragEnd(t ? t.clientX : undefined, t ? t.clientY : undefined);
    }
  });

  el.addEventListener('wheel', e => {
    e.preventDefault();
    smState.zoom = Math.max(1, Math.min(20, smState.zoom + (e.deltaY > 0 ? -1 : 1)));
    renderStaticMap();
  }, { passive: false });
}

// ─── 지도 화면 열기 ──────────────────────────────────────────────
export function openMap() {
  showScreen('map');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-btn-map')?.classList.add('active');
  remoteLog('[MAP] Static Maps 모드로 지도 열기', 'MAP_OPEN');

  requestAnimationFrame(() => requestAnimationFrame(() => {
    initStaticMap();
    refreshMapData();
  }));

  if (mapPollTimer) clearInterval(mapPollTimer);
  mapPollTimer = setInterval(refreshMapData, 30000);
}

export function closeMap() {
  if (mapPollTimer) { clearInterval(mapPollTimer); mapPollTimer = null; }
  showScreen('main');
  window.App?.switchTab('trip');
}

// ─── 지도 데이터 갱신 ────────────────────────────────────────────
export async function refreshMapData() {
  try {
    const res  = await smartFetch(BASE_URL + '/api/vehicle-tracking/trips?mode=active');
    const data = await res.json();
    smState.trips = data.trips || data.data || [];
    if (!smState.isDragging) renderMapOverlay();  // 드래그 중 폴링 재렌더 금지
    renderMapTripList(smState.trips);
  } catch (e) {
    console.warn('refreshMapData 오류', e);
    const container = document.getElementById('map-trip-items');
    if (container?.innerHTML.includes('불러오는 중')) {
      container.innerHTML = '<div class="map-state-empty"><span class="map-empty-icon">⚠️</span><span>데이터를 불러오지 못했습니다.</span></div>';
    }
  }
}

// ─── 내 위치 중심으로 이동 ───────────────────────────────────────
export function centerMyLocation() {
  navigator.geolocation.getCurrentPosition(
    pos => {
      smState.myLat = pos.coords.latitude;
      smState.myLng = pos.coords.longitude;
      smState.lat   = pos.coords.latitude;
      smState.lng   = pos.coords.longitude;
      smState.zoom  = 15;
      renderStaticMap();
      showToast('내 위치로 이동했습니다.');
    },
    () => showToast('현재 위치를 가져올 수 없습니다.')
  );
}

// ─── 유틸 ────────────────────────────────────────────────────────
function isContractedVehicle() {
  return (State.profile.driverId || '').toUpperCase().startsWith('ELSS');
}

function isMyTrip(trip) {
  const myV  = (State.profile.vehicleNo || '').replace(/\s/g, '').toUpperCase();
  const myId = (State.profile.driverId  || '').toUpperCase();
  const tV   = (trip.vehicle_number || trip.vehicleNo || '').replace(/\s/g, '').toUpperCase();
  const tId  = (trip.vehicle_id     || trip.driverId  || '').toUpperCase();
  return tV === myV || tId === myId;
}

// ─── 하단 패널 차량 목록 렌더 ────────────────────────────────────
function renderMapTripList(trips) {
  const contracted   = isContractedVehicle();
  const visibleTrips = trips.filter(t => t.status !== 'completed' && (contracted ? true : isMyTrip(t)));
  const container    = document.getElementById('map-trip-items');
  const countEl      = document.getElementById('map-panel-count');
  if (!container) return;

  if (countEl) {
    countEl.textContent = visibleTrips.length > 0 ? visibleTrips.length + '대 운행 중' : '운행 없음';
    countEl.style.color = visibleTrips.length > 0 ? '#10b981' : '#cbd5e1';
  }

  if (!visibleTrips.length) {
    container.innerHTML = '<div class="map-state-empty"><span class="map-empty-icon">🚚</span><span>현재 운행 중인 차량이 없습니다.</span></div>';
    return;
  }

  container.innerHTML = '';
  visibleTrips.forEach(trip => {
    const isMe   = isMyTrip(trip);
    const badge  = isMe ? '<span style="background:#10b981;color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:10px;margin-left:4px;">내 차량</span>' : '';
    const speed  = trip.lastLocation?.speed != null ? Math.round(trip.lastLocation.speed) + ' km/h' : '-';
    const addr   = trip.lastLocation?.address || trip.last_location_address || '위치 확인 중...';
    const el     = document.createElement('div');
    el.className = 'map-trip-item';
    el.innerHTML =
      `<div style="display:flex;align-items:center;gap:4px;"><span style="font-size:13px;font-weight:800;color:#1e293b;">${trip.vehicle_number || '-'}</span>${badge}</div>` +
      `<div style="font-size:12px;color:#64748b;">${trip.driver_name || trip.driverId || '-'} &nbsp;· ${speed}</div>` +
      `<div style="font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${addr}</div>`;
    el.onclick = () => showTripRouteOnMap(trip);
    container.appendChild(el);
  });
}

// ─── 하단 패널 접기/펼치기 ───────────────────────────────────────
export function toggleMapPanel() {
  const panel = document.getElementById('map-bottom-panel');
  const icon  = document.getElementById('map-panel-toggle-icon');
  if (!panel) return;
  _mapPanelCollapsed = !_mapPanelCollapsed;
  panel.classList.toggle('collapsed', _mapPanelCollapsed);
  if (icon) icon.textContent = _mapPanelCollapsed ? '▴' : '▾';
}
export const toggleMapTripList = toggleMapPanel; // 하위 호환

// ─── 경로 표시 ───────────────────────────────────────────────────
export async function showTripRouteOnMap(trip) {
  document.getElementById('map-trip-list')?.classList.add('hidden');
  clearMapRoute();

  let locations = [];
  try {
    if (trip.id) {
      const res  = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${trip.id}/locations`);
      const data = await res.json();
      locations  = data.locations || data.data || [];
    }
  } catch (e) { console.warn('locations fetch 실패', e); }

  if (!locations.length && trip.lastLocation) {
    locations = [{ ...trip.lastLocation, recorded_at: new Date().toISOString() }];
  }
  if (!locations.length) { showToast('경로 데이터가 없습니다.'); return; }

  const hav = (la1, lo1, la2, lo2) => {
    const p = 0.017453292519943295;
    const a = 0.5 - Math.cos((la2 - la1) * p) / 2
      + Math.cos(la1 * p) * Math.cos(la2 * p) * (1 - Math.cos((lo2 - lo1) * p)) / 2;
    return 12742 * Math.asin(Math.sqrt(a));
  };

  const valid = locations
    .filter(l => l.lat > 33 && l.lat < 40 && l.lng > 124 && l.lng < 132)
    .sort((a, b) => new Date(a.timestamp || a.recorded_at) - new Date(b.timestamp || b.recorded_at));

  const filtered = [];
  for (let i = 0; i < valid.length; i++) {
    const curr = valid[i];
    if (!filtered.length) { filtered.push(curr); continue; }
    const prev = filtered[filtered.length - 1];
    const dist = hav(prev.lat, prev.lng, curr.lat, curr.lng);
    const dt   = (new Date(curr.timestamp || curr.recorded_at) - new Date(prev.timestamp || prev.recorded_at)) / 1000;
    if (dt > 0 && (dist / (dt / 3600)) > 120) continue;
    if (i < valid.length - 1) {
      const next      = valid[i + 1];
      const threshold = ((prev.speed ?? 0) < 5) ? 0.05 : 0.5;
      const dN  = hav(curr.lat, curr.lng, next.lat, next.lng);
      const dPN = hav(prev.lat, prev.lng, next.lat, next.lng);
      if (dist > threshold && dN > threshold && dPN < threshold * 0.8) continue;
    }
    const moveThreshold = ((prev.speed ?? 0) < 5) ? 0.05 : 0.03;
    if (dist < moveThreshold) continue;
    filtered.push(curr);
  }
  if (valid.length && filtered[filtered.length - 1] !== valid[valid.length - 1]) filtered.push(valid[valid.length - 1]);
  if (!filtered.length) { showToast('표시할 경로가 없습니다.'); return; }

  smState.selectedTrip       = trip;
  smState.selectedTrip._path = filtered;

  const minLat = Math.min(...filtered.map(l => l.lat)), maxLat = Math.max(...filtered.map(l => l.lat));
  const minLng = Math.min(...filtered.map(l => l.lng)), maxLng = Math.max(...filtered.map(l => l.lng));
  smState.lat = (minLat + maxLat) / 2;
  smState.lng = (minLng + maxLng) / 2;

  const { w, h } = getMapSize();
  const dLng = Math.max(0.001, maxLng - minLng), dLat = Math.max(0.001, maxLat - minLat);
  smState.zoom = Math.max(5, Math.min(15, Math.floor(Math.min(
    Math.log2((w * 0.8 * 360) / (dLng * 256)),
    Math.log2((h * 0.8 * 180) / (dLat * 256))
  ))));
  renderStaticMap();

  const panel   = document.getElementById('map-route-panel');
  const titleEl = document.getElementById('map-route-title');
  const bodyEl  = document.getElementById('map-route-body');
  if (panel && titleEl && bodyEl) {
    const vn      = trip.vehicle_number || '';
    const dn      = trip.driver_name || trip.driverId || '';
    titleEl.textContent = vn + (dn ? ' — ' + dn : '');
    const lastLoc   = filtered[filtered.length - 1];
    const startTime = trip.started_at || filtered[0].recorded_at;
    const elapsed   = startTime ? Math.floor((Date.now() - new Date(startTime)) / 60000) : 0;
    const elapsedStr = (elapsed >= 60 ? Math.floor(elapsed / 60) + '시간 ' : '') + (elapsed % 60) + '분';
    const locStr    = lastLoc.address || `(${lastLoc.lat.toFixed(5)}, ${lastLoc.lng.toFixed(5)})`;
    bodyEl.innerHTML = `<div style="font-size:12px;color:#64748b;line-height:1.8;">▶ 출발: ${startTime ? new Date(startTime).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}) : '-'} 당시<br>⏱ 운행 시간: ${elapsedStr}<br>🔄 총 ${filtered.length}개 지점<br>📍 현 위치: ${locStr}</div>`;
    panel.classList.remove('hidden');
  }
}

export function clearMapRoute() {
  smState.selectedTrip = null;
  document.getElementById('map-route-panel')?.classList.add('hidden');
  renderMapOverlay();
}
