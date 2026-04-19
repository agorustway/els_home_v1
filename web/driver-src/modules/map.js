/**
 * map.js ???ㅼ씠踰?吏??Dynamic SDK v3 ?붿쭊 (v4.8.0)
 *
 * ??Static Maps (raster-cors) ?대?吏 諛⑹떇 ?꾩쟾 ?먭린
 * ??Naver Maps JS SDK v3 湲곕컲 ?ㅼ씠?곕툕 ?뚮뜑留? * ??naver.maps.Marker媛 吏???대??먯꽌 醫뚰몴瑜?吏곸젒 異붿쟻 ??留덉빱 ?쒕━?꾪듃 ?먯쿇 李⑤떒
 * ???섎떒 ?⑤꼸 ?ㅻ쾭?덉씠 諛⑹떇 ???⑤꼸 ?좉? ??吏??由ъ궗?댁쫰 遺덊븘??(怨좊Т以??꾩긽 ?쒓굅)
 */
import { State, BASE_URL } from './store.js?v=4919';
import { smartFetch, remoteLog } from './bridge.js?v=4919';
import { showToast } from './utils.js?v=4919';
import { showScreen } from './nav.js?v=4919';

// ??? ?곸닔 ??????????????????????????????????????????????????????????
const NCP_KEY_ID   = 'hxoj79osnj';
const SDK_SCRIPT_ID = 'naver-map-sdk';

// ??? 紐⑤뱢 ?대? ?곹깭 ????????????????????????????????????????????????
let _map         = null;           // naver.maps.Map ?몄뒪?댁뒪
let _markers     = new Map();      // tripId ??naver.maps.Marker
let _myMarker    = null;           // ???꾩튂 留덉빱
let _polyline    = null;           // 寃쎈줈 Polyline
let _startMarker = null;           // 寃쎈줈 異쒕컻??留덉빱
let _endMarker   = null;           // 寃쎈줈 ?꾩옱?꾩튂 留덉빱
let _trips       = [];             // 理쒖떊 ?댄뻾 ?곗씠??let _mapPollTimer = null;          // ?대쭅 ??대㉧
let _sdkReady    = false;          // SDK 濡쒕뱶 ?꾨즺 ?щ?

// ??? SDK ?숈쟻 濡쒕뱶 (openMap ?쒖젏??lazy) ???????????????????????????
function loadNaverSDK() {
  return new Promise((resolve, reject) => {
    // ?대? 濡쒕뱶??寃쎌슦
    if (window.naver?.maps?.Map) {
      _sdkReady = true;
      resolve();
      return;
    }

    // ?대? script ?쒓렇媛 異붽???寃쎌슦 ??onload ?湲?    const existing = document.getElementById(SDK_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => { _sdkReady = true; resolve(); });
      existing.addEventListener('error', reject);
      return;
    }

    // ?덈줈 script ?쎌엯
    const script = document.createElement('script');
    script.id    = SDK_SCRIPT_ID;
    script.src   = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NCP_KEY_ID}`;
    script.onload = () => {
      _sdkReady = true;
      remoteLog('[MAP] Naver SDK v3 濡쒕뱶 ?꾨즺', 'MAP_SDK_OK');
      resolve();
    };
    script.onerror = (e) => {
      remoteLog('[MAP] Naver SDK v3 濡쒕뱶 ?ㅽ뙣', 'MAP_SDK_ERR');
      reject(e);
    };
    document.head.appendChild(script);
  });
}

// ??? 吏??珥덇린??????????????????????????????????????????????????????
function initNaverMap() {
  const el = document.getElementById('driver-map');
  if (!el) return;

  // ?대? 珥덇린?붾맂 寃쎌슦 ??DOM???몄뒪?댁뒪媛 ?댁븘?덉쑝硫??ъ궗??  if (_map) {
    // ?붾㈃???ㅼ떆 蹂댁씤 ??吏???ш린 ?숆린??    naver.maps.Event.trigger(_map, 'resize');
    return;
  }

  _map = new naver.maps.Map(el, {
    center : new naver.maps.LatLng(36.5, 127.5),
    zoom   : 7,
    // 遺덊븘?뷀븳 UI ?쒓굅 (?먯껜 back-btn, my-loc-btn ?덉쓬)
    mapDataControl   : false,
    scaleControl     : true,
    scaleControlOptions : {
      position: naver.maps.Position.BOTTOM_RIGHT,
    },
    zoomControlOptions : {
      position: naver.maps.Position.RIGHT_CENTER,
    },
  });

  remoteLog('[MAP] naver.maps.Map 珥덇린???꾨즺', 'MAP_INIT');
}

// ??? 留덉빱 ?꾩씠肄??ы띁 ???????????????????????????????????????????????
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
    // 留먰뭾???꾨옯 瑗?쭞?먯씠 醫뚰몴??留욌룄濡??듭빱 ?ㅼ젙
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

// ??? 留덉빱 媛깆떊 ??????????????????????????????????????????????????????
function updateVehicleMarkers(trips) {
  if (!_map) return;

  const contracted = (State.profile.driverId || '').toUpperCase().startsWith('ELSS');
  const visible    = trips.filter(t => t.lastLocation && (contracted || isMyTrip(t)));
  const visibleIds = new Set(visible.map(t => t.id));

  // ?щ씪吏?留덉빱 ?쒓굅
  for (const [id, marker] of _markers) {
    if (!visibleIds.has(id)) {
      marker.setMap(null);
      _markers.delete(id);
    }
  }

  // 媛깆떊 ?먮뒗 ?좉퇋 異붽?
  for (const trip of visible) {
    const { lat, lng } = trip.lastLocation;
    const pos   = new naver.maps.LatLng(lat, lng);
    const isDone = trip.status === 'completed';
    const isMe   = isMyTrip(trip);
    const color  = isDone ? '#94a3b8' : (isMe ? '#10b981' : '#2563eb');
    const label  = trip.vehicle_number ? trip.vehicle_number.slice(-4) : '李⑤웾';

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
      // ?대┃ ??寃쎈줈 議고쉶
      naver.maps.Event.addListener(m, 'click', () => showTripRouteOnMap(trip));
      _markers.set(trip.id, m);
    }
  }
}

// ??? 寃쎈줈(Polyline) 洹몃━湲????????????????????????????????????????????
function drawPolyline(path) {
  // 湲곗〈 寃쎈줈/?쒖옉醫낅즺 留덉빱 ?쒓굅
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
    
    // 鍮꾩젙?곸쟻?쇰줈 鍮좊Ⅸ ?띾룄(?ㅽ뙆?댄겕) ?쒓굅
    if (timeSec > 0) {
      const speed = distKm / (timeSec / 3600);
      if (speed > SPEED_LIMIT_KMH && distKm > 0.5) continue;
    } else {
      if (distKm > 0.5) continue; // ?쒓컙??李⑥씠?녿뒗??500m?댁긽 ?硫??쒓굅
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

  // 異쒕컻 / ?꾩옱?꾩튂 留덉빱
  _startMarker = new naver.maps.Marker({
    position : latLngs[0],
    map      : _map,
    icon     : makeWaypointIcon('異쒕컻', '#16a34a'),
    zIndex   : 200,
  });

  _endMarker = new naver.maps.Marker({
    position : latLngs[latLngs.length - 1],
    map      : _map,
    icon     : makeWaypointIcon('?꾩옱', '#dc2626'),
    zIndex   : 201,
  });

  // ?섎떒 ?⑤꼸 ?믪씠瑜?媛먯븞???щ갚?쇰줈 fitBounds
  try {
    const bounds = _polyline.getBounds();
    _map.fitBounds(bounds, { top: 60, right: 20, bottom: 230, left: 20 });
  } catch (_) {
    _map.setCenter(latLngs[latLngs.length - 1]);
    _map.setZoom(13, true);
  }
}

// ??? ?섎떒 李⑤웾 紐⑸줉 ?뚮뜑留????????????????????????????????????????????
function renderTripList(trips) {
  const contracted = (State.profile.driverId || '').toUpperCase().startsWith('ELSS');
  const visible    = trips.filter(t => t.status !== 'completed' && (contracted || isMyTrip(t)));

  const countEl = document.getElementById('map-panel-count');
  if (countEl) countEl.textContent = visible.length > 0 ? `${visible.length}? ?댄뻾 以? : '?댄뻾 李⑤웾 ?놁쓬';

  const container = document.getElementById('map-trip-items');
  if (!container) return;

  if (!visible.length) {
    container.innerHTML = `
      <div class="map-state-empty">
        <span class="map-empty-icon">?슋</span>
        <span>?댄뻾 以묒씤 李⑤웾???놁뒿?덈떎.</span>
      </div>`;
    return;
  }

  container.innerHTML = visible.map(trip => `
    <div class="map-trip-item"
         onclick="App.showTripRouteOnMap(${JSON.stringify(trip).replace(/"/g, '&quot;')})">
      <div style="font-weight:800;">${trip.vehicle_number || '-'}</div>
      <div style="font-size:12px;color:#64748b;">
        ${trip.lastLocation?.address || '?꾩튂 ?뺣낫 ?놁쓬'}
      </div>
    </div>
  `).join('');
}

// ??? ?좏떥 ???????????????????????????????????????????????????????????
function isMyTrip(trip) {
  const myV = (State.profile.vehicleNo || '').replace(/\s/g, '').toUpperCase();
  const tV  = (trip.vehicle_number  || '').replace(/\s/g, '').toUpperCase();
  return tV && tV === myV;
}

// ??? ?몃? 怨듦컻 API ???????????????????????????????????????????????????

/**
 * 吏???붾㈃ ?닿린
 * 1) showScreen('map')
 * 2) Naver SDK lazy-load
 * 3) 吏??珥덇린?? * 4) 李⑤웾 ?곗씠???대쭅 ?쒖옉
 */
export async function openMap() {
  showScreen('map');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-btn-map')?.classList.add('active');

  // SDK 濡쒕뱶 (?대? 濡쒕뱶??寃쎌슦 利됱떆 resolve)
  try {
    await loadNaverSDK();
  } catch (e) {
    showToast('吏??濡쒕뱶 ?ㅽ뙣. ?ㅽ듃?뚰겕瑜??뺤씤?댁＜?몄슂.');
    remoteLog('[MAP] SDK 濡쒕뱶 ?ㅽ뙣: ' + (e?.message || e), 'MAP_SDK_ERR');
    return;
  }

  // DOM ?섏씤??蹂댁옣 ??珥덇린??(2-frame ?쒕젅??
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initNaverMap();
      refreshMapData();
    });
  });

  // 30珥??대쭅
  if (_mapPollTimer) clearInterval(_mapPollTimer);
  _mapPollTimer = setInterval(refreshMapData, 30000);

  remoteLog('[MAP] openMap ?꾨즺 (Dynamic SDK v3)', 'MAP_OPEN');
}

/** 吏???붾㈃ ?リ린 */
export async function closeMap() {
  if (_mapPollTimer) { clearInterval(_mapPollTimer); _mapPollTimer = null; }
  showScreen('main');
  // trip ???쒖꽦??諛??곗씠??濡쒕뱶
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-trip')?.classList.add('active');
  document.getElementById('tab-btn-trip')?.classList.add('active');
  try {
    const { loadCurrentTrip } = await import('./trip.js?v=4919');
    await loadCurrentTrip();
  } catch (e) { console.warn('[MAP] closeMap load error', e); }
}

/** 李⑤웾 ?꾩튂 ?곗씠??媛깆떊 */
export async function refreshMapData() {
  try {
    const res  = await smartFetch(BASE_URL + '/api/vehicle-tracking/trips?mode=active');
    const data = await res.json();
    _trips = data.trips || data.data || [];
    updateVehicleMarkers(_trips);
    renderTripList(_trips);
  } catch (e) {
    console.warn('[MAP] refreshMapData ?ㅻ쪟', e);
  }
}

/** ???꾩튂濡??대룞 */
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
      showToast('???꾩튂濡??대룞?덉뒿?덈떎.');
    },
    () => showToast('?꾩튂 ?뺣낫瑜?媛?몄삱 ???놁뒿?덈떎.')
  );
}

/** ?뱀젙 李⑤웾??寃쎈줈瑜?吏???꾩뿉 ?쒖떆 */
export async function showTripRouteOnMap(trip) {
  remoteLog(`[MAP] 寃쎈줈 議고쉶: ${trip.vehicle_number}`, 'MAP_ROUTE');

  let path = [];
  try {
    const res  = await smartFetch(`${BASE_URL}/api/vehicle-tracking/trips/${trip.id}/locations`);
    const data = await res.json();
    path = data.locations || data.data || [];
  } catch (e) {
    console.error('[MAP] 寃쎈줈 fetch ?ㅽ뙣', e);
  }

  if (!path.length) { showToast('寃쎈줈 ?곗씠?곌? ?놁뒿?덈떎.'); return; }

  drawPolyline(path);

  // 寃쎈줈 ?⑤꼸 ?쒖떆
  const panel = document.getElementById('map-route-panel');
  if (panel) {
    const titleEl = document.getElementById('map-route-title');
    if (titleEl) titleEl.textContent = trip.vehicle_number || '寃쎈줈 ?뺣낫';

    const bodyEl = document.getElementById('map-route-body');
    if (bodyEl) {
      const s = path[0];
      const e = path[path.length - 1];
      bodyEl.innerHTML = `
        <div style="font-size:12px;color:#64748b;line-height:1.9;">
          <div>?윟 <b>異쒕컻</b>: ${s.address  || `${s.lat?.toFixed(5)}, ${s.lng?.toFixed(5)}`}</div>
          <div>?뵶 <b>?꾩옱</b>: ${e.address  || `${e.lat?.toFixed(5)}, ${e.lng?.toFixed(5)}`}</div>
          <div>?뱤 <b>湲곕줉</b>: ${path.length}媛??ъ씤??/div>
        </div>`;
    }

    panel.classList.remove('hidden');
  }
}

/** 寃쎈줈 ?쒖떆 珥덇린??*/
export function clearMapRoute() {
  if (_polyline)    { _polyline.setMap(null);    _polyline    = null; }
  if (_startMarker) { _startMarker.setMap(null); _startMarker = null; }
  if (_endMarker)   { _endMarker.setMap(null);   _endMarker   = null; }
  document.getElementById('map-route-panel')?.classList.add('hidden');
}

/** ?섎떒 李⑤웾 紐⑸줉 ?⑤꼸 ?좉? */
export function toggleMapPanel() {
  const panel = document.getElementById('map-bottom-panel');
  if (!panel) return;
  panel.classList.toggle('collapsed');
  // ???ㅻ쾭?덉씠 諛⑹떇?대?濡?吏??resize 遺덊븘??}

export const toggleMapTripList = toggleMapPanel;

