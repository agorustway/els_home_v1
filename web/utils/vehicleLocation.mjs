const KOREA_BOUNDS = {
    minLat: 33,
    maxLat: 39.5,
    minLng: 124,
    maxLng: 132,
};

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
    for (const trip of trips) {
        const key = String(trip?.vehicle_number || trip?.vehicle_id || trip?.id || '').replace(/\s/g, '').toUpperCase();
        if (!key) continue;
        const prev = latest.get(key);
        if (!prev || toTripTime(trip) > toTripTime(prev)) latest.set(key, trip);
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

export function normalizeSpeedKmh(speed) {
    const n = Number(speed);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n > 80 ? n : n * 3.6;
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

export function shouldAcceptLocation({ current, previous, next = null, forced = false }) {
    const lat = Number(current?.lat);
    const lng = Number(current?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: 'invalid_coord' };
    if (!isCoordinateInKorea(lat, lng)) return { ok: false, reason: 'out_of_korea' };

    const accuracy = Number(current?.accuracy || 0);
    if (!forced && accuracy > 300) return { ok: false, reason: 'low_accuracy' };
    if (!previous) return { ok: true, reason: 'first' };

    const prevLat = Number(previous.lat);
    const prevLng = Number(previous.lng);
    const prevTime = getPointTime(previous);
    const currTime = getPointTime(current) || Date.now();
    const timeSec = Math.max(1, (currTime - prevTime) / 1000);
    const distKm = haversineKm(prevLat, prevLng, lat, lng);
    const impliedSpeed = distKm / (timeSec / 3600);
    const sensorSpeed = normalizeSpeedKmh(current?.speed);
    const speedLimit = Math.max(135, sensorSpeed + 45);

    if (!forced && distKm > 0.5 && impliedSpeed > speedLimit) {
        return { ok: false, reason: 'impossible_speed', impliedSpeed };
    }

    if (!forced && next) {
        const nextDist = haversineKm(lat, lng, Number(next.lat), Number(next.lng));
        const bridgeDist = haversineKm(prevLat, prevLng, Number(next.lat), Number(next.lng));
        const lowSpeedSpike = sensorSpeed < 15 && distKm > 0.08 && nextDist > 0.08 && bridgeDist < Math.max(0.06, distKm * 0.45);
        const highSpeedSpike = distKm > 0.7 && nextDist > 0.7 && bridgeDist < Math.max(0.3, Math.min(distKm, nextDist) * 0.55);
        if (lowSpeedSpike || highSpeedSpike) return { ok: false, reason: 'spike_return' };
    }

    return { ok: true, reason: 'accepted' };
}

export function filterRouteLocations(locations = []) {
    const ordered = locations
        .filter(Boolean)
        .map((l) => ({ ...l, lat: Number(l.lat), lng: Number(l.lng), speed: Number(l.speed || 0) }))
        .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lng))
        .sort((a, b) => getPointTime(a) - getPointTime(b));

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
            const minMoveKm = speedKmh < 10 ? 0.015 : speedKmh < 40 ? 0.025 : 0.05;
            if (distKm < minMoveKm && !current.marker_type) continue;
        }

        filtered.push(current);
    }
    return filtered;
}

