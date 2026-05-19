import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pageSource = fs.readFileSync(
  new URL('../app/(main)/employees/container-history/page.js', import.meta.url),
  'utf8',
);

const botBackendSource = fs.readFileSync(
  new URL('../../docker/els-backend/app_bot.py', import.meta.url),
  'utf8',
);

const daemonSource = fs.readFileSync(
  new URL('../../elsbot/els_web_runner_daemon.py', import.meta.url),
  'utf8',
);

const composeSource = fs.readFileSync(
  new URL('../../docker/docker-compose.yml', import.meta.url),
  'utf8',
);

test('컨테이너 이력조회 화면에 BOT 정지 버튼과 세션 정리 동작이 있다', () => {
  assert.match(pageSource, /const handleStopBot = useCallback/);
  assert.match(pageSource, /BOT 정지/);
  assert.match(pageSource, /api\/els\/stop-daemon/);
  assert.match(pageSource, /setLoginSuccess\(false\)/);
  assert.match(pageSource, /setWorkers\(\[\]\)/);
  assert.match(pageSource, /BOT 정지로 조회 중단됨/);
});

test('NAS bot은 컨테이너 시작과 API 진입 양쪽에서 저장 계정 워밍업을 트리거한다', () => {
  assert.match(composeSource, /ELS_AUTO_LOGIN_ON_START=true/);
  assert.match(daemonSource, /def startup_auto_login\(\):/);
  assert.match(daemonSource, /_trigger_saved_warmup\(source="container-start"/);
  assert.match(daemonSource, /@app\.route\('\/warmup'/);
  assert.match(botBackendSource, /@app\.route\("\/api\/els\/warmup"/);
  assert.match(botBackendSource, /_daemon_warmup\(wait=False, timeout=5\)/);
});
