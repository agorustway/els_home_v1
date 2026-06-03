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

test('NAS files API hides temporary and recycle/system files before admin bypass', () => {
  const source = read('web/app/api/nas/files/route.js');

  assert.match(source, /normalizedName\.startsWith\('~'\)/);
  assert.match(source, /lowerName === '#recycle'/);
  assert.match(source, /lowerName === '@eadir'/);
  assert.match(source, /lowerName === '\$recycle\.bin'/);
  assert.match(source, /lowerName\.includes\('recycle bin'\)/);
  assert.ok(
    source.indexOf('if (isHiddenOrTemp(file.name)) return false;') <
      source.indexOf('if (isAdmin) return true;'),
    'hidden/temp filtering must happen before admin sees normal entries',
  );
});

test('NAS files API keeps branch and security folder visibility role-scoped', () => {
  const source = read('web/app/api/nas/files/route.js');

  assert.match(source, /if \(!rootFolder\) return \{ canRead: true, canWrite: false \};/);
  assert.match(source, /if \(!userBranchName\) return \{ canRead: false, canWrite: false \};/);
  assert.match(source, /rootFolder\.endsWith\('_보안'\)/);
  assert.match(source, /securityBranch !== userBranchName \|\| !userCanSecurity/);
  assert.match(source, /return \{ canRead: true, canWrite: false \};/);
  assert.match(source, /new Set\(\[userBranchName, '자료실', '공지사항_첨부'\]\)/);
  assert.match(source, /if \(!readableRoots\.has\(rootFolder\)\) return \{ canRead: false, canWrite: false \};/);
});

test('NAS files API blocks hidden/temp file direct access and writes', () => {
  const source = read('web/app/api/nas/files/route.js');

  assert.match(source, /isHiddenOrTemp\(getBaseName\(path\)\)/);
  assert.match(source, /return NextResponse\.json\(\{ error: 'File not found' \}, \{ status: 404 \}\)/);
  assert.match(source, /isHiddenOrTemp\(getBaseName\(targetPath\)\)/);
  assert.match(source, /임시\/시스템 파일명은 자료실에서 사용할 수 없습니다\./);
  assert.match(source, /file\?\.name && isHiddenOrTemp\(file\.name\)/);
  assert.match(source, /임시\/시스템 파일은 업로드할 수 없습니다\./);
  assert.match(source, /isHiddenOrTemp\(getBaseName\(to\)\)/);
  assert.match(source, /json\.from && isHiddenOrTemp\(getBaseName\(json\.from\)\)/);
  assert.match(source, /isHiddenOrTemp\(getBaseName\(from\)\)/);
  assert.match(source, /const sourcePerms = getPermissions\(userRole, userCanSecurity, from\);/);
  assert.match(source, /Forbidden: 원본 항목을 읽을 권한이 없습니다\./);
});
