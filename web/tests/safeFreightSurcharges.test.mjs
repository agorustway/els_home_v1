import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applySafeFreightSurchargesToFare,
  calculateSafeFreightSurchargeInfo,
  makeRegionalBaseSurchargeItem,
} from '../utils/safeFreightSurcharges.mjs';

const data = JSON.parse(fs.readFileSync(new URL('../public/data/safe-freight.json', import.meta.url), 'utf8'));

const REGULATION = {
  maxPctCount: 3,
  firstFull: true,
  restHalf: true,
  excludedReason: '할증 항목이 3개를 초과하여 본 운송에는 적용되지 않습니다.',
};

test('인천/평택 기점 할증은 제22호 높은 순 3개 규칙에 포함하고 안전위탁운임 할증액을 안전운송운임에 더한다', () => {
  const base55 = data.distanceByPeriod['26.02월|가. 거리(km)별 운임(왕복)'].find((row) => row.km === 55);
  const surchargeInfo = calculateSafeFreightSurchargeInfo({
    regulation: REGULATION,
    items: [
      { id: 'hazard_100', label: '화약류 100%', pct: 100 },
      makeRegionalBaseSurchargeItem({ key: 'incheon', label: '인천', pct: 20 }),
      { id: 'night', label: '심야 20%', pct: 20 },
    ],
  });

  const applied = applySafeFreightSurchargesToFare(base55, {
    baseRow: base55,
    surchargeInfo,
  });

  assert.deepEqual(
    surchargeInfo.pctApplied.map((item) => [item.id, item.pct, item.effective]),
    [
      ['hazard_100', 100, 100],
      ['regional_incheon', 20, 50],
      ['night', 20, 50],
    ],
  );
  assert.equal(applied.f40위탁, 645200);
  assert.equal(applied.f40안전, 725200);
});

test('구간표에 인천기점 할증이 이미 포함되어도 추가 퍼센트 할증이 있으면 거리별 원운임을 기준으로 재산정한다', () => {
  const section = data.fares['[왕복] 인천국제여객|경기도|화성시|마도면'][0];
  const base42 = data.distanceByPeriod['26.02월|가. 거리(km)별 운임(왕복)'].find((row) => row.km === section.km);
  const surchargeInfo = calculateSafeFreightSurchargeInfo({
    regulation: REGULATION,
    items: [
      { id: 'tank', label: 'TANK 컨테이너 30%', pct: 30 },
      makeRegionalBaseSurchargeItem({ key: 'incheon', label: '인천', pct: 20 }),
    ],
  });

  const applied = applySafeFreightSurchargesToFare(section, {
    baseRow: base42,
    surchargeInfo,
  });

  assert.equal(section.f40안전, 333600);
  assert.equal(base42.f40안전, 283700);
  assert.equal(applied.f40위탁, 349600);
  assert.equal(applied.f40안전, 393800);
});

test('할증 항목은 지역 기점 할증을 포함해 최대 3개만 적용한다', () => {
  const info = calculateSafeFreightSurchargeInfo({
    regulation: REGULATION,
    items: [
      { id: 'hazard_200', label: '방사성물질 200%', pct: 200 },
      { id: 'hazard_100', label: '화약류 100%', pct: 100 },
      { id: 'heavy_80', label: '중량8톤 초과 80%', pct: 80 },
      makeRegionalBaseSurchargeItem({ key: 'pyeongtaek', label: '평택', pct: 18 }),
      { id: 'night', label: '심야 20%', pct: 20 },
    ],
  });

  assert.deepEqual(info.pctApplied.map((item) => item.id), ['hazard_200', 'hazard_100', 'heavy_80']);
  assert.deepEqual(info.pctExcluded.map((item) => item.id), ['night', 'regional_pyeongtaek']);
});
