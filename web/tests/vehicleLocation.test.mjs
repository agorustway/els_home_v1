import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterRouteLocations,
  sanitizeRecordedAt,
  shouldAcceptLocation,
  shouldStoreLocation,
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

test('실시간 추적 모드에서는 작지만 의미 있는 이동을 저장한다', () => {
  const decision = shouldStoreLocation({
    previous: { lat: 36.5000, lng: 127.0000, speed: 20, recorded_at: at(0) },
    current: { lat: 36.5002, lng: 127.0000, speed: 20, accuracy: 8, recorded_at: at(5) },
    fastMode: true,
  });

  assert.equal(decision.ok, true);
});
