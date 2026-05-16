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
    assert.match(source, /def _shipping_sort_value\(value\):/);
    assert.match(
      source,
      /def query_asan_shipping_db\(rel_path, page=1, page_size=5000, search="", sort_key="", sort_dir="asc"\):/,
      `${rel} DB query should accept sort params`,
    );
    assert.match(source, /sort_idx = headers\.index\(sort_key\) if sort_key in headers else -1/);
    assert.match(
      source,
      /if sort_idx >= 0:[\s\S]*range\(0, 9999\)[\s\S]*sortable\.sort\([\s\S]*page_rows = ordered_rows\[start:end \+ 1\]/,
      `${rel} should sort the full DB result before slicing the requested page`,
    );
    assert.match(
      source,
      /sort_key = \(.*get\("sort_key"\)[\s\S]*query_asan_shipping_db\([\s\S]*sort_key=sort_key[\s\S]*sort_dir=sort_dir/,
      `${rel} route should pass sort params into DB query`,
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
  assert.match(source, /function getServerSortParams\(config\)/);
  assert.match(source, /params\.set\('sort_key', sortKey\)/);
  assert.match(source, /applyShippingData\(j\.data, \{ append \}\)/);
  assert.match(source, /const isServerSort = isServerPaged && sortConfig\.key && !isContainerLookupColumn\(sortConfig\.key\);/);
  assert.match(source, /if \(sortConfig\.key && !isServerSort\)/);
  assert.match(source, /sort_key: serverSortParams\.sortKey/);
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

test('선적관리 삭제 이력은 1년, 조회 이력은 6개월 보존 후 정리하고 현재 원장은 건드리지 않는다', () => {
  for (const rel of backendFiles) {
    const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');

    assert.match(source, /SHIPPING_ARCHIVE_RETENTION_DAYS = 365/);
    assert.match(source, /SHIPPING_LOOKUP_RETENTION_DAYS = 180/);

    const cleanupMatch = source.match(
      /def cleanup_asan_shipping_history_retention[\s\S]*?def maybe_cleanup_asan_shipping_history/,
    );
    assert.ok(cleanupMatch, `${rel} should define history retention cleanup`);
    const cleanupBlock = cleanupMatch[0];

    assert.match(
      cleanupBlock,
      /from_\("branch_shipping_row_archive"\)\.delete\(\)\.lt\("archived_at", archive_cutoff\)/,
      `${rel} should delete old archived shipping rows by archived_at`,
    );
    assert.match(
      cleanupBlock,
      /from_\("branch_shipping_container_lookups"\)\.delete\(\)\.lt\("looked_up_at", lookup_cutoff\)/,
      `${rel} should delete old container lookup rows by looked_up_at`,
    );
    assert.doesNotMatch(
      cleanupBlock,
      /from_\("branch_shipping_rows"\)\.delete\(\)/,
      `${rel} retention cleanup must not delete current shipping rows`,
    );

    const schedulerMatch = source.match(
      /def asan_shipping_sync_scheduler\(\):[\s\S]*?threading\.Thread/,
    );
    assert.ok(schedulerMatch, `${rel} should define the shipping sync scheduler`);
    assert.match(
      schedulerMatch[0],
      /now = datetime\.now\(KST\)[\s\S]*maybe_cleanup_asan_shipping_history\(now\)[\s\S]*sync_asan_shipping_python\(\)/,
      `${rel} should run retention cleanup from the scheduler before sync`,
    );
  }
});

test('선적관리 조회 이력은 최신값/보존기간 인덱스를 가진다', () => {
  const migration = fs.readFileSync(
    path.join(repoRoot, 'web/supabase_sql/20260516_asan_shipping_lookup_retention_indexes.sql'),
    'utf8',
  );

  assert.match(
    migration,
    /idx_branch_shipping_container_lookups_latest[\s\S]*branch_id, file_path, container_no, looked_up_at DESC/,
  );
  assert.match(migration, /idx_branch_shipping_container_lookups_retention[\s\S]*looked_up_at/);
  assert.match(migration, /idx_branch_shipping_row_archive_retention[\s\S]*archived_at/);
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

test('선적관리 액션바는 모바일 줄바꿈을 지원하고 이력 요소를 뒤쪽에 둔다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );

  assert.match(
    source,
    /return \[\.\.\.excelCols, \.\.\.lookupCols, \.\.\.extraLookupCols\]/,
    'lookup columns should be appended after Excel columns',
  );
  assert.match(
    source,
    /className=\{styles\.syncBtn\}[\s\S]*NAS 동기화[\s\S]*className=\{styles\.lookupBtn\}[\s\S]*컨테이너 조회/,
    'container lookup action should appear after NAS sync',
  );
  assert.match(css, /\.actionRow[\s\S]*flex-wrap: wrap;/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.actionGroup[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(source, /const orderedVisibleColumns = useMemo/);
  assert.match(source, /\{orderedVisibleColumns\.map\(col =>/);
  assert.match(source, /if \(headers\.length === 0 \|\| allHeaders\.length === 0\) return;/);
  assert.match(css, /\.hiddenLookupChip[\s\S]*background: #e8f7ee;/);
  assert.match(css, /\.hiddenChip[\s\S]*max-width: 78px;[\s\S]*text-overflow: ellipsis;/);
  assert.match(source, /function getHiddenChipLabel\(col\)/);
  assert.match(source, /title="숨긴 컬럼입니다\./);
  assert.doesNotMatch(source, />\s*\{hiddenCols\.size === 0 \? '이곳에 컬럼을 드래그하여 숨길 수 있습니다'/);
});

test('선적관리 검색은 입력 완료 시간을 기다린 뒤 DB 전체 조건 검색을 갱신한다', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/AsanShipping.js'),
    'utf8',
  );
  const css = fs.readFileSync(
    path.join(repoRoot, 'web/app/(main)/employees/branches/asan/shipping.module.css'),
    'utf8',
  );

  assert.match(source, /const SEARCH_DEBOUNCE_MS = 1000;/);
  assert.match(source, /const \[searchInput, setSearchInput\] = useState\(''\);/);
  assert.match(source, /if \(isComposingSearch\) return undefined;/);
  assert.match(source, /setTimeout\(\(\) => \{\s*setSearchTerm\(searchInput\);/);
  assert.match(source, /fetchData\(selectedPath, \{ page: 1, search: searchTerm, quiet, \.\.\.serverSortParams \}\)/);
  assert.match(source, /value=\{searchInput\}/);
  assert.match(source, /onKeyDown=\{e => \{[\s\S]*if \(e\.key === 'Enter'\) setSearchTerm\(searchInput\);/);
  assert.match(css, /\.searchStatus/);
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
