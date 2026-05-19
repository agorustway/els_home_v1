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
const STALE_REPLAY_RADIUS_KM = 0.008;
const ROUTE_MARKER_METHODS = new Set(['TRIP_START', 'TRIP_END', 'TRIP_PAUSE', 'TRIP_RESUME', 'GPS_TURN', 'NATIVE_FORCED']);

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

export function isRouteMarker(point) {
    const marker = String(point?.marker_type || point?.method || point?.source || '').toUpperCase();
    return ROUTE_MARKER_METHODS.has(marker);
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

export function detectStaleReplayLocation({ current, latest = null, history = [] }) {
    if (!current || !latest) return { ok: true, reason: 'no_compare' };

    const sourceText = String(current.source || current.method || '').toLowerCase();
    const isNativeBackground = sourceText.includes('android_bg') || sourceText.includes('native_bg') || sourceText.includes('background');
    if (!isNativeBackground) return { ok: true, reason: 'source_not_replay_prone' };

    const speed = normalizeSpeedKmh(current.speed);
    if (speed > STATIONARY_SPEED_KMH) return { ok: true, reason: 'moving_source' };

    const lat = Number(current.lat);
    const lng = Number(current.lng);
    const latestLat = Number(latest.lat);
    const latestLng = Number(latest.lng);
    if (![lat, lng, latestLat, latestLng].every(Number.isFinite)) return { ok: true, reason: 'invalid_compare' };

    const currentTime = getPointTime(current) || Date.now();
    const latestTime = getPointTime(latest) || currentTime;
    const latestDist = haversineKm(latestLat, latestLng, lat, lng);
    const latestSec = Math.max(1, (currentTime - latestTime) / 1000);
    const latestImpliedSpeed = latestDist / (latestSec / 3600);

    if (latestDist < 0.12 || latestImpliedSpeed < 80) {
        return { ok: true, reason: 'plausible_return' };
    }

    for (const previous of history || []) {
        if (!previous || previous === latest) continue;
        const prevTime = getPointTime(previous);
        if (!prevTime || currentTime - prevTime < 15_000) continue;
        const prevLat = Number(previous.lat);
        const prevLng = Number(previous.lng);
        if (![prevLat, prevLng].every(Number.isFinite)) continue;
        const replayDist = haversineKm(prevLat, prevLng, lat, lng);
        if (replayDist <= STALE_REPLAY_RADIUS_KM) {
            return {
                ok: false,
                reason: 'stale_replay',
                latestDist,
                latestImpliedSpeed,
                replayDist,
            };
        }
    }

    return { ok: true, reason: 'no_replay_match' };
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
            if (distKm < minMoveKm && !isRouteMarker(current)) continue;
        }

        filtered.push(current);
    }

    const terminal = ordered[ordered.length - 1];
    const last = filtered[filtered.length - 1];
    if (terminal && last && terminal !== last && getPointTime(terminal) > getPointTime(last)) {
        const forcedTerminal = isRouteMarker(terminal);
        const decision = shouldAcceptLocation({ current: terminal, previous: last, forced: forcedTerminal });
        if (decision.ok) {
            const distKm = haversineKm(last.lat, last.lng, terminal.lat, terminal.lng);
            const elapsedMs = Math.max(0, getPointTime(terminal) - getPointTime(last));
            const closeStableTail = distKm <= 0.035 || elapsedMs >= 45 * 1000;
            if (forcedTerminal || closeStableTail) filtered.push(terminal);
        }
    }

    return filtered;
}

export function pickLatestDisplayLocation(locations = []) {
    const ordered = locations
        .filter(Boolean)
        .map((l) => ({ ...l, lat: Number(l.lat), lng: Number(l.lng), speed: Number(l.speed || 0) }))
        .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng))
        .sort((a, b) => getPointTime(a) - getPointTime(b));

    if (!ordered.length) return null;
    const clean = filterRouteLocations(ordered);
    return clean[clean.length - 1] || trimEndpointOutliers(ordered).at(-1) || ordered[ordered.length - 1] || null;
}

export function simplifyRouteLocations(locations = []) {
    const points = locations
        .filter(Boolean)
        .map((l) => ({ ...l, lat: Number(l.lat), lng: Number(l.lng), speed: Number(l.speed || 0) }))
        .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng))
        .sort((a, b) => getPointTime(a) - getPointTime(b));

    if (points.length <= 3) return points;

    const simplified = [points[0]];
    for (let i = 1; i < points.length - 1; i += 1) {
        const current = points[i];
        const previous = simplified[simplified.length - 1];
        const next = points[i + 1];

        if (isRouteMarker(current)) {
            simplified.push(current);
            continue;
        }

        const prevDist = haversineKm(previous.lat, previous.lng, current.lat, current.lng);
        const nextDist = haversineKm(current.lat, current.lng, next.lat, next.lng);
        const bridgeDist = haversineKm(previous.lat, previous.lng, next.lat, next.lng);
        const speed = normalizeSpeedKmh(current.speed || previous.speed || next.speed);
        const minKeepKm = speed < LOW_SPEED_KMH ? 0.035 : (speed < 45 ? 0.05 : 0.07);

        if (prevDist < minKeepKm && nextDist < minKeepKm * 1.4) continue;

        const jitterPocket = prevDist < 0.09
            && nextDist < 0.09
            && bridgeDist < Math.max(0.025, (prevDist + nextDist) * 0.65);
        if (jitterPocket && speed < 45) continue;

        const incoming = bearingDeg(previous.lat, previous.lng, current.lat, current.lng);
        const outgoing = bearingDeg(current.lat, current.lng, next.lat, next.lng);
        const turn = angleDiffDeg(incoming, outgoing);
        if (turn != null && turn > 35 && (prevDist > 0.035 || nextDist > 0.035)) {
            simplified.push(current);
            continue;
        }

        if (prevDist >= minKeepKm) simplified.push(current);
    }

    const last = points[points.length - 1];
    const prev = simplified[simplified.length - 1];
    if (!prev || haversineKm(prev.lat, prev.lng, last.lat, last.lng) > 0.01 || isRouteMarker(last)) {
        simplified.push(last);
    }

    return simplified.length >= 2 ? simplified : points;
}

export function pathDistanceKm(points = []) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const current = points[i];
        const prevLat = Number(prev?.lat);
        const prevLng = Number(prev?.lng);
        const currLat = Number(current?.lat);
        const currLng = Number(current?.lng);
        if ([prevLat, prevLng, currLat, currLng].every(Number.isFinite)) {
            total += haversineKm(prevLat, prevLng, currLat, currLng);
        }
    }
    return total;
}

function pointToSegmentDistanceKm(point, a, b) {
    const px = Number(point?.lng);
    const py = Number(point?.lat);
    const ax = Number(a?.lng);
    const ay = Number(a?.lat);
    const bx = Number(b?.lng);
    const by = Number(b?.lat);
    if (![px, py, ax, ay, bx, by].every(Number.isFinite)) return Infinity;

    const vx = bx - ax;
    const vy = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const lenSq = vx * vx + vy * vy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq)) : 0;
    const proj = { lat: ay + t * vy, lng: ax + t * vx };
    return haversineKm(py, px, proj.lat, proj.lng);
}

function distanceToPolylineKm(point, line = []) {
    if (!line.length) return Infinity;
    if (line.length === 1) return haversineKm(Number(point.lat), Number(point.lng), Number(line[0].lat), Number(line[0].lng));
    let best = Infinity;
    for (let i = 1; i < line.length; i += 1) {
        best = Math.min(best, pointToSegmentDistanceKm(point, line[i - 1], line[i]));
    }
    return best;
}

function hasLoopExcursion(points = []) {
    if (points.length < 8) return false;
    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) {
        cumulative[i] = cumulative[i - 1] + haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    }

    for (let i = 0; i < points.length - 6; i += 1) {
        for (let j = i + 5; j < points.length; j += 1) {
            const loopKm = cumulative[j] - cumulative[i];
            if (loopKm < 0.45) continue;
            const closingKm = haversineKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
            if (closingKm < Math.max(0.035, loopKm * 0.08)) return true;
        }
    }
    return false;
}

export function validateMatchedRoute(rawPoints = [], matchedPath = [], options = {}) {
    const raw = simplifyRouteLocations(filterRouteLocations(rawPoints));
    const matched = (matchedPath || [])
        .filter(Boolean)
        .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    if (raw.length < 2 || matched.length < 2) return { ok: true, reason: 'not_enough_points' };

    const rawDistanceKm = pathDistanceKm(raw);
    const matchedDistanceKm = Number.isFinite(Number(options.summaryDistanceM))
        ? Number(options.summaryDistanceM) / 1000
        : pathDistanceKm(matched);
    const directDistanceKm = haversineKm(raw[0].lat, raw[0].lng, raw[raw.length - 1].lat, raw[raw.length - 1].lng);

    if (rawDistanceKm >= 0.35
        && matchedDistanceKm - rawDistanceKm > 0.7
        && matchedDistanceKm > rawDistanceKm * 1.75) {
        return { ok: false, reason: 'matched_route_too_long', rawDistanceKm, matchedDistanceKm };
    }

    if (directDistanceKm >= 0.2
        && matchedDistanceKm > directDistanceKm * 4
        && matchedDistanceKm - rawDistanceKm > 0.5) {
        return { ok: false, reason: 'matched_route_excessive_detour', rawDistanceKm, matchedDistanceKm, directDistanceKm };
    }

    const offTrace = matched.reduce((count, point) => count + (distanceToPolylineKm(point, raw) > 0.35 ? 1 : 0), 0);
    if (matched.length >= 10 && offTrace / matched.length > 0.2) {
        return { ok: false, reason: 'matched_route_off_trace', rawDistanceKm, matchedDistanceKm, offTrace };
    }

    if (hasLoopExcursion(matched) && !hasLoopExcursion(raw)) {
        return { ok: false, reason: 'matched_route_loop', rawDistanceKm, matchedDistanceKm };
    }

    return { ok: true, reason: 'matched_route_plausible', rawDistanceKm, matchedDistanceKm };
}

export function trimEndpointOutliers(points = []) {
    let list = points.filter((p) => isCoordinateInKorea(Number(p.lat), Number(p.lng)));
    if (list.length < 3) return list;

    const hasMarker = (point) => isRouteMarker(point);
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
    const routePoints = simplifyRouteLocations(clean);
    if (routePoints.length <= 2) return { clean: routePoints, waypoints: [] };
    const middle = routePoints.slice(1, -1);
    if (middle.length <= maxWaypoints) return { clean: routePoints, waypoints: middle };
    const step = (middle.length - 1) / Math.max(1, maxWaypoints - 1);
    const waypoints = [];
    for (let i = 0; i < maxWaypoints; i += 1) {
        waypoints.push(middle[Math.round(i * step)]);
    }
    return { clean: routePoints, waypoints };
}
