import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bearingDeg,
  detectStaleReplayLocation,
  filterRouteLocations,
  isRouteMarker,
  isForwardProgressCandidate,
  normalizeStoredSpeedKmh,
  pathDistanceKm,
  pickLatestDisplayLocation,
  prepareLiveTrips,
  sampleRouteWaypoints,
  sanitizeRecordedAt,
  shouldAcceptLocation,
  shouldStoreLocation,
  validateMatchedRoute,
} from '../utils/vehicleLocation.mjs';

const base = '2026-05-16T00:00:00.000Z';
const at = (seconds) => new Date(new Date(base).getTime() + seconds * 1000).toISOString();

test('정차·저속 중 100m 이상 순간 점프는 거부한다', () => {
  const decision = shouldAcceptLocation({
    previous: { lat: 36.5000, lng: 127.0000, speed: 0, recorded_at: at(0) },
    current: { lat: 36.5010, lng: 127.0000, speed: 0, accuracy: 8, recorded_at: at(10) },
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /impossible_speed|low_speed_jump/);
});

test('튀었다가 원래 경로로 복귀하는 spike-return 포인트를 제거한다', () => {
  const locations = [
    { lat: 36.5000, lng: 127.0000, speed: 0, accuracy: 5, recorded_at: at(0) },
    { lat: 36.5030, lng: 127.0000, speed: 0, accuracy: 50, recorded_at: at(60) },
    { lat: 36.5001, lng: 127.0001, speed: 0, accuracy: 5, recorded_at: at(120) },
    { lat: 36.5004, lng: 127.0002, speed: 10, accuracy: 5, recorded_at: at(180) },
  ];

  const filtered = filterRouteLocations(locations);
  assert.equal(filtered.some((p) => p.lat === 36.5030), false);
  assert.equal(filtered[filtered.length - 1].lat, 36.5004);
});

test('안드로이드 백그라운드가 예전 정차 좌표를 재전송하면 stale replay로 거부한다', () => {
  const latest = { lat: 36.9179082, lng: 127.0336756, speed: 64, method: 'map_foreground', recorded_at: at(64) };
  const replayed = { lat: 36.9208965, lng: 127.0432539, speed: 0, method: 'android_bg', recorded_at: at(68) };
  const history = [
    latest,
    { lat: 36.9208965, lng: 127.0432539, speed: 0, method: 'android_bg', recorded_at: at(20) },
    { lat: 36.9199604, lng: 127.0414203, speed: 64, method: 'map_foreground', recorded_at: at(22) },
  ];

  const decision = detectStaleReplayLocation({ current: replayed, latest, history });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, 'stale_replay');
});

test('시간 간격이 충분한 정상 저속 이동은 유지한다', () => {
  const decision = shouldAcceptLocation({
    previous: { lat: 36.5000, lng: 127.0000, speed: 0, recorded_at: at(0) },
    current: { lat: 36.5005, lng: 127.0000, speed: 0, accuracy: 7, recorded_at: at(90) },
  });

  assert.equal(decision.ok, true);
});

test('클라이언트 수신시간은 정상 범위면 보존하고 과도한 미래값은 서버시간으로 보정한다', () => {
  const nowMs = new Date(base).getTime();
  assert.equal(sanitizeRecordedAt(at(30), nowMs), at(30));
  assert.equal(sanitizeRecordedAt(at(600), nowMs), base);
});

test('서버 저장 전 같은 자리 반복 포인트는 heartbeat 전까지 중복 저장하지 않는다', () => {
  const decision = shouldStoreLocation({
    previous: { lat: 36.5000, lng: 127.0000, speed: 0, recorded_at: at(0) },
    current: { lat: 36.5001, lng: 127.0000, speed: 0, accuracy: 8, recorded_at: at(20) },
  });

  assert.equal(decision.ok, false);
  assert.equal(decision.reason, 'duplicate_location');
});

test('서버 저장 속도는 좌표 진행보다 과한 센서 튐을 보정한다', () => {
  const previous = { lat: 36.921000, lng: 127.049000, speed: 55, recorded_at: at(0) };
  const current = { lat: 36.921850, lng: 127.049700, speed: 156.3, accuracy: 4, recorded_at: at(8) };
  const normalized = normalizeStoredSpeedKmh({ previous, current });

  assert.ok(normalized < 100);
  assert.ok(normalized > 40);
});

test('같은 자리에서 튄 센서 속도는 정차 속도로 저장한다', () => {
  const previous = { lat: 36.921000, lng: 127.049000, speed: 0, recorded_at: at(0) };
  const current = { lat: 36.921030, lng: 127.049020, speed: 88, accuracy: 4, recorded_at: at(10) };

  assert.equal(normalizeStoredSpeedKmh({ previous, current }), 0);
});

test('실시간 추적 모드에서는 작지만 의미 있는 이동을 저장한다', () => {
  const decision = shouldStoreLocation({
    previous: { lat: 36.5000, lng: 127.0000, speed: 20, recorded_at: at(0) },
    current: { lat: 36.5002, lng: 127.0000, speed: 20, accuracy: 8, recorded_at: at(5) },
    fastMode: true,
  });

  assert.equal(decision.ok, true);
});

test('불가능한 종료 마커는 경로 끝점에서 제외하고 마지막 정상점을 유지한다', () => {
  const locations = [
    { lat: 36.5000, lng: 127.0000, speed: 35, accuracy: 8, recorded_at: at(0) },
    { lat: 36.5010, lng: 127.0000, speed: 35, accuracy: 8, recorded_at: at(60) },
    { lat: 36.5400, lng: 127.0000, speed: 0, accuracy: 9999, marker_type: 'TRIP_END', recorded_at: at(90) },
  ];

  const filtered = filterRouteLocations(locations);
  assert.equal(filtered.length, 2);
  assert.equal(filtered[filtered.length - 1].lat, 36.5010);
});

test('정차 중 마지막 heartbeat 좌표는 관제 현재점으로 보존한다', () => {
  const locations = [
    { lat: 36.920000, lng: 127.040000, speed: 0, accuracy: 8, recorded_at: at(0) },
    { lat: 36.920500, lng: 127.040300, speed: 18, accuracy: 8, recorded_at: at(60) },
    { lat: 36.920520, lng: 127.040310, speed: 0, accuracy: 8, recorded_at: at(220) },
  ];

  const filtered = filterRouteLocations(locations);
  const latest = pickLatestDisplayLocation(locations);

  assert.equal(filtered[filtered.length - 1].recorded_at, at(220));
  assert.equal(latest.recorded_at, at(220));
});

test('marker_type 컬럼이 없어도 method=TRIP_END 끝점은 보존한다', () => {
  const locations = [
    { lat: 37.272003, lng: 126.938207, speed: 4, accuracy: 10, method: 'android_bg', recorded_at: at(0) },
    { lat: 37.272002, lng: 126.938205, speed: 0, accuracy: 10, method: 'native_bg', recorded_at: at(600) },
    { lat: 37.271955, lng: 126.938121, speed: 8, accuracy: 15, method: 'TRIP_END', recorded_at: at(2400) },
  ];

  const filtered = filterRouteLocations(locations);
  assert.equal(isRouteMarker(locations[2]), true);
  assert.equal(filtered[filtered.length - 1].recorded_at, at(2400));
});

test('경로 매칭용 waypoint는 단지·저속 구간의 촘촘한 지그재그를 줄이고 끝점은 보존한다', () => {
  const locations = [
    { lat: 36.920000, lng: 127.040000, speed: 8, accuracy: 5, recorded_at: at(0) },
    { lat: 36.920120, lng: 127.040090, speed: 8, accuracy: 5, recorded_at: at(4) },
    { lat: 36.920070, lng: 127.040030, speed: 7, accuracy: 5, recorded_at: at(8) },
    { lat: 36.920260, lng: 127.040170, speed: 9, accuracy: 5, recorded_at: at(12) },
    { lat: 36.920500, lng: 127.040350, speed: 15, accuracy: 5, recorded_at: at(20) },
    { lat: 36.921200, lng: 127.040900, speed: 30, accuracy: 5, recorded_at: at(45) },
  ];

  const { clean, waypoints } = sampleRouteWaypoints(locations, 12);
  assert.equal(clean[0].lat, locations[0].lat);
  assert.equal(clean[clean.length - 1].lat, locations[locations.length - 1].lat);
  assert.ok(clean.length < locations.length);
  assert.ok(waypoints.length <= clean.length - 2);
});

test('경로조회 결과가 원시 진행보다 과도하게 돌아가면 매칭 경로를 버린다', () => {
  const raw = [
    { lat: 36.9000, lng: 127.0300, speed: 45, accuracy: 8, recorded_at: at(0) },
    { lat: 36.9030, lng: 127.0304, speed: 45, accuracy: 8, recorded_at: at(30) },
    { lat: 36.9060, lng: 127.0308, speed: 45, accuracy: 8, recorded_at: at(60) },
  ];
  const matchedLoop = [
    { lat: 36.9000, lng: 127.0300 },
    { lat: 36.9030, lng: 127.0304 },
    { lat: 36.9030, lng: 127.0360 },
    { lat: 36.8990, lng: 127.0360 },
    { lat: 36.8990, lng: 127.0304 },
    { lat: 36.9030, lng: 127.0304 },
    { lat: 36.9060, lng: 127.0308 },
  ];

  const decision = validateMatchedRoute(raw, matchedLoop, {
    summaryDistanceM: pathDistanceKm(matchedLoop) * 1000,
  });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /matched_route/);
});

test('완료 마커는 남기되 같은 차량이 재운행하면 진행 중 운행을 우선한다', () => {
  const trips = prepareLiveTrips([
    {
      id: 'old-completed',
      vehicle_number: '12가0140',
      status: 'completed',
      completed_at: at(300),
      lastLocation: { recorded_at: at(300) },
    },
    {
      id: 'new-driving',
      vehicle_number: '12가0140',
      status: 'driving',
      started_at: at(240),
      lastLocation: { recorded_at: at(240) },
    },
  ]);

  assert.equal(trips.length, 1);
  assert.equal(trips[0].id, 'new-driving');
});

test('터널 이후 기존 진행 방향과 맞는 후보는 전진으로 인정한다', () => {
  const previous = { lat: 36.5000, lng: 127.0000, speed: 60, heading: 0, recorded_at: at(0) };
  const current = { lat: 36.5100, lng: 127.0000, speed: 55, accuracy: 18, recorded_at: at(70) };
  const decision = isForwardProgressCandidate({ previous, current });

  assert.equal(decision.ok, true);
  assert.equal(Math.round(bearingDeg(previous.lat, previous.lng, current.lat, current.lng)), 0);
});

test('터널 이후 진행 방향 반대편 고정밀 점프는 후보로 잡지 않는다', () => {
  const previous = { lat: 36.5000, lng: 127.0000, speed: 60, heading: 0, recorded_at: at(0) };
  const current = { lat: 36.4960, lng: 127.0000, speed: 50, accuracy: 20, recorded_at: at(40) };
  const decision = isForwardProgressCandidate({ previous, current });

  assert.equal(decision.ok, false);
  assert.match(decision.reason, /heading/);
});
