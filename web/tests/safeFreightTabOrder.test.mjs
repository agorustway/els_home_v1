import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pageSource = fs.readFileSync(
  new URL('../app/(main)/employees/safe-freight/page.js', import.meta.url),
  'utf8',
);

test('안전운임 상단 탭은 구간조회가 이외구간보다 앞에 온다', () => {
  const primaryTabs = pageSource.indexOf("QUERY_TYPES.filter((t) => t.id !== 'other').map(renderQueryTypeTab)");
  const routeSearchTab = pageSource.indexOf('<span className={styles.tabLabel}>구간조회</span>');
  const otherTab = pageSource.indexOf("QUERY_TYPES.filter((t) => t.id === 'other').map(renderQueryTypeTab)");

  assert.ok(primaryTabs >= 0, '구간별/거리별 탭 렌더링 위치를 찾을 수 있어야 합니다.');
  assert.ok(routeSearchTab >= 0, '구간조회 탭 렌더링 위치를 찾을 수 있어야 합니다.');
  assert.ok(otherTab >= 0, '이외구간 탭 렌더링 위치를 찾을 수 있어야 합니다.');
  assert.ok(primaryTabs < routeSearchTab, '구간조회는 구간별/거리별 탭 뒤에 있어야 합니다.');
  assert.ok(routeSearchTab < otherTab, '구간조회는 이외구간보다 앞에 있어야 합니다.');
});
