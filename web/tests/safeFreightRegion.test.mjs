import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  matchSafeFreightDong,
  resolveSafeFreightRegion,
} from '../utils/safeFreightRegion.mjs';
import { findSafeFreightSectionOrigin } from '../utils/safeFreightRouteMatch.mjs';

const data = JSON.parse(fs.readFileSync(new URL('../public/data/safe-freight.json', import.meta.url), 'utf8'));

test('주소 검색 결과를 안전운임 행정동 키로 정규화한다', () => {
  const region = resolveSafeFreightRegion(data.regions, {
    siNm: '경기',
    sggNm: '화성시 만세구',
    emdNm: '청원리',
    hDong: '마도면',
    bDong: '청원리',
  });

  assert.deepEqual(region, {
    r1: '경기도',
    r2: '화성시',
    r3: '마도면',
  });
});

test('법정동보다 행정동을 우선해 구간운임 조회 키를 만든다', () => {
  const region = resolveSafeFreightRegion(data.regions, {
    siNm: '경기도',
    sggNm: '화성시',
    emdNm: '청원리',
    hDong: '마도면',
    bDong: '청원리',
  });
  const key = `[왕복] 인천국제여객|${region.r1}|${region.r2}|${region.r3}`;

  assert.equal(Boolean(data.fares[key]), true);
  assert.equal(data.fares[key][0].km, 42);
});

test('송도동처럼 고시에 세분 행정동만 있는 경우 첫 매칭 행정동으로 보정한다', () => {
  const dong = matchSafeFreightDong(data.regions, '인천시', '연수구', ['송도동']);

  assert.equal(dong, '송도1동');
});

test('인천항국제여객터미널은 인천항이 아니라 인천국제여객 기점으로 매칭한다', () => {
  const origin = findSafeFreightSectionOrigin(data.origins, {
    terminalKey: 'port_icn_intl',
    text: '인천항국제여객터미널',
  });
  const originFromText = findSafeFreightSectionOrigin(data.origins, {
    text: '인천항국제여객터미널',
  });

  assert.equal(origin?.id, '[왕복] 인천국제여객');
  assert.equal(originFromText?.id, '[왕복] 인천국제여객');
});
