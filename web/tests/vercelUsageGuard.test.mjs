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

test('middleware는 route handler API 대부분을 matcher에서 제외한다', () => {
  const source = read('web/middleware.js');

  assert.match(source, /'\/api\/vehicle-tracking\/:path\*'/);
  assert.match(source, /path === '\/api' \|\| path\.startsWith\('\/api\/'\)/);
  assert.match(source, /return supabaseResponse;/);
  assert.match(source, /\(\?!api\/\|_next\/static\|_next\/image/);
});

test('middleware는 공개 페이지에서 불필요한 Supabase auth 조회를 생략한다', () => {
  const source = read('web/middleware.js');

  assert.match(source, /const needsAuthContext = isProtectedPath \|\| path === '\/' \|\| path === '\/login'/);
  assert.match(source, /if \(!needsAuthContext\) \{\s*return supabaseResponse;\s*\}/);
  assert.ok(
    source.indexOf('if (!needsAuthContext)') < source.indexOf('const supabase = createServerClient'),
    'auth client should be created only after public-page fast path',
  );
});

test('아산 주요 자동 갱신은 백그라운드 탭에서 Vercel API를 호출하지 않는다', () => {
  const summary = read('web/app/(main)/employees/branches/asan/AsanSummaryPerformance.js');
  const dashboard = read('web/app/(main)/employees/branches/asan/page.js');

  assert.match(summary, /typeof document !== 'undefined' && document\.hidden/);
  assert.match(dashboard, /typeof document !== 'undefined' && document\.hidden/);
  assert.ok(
    dashboard.match(/document\.hidden/g)?.length >= 2,
    'sync gate and silent refresh should both guard hidden tabs',
  );
});
