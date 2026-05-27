function cleanDuplicateText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function duplicateKeyPart(value) {
  return cleanDuplicateText(value).toUpperCase();
}

function rowText(row = {}, snakeKey, camelKey = snakeKey) {
  return row[snakeKey] ?? row[camelKey];
}

export function buildGlapsRouteDuplicateGroupKey(row = {}) {
  return duplicateKeyPart(rowText(row, 'route_code', 'routeCode'));
}

export function buildGlapsAliasDuplicateGroupKey(row = {}) {
  return duplicateKeyPart(rowText(row, 'glaps_code', 'glapsCode'));
}

export function buildGlapsDuplicateInfo(activeTable, rows = []) {
  const byId = new Map();
  const keyById = new Map();
  const groups = [];
  const label = activeTable === 'routes'
    ? '운송경로코드 중복'
    : '최종코드(BP) 중복';
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
