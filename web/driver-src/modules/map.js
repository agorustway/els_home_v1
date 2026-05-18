/**
 * map.js — 네이버 지도 Dynamic SDK v3 엔진 (v4.8.0)
 *
 * ✅ Static Maps (raster-cors) 이미지 방식 완전 폐기
 * ✅ Naver Maps JS SDK v3 기반 네이티브 렌더링
 * ✅ naver.maps.Marker가 지도 내부에서 좌표를 직접 추적 → 마커 드리프트 원천 차단
 * ✅ 하단 패널 오버레이 방식 → 패널 토글 시 지도 리사이즈 불필요 (고무줄 현상 제거)
 */
import { State, BASE_URL } from './store.js?v=5155';
import { smartFetch, remoteLog } from './bridge.js?v=5155';
import { showToast } from './utils.js?v=5155';
import { showScreen } from './nav.js?v=5155';
import { filterRouteLocations, haversineKm, prepareLiveTrips } from './locationFilter.js?v=5155';
import { contractTypeLabel, filterTripsForMapVisibility, isOwnVehicleTrip } from './cargoOptions.js?v=5155';
import { startMapForegroundTracking, stopMapForegroundTracking } from './gps.js?v=5155';

// ─── 상수 ──────────────────────────────────────────────────────────
const NCP_KEY_ID   = 'hxoj79osnj';
const SDK_SCRIPT_ID = 'naver-map-sdk';
const MAP_DEFAULT_ZOOM = 13;
const MAP_FOCUS_ZOOM = 15;

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
let _autoFollow  = true;           // 내 차량 자동 추적 (네비 모드)
let _routeTripId  = null;          // 현재 상세 경로 표시 중인 tripId
let _gpsSampleHandler = null;      // 지도 전경 GPS 샘플 핸들러
let _zoomedTripId = null;          // 차량 마커 반복 클릭 줌 토글 상태
let _lastRouteAppendPoint = null;  // 실시간 경로선에 마지막으로 붙인 안정 포인트
let _lastMotionSample = null;      // GPS 공백 중 화면 예측 이동용 마지막 안정 샘플
let _coastTimer = null;            // 터널/음영구간 UI 관성 이동 타이머

function getVisibleTrips(trips, includeCompleted = false) {
  return filterTripsForMapVisibility(prepareLiveTrips(trips), State.profile, includeCompleted);
}

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
    'border-radius:18px;',
    'padding:5px 12px;',
    'font-size:11px;',
    'font-weight:800;',
    'white-space:nowrap;',
    'position:relative;',
    "box-shadow:0 2px 8px rgba(0,0,0,0.35);",
    "font-family:'Noto Sans KR',sans-serif;",
    '">',
    label,
    '<span style="position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);width:3px;height:9px;background:',
    color,
    ';border-radius:0 0 3px 3px;box-shadow:0 2px 4px rgba(0,0,0,.2);"></span>',
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

function makeWaypointIcon(color) {
  const html = [
    '<div style="',
    `background:${color};`,
    'width:14px;height:14px;',
    'border:3px solid #fff;',
    'border-radius:50%;',
    'box-shadow:0 2px 6px rgba(0,0,0,0.3);',
    '">',
    '</div>',
  ].join('');

  return { content: html, anchor: new naver.maps.Point(10, 10) };
}

// ─── 마커 부드러운 이동 애니메이션 ───────────────────────────────────
function animateMarker(marker, fromLat, fromLng, toLat, toLng, duration = 500) {
  const start = performance.now();
  const step = (now) => {
    const elapsed = now - start;
    const t = Math.min(elapsed / duration, 1);
    // easeOutCubic
    const ease = 1 - Math.pow(1 - t, 3);
    const lat = fromLat + (toLat - fromLat) * ease;
    const lng = fromLng + (toLng - fromLng) * ease;
    marker.setPosition(new naver.maps.LatLng(lat, lng));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setMarkerPositionSmooth(marker, lat, lng, duration = 700) {
  if (!marker || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const pos = new naver.maps.LatLng(lat, lng);
  const prev = marker.getPosition?.();
  if (prev) {
    const pLat = prev.lat();
    const pLng = prev.lng();
    const dist = Math.abs(pLat - lat) + Math.abs(pLng - lng);
    if (dist > 0.000001 && dist < 0.5) animateMarker(marker, pLat, pLng, lat, lng, duration);
    else marker.setPosition(pos);
  } else {
    marker.setPosition(pos);
  }
}

function pointTimeMs(point) {
  const raw = point?.recordedAt || point?.recorded_at || point?.timestamp || point?.created_at;
  const ms = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(ms) ? ms : Date.now();
}

function shouldAppendLiveRoutePoint(prev, next) {
  if (!prev || !next) return true;
  const distKm = haversineKm(prev.lat, prev.lng, next.lat, next.lng);
  if (distKm < 0.015) return false;
  const elapsedSec = Math.max(1, (pointTimeMs(next) - pointTimeMs(prev)) / 1000);
  const implied = distKm / (elapsedSec / 3600);
  const speed = Number(next.speed || 0);
  const accuracy = Number(next.accuracy || 0);
  const speedLimit = speed <= 4 ? 60 : (speed < 15 ? 90 : Math.min(145, Math.max(105, speed + 45)));
  if (accuracy > 120) return false;
  if (distKm > 0.05 && implied > speedLimit) return false;
  if (accuracy > 60 && speed < 15 && distKm > 0.08) return false;
  return true;
}

function projectPoint(lat, lng, bearing, distanceKm) {
  const radiusKm = 6371;
  const d = distanceKm / radiusKm;
  const brng = Number(bearing) * Math.PI / 180;
  const lat1 = Number(lat) * Math.PI / 180;
  const lng1 = Number(lng) * Math.PI / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lng2 = lng1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );
  return {
    lat: lat2 * 180 / Math.PI,
    lng: ((lng2 * 180 / Math.PI + 540) % 360) - 180,
  };
}

function applyPredictedMapPosition() {
  if (!_map || State.trip.status !== 'driving' || !State.trip.id || !_lastMotionSample) return;
  const speed = Number(_lastMotionSample.speed || 0);
  const heading = Number(_lastMotionSample.heading);
  const accuracy = Number(_lastMotionSample.accuracy || 0);
  if (!Number.isFinite(heading) || speed < 8 || speed > 105 || accuracy > 80) return;

  const elapsedMs = Date.now() - _lastMotionSample.receivedAtMs;
  if (elapsedMs < 3500 || elapsedMs > 45000) return;
  const distanceKm = Math.min(1.1, speed * (elapsedMs / 3600000));
  const predicted = projectPoint(_lastMotionSample.lat, _lastMotionSample.lng, heading, distanceKm);
  if (!Number.isFinite(predicted.lat) || !Number.isFinite(predicted.lng)) return;

  const marker = _markers.get(State.trip.id);
  if (marker) setMarkerPositionSmooth(marker, predicted.lat, predicted.lng, 900);
  if (_routeTripId && String(_routeTripId) === String(State.trip.id) && _endMarker) {
    setMarkerPositionSmooth(_endMarker, predicted.lat, predicted.lng, 900);
  }
  if (_autoFollow) _map.panTo(new naver.maps.LatLng(predicted.lat, predicted.lng), { duration: 900, easing: 'easeOutCubic' });
}

function handleForegroundGpsSample(event) {
  if (!_map || !window.naver?.maps || State.trip.status !== 'driving' || !State.trip.id) return;
  const { lat, lng, speed, accuracy, heading, recordedAt } = event.detail || {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const sampleHeading = Number(heading);
  _lastMotionSample = {
    lat, lng,
    speed: Number(speed || 0),
    accuracy: Number(accuracy || 0),
    heading: Number.isFinite(sampleHeading) ? sampleHeading : _lastMotionSample?.heading,
    recordedAt,
    receivedAtMs: Date.now(),
  };

  const pos = new naver.maps.LatLng(lat, lng);
  const marker = _markers.get(State.trip.id);
  if (marker) {
    setMarkerPositionSmooth(marker, lat, lng, 900);
  } else {
    const label = State.profile.vehicleNo ? State.profile.vehicleNo.slice(-4) : '내 차량';
    _markers.set(State.trip.id, new naver.maps.Marker({
      position: pos,
      map: _map,
      icon: makeVehicleIcon(label, '#10b981'),
      title: label,
      zIndex: 120,
    }));
  }

  if (_routeTripId && String(_routeTripId) === String(State.trip.id) && _endMarker) {
    try {
      const path = _polyline?.getPath?.();
      const lastIdx = path?.getLength?.() ? path.getLength() - 1 : -1;
      const last = lastIdx >= 0 ? path.getAt(lastIdx) : null;
      const prev = _lastRouteAppendPoint || (last ? { lat: last.lat(), lng: last.lng(), recordedAt: new Date().toISOString() } : null);
      const next = { lat, lng, speed, accuracy, recordedAt };
      if (shouldAppendLiveRoutePoint(prev, next)) {
        setMarkerPositionSmooth(_endMarker, lat, lng, 900);
        if (path) path.push(pos);
        _lastRouteAppendPoint = next;
      }
    } catch (_) { }
  }

  _trips = _trips.map(t => String(t.id) === String(State.trip.id)
    ? { ...t, lastLocation: { ...(t.lastLocation || {}), lat, lng, recorded_at: new Date().toISOString() } }
    : t);

  if (_autoFollow) _map.panTo(pos, { duration: 900, easing: 'easeOutCubic' });
}

function startMapGpsSampling() {
  if (!_gpsSampleHandler) {
    _gpsSampleHandler = handleForegroundGpsSample;
    window.addEventListener('els:gps-sample', _gpsSampleHandler);
  }
  startMapForegroundTracking();
  if (!_coastTimer) _coastTimer = setInterval(applyPredictedMapPosition, 1000);
}

function stopMapGpsSampling() {
  stopMapForegroundTracking();
  if (_gpsSampleHandler) {
    window.removeEventListener('els:gps-sample', _gpsSampleHandler);
    _gpsSampleHandler = null;
  }
  if (_coastTimer) {
    clearInterval(_coastTimer);
    _coastTimer = null;
  }
  _lastMotionSample = null;
}

// ─── 마커 갱신 ──────────────────────────────────────────────────────
function updateVehicleMarkers(trips) {
  if (!_map) return;

  const visible = getVisibleTrips(trips, true);
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
      // 부드러운 마커 이동 (이전 위치 → 새 위치)
      const prev = m.getPosition();
      if (prev) {
        const pLat = prev.lat();
        const pLng = prev.lng();
        const dist = Math.abs(pLat - lat) + Math.abs(pLng - lng);
        if (dist > 0.00001 && dist < 0.5) {
          // 적당한 거리면 애니메이션, 너무 멀면 즉시 이동
          animateMarker(m, pLat, pLng, lat, lng, 600);
        } else {
          m.setPosition(pos);
        }
      } else {
        m.setPosition(pos);
      }
      m.setIcon(makeVehicleIcon(label, color));
    } else {
      const m = new naver.maps.Marker({
        position : pos,
        map      : _map,
        icon     : makeVehicleIcon(label, color),
        title    : label,
        zIndex   : 100,
      });
      // 클릭 시 경로/상세보기 조회 + 줌 토글
      naver.maps.Event.addListener(m, 'click', () => handleVehicleMarkerClick(trip));
      _markers.set(trip.id, m);
    }
  }

  // 자동 추적 모드: 내 차량이 있으면 부드럽게 지도 이동 (네비게이션 스타일)
  if (_autoFollow) {
    const myTrip = visible.find(t => isMyTrip(t));
    if (myTrip?.lastLocation) {
      const pos = new naver.maps.LatLng(myTrip.lastLocation.lat, myTrip.lastLocation.lng);
      _map.panTo(pos, { duration: 500, easing: 'easeOutCubic' });
    }
  }
}

async function handleVehicleMarkerClick(trip) {
  await showTripRouteOnMap(trip, { toggleZoom: true });
}

// ─── 경로(Polyline) 그리기 ───────────────────────────────────────────
function drawPolyline(path, options = {}) {
  // 기존 경로/시작종료 마커 제거
  if (_polyline)    { _polyline.setMap(null);    _polyline    = null; }
  if (_startMarker) { _startMarker.setMap(null); _startMarker = null; }
  if (_endMarker)   { _endMarker.setMap(null);   _endMarker   = null; }

  if (!path.length || !_map) return;

  const filteredPath = options.alreadyMatched ? path : filterRouteLocations(path);

  if (filteredPath.length === 0) return;
  _lastRouteAppendPoint = filteredPath[filteredPath.length - 1] || null;

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

  // 출발 / 종료 위치는 작은 점만 표시하고, 현재 위치는 차량 마커와 경로선으로 식별한다.
  _startMarker = new naver.maps.Marker({
    position : latLngs[0],
    map      : _map,
    icon     : makeWaypointIcon('#16a34a'),
    zIndex   : 200,
  });

  _endMarker = new naver.maps.Marker({
    position : latLngs[latLngs.length - 1],
    map      : _map,
    icon     : makeWaypointIcon('#dc2626'),
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
  const visible = getVisibleTrips(trips, true);

  const countEl = document.getElementById('map-panel-count');
  const cargoLabel = (State.profile.cargoType || 'container') === 'general' ? '일반화물' : '컨테이너';
  if (countEl) {
    const activeCount = visible.filter(t => t.status !== 'completed').length;
    const completedCount = visible.length - activeCount;
    countEl.textContent = visible.length > 0
      ? `${cargoLabel} 표시 ${visible.length}대 · 운행 ${activeCount} · 완료 ${completedCount}`
      : `${cargoLabel} 표시 차량 없음`;
  }

  const container = document.getElementById('map-trip-items');
  if (!container) return;

  if (!visible.length) {
    container.innerHTML = `
      <div class="map-state-empty">
        <span>운행 중인 차량이 없습니다.</span>
      </div>`;
    return;
  }

  container.innerHTML = visible.map(trip => `
    <div class="map-trip-item"
         onclick="App.focusVehicleOnMap(${JSON.stringify(trip).replace(/"/g, '&quot;')})">
      <div style="font-weight:800;color:#0f172a;">${trip.vehicle_number || '-'}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">
        ${trip.driver_name || '-'} · ${trip.status === 'completed' ? '운행완료' : '운행중'} · ${contractTypeLabel(trip.driver_contract_type || trip.contract_type)} · ${trip.lastLocation?.address || '위치 정보 없음'}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:6px;">
        <button class="btn btn-sm" style="font-size:11px;padding:4px 10px;height:24px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;" onclick="event.stopPropagation(); App.showTripRouteOnMap(${JSON.stringify(trip).replace(/"/g, '&quot;')})">상세보기</button>
      </div>
    </div>
  `).join('');
}

// ─── 유틸 ───────────────────────────────────────────────────────────
function isMyTrip(trip) {
  return isOwnVehicleTrip(trip, State.profile);
}

function normalizeSpeed(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed) || speed < 0 || speed > 160) return null;
  return Math.round(speed);
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0분';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function readPointTime(point) {
  const raw = point?.recorded_at || point?.created_at || point?.timestamp || point?.time;
  const parsed = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function buildRouteStats(trip, points) {
  const endedAt = trip.ended_at || trip.completed_at || trip.updated_at || trip.lastLocation?.created_at;
  const firstTimedPoint = points.find(p => readPointTime(p));
  const startedAt = trip.started_at || firstTimedPoint?.recorded_at || firstTimedPoint?.created_at;
  const startMs = startedAt ? new Date(startedAt).getTime() : readPointTime(points[0]);
  const endMs = endedAt ? new Date(endedAt).getTime() : readPointTime(points[points.length - 1]);
  const durationMs = (Number.isFinite(startMs) && Number.isFinite(endMs)) ? endMs - startMs : 0;
  const speeds = points
    .map(p => normalizeSpeed(p.speed ?? p.speed_kmh ?? p.velocity))
    .filter(v => v != null);
  const maxSpeed = normalizeSpeed(trip.max_speed) ?? (speeds.length ? Math.max(...speeds) : 0);
  const avgSpeed = normalizeSpeed(trip.avg_speed) ?? (speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0);

  return {
    duration: formatDuration(durationMs),
    maxSpeed,
    avgSpeed,
  };
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
  _autoFollow = true;  // 지도 열 때 자동추적 모드 ON
  _routeTripId = null;
  _lastRouteAppendPoint = null;
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
      startMapGpsSampling();
    });
  });

  // 지도 화면이 떠 있는 동안은 네비게이션처럼 짧게 폴링한다.
  if (_mapPollTimer) clearInterval(_mapPollTimer);
  _mapPollTimer = setInterval(refreshMapData, 5000);

  remoteLog('[MAP] openMap 완료 (Dynamic SDK v3)', 'MAP_OPEN');
}

/** 지도 화면 닫기 */
export async function closeMap() {
  if (_mapPollTimer) { clearInterval(_mapPollTimer); _mapPollTimer = null; }
  stopMapGpsSampling();
  _routeTripId = null;
  _lastRouteAppendPoint = null;
  showScreen('main');
  // trip 탭 활성화 및 데이터 로드
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-trip')?.classList.add('active');
  document.getElementById('tab-btn-trip')?.classList.add('active');
  try {
    const { loadCurrentTrip } = await import('./trip.js?v=5155');
    await loadCurrentTrip();
  } catch (e) { console.warn('[MAP] closeMap load error', e); }
}

/** 차량 위치 데이터 갱신 */
export async function refreshMapData() {
  try {
    const res  = await smartFetch(BASE_URL + '/api/vehicle-tracking/trips?mode=active');
    const data = await res.json();
    _trips = prepareLiveTrips(data.trips || data.data || []);
    updateVehicleMarkers(_trips);
    renderTripList(_trips);
  } catch (e) {
    console.warn('[MAP] refreshMapData 오류', e);
  }
}

/** 내 위치로 이동 */
export function centerMyLocation() {
  _autoFollow = true;  // 내 위치 버튼 누르면 자동추적 ON
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

      _map.panTo(position, { duration: 400, easing: 'easeOutCubic' });
      _map.setZoom(MAP_DEFAULT_ZOOM, true);
      _zoomedTripId = null;
      showToast('내 위치로 이동했습니다.');
    },
    () => showToast('위치 정보를 가져올 수 없습니다.')
  );
}

/** 현재 공개범위 내 전체 차량 보기 */
export function showAllMapVehicles() {
  if (!_map) return;
  _autoFollow = false;  // 전체보기 누르면 자동추적 OFF
  const visible = getVisibleTrips(_trips, true);
  if (!visible.length) {
    showToast('현재 공개범위에 표시할 차량이 없습니다.');
    return;
  }
  try {
    const bounds = new naver.maps.LatLngBounds();
    visible.forEach(t => bounds.extend(new naver.maps.LatLng(t.lastLocation.lat, t.lastLocation.lng)));
    _map.fitBounds(bounds, { top: 70, right: 35, bottom: 240, left: 35 });
  } catch {
    const first = visible[0].lastLocation;
    _map.setCenter(new naver.maps.LatLng(first.lat, first.lng));
    _map.setZoom(12, true);
  }
}

/** 특정 차량의 위치로 이동 및 줌 레벨 조정 */
export function focusVehicleOnMap(trip) {
  if (!_map || !trip.lastLocation) return;
  _autoFollow = false;  // 수동 이동 시 자동추적 OFF
  const pos = new naver.maps.LatLng(trip.lastLocation.lat, trip.lastLocation.lng);
  _map.panTo(pos, { duration: 400, easing: 'easeOutCubic' });
  _map.setZoom(MAP_FOCUS_ZOOM, true);
  _zoomedTripId = trip.id;
  showToast(`${trip.vehicle_number} 차량 위치로 이동했습니다.`);
}

function toggleVehicleZoom(trip) {
  if (!_map || !trip?.lastLocation) return;
  const pos = new naver.maps.LatLng(trip.lastLocation.lat, trip.lastLocation.lng);
  const isSameZoomed = String(_zoomedTripId) === String(trip.id) && _map.getZoom() > MAP_DEFAULT_ZOOM;
  _map.panTo(pos, { duration: 350, easing: 'easeOutCubic' });
  _map.setZoom(isSameZoomed ? MAP_DEFAULT_ZOOM : MAP_FOCUS_ZOOM, true);
  _zoomedTripId = isSameZoomed ? null : trip.id;
}

/** 특정 차량의 경로를 지도 위에 표시 */
export async function showTripRouteOnMap(trip, options = {}) {
  _autoFollow = false; // 상세보기 중에는 지도 카메라를 고정한다.
  _routeTripId = trip.id;
  remoteLog(`[MAP] 경로 조회: ${trip.vehicle_number}`, 'MAP_ROUTE');

  let path = [];
  let rawLocations = [];
  try {
    const res  = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${trip.id}/matched-route`);
    const data = await res.json();
    rawLocations = Array.isArray(data.locations) ? data.locations : (Array.isArray(data.data) ? data.data : []);
    path = (Array.isArray(data.matchedPath) && data.matchedPath.length >= 2)
      ? data.matchedPath
      : rawLocations;
    path._matchedSource = data.source;
  } catch (e) {
    console.error('[MAP] 경로 fetch 실패', e);
  }

  if (!path.length) { showToast('경로 데이터가 없습니다.'); return; }

  drawPolyline(path, { alreadyMatched: path._matchedSource === 'naver-directions15' });
  if (options.toggleZoom) toggleVehicleZoom(trip);

  // 경로 패널 표시
  const panel = document.getElementById('map-route-panel');
  if (panel) {
    document.getElementById('map-bottom-panel')?.classList.add('collapsed');
    const titleEl = document.getElementById('map-route-title');
    if (titleEl) titleEl.textContent = trip.vehicle_number || '경로 정보';
    const countEl = document.getElementById('map-panel-count');
    if (countEl) countEl.textContent = trip.vehicle_number ? `선택 차량 ${trip.vehicle_number}` : '선택 차량 경로';

    const bodyEl = document.getElementById('map-route-body');
    if (bodyEl) {
      const cleanPath = path._matchedSource === 'naver-directions15' ? path : filterRouteLocations(path);
      const s = cleanPath[0] || path[0];
      const e = cleanPath[cleanPath.length - 1] || path[path.length - 1];
      const stats = buildRouteStats(trip, rawLocations.length ? rawLocations : cleanPath);

      const statsHtml = [
        `<div><b>총운행시간</b>: ${stats.duration}</div>`,
        `<div><b>최고속도</b>: ${stats.maxSpeed} km/h</div>`,
        `<div><b>평균속도</b>: ${stats.avgSpeed} km/h</div>`,
      ].join('');

      bodyEl.innerHTML = `
        <div style="font-size:12px;color:#64748b;line-height:1.9;">
          <div><span style="display:inline-block;width:10px;height:10px;background:#16a34a;border-radius:50%;margin-right:6px;"></span><b>입차</b>: ${s.address  || `${s.lat?.toFixed(5)}, ${s.lng?.toFixed(5)}`}</div>
          <div><span style="display:inline-block;width:10px;height:10px;background:#dc2626;border-radius:50%;margin-right:6px;"></span><b>마지막</b>: ${e.address  || `${e.lat?.toFixed(5)}, ${e.lng?.toFixed(5)}`}</div>
          <div><b>기록</b>: ${cleanPath.length}개 보정 포인트 / 원본 ${path.length}개</div>
          ${statsHtml}
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
  _routeTripId = null;
  _lastRouteAppendPoint = null;
  _zoomedTripId = null;
  document.getElementById('map-route-panel')?.classList.add('hidden');
  document.getElementById('map-bottom-panel')?.classList.remove('collapsed');
}

/** 하단 차량 목록 패널 토글 */
export function toggleMapPanel() {
  const panel = document.getElementById('map-bottom-panel');
  if (!panel) return;
  panel.classList.toggle('collapsed');
  // ★ 오버레이 방식이므로 지도 resize 불필요
}

export const toggleMapTripList = toggleMapPanel;
