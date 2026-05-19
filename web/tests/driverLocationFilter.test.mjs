import assert from 'node:assert/strict';
import test from 'node:test';
import { filterRouteLocations } from '../driver-src/modules/locationFilter.js';

const base = '2026-05-19T09:00:00.000Z';
const at = (seconds) => new Date(new Date(base).getTime() + seconds * 1000).toISOString();

test('드라이버 앱 경로 필터는 method=TRIP_END 마지막점을 보존한다', () => {
  const locations = [
    { lat: 37.272003, lng: 126.938207, speed: 4, accuracy: 10, method: 'android_bg', recorded_at: at(0) },
    { lat: 37.272002, lng: 126.938205, speed: 0, accuracy: 10, method: 'native_bg', recorded_at: at(600) },
    { lat: 37.271955, lng: 126.938121, speed: 8, accuracy: 15, method: 'TRIP_END', recorded_at: at(2400) },
  ];

  const filtered = filterRouteLocations(locations);
  assert.equal(filtered[filtered.length - 1].recorded_at, at(2400));
});
