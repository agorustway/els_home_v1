import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('차량 운행기록 Excel export 라우트는 빌드 중 정적 렌더 대상에서 제외한다', () => {
  const source = readFileSync(
    new URL('../app/api/vehicle-tracking/export/excel/route.js', import.meta.url),
    'utf8',
  );

  assert.match(source, /export const dynamic = ['"]force-dynamic['"]/);
});
