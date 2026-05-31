import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

test('헤더 인트라넷 메뉴는 사이드바 메뉴 상수에서 생성한다', () => {
    const headerSource = readFileSync(resolve(root, 'components/Header.js'), 'utf8');
    assert.match(headerSource, /buildHeaderEmployeeMenuChildren/);
    assert.doesNotMatch(headerSource, /href:\s*['"]\/admin\/data-operations['"]/);
});

test('관리 메뉴에는 데이터 운영 관리가 사이드바와 헤더 공통으로 등록된다', () => {
    const menuSource = readFileSync(resolve(root, 'constants/intranetMenu.js'), 'utf8');
    assert.match(menuSource, /label:\s*['"]데이터 운영 관리['"]/);
    assert.match(menuSource, /path:\s*['"]\/admin\/data-operations['"]/);
    assert.match(menuSource, /export function buildHeaderEmployeeMenuChildren/);
});
