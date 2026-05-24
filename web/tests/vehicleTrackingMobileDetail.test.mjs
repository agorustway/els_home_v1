import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../app/(main)/employees/vehicle-tracking/page.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../app/(main)/employees/vehicle-tracking/tracking.module.css', import.meta.url), 'utf8');

test('모바일 운행 상세현황은 데스크탑 표 대신 카드형 위치/로그 목록을 제공한다', () => {
  assert.ok(pageSource.includes('mobileLocationTimeline'), 'mobile location timeline should be rendered');
  assert.ok(pageSource.includes('mobileLocationCard'), 'mobile location cards should be rendered');
  assert.ok(pageSource.includes('desktopLocationTable'), 'desktop location table should remain for wide screens');
  assert.ok(pageSource.includes('mobileLogList'), 'mobile log list should be rendered');
  assert.ok(cssSource.includes('.desktopLocationTable'), 'desktop location table should have a mobile hide rule');
  assert.ok(cssSource.includes('display: none !important;'), 'desktop tables should be hidden on mobile');
});

test('갤럭시24 폭에서는 상세 패널이 전체 화면 모바일 레이아웃을 사용한다', () => {
  assert.ok(cssSource.includes('height: 100dvh'), 'detail overlay should occupy full dynamic viewport height');
  assert.ok(cssSource.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'metrics should wrap to two columns');
  assert.ok(cssSource.includes('grid-template-columns: 1fr'), 'detail form should become single column');
  assert.ok(cssSource.includes('min-height: 42px'), 'mobile form controls should be finger-friendly');
});

test('기록/교육 검색 후 모바일 결과 목록을 바로 열 수 있게 한다', () => {
  assert.match(
    pageSource,
    /const handleSearch = async \(\) => \{\s*await fetchRecords\(\);\s*setIsMobileListOpen\(true\);/s,
    'search should open the mobile result sheet after fetching records',
  );
  assert.ok(pageSource.includes('운행 기록 목록'), 'records tab should expose a mobile result button');
  assert.ok(pageSource.includes('교육 이수 목록'), 'education tab should expose a mobile result button');
  assert.ok(pageSource.includes('data-label="최종위치"'), 'mobile record cards should have readable labels');
  assert.ok(pageSource.includes('data-label="교육"'), 'mobile education cards should have readable labels');
});

test('관제 통계 카드는 실행 버튼처럼 떠오르지 않는다', () => {
  const hoverBlock = cssSource.match(/\.statCard:hover\s*\{[^}]*\}/)?.[0] || '';
  assert.ok(hoverBlock.includes('transform: none;'), 'stat cards should not move on hover');
  assert.ok(!hoverBlock.includes('translateY'), 'stat hover should not use translateY');
  assert.ok(cssSource.includes('.summaryGrid'), 'records summary should use stable summary cards');
  assert.ok(cssSource.includes('min-width: 126px'), 'mobile date inputs should keep enough width for full dates');
});
