export function haversineKm(lat1, lng1, lat2, lng2) {
  const p = Math.PI / 180;
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2
    + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lng2 - lng1) * p)) / 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

const HARD_TRUCK_SPEED_LIMIT_KMH = 145;
const LOW_SPEED_KMH = 15;
const STATIONARY_SPEED_KMH = 4;
const LOW_SPEED_JUMP_KM = 0.08;
const STATIONARY_JUMP_KM = 0.06;

function pointTime(point) {
  const raw = point?.recorded_at || point?.timestamp || point?.created_at;
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function speedKmh(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function adaptiveSpeedLimit(sensorSpeed) {
  if (sensorSpeed <= STATIONARY_SPEED_KMH) return 60;
  if (sensorSpeed < LOW_SPEED_KMH) return 90;
  return Math.min(HARD_TRUCK_SPEED_LIMIT_KMH, Math.max(105, sensorSpeed + 45));
}

function isLowSpeedJump({ distKm, implied, sensor, accuracy }) {
  if (sensor <= STATIONARY_SPEED_KMH && distKm > STATIONARY_JUMP_KM && implied > 25) return true;
  if (sensor < LOW_SPEED_KMH && distKm > LOW_SPEED_JUMP_KM && implied > 45) return true;
  if (accuracy > 60 && sensor < LOW_SPEED_KMH && distKm > LOW_SPEED_JUMP_KM) return true;
  return false;
}

function trimEndpointOutliers(points = []) {
  let list = points.filter(l => Number.isFinite(l.lat) && Number.isFinite(l.lng) && l.lat >= 33 && l.lat <= 39.5 && l.lng >= 124 && l.lng <= 132);
  if (list.length < 3) return list;

  const dropFirst = () => {
    if (list.length < 3) return false;
    const [a, b, c] = list;
    // TRIP_START 등 명시적 마커는 절대 드롭 안함
    if (a.marker_type) return false;
    const ab = haversineKm(a.lat, a.lng, b.lat, b.lng);
    const bc = haversineKm(b.lat, b.lng, c.lat, c.lng);
    const timeSec = Math.max(1, (pointTime(b) - pointTime(a)) / 1000);
    const implied = ab / (timeSec / 3600);
    return (ab > 0.5 && implied > 120) || (ab > 1.5 && bc < 0.35);
  };

  const dropLast = () => {
    if (list.length < 3) return false;
    const a = list[list.length - 3];
    const b = list[list.length - 2];
    const c = list[list.length - 1];
    // TRIP_END 등 명시적 마커는 절대 드롭 안함
    if (c.marker_type) return false;
    const ab = haversineKm(a.lat, a.lng, b.lat, b.lng);
    const bc = haversineKm(b.lat, b.lng, c.lat, c.lng);
    const timeSec = Math.max(1, (pointTime(c) - pointTime(b)) / 1000);
    const implied = bc / (timeSec / 3600);
    return (bc > 0.5 && implied > 120) || (bc > 1.5 && ab < 0.35);
  };

  while (dropFirst()) list = list.slice(1);
  while (dropLast()) list = list.slice(0, -1);
  return list;
}

export function filterRouteLocations(locations = []) {
  let ordered = locations
    .filter(Boolean)
    .map(l => ({ ...l, lat: Number(l.lat), lng: Number(l.lng), speed: Number(l.speed || 0) }))
    .filter(l => Number.isFinite(l.lat) && Number.isFinite(l.lng) && l.lat >= 33 && l.lat <= 39.5 && l.lng >= 124 && l.lng <= 132)
    .sort((a, b) => pointTime(a) - pointTime(b));

  ordered = trimEndpointOutliers(ordered);

  const filtered = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const curr = ordered[i];
    const prev = filtered[filtered.length - 1];
    if (!prev) {
      filtered.push(curr);
      continue;
    }

    const distKm = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
    const timeSec = Math.max(1, (pointTime(curr) - pointTime(prev)) / 1000);
    const implied = distKm / (timeSec / 3600);
    const sensor = speedKmh(curr.speed);
    if (pointTime(curr) + 1000 < pointTime(prev)) continue;
    if (distKm > 0.05 && implied > adaptiveSpeedLimit(sensor)) continue;
    if (isLowSpeedJump({ distKm, implied, sensor, accuracy: Number(curr.accuracy || 0) })) continue;

    const next = ordered[i + 1];
    if (next) {
      const nextDist = haversineKm(curr.lat, curr.lng, Number(next.lat), Number(next.lng));
      const bridgeDist = haversineKm(prev.lat, prev.lng, Number(next.lat), Number(next.lng));
      if (sensor < LOW_SPEED_KMH && distKm > LOW_SPEED_JUMP_KM && nextDist > LOW_SPEED_JUMP_KM && bridgeDist < Math.max(0.06, distKm * 0.45)) continue;
      if (distKm > 0.7 && nextDist > 0.7 && bridgeDist < Math.max(0.3, Math.min(distKm, nextDist) * 0.55)) continue;
    }

    const minMoveKm = sensor < 10 ? 0.02 : sensor < 40 ? 0.035 : 0.06;
    if (distKm < minMoveKm && !curr.marker_type) continue;
    filtered.push(curr);
  }
  return filtered;
}

export function displaySpeedKmh(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n) || n < 0 || n > 160) return 0;
  return Math.round(n);
}

function tripTime(trip) {
  const raw = trip?.lastLocation?.recorded_at || trip?.lastLocation?.timestamp || trip?.updated_at || trip?.completed_at || trip?.started_at;
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export function prepareLiveTrips(trips = []) {
  const latest = new Map();
  const rank = { driving: 0, paused: 1, completed: 2 };
  for (const trip of trips) {
    const key = String(trip?.vehicle_number || trip?.vehicle_id || trip?.id || '').replace(/\s/g, '').toUpperCase();
    if (!key) continue;
    const prev = latest.get(key);
    if (!prev) {
      latest.set(key, trip);
      continue;
    }
    const prevRank = rank[prev?.status] ?? 9;
    const nextRank = rank[trip?.status] ?? 9;
    if (nextRank < prevRank || (nextRank === prevRank && tripTime(trip) > tripTime(prev))) {
      latest.set(key, trip);
    }
  }

  return trips
    .filter(trip => {
      const key = String(trip?.vehicle_number || trip?.vehicle_id || trip?.id || '').replace(/\s/g, '').toUpperCase();
      return !key || latest.get(key)?.id === trip.id;
    })
    .sort((a, b) => (rank[a?.status] ?? 9) - (rank[b?.status] ?? 9) || tripTime(b) - tripTime(a));
}
