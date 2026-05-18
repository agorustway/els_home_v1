const KOREA_BOUNDS = {
    minLat: 33,
    maxLat: 39.5,
    minLng: 124,
    maxLng: 132,
};

const HARD_TRUCK_SPEED_LIMIT_KMH = 145;
const LOW_SPEED_KMH = 15;
const STATIONARY_SPEED_KMH = 4;
const LOW_SPEED_JUMP_KM = 0.08;
const STATIONARY_JUMP_KM = 0.06;

export function toTripTime(trip) {
    const raw = trip?.lastLocation?.recorded_at
        || trip?.lastLocation?.timestamp
        || trip?.updated_at
        || trip?.completed_at
        || trip?.started_at;
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
}

export function sortTripsForLiveView(trips = []) {
    const rank = { driving: 0, paused: 1, completed: 2 };
    return [...trips].sort((a, b) => {
        const ra = rank[a?.status] ?? 9;
        const rb = rank[b?.status] ?? 9;
        if (ra !== rb) return ra - rb;
        return toTripTime(b) - toTripTime(a);
    });
}

export function keepLatestTripPerVehicle(trips = []) {
    const latest = new Map();
    const rank = { driving: 0, paused: 1, completed: 2 };
    for (const trip of trips) {
        const key = String(trip?.vehicle_number || trip?.vehicle_id || trip?.id || '').replace(/\s/g, '').toUpperCase();
        if (!key) continue;
        const prev = latest.get(key);
        const prevRank = rank[prev?.status] ?? 9;
        const nextRank = rank[trip?.status] ?? 9;
        if (!prev || nextRank < prevRank || (nextRank === prevRank && toTripTime(trip) > toTripTime(prev))) {
            latest.set(key, trip);
        }
    }
    return trips.filter((trip) => {
        const key = String(trip?.vehicle_number || trip?.vehicle_id || trip?.id || '').replace(/\s/g, '').toUpperCase();
        return !key || latest.get(key)?.id === trip.id;
    });
}

export function prepareLiveTrips(trips = []) {
    return sortTripsForLiveView(keepLatestTripPerVehicle(trips));
}

export function haversineKm(lat1, lng1, lat2, lng2) {
    const p = Math.PI / 180;
    const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2
        + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lng2 - lng1) * p)) / 2;
    return 12742 * Math.asin(Math.sqrt(a));
}

export function bearingDeg(lat1, lng1, lat2, lng2) {
    const p = Math.PI / 180;
    const y = Math.sin((lng2 - lng1) * p) * Math.cos(lat2 * p);
    const x = Math.cos(lat1 * p) * Math.sin(lat2 * p)
        - Math.sin(lat1 * p) * Math.cos(lat2 * p) * Math.cos((lng2 - lng1) * p);
    const deg = Math.atan2(y, x) / p;
    return (deg + 360) % 360;
}

export function angleDiffDeg(left, right) {
    const a = Number(left);
    const b = Number(right);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const diff = Math.abs(((a - b + 540) % 360) - 180);
    return Number.isFinite(diff) ? diff : null;
}

export function normalizeSpeedKmh(speed) {
    const n = Number(speed);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

export function displaySpeedKmh(speed) {
    const n = Number(speed);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (n > 160) return 0;
    return Math.round(n);
}

export function isCoordinateInKorea(lat, lng) {
    return lat >= KOREA_BOUNDS.minLat && lat <= KOREA_BOUNDS.maxLat
        && lng >= KOREA_BOUNDS.minLng && lng <= KOREA_BOUNDS.maxLng;
}

export function getPointTime(point) {
    const raw = point?.recorded_at || point?.timestamp || point?.created_at;
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
}

export function sanitizeRecordedAt(value, nowMs = Date.now()) {
    const parsed = value ? new Date(value).getTime() : nowMs;
    if (!Number.isFinite(parsed)) return new Date(nowMs).toISOString();

    // 클라이언트 시간이 크게 어긋나면 서버 시간을 사용한다.
    const maxFutureMs = 2 * 60 * 1000;
    const maxPastMs = 7 * 24 * 60 * 60 * 1000;
    if (parsed > nowMs + maxFutureMs || parsed < nowMs - maxPastMs) {
        return new Date(nowMs).toISOString();
    }
    return new Date(parsed).toISOString();
}

function adaptiveSpeedLimit(sensorSpeed) {
    if (sensorSpeed <= STATIONARY_SPEED_KMH) return 60;
    if (sensorSpeed < LOW_SPEED_KMH) return 90;
    return Math.min(HARD_TRUCK_SPEED_LIMIT_KMH, Math.max(105, sensorSpeed + 45));
}

function pointHeading(point) {
    const value = point?.heading ?? point?.bearing ?? point?.course;
    const heading = Number(value);
    return Number.isFinite(heading) ? ((heading % 360) + 360) % 360 : null;
}

export function isForwardProgressCandidate({ previous, current, previousHeading = null }) {
    if (!previous || !current) return { ok: true, reason: 'no_compare' };
    const prevLat = Number(previous.lat);
    const prevLng = Number(previous.lng);
    const currLat = Number(current.lat);
    const currLng = Number(current.lng);
    if (![prevLat, prevLng, currLat, currLng].every(Number.isFinite)) return { ok: true, reason: 'no_compare' };

    const distKm = haversineKm(prevLat, prevLng, currLat, currLng);
    if (distKm < 0.05) return { ok: true, reason: 'short_move', distKm };

    const heading = Number.isFinite(Number(previousHeading)) ? Number(previousHeading) : pointHeading(previous);
    if (heading == null) return { ok: true, reason: 'no_heading', distKm };

    const moveBearing = bearingDeg(prevLat, prevLng, currLat, currLng);
    const diff = angleDiffDeg(heading, moveBearing);
    const speed = normalizeSpeedKmh(current.speed || previous.speed);
    const accuracy = Number(current.accuracy || 0);

    // 저속 회전·유턴·상하차 주변은 방향 센서 오차가 커서 속도/거리 필터에 맡긴다.
    if (speed < LOW_SPEED_KMH && distKm < 0.25) return { ok: true, reason: 'low_speed_turn', distKm, diff };

    if (accuracy > 60 && diff != null && diff > 100 && distKm > 0.08) {
        return { ok: false, reason: 'heading_mismatch', distKm, diff };
    }
    if (diff != null && diff > 135 && distKm > 0.2) {
        return { ok: false, reason: 'heading_reverse', distKm, diff };
    }

    return { ok: true, reason: 'forward_progress', distKm, diff };
}

function isLowSpeedJump({ distKm, impliedSpeed, sensorSpeed, accuracy }) {
    if (sensorSpeed <= STATIONARY_SPEED_KMH && distKm > STATIONARY_JUMP_KM && impliedSpeed > 25) return true;
    if (sensorSpeed < LOW_SPEED_KMH && distKm > LOW_SPEED_JUMP_KM && impliedSpeed > 45) return true;
    if (accuracy > 60 && sensorSpeed < LOW_SPEED_KMH && distKm > LOW_SPEED_JUMP_KM) return true;
    return false;
}

export function shouldAcceptLocation({ current, previous, next = null, forced = false }) {
    const lat = Number(current?.lat);
    const lng = Number(current?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: 'invalid_coord' };
    if (!isCoordinateInKorea(lat, lng)) return { ok: false, reason: 'out_of_korea' };

    const accuracy = Number(current?.accuracy || 0);
    if (!forced && accuracy > 120) return { ok: false, reason: 'low_accuracy' };
    if (!previous) return { ok: true, reason: 'first' };

    const prevLat = Number(previous.lat);
    const prevLng = Number(previous.lng);
    const prevTime = getPointTime(previous);
    const currTime = getPointTime(current) || Date.now();
    const timeSec = Math.max(1, (currTime - prevTime) / 1000);
    const distKm = haversineKm(prevLat, prevLng, lat, lng);
    const impliedSpeed = distKm / (timeSec / 3600);
    const sensorSpeed = normalizeSpeedKmh(current?.speed);
    const speedLimit = adaptiveSpeedLimit(sensorSpeed);

    if (!forced && currTime + 1000 < prevTime) {
        return { ok: false, reason: 'out_of_order' };
    }

    if (!forced && distKm > 0.05 && impliedSpeed > speedLimit) {
        return { ok: false, reason: 'impossible_speed', impliedSpeed, speedLimit };
    }

    if (!forced && isLowSpeedJump({ distKm, impliedSpeed, sensorSpeed, accuracy })) {
        return { ok: false, reason: 'low_speed_jump', impliedSpeed };
    }

    if (!forced && next) {
        const nextDist = haversineKm(lat, lng, Number(next.lat), Number(next.lng));
        const bridgeDist = haversineKm(prevLat, prevLng, Number(next.lat), Number(next.lng));
        const lowSpeedSpike = sensorSpeed < LOW_SPEED_KMH && distKm > LOW_SPEED_JUMP_KM && nextDist > LOW_SPEED_JUMP_KM && bridgeDist < Math.max(0.06, distKm * 0.45);
        const highSpeedSpike = distKm > 0.7 && nextDist > 0.7 && bridgeDist < Math.max(0.3, Math.min(distKm, nextDist) * 0.55);
        if (lowSpeedSpike || highSpeedSpike) return { ok: false, reason: 'spike_return' };
    }

    return { ok: true, reason: 'accepted' };
}

export function shouldStoreLocation({ current, previous, forced = false, fastMode = false }) {
    if (forced || !previous) return { ok: true, reason: forced ? 'forced' : 'first' };

    const lat = Number(current?.lat);
    const lng = Number(current?.lng);
    const prevLat = Number(previous?.lat);
    const prevLng = Number(previous?.lng);
    if (![lat, lng, prevLat, prevLng].every(Number.isFinite)) return { ok: true, reason: 'no_compare' };

    const distKm = haversineKm(prevLat, prevLng, lat, lng);
    const currTime = getPointTime(current) || Date.now();
    const prevTime = getPointTime(previous) || currTime;
    const elapsedMs = Math.max(0, currTime - prevTime);
    const speed = normalizeSpeedKmh(current?.speed);

    let minMoveKm;
    if (fastMode) minMoveKm = speed < LOW_SPEED_KMH ? 0.025 : 0.015;
    else if (speed <= STATIONARY_SPEED_KMH) minMoveKm = 0.06;
    else if (speed < 45) minMoveKm = 0.05;
    else minMoveKm = 0.08;

    const heartbeatMs = fastMode ? 20 * 1000 : (speed <= STATIONARY_SPEED_KMH ? 90 * 1000 : 45 * 1000);

    if (distKm < minMoveKm && elapsedMs < heartbeatMs) {
        return { ok: false, reason: 'duplicate_location', distKm, minMoveKm, elapsedMs };
    }

    return { ok: true, reason: distKm >= minMoveKm ? 'moved' : 'heartbeat', distKm };
}

export function filterRouteLocations(locations = []) {
    let ordered = locations
        .filter(Boolean)
        .map((l) => ({ ...l, lat: Number(l.lat), lng: Number(l.lng), speed: Number(l.speed || 0) }))
        .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng))
        .sort((a, b) => getPointTime(a) - getPointTime(b));

    ordered = trimEndpointOutliers(ordered);

    const filtered = [];
    for (let i = 0; i < ordered.length; i += 1) {
        const current = ordered[i];
        const previous = filtered[filtered.length - 1];
        const next = ordered[i + 1] || null;
        const decision = shouldAcceptLocation({ current, previous, next });
        if (!decision.ok) continue;

        if (previous) {
            const distKm = haversineKm(previous.lat, previous.lng, current.lat, current.lng);
            const speedKmh = normalizeSpeedKmh(current.speed || previous.speed);
            const minMoveKm = speedKmh < 10 ? 0.02 : speedKmh < 40 ? 0.035 : 0.06;
            if (distKm < minMoveKm && !current.marker_type) continue;
        }

        filtered.push(current);
    }
    return filtered;
}

export function trimEndpointOutliers(points = []) {
    let list = points.filter((p) => isCoordinateInKorea(Number(p.lat), Number(p.lng)));
    if (list.length < 3) return list;

    const hasMarker = (point) => Boolean(point?.marker_type);
    const hasHardBadAccuracy = (point) => Number(point?.accuracy || 0) > 120;

    const shouldDropFirst = () => {
        if (list.length < 3) return false;
        const [a, b, c] = list;
        const ab = haversineKm(a.lat, a.lng, b.lat, b.lng);
        const bc = haversineKm(b.lat, b.lng, c.lat, c.lng);
        const timeSec = Math.max(1, (getPointTime(b) - getPointTime(a)) / 1000);
        const implied = ab / (timeSec / 3600);
        const outlier = (ab > 0.5 && implied > 120) || (ab > 1.5 && bc < 0.35) || (hasHardBadAccuracy(a) && ab > 0.08);
        // 명시적 시작 마커는 정상 범위라면 보존하되, 캐시/저품질 GPS로 생긴 불가능한 시작점은 제거한다.
        if (hasMarker(a) && !outlier) return false;
        return outlier;
    };

    const shouldDropLast = () => {
        if (list.length < 3) return false;
        const a = list[list.length - 3];
        const b = list[list.length - 2];
        const c = list[list.length - 1];
        const ab = haversineKm(a.lat, a.lng, b.lat, b.lng);
        const bc = haversineKm(b.lat, b.lng, c.lat, c.lng);
        const timeSec = Math.max(1, (getPointTime(c) - getPointTime(b)) / 1000);
        const implied = bc / (timeSec / 3600);
        const outlier = (bc > 0.5 && implied > 120) || (bc > 1.5 && ab < 0.35) || (hasHardBadAccuracy(c) && bc > 0.08);
        // 종료 마커는 지도에 남기되, 터널/지하에서 튄 끝점은 마지막 정상점으로 수렴시킨다.
        if (hasMarker(c) && !outlier) return false;
        return outlier;
    };

    while (shouldDropFirst()) list = list.slice(1);
    while (shouldDropLast()) list = list.slice(0, -1);
    return list;
}

export function sampleRouteWaypoints(locations = [], maxWaypoints = 12) {
    const clean = filterRouteLocations(locations);
    if (clean.length <= 2) return { clean, waypoints: [] };
    const middle = clean.slice(1, -1);
    if (middle.length <= maxWaypoints) return { clean, waypoints: middle };
    const step = (middle.length - 1) / Math.max(1, maxWaypoints - 1);
    const waypoints = [];
    for (let i = 0; i < maxWaypoints; i += 1) {
        waypoints.push(middle[Math.round(i * step)]);
    }
    return { clean, waypoints };
}
