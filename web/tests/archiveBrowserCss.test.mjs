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

test('자료실 NAS 헤더는 모바일에서 버튼이 잘리지 않도록 줄바꿈 레이아웃을 사용한다', () => {
  const component = read('web/app/(main)/employees/(intranet)/archive/ArchiveBrowser.js');
  const css = read('web/app/(main)/employees/(intranet)/archive/archive.module.css');

  assert.match(component, /className=\{styles\.titleRow\}/);
  assert.match(css, /\.titleRow\s*\{/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.headerBanner\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.headerControls\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.pathBadge\s*\{[\s\S]*text-overflow:\s*ellipsis/);
  assert.match(css, /\.emptyCell,\s*\n\.emptyGrid/);
});

test('자료실 NAS는 권한 fallback에서 로딩 상태를 남기지 않는다', () => {
  const component = read('web/app/(main)/employees/(intranet)/archive/ArchiveBrowser.js');
  const roleHook = read('web/hooks/useUserRole.js');

  assert.match(component, /if \(!role \|\| role === 'visitor'\) \{/);
  assert.match(component, /setLoading\(false\);[\s\S]*if \(role === 'visitor'\) setError/);
  assert.match(component, /표시할 자료가 없습니다\./);
  assert.match(roleHook, /debugModeActive && authUser\.email === 'debug_admin@elssolution\.com'/);
  assert.match(roleHook, /skipping user_roles lookup/);
});
