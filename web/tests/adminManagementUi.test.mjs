import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

const adminPageFiles = [
  'web/app/(main)/admin/page.js',
  'web/app/(main)/admin/users/page.js',
  'web/app/(main)/admin/logs/page.js',
];

const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

test('관리 페이지 화면 코드는 이모지 장식을 쓰지 않는다', () => {
  for (const file of adminPageFiles) {
    assert.doesNotMatch(read(file), emojiPattern, `${file} contains emoji-style UI text`);
  }
});

test('활동 로그 관리는 인증된 Next 관리자 API를 사용하고 모바일 카드 뷰를 제공한다', () => {
  const page = read('web/app/(main)/admin/logs/page.js');

  assert.match(page, /\/api\/admin\/logs/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_ELS_BACKEND_URL/);
  assert.match(page, /placeholder="이름 또는 이메일 검색"/);
  assert.match(page, /q:\s*activeEmail/);
  assert.match(page, /log\.user_name/);
  assert.match(page, /className=\{styles\.identityName\}/);
  assert.match(page, /className=\{styles\.cardList\}/);
  assert.match(page, /className=\{styles\.logCard\}/);
});

test('활동 로그 API는 서비스 롤로 조회·삭제하고 정확 카운트 병목을 피한다', () => {
  const adminRoute = read('web/app/api/admin/logs/route.js');
  const collectRoute = read('web/app/api/logs/route.js');

  assert.match(adminRoute, /createAdminClient/);
  assert.match(adminRoute, /count:\s*'estimated'/);
  assert.doesNotMatch(adminRoute, /count:\s*'exact'/);
  assert.match(adminRoute, /attachUserNames/);
  assert.match(adminRoute, /resolveLogSearchIdentities/);
  assert.match(adminRoute, /searchParams\.get\('q'\)/);
  assert.match(adminRoute, /fetchIlikeRows/);
  assert.match(adminRoute, /user_name/);
  assert.match(adminRoute, /profiles/);
  assert.match(adminRoute, /user_roles/);
  assert.match(adminRoute, /deleteType === 'IDS'/);
  assert.match(collectRoute, /createAdminClient/);
  assert.match(collectRoute, /user_activity_logs/);
});
