function cleanDuplicateText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function duplicateKeyPart(value) {
  return cleanDuplicateText(value).toUpperCase();
}

function rowText(row = {}, snakeKey, camelKey = snakeKey) {
  return row[snakeKey] ?? row[camelKey];
}

const GLAPS_ROUTE_DUPLICATE_BYPASS_CODES = new Set(['AAAAAAAAA']);

export function isGlapsRouteDuplicateBypassCode(value) {
  return GLAPS_ROUTE_DUPLICATE_BYPASS_CODES.has(duplicateKeyPart(value));
}

export function buildGlapsRouteDuplicateGroupKey(row = {}) {
  const routeCode = duplicateKeyPart(rowText(row, 'route_code', 'routeCode'));
  if (isGlapsRouteDuplicateBypassCode(routeCode)) return '';
  return routeCode;
}

export function buildGlapsAliasDuplicateGroupKey(row = {}) {
  const aliasType = duplicateKeyPart(rowText(row, 'alias_type', 'aliasType'));
  const glapsCode = duplicateKeyPart(rowText(row, 'glaps_code', 'glapsCode'));
  if (!aliasType || !glapsCode) return '';
  return `${aliasType}|${glapsCode}`;
}

export function buildGlapsDuplicateInfo(activeTable, rows = []) {
  const byId = new Map();
  const keyById = new Map();
  const groups = [];
  const label = activeTable === 'routes'
    ? '운송경로코드 중복'
    : '매핑항목+최종코드(BP) 중복';
  const keyFn = activeTable === 'routes'
    ? buildGlapsRouteDuplicateGroupKey
    : (activeTable === 'aliases' ? buildGlapsAliasDuplicateGroupKey : null);

  if (!keyFn) return { byId, keyById, rowCount: 0, groupCount: 0 };

  const grouped = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });

  grouped.forEach((items, key) => {
    if (items.length < 2) return;
    groups.push({ label, count: items.length });
    items.forEach((item) => {
      if (!item.id) return;
      const labels = byId.get(item.id) || [];
      labels.push(`${label} ${items.length}건`);
      byId.set(item.id, labels);
      keyById.set(item.id, key);
    });
  });

  return {
    byId,
    keyById,
    rowCount: byId.size,
    groupCount: groups.length,
  };
}
