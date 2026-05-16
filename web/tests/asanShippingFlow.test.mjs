import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildContainerLookupMapFromRows,
  extractUniqueContainerNos,
} from '../utils/containerHistoryResults.mjs';

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

  assert.match(source, /const SHIPPING_PAGE_SIZE = 100;/);
  assert.match(source, /page_size: String\(pageSize\)/);
  assert.match(source, /applyShippingData\(j\.data, \{ append \}\)/);
  assert.doesNotMatch(source, /import \* as XLSX from 'xlsx'/);
  assert.match(source, /await import\('xlsx'\)/);
  assert.match(source, /data\.source === 'supabase'[\s\S]*더 보기/);
});

test('아산 페이지는 마지막 메인 탭을 기억해 불필요한 기본 fetch를 줄인다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/page.js'),
    'utf8',
  );

  assert.match(source, /const ASAN_MAIN_TAB_KEY = 'asan_main_tab';/);
  assert.match(source, /localStorage\.getItem\(ASAN_MAIN_TAB_KEY\)/);
  assert.match(source, /localStorage\.setItem\(ASAN_MAIN_TAB_KEY, tab\)/);
  assert.match(source, /const \[activeMainTab, setActiveMainTab\] = useState\(null\);/);
});

test('선적관리 엑셀 삭제 행은 현재 조회에서 지우기 전 archive 테이블에 남긴다', () => {
  for (const rel of backendFiles) {
    const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');

    assert.match(source, /def _archive_removed_asan_shipping_rows\(normalized_path, new_payload, removed_file_modified_at\):/);
    assert.match(source, /branch_shipping_row_archive/);
    assert.match(
      source,
      /archived_count = _archive_removed_asan_shipping_rows\(normalized_path, payload, file_modified_at\)[\s\S]*branch_shipping_rows"\)\.delete\(\)/,
      `${rel} should archive removed rows before replacing current shipping rows`,
    );
    assert.match(source, /"archive_reason": "deleted_from_excel"/);
  }
});

test('선적관리 화면은 필터된 컨테이너 조회 결과를 초록색 이력 컬럼으로 붙인다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );
  const route = fs.readFileSync(
    path.join(repoRoot, 'web/app/api/branches/asan/shipping/container-results/route.js'),
    'utf8',
  );

  assert.match(source, /extractUniqueContainerNos\(data\?\.headers \|\| \[\], processedData\)/);
  assert.match(source, /fetch\('\/api\/els\/run'/);
  assert.match(source, /fetch\('\/api\/branches\/asan\/shipping\/container-results'/);
  assert.match(source, /CONTAINER_LOOKUP_DISPLAY_COLUMNS/);
  assert.match(source, /styles\.lookupHeader/);
  assert.match(source, /styles\.lookupCell/);
  assert.match(source, /DB수정/);
  assert.match(css, /\.table th\.lookupHeader[\s\S]*background: #15803d;/);
  assert.match(route, /branch_shipping_container_lookups/);
});

test('컨테이너 조회 유틸은 필터 결과의 컨테이너와 No 1 메인 행을 고른다', () => {
  const headers = ['DATE', 'CONTAINER', 'CUSTOMER'];
  const rows = [
    ['2026-04-30', 'TCLU8300912', 'A'],
    ['2026-04-30', 'bad', 'B'],
    ['2026-04-30', 'TRHU5191927', 'C'],
    ['2026-04-30', 'TCLU8300912', 'D'],
  ];

  assert.deepEqual(extractUniqueContainerNos(headers, rows), ['TCLU8300912', 'TRHU5191927']);

  const lookupMap = buildContainerLookupMapFromRows([
    ['TCLU8300912', '2', '수출', '반출', 'OLD', '2026-05-01 08:00'],
    ['TCLU8300912', '1', '수출', '반입', 'HJNC', '2026-05-01 09:00'],
  ], ['TCLU8300912'], '2026-05-16T00:00:00.000Z');

  assert.equal(lookupMap.TCLU8300912.mainRow[1], '1');
  assert.equal(lookupMap.TCLU8300912.mainRow[4], 'HJNC');
  assert.equal(lookupMap.TCLU8300912.lookedUpAt, '2026-05-16T00:00:00.000Z');
});
