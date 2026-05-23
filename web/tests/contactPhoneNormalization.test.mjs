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

const contactInputPages = [
  'web/app/(main)/employees/(intranet)/external-contacts/new/page.js',
  'web/app/(main)/employees/(intranet)/external-contacts/[id]/edit/EditClient.js',
  'web/app/(main)/employees/(intranet)/internal-contacts/new/page.js',
  'web/app/(main)/employees/(intranet)/internal-contacts/[id]/edit/EditClient.js',
  'web/app/(main)/employees/(intranet)/partner-contacts/new/page.js',
  'web/app/(main)/employees/(intranet)/partner-contacts/[id]/edit/EditClient.js',
  'web/app/(main)/employees/(intranet)/driver-contacts/new/page.js',
  'web/app/(main)/employees/(intranet)/driver-contacts/[id]/edit/EditClient.js',
  'web/app/(main)/employees/(intranet)/work-sites/new/page.js',
  'web/app/(main)/employees/(intranet)/work-sites/[id]/edit/EditClient.js',
];

const contactListPages = [
  'web/app/(main)/employees/(intranet)/external-contacts/page.js',
  'web/app/(main)/employees/(intranet)/internal-contacts/page.js',
  'web/app/(main)/employees/(intranet)/partner-contacts/page.js',
  'web/app/(main)/employees/(intranet)/driver-contacts/page.js',
  'web/app/(main)/employees/(intranet)/work-sites/page.js',
];

const contactApiFiles = [
  'web/app/api/external-contacts/route.js',
  'web/app/api/external-contacts/[id]/route.js',
  'web/app/api/internal-contacts/route.js',
  'web/app/api/internal-contacts/[id]/route.js',
  'web/app/api/partner-contacts/route.js',
  'web/app/api/partner-contacts/[id]/route.js',
  'web/app/api/driver-contacts/route.js',
  'web/app/api/driver-contacts/[id]/route.js',
  'web/app/api/driver-contacts/bulk/route.js',
  'web/app/api/driver-contacts/search/route.js',
  'web/app/api/work-sites/route.js',
  'web/app/api/work-sites/[id]/route.js',
  'web/app/api/contacts/excel/upload/route.js',
  'web/app/api/contacts/deduplicate/route.js',
];

test('연락처 입력 화면은 전화번호 값을 저장 기준으로 정규화한다', () => {
  for (const file of contactInputPages) {
    const source = read(file);
    assert.match(source, /normalizeKoreanPhoneNumberInput/, `${file} must normalize phone input`);
    assert.match(source, /inputMode="tel"/, `${file} phone input should use tel input mode`);
  }
});

test('연락처 목록 검색은 구분기호를 제거한 번호 기준으로 비교한다', () => {
  for (const file of contactListPages) {
    const source = read(file);
    assert.match(source, /normalizeKoreanPhoneNumberInput/, `${file} must normalize phone search`);
  }
});

test('연락처 저장 API와 엑셀 업로드는 전화번호를 정규화한 뒤 저장한다', () => {
  for (const file of contactApiFiles) {
    const source = read(file);
    assert.match(source, /normalizeKoreanPhoneNumberInput/, `${file} must normalize persisted phone values`);
  }
});

