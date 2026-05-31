const FARE_KEYS = [
  'f40위탁',
  'f40운수자',
  'f40안전',
  'f20위탁',
  'f20운수자',
  'f20안전',
];

const CONSIGNMENT_KEY_BY_FARE = {
  f40위탁: 'f40위탁',
  f40운수자: 'f40위탁',
  f40안전: 'f40위탁',
  f20위탁: 'f20위탁',
  f20운수자: 'f20위탁',
  f20안전: 'f20위탁',
};

export function roundSafeFreight10(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / 10) * 10;
}

export function roundSafeFreightSurchargeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / 100) * 100;
}

export function makeRegionalBaseSurchargeItem(regionalBaseSurcharge) {
  const pct = Number(regionalBaseSurcharge?.pct) || 0;
  if (pct <= 0) return null;
  const label = `${regionalBaseSurcharge.label || '기점'}기점 할증 ${pct}%`;
  return {
    id: `regional_${regionalBaseSurcharge.key || regionalBaseSurcharge.label || 'base'}`,
    label,
    pct,
    regionalBase: true,
    source: '2026-04-01 추가 운영지침',
  };
}

export function calculateSafeFreightSurchargeInfo({
  items = [],
  fixedItems = [],
  regulation = {},
} = {}) {
  const maxPct = regulation.maxPctCount ?? 3;
  const sortedItems = items
    .filter((item) => item && !item.otherCost && !item.fixed && Number(item.pct) > 0)
    .map((item, index) => ({
      ...item,
      pct: Number(item.pct) || 0,
      __order: index,
    }))
    .sort((a, b) => (b.pct - a.pct) || (a.__order - b.__order));

  const pctItems = sortedItems.map((item) => {
    const { __order, ...clean } = item;
    return clean;
  });

  const pctApplied = sortedItems.slice(0, maxPct).map((item, index) => {
    const { __order, ...clean } = item;
    return {
      ...clean,
      effective: index === 0 && regulation.firstFull !== false
        ? 100
        : regulation.restHalf === false ? 100 : 50,
    };
  });

  const pctExcluded = sortedItems.slice(maxPct).map((item) => {
    const { __order, ...clean } = item;
    return {
      ...clean,
      reason: regulation.excludedReason || '할증 항목이 3개를 초과하여 본 운송에는 적용되지 않습니다(고시 제22조 나목).',
    };
  });

  const regularEffectivePct = pctApplied
    .filter((item) => !item.regionalBase)
    .reduce((sum, item) => sum + (item.pct * item.effective) / 100, 0);
  const regionalEffectivePct = pctApplied
    .filter((item) => item.regionalBase)
    .reduce((sum, item) => sum + (item.pct * item.effective) / 100, 0);

  const appliedLabels = [
    ...pctApplied.map((item) => item.effective === 100 ? item.label : `${item.label} (50% 적용)`),
    ...fixedItems.map((item) => item.label),
  ];

  return {
    pctItems,
    pctApplied,
    pctExcluded,
    fixedApplied: fixedItems,
    regularEffectivePct,
    regionalEffectivePct,
    appliedLabels,
    regulation,
  };
}

export function applySafeFreightSurchargesToFare(row, {
  baseRow = row,
  baseMult = 1,
  surchargeInfo = {},
} = {}) {
  if (!row) return row;

  const source = baseRow || row;
  const regularPct = Number(surchargeInfo.regularEffectivePct) || 0;
  const regionalPct = Number(surchargeInfo.regionalEffectivePct) || 0;
  const fixedApplied = Array.isArray(surchargeInfo.fixedApplied) ? surchargeInfo.fixedApplied : [];
  const fixedAdd = fixedApplied.reduce((sum, item) => sum + (Number(item?.fixed) || 0), 0);

  const baseValues = {};
  FARE_KEYS.forEach((key) => {
    baseValues[key] = (Number(source[key]) || 0) * baseMult;
  });

  const next = { ...row };
  FARE_KEYS.forEach((key) => {
    const base = baseValues[key];
    const regularAdd = regularPct > 0
      ? roundSafeFreightSurchargeAmount(base * regularPct / 100)
      : 0;
    const regionalBasisKey = CONSIGNMENT_KEY_BY_FARE[key];
    const regionalBasis = baseValues[regionalBasisKey] || 0;
    const regionalAdd = regionalPct > 0
      ? roundSafeFreightSurchargeAmount(regionalBasis * regionalPct / 100)
      : 0;

    next[key] = roundSafeFreight10(base + regularAdd + regionalAdd) + fixedAdd;
  });

  return next;
}
