/**
 * map.js — Static Maps 엔진 v4.7.0 (전면 재설계 — 마커 드리프트 정밀 해결)
 * 
 * [아키텍처 개선]
 * 1. smPanner (panning layer): 지도 이미지(img) + 경로(canvas)만 포함. 드래그 중 translate3d 이동.
 * 2. smOverlay (pixed overlay): panner 바깥에 배치. 마커들이 화면 좌표에 '절대 고정'됨.
 * 3. 드래그 중: panner와 overlay에 동일한 translate3d를 적용하여 일체감 유지.
 * 4. 드래그 종료: pixelToLatLng 역변환으로 새 중심점(State.lat/lng) 계산 → 새 이미지 로드 → 오버레이 재배치(reset).
 * 
 * [수정 사항]
 * - 핀치줌 지원 (2점 터치 감지)
 * - 하단 패널 토글 시 350ms 후 리사이즈 연동 (찌그러짐 방지)
 * - "v4.6.1-STATIC-FIX" HUD 제거
 * - 차량 목록 "불러오는 중" 상태 실시간 대수 갱신 로직 추가
 */
import { State, BASE_URL } from './store.js';
import { smartFetch, remoteLog } from './bridge.js';
import { showToast } from './utils.js';
import { showScreen } from './nav.js';

const STATIC_MAP_KEY = 'hxoj79osnj';
const STATIC_BASE    = 'https://maps.apigw.ntruss.com/map-static/v2/raster-cors';

// ─── 지도 엔진 상태 (내부) ─────────────────────────────────────────
let smState = {
  lat: 36.5, lng: 127.5, zoom: 7,
  isDragging: false,
  panOffsetX: 0, panOffsetY: 0,   // 현재 드래그 중인 px 오프셋
  trips: [], selectedTrip: null,
  myLat: null, myLng: null,
  _touchStartDist: 0, _startZoom: 7, // 핀치줌용
};

let smImg = null, smCanvas = null, smOverlay = null, smPanner = null;
let mapContainer = null;
let mapPollTimer = null;
let _pendingRender = false;

/** 지도 화면 초기화 (최초 1회만) */
export function initMapScreen() {
  mapContainer = document.getElementById('map-container');
  if (!mapContainer) return;

  smPanner  = document.getElementById('sm-panner');
  smImg     = document.getElementById('sm-img');
  smCanvas  = document.getElementById('sm-canvas');
  smOverlay = document.getElementById('sm-overlay');

  if (!smPanner || !smOverlay) {
    console.error('[MAP] 필수 DOM 요소 누락');
    return;
  }

  // 1. 네이티브 드래그 방지
  smImg.ondragstart = () => false;

  // 2. 터치 핸들러 바인딩
  bindMapTouchEvents();

  // 3. 패널 토글 버튼 연동
  const toggleBtn = document.getElementById('map-panel-toggle');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      toggleMapPanel();
    };
  }

  console.log('[MAP] v4.7.0 인터페이스 초기화 완료');
}

/** 지도 렌더링 (이미지 로드 + 오버레이 전개) */
export async function renderStaticMap() {
  if (!mapContainer || State.currentScreen !== 'screen-map') return;

  const w = mapContainer.clientWidth;
  const h = mapContainer.clientHeight;
  if (w === 0 || h === 0) return;

  // 드래그 중이면 데이터 로드 생략 (깜빡임 방지)
  if (smState.isDragging || _pendingRender) return;

  _pendingRender = true;

  try {
    const lat = smState.lat;
    const lng = smState.lng;
    const zoom = Math.round(smState.zoom);

    // 1. Static Map URL 생성 (기본 지도)
    let url = `${STATIC_BASE}?w=${w}&h=${h}&center=${lng},${lat}&level=${zoom}&public_key=${STATIC_MAP_KEY}`;
    
    // 2. 이미지 로드 대기
    await new Promise((resolve) => {
      smImg.onload = resolve;
      smImg.onerror = resolve;
      smImg.src = url;
    });

    // 3. 드래그 오프셋 초기화 (0,0 으로 복귀)
    smState.panOffsetX = 0;
    smState.panOffsetY = 0;
    updateLayersTransform(0, 0);

    // 4. 경로 및 오버레이(마커) 초기화
    renderMapPath(w, h);
    renderMapOverlay();

    // 5. 카운트 갱신
    updateMapTripCount();

  } catch (e) {
    remoteLog('renderStaticMap_err', e.message);
  } finally {
    _pendingRender = false;
  }
}

/** 드래그 시 레이어(Panner + Overlay) 동기 이동 */
function updateLayersTransform(x, y) {
  const css = `translate3d(${x}px, ${y}px, 0)`;
  smPanner.style.transform = css;
  smOverlay.style.transform = css;
}

/** 터치 이벤트 (드래그 & 핀치줌) */
function bindMapTouchEvents() {
  let startX, startY;
  let startLat, startLng;

  mapContainer.addEventListener('touchstart', (e) => {
    if (_pendingRender) return;

    if (e.touches.length === 1) {
      // 일반 드래그 시작
      smState.isDragging = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startLat = smState.lat;
      startLng = smState.lng;
    } 
    else if (e.touches.length === 2) {
      // 핀치줌 시작
      smState.isDragging = true;
      smState._touchStartDist = getPinchDist(e);
      smState._startZoom = smState.zoom;
    }
  }, { passive: false });

  mapContainer.addEventListener('touchmove', (e) => {
    if (!smState.isDragging) return;
    e.preventDefault();

    if (e.touches.length === 1) {
      // 드래그 중: 레이어만 transform 이동
      smState.panOffsetX = e.touches[0].clientX - startX;
      smState.panOffsetY = e.touches[0].clientY - startY;
      updateLayersTransform(smState.panOffsetX, smState.panOffsetY);
    } 
    else if (e.touches.length === 2) {
      // 핀치줌 중: 즉시 줌 레벨 조정 (시점은 나중에)
      const dist = getPinchDist(e);
      const scale = dist / smState._touchStartDist;
      let newZoom = smState._startZoom + Math.log2(scale);
      newZoom = Math.max(3, Math.min(18, newZoom));
      
      if (Math.abs(newZoom - smState.zoom) > 0.1) {
        smState.zoom = newZoom;
        // 줌 변경시는 transform 대신 바로 재렌더링 예약 유도 가능하지만, 
        // 하드웨어 부하를 위해 줌 슬라이더 등 UI만 갱신 가능.
        // 여기서는 그냥 값만 킵
      }
    }
  }, { passive: false });

  mapContainer.addEventListener('touchend', (e) => {
    if (!smState.isDragging) return;
    smState.isDragging = false;

    // 만약 드래그가 일정 수준 이상(10px) 발생했다면 새 좌표 계산
    if (Math.abs(smState.panOffsetX) > 10 || Math.abs(smState.panOffsetY) > 10) {
      const w = mapContainer.clientWidth;
      const h = mapContainer.clientHeight;
      
      // 역변환: 화면 오프셋만큼 중심점 이동
      const centerFix = pixelToLatLng(w/2 - smState.panOffsetX, h/2 - smState.panOffsetY, w, h);
      smState.lat = centerFix.lat;
      smState.lng = centerFix.lng;
    }

    renderStaticMap();
  });
}

function getPinchDist(e) {
  return Math.sqrt(
    Math.pow(e.touches[0].clientX - e.touches[1].clientX, 2) +
    Math.pow(e.touches[0].clientY - e.touches[1].clientY, 2)
  );
}

/** ─── 좌표 계산 코어 (Naver Static Map Raster 변환) ─── */

function latLngToPixel(lat, lng, w, h) {
  const centerLat = smState.lat;
  const centerLng = smState.lng;
  const zoom = Math.round(smState.zoom);
  
  const worldSize = 256 * Math.pow(2, zoom);
  const prj = (v) => worldSize * (v + 180) / 360;
  const latPrj = (v) => {
    const sinLat = Math.sin(v * Math.PI / 180);
    return worldSize * (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI));
  };

  const centerPxX = prj(centerLng);
  const centerPxY = latPrj(centerLat);
  const targetPxX = prj(lng);
  const targetPxY = latPrj(lat);

  return {
    x: (targetPxX - centerPxX) + (w / 2),
    y: (targetPxY - centerPxY) + (h / 2)
  };
}

function pixelToLatLng(x, y, w, h) {
  const centerLat = smState.lat;
  const centerLng = smState.lng;
  const zoom = Math.round(smState.zoom);

  const worldSize = 256 * Math.pow(2, zoom);
  const prj_inv = (px) => (px * 360 / worldSize) - 180;
  const latPrj = (v) => {
    const sinLat = Math.sin(v * Math.PI / 180);
    return worldSize * (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI));
  };
  const latPrj_inv = (py) => {
    const n = Math.PI - 2 * Math.PI * py / worldSize;
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };

  const centerPxX = worldSize * (centerLng + 180) / 360;
  const centerPxY = latPrj(centerLat);

  const targetPxX = centerPxX + (x - w / 2);
  const targetPxY = centerPxY + (y - h / 2);

  return {
    lat: latPrj_inv(targetPxY),
    lng: prj_inv(targetPxX)
  };
}

/** ─── 경로 및 오버레이 렌더링 ─── */

function renderMapPath(w, h) {
  const ctx = smCanvas.getContext('2d');
  smCanvas.width = w;
  smCanvas.height = h;
  ctx.clearRect(0, 0, w, h);

  if (!smState.selectedTrip) return;

  const locs = smState.selectedTrip.locations || [];
  if (locs.length < 2) return;

  ctx.beginPath();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';

  locs.forEach((loc, idx) => {
    const px = latLngToPixel(loc.latitude, loc.longitude, w, h);
    if (idx === 0) ctx.moveTo(px.x, px.y);
    else ctx.lineTo(px.x, px.y);
  });
  ctx.stroke();
}

function renderMapOverlay() {
  smOverlay.innerHTML = '';
  const w = mapContainer.clientWidth;
  const h = mapContainer.clientHeight;

  // 1. 내 위치 마커
  if (smState.myLat && smState.myLng) {
    const px = latLngToPixel(smState.myLat, smState.myLng, w, h);
    addMarkerDOM(px.x, px.y, '🔵', '내 위치', true);
  }

  // 2. 차량 마커들
  smState.trips.forEach(trip => {
    if (!trip.latitude || !trip.longitude) return;
    const px = latLngToPixel(trip.latitude, trip.longitude, w, h);
    const isSel = smState.selectedTrip?.id === trip.id;
    
    const div = addMarkerDOM(px.x, px.y, isSel ? '🚒' : '🚚', trip.vehicle_no || '차량', false);
    div.onclick = (e) => {
      e.stopPropagation();
      selectTrip(trip);
    };
  });
}

function addMarkerDOM(x, y, emoji, label, isPulse) {
  const div = document.createElement('div');
  div.className = 'sm-marker' + (isPulse ? ' pulse' : '');
  div.style.left = `${x}px`;
  div.style.top = `${y}px`;
  div.innerHTML = `
    <div class="marker-icon">${emoji}</div>
    <div class="marker-label">${label}</div>
  `;
  smOverlay.appendChild(div);
  return div;
}

/** ─── 데이터 관리 ─── */

export async function refreshMapData(isFirst = false) {
  try {
    const res = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips`);
    if (res && res.trips) {
      smState.trips = res.trips;
      
      // 내 위치 연동
      if (window.State && window.State.gps) {
        smState.myLat = window.State.gps.lat;
        smState.myLng = window.State.gps.lng;
        
        if (isFirst && smState.myLat) {
          smState.lat = smState.myLat;
          smState.lng = smState.myLng;
        }
      }
      
      renderStaticMap();
      renderMapTripList();
    }
  } catch (e) {
    console.error('[MAP] 데이터 갱신 실패', e);
  }
}

function selectTrip(trip) {
  smState.selectedTrip = trip;
  smState.lat = trip.latitude;
  smState.lng = trip.longitude;
  smState.zoom = 14;
  renderStaticMap();
  
  // 패널 열기
  const panel = document.getElementById('map-panel');
  if (panel) panel.classList.remove('collapsed');
}

/** 차량 목록 렌더링 */
function renderMapTripList() {
  const list = document.getElementById('map-trip-list');
  if (!list) return;

  if (smState.trips.length === 0) {
    list.innerHTML = '<div class="p-4 text-center text-gray-500">운행 중인 차량이 없습니다.</div>';
    return;
  }

  list.innerHTML = smState.trips.map(trip => `
    <div class="trip-item p-3 border-b active:bg-gray-100 ${smState.selectedTrip?.id === trip.id ? 'bg-blue-50' : ''}" id="trip-item-${trip.id}">
      <div class="flex justify-between items-center">
        <span class="font-bold text-gray-800">${trip.vehicle_no}</span>
        <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">운행중</span>
      </div>
      <div class="text-xs text-gray-500 mt-1">마지막 위치: ${trip.last_address || '정보 없음'}</div>
    </div>
  `).join('');

  // 클릭 이벤트
  smState.trips.forEach(trip => {
    const el = document.getElementById(`trip-item-${trip.id}`);
    if (el) el.onclick = () => selectTrip(trip);
  });
}

/** 차량 대수 텍스트 갱신 */
function updateMapTripCount() {
  const countEl = document.getElementById('map-panel-count');
  if (countEl) {
    const count = smState.trips.length;
    countEl.innerText = count > 0 ? `${count}대 운행 중` : '운행 차량 없음';
  }
}

/** 하단 패널 토글 */
function toggleMapPanel() {
  const panel = document.getElementById('map-panel');
  if (panel) {
    panel.classList.toggle('collapsed');
    
    // 레이아웃이 변하므로 지도 재렌더링 (애니메이션 대기 350ms)
    setTimeout(() => {
      renderStaticMap();
    }, 350);
  }
}

/** 오토줌 (전체 차량이 보이도록) */
export function fitMapBounds() {
  if (smState.trips.length === 0) return;

  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  smState.trips.forEach(t => {
    if (!t.latitude || !t.longitude) return;
    minLat = Math.min(minLat, t.latitude);
    maxLat = Math.max(maxLat, t.latitude);
    minLng = Math.min(minLng, t.longitude);
    maxLng = Math.max(maxLng, t.longitude);
  });

  smState.lat = (minLat + maxLat) / 2;
  smState.lng = (minLng + maxLng) / 2;
  
  // 대략적인 줌 결정 (단순화)
  const dist = Math.max(maxLat - minLat, (maxLng - minLng) * 0.7);
  if (dist > 2) smState.zoom = 7;
  else if (dist > 0.5) smState.zoom = 9;
  else if (dist > 0.1) smState.zoom = 11;
  else smState.zoom = 13;

  renderStaticMap();
}
