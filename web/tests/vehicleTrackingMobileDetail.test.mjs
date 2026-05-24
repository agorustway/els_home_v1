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
  const mobileBlockStart = cssSource.lastIndexOf('@media (max-width: 768px)');
  const mobileBlock = cssSource.slice(mobileBlockStart);

  assert.ok(mobileBlock.includes('height: 100dvh'), 'detail overlay should occupy full dynamic viewport height');
  assert.ok(mobileBlock.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'metrics should wrap to two columns');
  assert.ok(mobileBlock.includes('grid-template-columns: 1fr'), 'detail form should become single column');
  assert.ok(mobileBlock.includes('min-height: 42px'), 'mobile form controls should be finger-friendly');
});
