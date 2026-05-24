import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../app/(main)/employees/vehicle-tracking/page.js', import.meta.url), 'utf8');
const coreSource = readFileSync(new URL('../../docker/els-backend/app_core.py', import.meta.url), 'utf8');

test('차량관제 실시간 로그 버튼은 debug log view를 연다', () => {
  assert.ok(pageSource.includes("window.open('/api/debug/view'"), 'realtime log button should open debug log view');
});

test('els-core는 앱 디버그 로그 수신과 보기 라우트를 제공한다', () => {
  assert.ok(coreSource.includes('@app.route("/api/debug/log", methods=["POST"])'), 'core should receive app debug logs');
  assert.ok(coreSource.includes('@app.route("/api/debug/view", methods=["GET"])'), 'core should expose debug log view');
  assert.ok(coreSource.includes('debug_app.log'), 'core should use the debug app log file');
  assert.ok(coreSource.includes('send_file(log_file'), 'debug view should stream the log file');
});
