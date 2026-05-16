import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const backendFiles = [
  'docker/els-backend/app.py',
  'docker/els-backend/app_core.py',
];

test('아산 선적관리 백엔드는 조회 GET과 동기화 POST를 분리한다', () => {
  for (const rel of backendFiles) {
    const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');

    assert.match(
      source,
      /@app\.route\("\/api\/branches\/asan\/shipping", methods=\["GET", "POST"\]\)/,
      `${rel} route should accept GET and POST`,
    );
    assert.match(
      source,
      /if request\.method == "POST":[\s\S]*sync_asan_shipping_python\(force=bool\(force\), rel_path=rel_path\)/,
      `${rel} POST should run NAS to Supabase sync`,
    );
    assert.doesNotMatch(
      source,
      /source = request\.args\.get\("source", "auto"\)[\s\S]*sync_asan_shipping_python\(force=force, rel_path=rel_path\)/,
      `${rel} GET should not sync before reading DB`,
    );
    assert.match(
      source,
      /search_terms = _shipping_search_terms\(search\)[\s\S]*q = q\.or_\(filters\)/,
      `${rel} comma-separated search should use server-side OR filters`,
    );
  }
});

test('아산 선적관리 Next 라우트는 POST를 NAS 백엔드로 프록시한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/shipping/route.js'),
    'utf8',
  );

  assert.match(source, /export async function POST\(req\)/);
  assert.match(source, /proxyToBackend\(req, '\/api\/branches\/asan\/shipping'\)/);
});

test('아산 선적관리 화면은 DB 조회를 페이지 단위로 가져온다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );

  assert.match(source, /const SHIPPING_PAGE_SIZE = 500;/);
  assert.match(source, /page_size: String\(pageSize\)/);
  assert.match(source, /applyShippingData\(j\.data, \{ append \}\)/);
  assert.match(source, /data\.source === 'supabase'[\s\S]*더 보기/);
});
