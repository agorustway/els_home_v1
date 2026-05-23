export const DEFAULT_GLAPS_BRANCH_ID = 'asan';

export const GLAPS_ROUTE_TEMPLATE_HEADERS = Object.freeze([
  'ID',
  '운송경로코드',
  '운송경로명',
  '상차지',
  '경유지',
  '경유지(ELS)',
  '하차지(선적)',
  '매칭상태',
  '조정안내',
  '삭제(Y)',
]);

export const GLAPS_ALIAS_TEMPLATE_HEADERS = Object.freeze([
  'ID',
  '항목',
  '원본명',
  'ELS명',
  'GLAPS명',
  'GLAPS코드',
  '운송경로코드',
  '매칭상태',
  '조정안내',
  '삭제(Y)',
]);

export const GLAPS_REVIEW_STATUS_LABELS = Object.freeze({
  ready: '확정',
  needs_mapping: '조정필요',
  missing_route_code: '코드없음',
});

const ROUTE_HEADER_CANDIDATES = Object.freeze({
  routeCode: ['운송경로코드', '경로코드', 'ROUTE CODE', 'ROUTECODE'],
  routeName: ['운송경로명', '경로명', 'ROUTE NAME', 'ROUTENAME'],
  startLocationName: ['상차지', '상차지명', '출발지', '출발지명'],
  waypointName: ['경유지', '경유지명', '작업지', '작업지명'],
  waypointElsName: ['경유지(ELS)', 'ELS경유지', 'ELS작업지', '우리작업지'],
  destinationName: ['하차지', '하차지명', '도착지', '도착지명', '도착항', '선적'],
  reviewNote: ['비고', '메모', '조정안내'],
});

const ROUTE_TEMPLATE_ALIASES = Object.freeze({
  id: ['id', 'ID'],
  routeCode: ['route_code', '운송경로코드', '경로코드'],
  routeName: ['route_name', '운송경로명', '경로명'],
  startLocationName: ['start_location_name', '상차지'],
  waypointName: ['waypoint_name', '경유지', '작업지'],
  waypointElsName: ['waypoint_els_name', '경유지(ELS)'],
  destinationName: ['destination_name', '하차지', '선적'],
  reviewStatus: ['review_status', '매칭상태'],
  reviewNote: ['review_note', '조정안내', '비고'],
  deleteFlag: ['삭제(Y)', '삭제', 'delete'],
});

const ALIAS_TEMPLATE_ALIASES = Object.freeze({
  id: ['id', 'ID'],
  aliasType: ['alias_type', '항목', '구분'],
  sourceName: ['source_name', '원본명', '배차판명'],
  elsName: ['els_name', 'ELS명', 'ELS'],
  glapsName: ['glaps_name', 'GLAPS명', '마스터명'],
  glapsCode: ['glaps_code', 'GLAPS코드', '코드'],
  routeCode: ['route_code', '운송경로코드'],
  reviewStatus: ['review_status', '매칭상태'],
  reviewNote: ['review_note', '조정안내', '비고'],
  deleteFlag: ['삭제(Y)', '삭제', 'delete'],
});

const CODE_SHEET_ALIAS_TYPES = Object.freeze([
  ['컨테이너규격', 'container_type'],
  ['규격', 'container_type'],
  ['프로코드', 'port'],
  ['포트', 'port'],
  ['PORT', 'port'],
  ['라인', 'line'],
  ['선사', 'line'],
  ['운송사코드', 'carrier'],
  ['운송사', 'carrier'],
  ['컨사이니', 'consignee'],
  ['CONSIGNEE', 'consignee'],
]);

const GLAPS_CODE_ALIAS_TYPES = new Set([
  'start',
  'waypoint',
  'destination',
  'port',
  'line',
  'container_type',
  'carrier',
  'consignee',
  'generic',
]);

const GLAPS_ROUTE_LOCATION_CODE_ALIASES = Object.freeze([
  ['부산신항', ['KRBNP']],
  ['부산북항', ['KRBNX']],
  ['인천항', ['KRINC']],
  ['인천신항', ['KRINN']],
  ['인천항국제여객터미널', ['KRINF']],
  ['광양항', ['KRKAN']],
  ['평택항', ['KRPTK']],
  ['울산신항', ['KRUSN', 'KRUSN_NEW']],
  ['울산구항', ['KRUSN_OLD']],
  ['의왕ICD', ['KRUWN']],
  ['군산항', ['KRKUV']],
  ['온산항', ['KRONS']],
]);

export function cleanGlapsText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function normalizeGlapsKey(value) {
  return cleanGlapsText(value).replace(/[()\[\]{}_\-\s]/g, '').toUpperCase();
}

function routePartKey(value) {
  return cleanGlapsText(value).replace(/\s+/g, '').toUpperCase();
}

export function getGlapsRouteLocationCodeCandidates(value = '') {
  const cleaned = cleanGlapsText(value);
  const normalized = normalizeGlapsKey(cleaned);
  const candidates = [cleaned];
  GLAPS_ROUTE_LOCATION_CODE_ALIASES.forEach(([name, codes]) => {
    if (normalizeGlapsKey(name) === normalized) candidates.push(...codes);
  });
  return [...new Set(candidates.filter(Boolean))];
}

export function buildGlapsDispatchRouteFingerprints({
  startLocationName = '',
  waypointElsName = '',
  waypointName = '',
  destinationName = '',
} = {}) {
  const starts = getGlapsRouteLocationCodeCandidates(startLocationName);
  const destinations = getGlapsRouteLocationCodeCandidates(destinationName);
  const waypoint = waypointElsName || waypointName;
  return starts.flatMap(start => destinations.map(destination => buildGlapsRouteFingerprint({
    startLocationName: start,
    waypointElsName: waypoint,
    destinationName: destination,
  })));
}

function isElsHeader(value) {
  return normalizeGlapsKey(value).includes('ELS');
}

export function findGlapsHeaderIndex(headers = [], candidates = [], options = {}) {
  const normalizedHeaders = headers.map(normalizeGlapsKey);
  const normalizedCandidates = candidates.map(normalizeGlapsKey).filter(Boolean);
  const predicate = typeof options.predicate === 'function' ? options.predicate : () => true;

  for (const candidate of normalizedCandidates) {
    const idx = normalizedHeaders.findIndex((header, i) => header === candidate && predicate(headers[i], i));
    if (idx >= 0) return idx;
  }
  for (const candidate of normalizedCandidates) {
    const idx = normalizedHeaders.findIndex((header, i) => header && header.includes(candidate) && predicate(headers[i], i));
    if (idx >= 0) return idx;
  }
  return -1;
}

function findRouteHeaderRowIndex(rows = []) {
  const scanRows = rows.slice(0, 12);
  for (let idx = 0; idx < scanRows.length; idx += 1) {
    const row = scanRows[idx] || [];
    const hasCode = findGlapsHeaderIndex(row, ROUTE_HEADER_CANDIDATES.routeCode) >= 0;
    const hasName = findGlapsHeaderIndex(row, ROUTE_HEADER_CANDIDATES.routeName) >= 0;
    const hasWaypointEls = findGlapsHeaderIndex(row, ROUTE_HEADER_CANDIDATES.waypointElsName) >= 0;
    if ((hasCode && hasName) || (hasName && hasWaypointEls)) return idx;
  }
  return -1;
}

function getRowValue(row, idx) {
  return idx >= 0 ? cleanGlapsText(row[idx]) : '';
}

function isNonEmptyRow(row = []) {
  return row.some(cell => cleanGlapsText(cell));
}

function inferSheetAliasType(sheetName = '') {
  const normalizedSheetName = normalizeGlapsKey(sheetName);
  const found = CODE_SHEET_ALIAS_TYPES.find(([token]) => normalizedSheetName.includes(normalizeGlapsKey(token)));
  return found?.[1] || 'generic';
}

function findElsCodeIndexes(headers = []) {
  return headers
    .map((header, idx) => {
      const normalized = normalizeGlapsKey(header);
      if (!normalized.includes('ELS') || (!normalized.includes('코드') && !normalized.includes('CODE'))) return null;
      const orderMatch = normalized.match(/(?:ELS코드|ELSCODE|ELS)(\d+)/);
      return {
        idx,
        order: orderMatch ? Number(orderMatch[1]) : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.idx - b.idx)
    .map(item => item.idx);
}

function getRowValues(row, indexes = []) {
  return indexes.map(idx => getRowValue(row, idx)).filter(Boolean);
}

export function inferGlapsRouteParts(routeName = '') {
  const text = cleanGlapsText(routeName);
  if (!text) return { startLocationName: '', waypointName: '', destinationName: '' };
  const parts = text.split(' ').filter(Boolean);
  if (parts.length < 3) {
    return { startLocationName: '', waypointName: text, destinationName: '' };
  }
  return {
    startLocationName: parts[0],
    waypointName: parts.slice(1, -1).join(' '),
    destinationName: parts[parts.length - 1],
  };
}

function buildRawPayload(headers = [], row = []) {
  return headers.reduce((payload, header, idx) => {
    const key = cleanGlapsText(header) || `col_${idx + 1}`;
    payload[key] = cleanGlapsText(row[idx]);
    return payload;
  }, {});
}

export function buildGlapsRouteFingerprint({
  startLocationName = '',
  waypointElsName = '',
  waypointName = '',
  destinationName = '',
} = {}) {
  return [
    routePartKey(startLocationName),
    routePartKey(waypointElsName || waypointName),
    routePartKey(destinationName),
  ].join('|');
}

export function getGlapsRouteReviewStatus(route = {}) {
  if (!cleanGlapsText(route.routeCode)) return 'missing_route_code';
  if (!cleanGlapsText(route.startLocationName) || !cleanGlapsText(route.destinationName)) return 'needs_mapping';
  if (!cleanGlapsText(route.waypointElsName)) return 'needs_mapping';
  return 'ready';
}

function normalizeReviewStatus(value, fallback = 'needs_mapping') {
  const normalized = cleanGlapsText(value).toLowerCase();
  if (['ready', '확정', '정상'].includes(normalized)) return 'ready';
  if (['missing_route_code', '코드없음', '코드 없음'].includes(normalized)) return 'missing_route_code';
  if (['needs_mapping', '조정필요', '조정 필요', '확인필요', '확인 필요'].includes(normalized)) return 'needs_mapping';
  return fallback;
}

function buildRouteColumns(headers = []) {
  return {
    routeCode: findGlapsHeaderIndex(headers, ROUTE_HEADER_CANDIDATES.routeCode),
    routeName: findGlapsHeaderIndex(headers, ROUTE_HEADER_CANDIDATES.routeName),
    startLocationName: findGlapsHeaderIndex(headers, ROUTE_HEADER_CANDIDATES.startLocationName),
    waypointName: findGlapsHeaderIndex(headers, ROUTE_HEADER_CANDIDATES.waypointName, {
      predicate: (header) => !isElsHeader(header),
    }),
    waypointElsName: findGlapsHeaderIndex(headers, ROUTE_HEADER_CANDIDATES.waypointElsName),
    destinationName: findGlapsHeaderIndex(headers, ROUTE_HEADER_CANDIDATES.destinationName),
    reviewNote: findGlapsHeaderIndex(headers, ROUTE_HEADER_CANDIDATES.reviewNote),
  };
}

export function parseGlapsRouteSheet(sheet = {}) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const headerRowIndex = findRouteHeaderRowIndex(rows);
  if (headerRowIndex < 0) return [];

  const headers = rows[headerRowIndex].map(cleanGlapsText);
  const cols = buildRouteColumns(headers);
  const routes = [];

  rows.slice(headerRowIndex + 1).forEach((row, offset) => {
    const sourceRowNumber = headerRowIndex + offset + 2;
    const routeCode = getRowValue(row, cols.routeCode);
    const routeName = getRowValue(row, cols.routeName);
    if (!routeCode && !routeName) return;

    const inferred = inferGlapsRouteParts(routeName);
    const route = {
      routeCode,
      routeName,
      startLocationName: getRowValue(row, cols.startLocationName) || inferred.startLocationName,
      waypointName: getRowValue(row, cols.waypointName) || inferred.waypointName,
      waypointElsName: getRowValue(row, cols.waypointElsName),
      destinationName: getRowValue(row, cols.destinationName) || inferred.destinationName,
      reviewNote: getRowValue(row, cols.reviewNote),
      sourceSheet: cleanGlapsText(sheet.name || '운송경로'),
      sourceRowNumber,
      rawPayload: buildRawPayload(headers, row),
    };

    route.routeFingerprint = buildGlapsRouteFingerprint(route);
    route.reviewStatus = getGlapsRouteReviewStatus(route);
    routes.push(route);
  });

  return routes;
}

function findRouteCandidateSheet(sheets = []) {
  const routeNameSheet = sheets.find(sheet => cleanGlapsText(sheet.name).includes('운송경로'));
  if (routeNameSheet) return routeNameSheet;
  return sheets.find(sheet => findRouteHeaderRowIndex(sheet.rows || []) >= 0) || null;
}

function findGenericHeaderRowIndex(rows = []) {
  for (let idx = 0; idx < Math.min(rows.length, 10); idx += 1) {
    const row = rows[idx] || [];
    if (!isNonEmptyRow(row)) continue;
    const hasCodeHeader = row.some(cell => normalizeGlapsKey(cell).includes('코드') || normalizeGlapsKey(cell).includes('CODE'));
    if (hasCodeHeader) return idx;
  }
  return rows.findIndex(isNonEmptyRow);
}

function buildGenericRawPayload(headers = [], row = []) {
  return row.reduce((payload, cell, idx) => {
    const fallback = `col_${idx + 1}`;
    const key = cleanGlapsText(headers[idx]) || fallback;
    payload[key] = cleanGlapsText(cell);
    return payload;
  }, {});
}

export function buildGlapsMasterSheetRows(sheets = []) {
  return sheets.flatMap((sheet) => {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const headerRowIndex = findGenericHeaderRowIndex(rows);
    const headers = headerRowIndex >= 0 ? (rows[headerRowIndex] || []).map(cleanGlapsText) : [];
    return rows.map((row, idx) => ({
      sheetName: cleanGlapsText(sheet.name),
      rowNumber: idx + 1,
      headerRow: idx === headerRowIndex,
      rowValues: row.map(cleanGlapsText),
      rowPayload: buildGenericRawPayload(headers, row),
    })).filter(item => isNonEmptyRow(item.rowValues));
  });
}

function aliasKey(alias) {
  return [
    cleanGlapsText(alias.aliasType),
    routePartKey(alias.sourceName),
    routePartKey(alias.elsName),
    cleanGlapsText(alias.routeCode),
  ].join('|');
}

export function buildGlapsAliasesFromRoutes(routes = []) {
  const aliases = new Map();
  const addAlias = (alias) => {
    if (!alias.sourceName && !alias.elsName && !alias.glapsName) return;
    const normalized = {
      aliasType: alias.aliasType,
      sourceName: cleanGlapsText(alias.sourceName),
      elsName: cleanGlapsText(alias.elsName),
      glapsName: cleanGlapsText(alias.glapsName),
      glapsCode: cleanGlapsText(alias.glapsCode),
      routeCode: cleanGlapsText(alias.routeCode),
      reviewStatus: normalizeReviewStatus(alias.reviewStatus, cleanGlapsText(alias.elsName) ? 'ready' : 'needs_mapping'),
      reviewNote: cleanGlapsText(alias.reviewNote),
    };
    aliases.set(aliasKey(normalized), normalized);
  };

  routes.forEach((route) => {
    addAlias({
      aliasType: 'start',
      sourceName: route.startLocationName,
      elsName: route.startLocationName,
      glapsName: route.startLocationName,
      routeCode: route.routeCode,
      reviewStatus: route.startLocationName ? 'ready' : 'needs_mapping',
    });
    addAlias({
      aliasType: 'waypoint',
      sourceName: route.waypointName || route.waypointElsName,
      elsName: route.waypointElsName || route.waypointName,
      glapsName: route.waypointName || route.waypointElsName,
      routeCode: route.routeCode,
      reviewStatus: route.waypointElsName ? 'ready' : 'needs_mapping',
    });
    addAlias({
      aliasType: 'destination',
      sourceName: route.destinationName,
      elsName: route.destinationName,
      glapsName: route.destinationName,
      routeCode: route.routeCode,
      reviewStatus: route.destinationName ? 'ready' : 'needs_mapping',
    });
  });

  return [...aliases.values()];
}

export function buildGlapsAliasesFromCodeSheets(sheets = []) {
  const aliases = new Map();
  const addAlias = (alias) => {
    const glapsCode = cleanGlapsText(alias.glapsCode);
    const names = [
      alias.sourceName,
      alias.elsName,
      alias.glapsName,
      ...(Array.isArray(alias.extraNames) ? alias.extraNames : []),
    ].map(cleanGlapsText).filter(Boolean);
    [...new Set(names)].forEach((name) => {
      const normalized = {
        aliasType: alias.aliasType,
        sourceName: name,
        elsName: name,
        glapsName: cleanGlapsText(alias.glapsName) || name,
        glapsCode,
        routeCode: '',
        reviewStatus: name || glapsCode ? 'ready' : 'needs_mapping',
        reviewNote: cleanGlapsText(alias.reviewNote),
      };
      const key = aliasKey(normalized);
      if (!aliases.has(key)) aliases.set(key, normalized);
    });
  };

  sheets.forEach((sheet) => {
    const sheetName = cleanGlapsText(sheet.name);
    if (!sheetName || sheetName.includes('운송경로')) return;
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const headerRowIndex = findGenericHeaderRowIndex(rows);
    if (headerRowIndex < 0) return;

    const headers = (rows[headerRowIndex] || []).map(cleanGlapsText);
    const normalizedHeaders = headers.map(normalizeGlapsKey);
    const aliasType = inferSheetAliasType(sheetName);
    const findColumn = (candidates = []) => findGlapsHeaderIndex(headers, candidates);

    if (aliasType === 'container_type') {
      const isoIdx = findColumn(['ISO코드', 'ISO CODE']);
      const customsIdx = findColumn(['세관코드', '규격', '컨테이너규격']);
      const elsCodeIdxs = findElsCodeIndexes(headers);
      const descriptionIdx = findColumn(['설명 (Description)', '설명', 'Description']);
      const registerKeyIdx = findColumn(['GLAPS 등록 KEY', '등록 KEY']);

      rows.slice(headerRowIndex + 1).forEach((row) => {
        const isoCode = getRowValue(row, isoIdx);
        const customsCode = getRowValue(row, customsIdx);
        const elsCodes = getRowValues(row, elsCodeIdxs);
        const description = getRowValue(row, descriptionIdx);
        const registerKey = getRowValue(row, registerKeyIdx);
        if (!isoCode && !customsCode && !elsCodes.length && !description && !registerKey) return;
        addAlias({
          aliasType,
          sourceName: isoCode || customsCode || elsCodes[0] || description,
          glapsName: description || customsCode || isoCode,
          glapsCode: isoCode,
          extraNames: [customsCode, ...elsCodes, registerKey, description],
          reviewNote: sheetName,
        });
      });
      return;
    }

    if (aliasType === 'port') {
      const glapsPortIdx = findColumn(['GLAPS 포트', 'GLAPS PORT']);
      const glapsCodeIdx = findColumn(['GLAPS 코드', 'GLAPS CODE']);
      const elsCodeIdxs = findElsCodeIndexes(headers);
      const kdValueIdx = findColumn(['KD보낼값', 'KD 보낼값']);
      const gloveNameIdx = findColumn(['명칭(GLOVE)', '명칭', 'GLOVE명']);
      const gloveTypeIdx = findColumn(['구분(GLOVE)', '구분']);
      const locationIdx = findColumn(['LOCATION (GLOVE)', 'LOCATION']);

      rows.slice(headerRowIndex + 1).forEach((row) => {
        const glapsPort = getRowValue(row, glapsPortIdx);
        const glapsCode = getRowValue(row, glapsCodeIdx);
        const elsCodes = getRowValues(row, elsCodeIdxs);
        const kdValue = getRowValue(row, kdValueIdx);
        const gloveName = getRowValue(row, gloveNameIdx);
        const gloveType = getRowValue(row, gloveTypeIdx);
        const location = getRowValue(row, locationIdx);
        if (!glapsPort && !glapsCode && !elsCodes.length && !kdValue && !gloveName && !location) return;
        addAlias({
          aliasType,
          sourceName: glapsCode || elsCodes[0] || glapsPort || kdValue || gloveName,
          glapsName: glapsPort || kdValue || gloveName || glapsCode,
          glapsCode: glapsCode || glapsPort,
          extraNames: [...elsCodes, glapsPort, kdValue, gloveName, gloveType, location],
          reviewNote: sheetName,
        });
      });
      return;
    }

    if (aliasType === 'line') {
      const codeIdx = findColumn(['선사코드 (GLAPS)', '선사코드(GLAPS)', '선사코드', 'GLAPS 코드', 'LINE CODE']);
      const elsCodeIdxs = findElsCodeIndexes(headers);
      const nameIdx = findColumn(['선사명(영문)', '선사명', '선사', 'LINE NAME', 'CARRIER NAME']);

      rows.slice(headerRowIndex + 1).forEach((row) => {
        const glapsCode = getRowValue(row, codeIdx);
        const elsCodes = getRowValues(row, elsCodeIdxs);
        const glapsName = getRowValue(row, nameIdx);
        if (!glapsCode && !elsCodes.length && !glapsName) return;
        addAlias({
          aliasType,
          sourceName: glapsCode || elsCodes[0] || glapsName,
          glapsName: glapsName || glapsCode || elsCodes[0],
          glapsCode,
          extraNames: [...elsCodes, glapsName],
          reviewNote: sheetName,
        });
      });
      return;
    }

    const elsCodeIdxs = findElsCodeIndexes(headers);
    const elsCodeIdxSet = new Set(elsCodeIdxs);
    const codeIdx = normalizedHeaders.findIndex((header, idx) => (
      !elsCodeIdxSet.has(idx) && (header.includes('코드') || header.includes('CODE'))
    ));
    const nameIdx = normalizedHeaders.findIndex((header, idx) => (
      idx !== codeIdx
      && !elsCodeIdxSet.has(idx)
      && (header.includes('명') || header.includes('NAME') || header.includes('규격') || header.includes('선사') || header.includes('컨사이니') || header.includes('포트'))
    ));
    const fallbackNameIdx = nameIdx >= 0 ? nameIdx : rows[headerRowIndex].findIndex((_, idx) => idx !== codeIdx && !elsCodeIdxSet.has(idx));

    rows.slice(headerRowIndex + 1).forEach((row) => {
      const glapsCode = getRowValue(row, codeIdx);
      const elsCodes = getRowValues(row, elsCodeIdxs);
      const glapsName = getRowValue(row, fallbackNameIdx);
      if (!glapsCode && !elsCodes.length && !glapsName) return;
      const extraNames = [...elsCodes];
      if (aliasType === 'carrier' && normalizeGlapsKey(glapsName).includes('ELS')) extraNames.push('ELS');
      addAlias({
        aliasType,
        sourceName: glapsCode || elsCodes[0] || glapsName,
        glapsName: glapsName || glapsCode,
        glapsCode,
        extraNames,
        reviewNote: sheetName,
      });
    });
  });
  return [...aliases.values()];
}

export function summarizeGlapsRoutes(routes = []) {
  const byStatus = routes.reduce((acc, route) => {
    acc[route.reviewStatus] = (acc[route.reviewStatus] || 0) + 1;
    return acc;
  }, {});
  return {
    total: routes.length,
    ready: byStatus.ready || 0,
    needsMapping: byStatus.needs_mapping || 0,
    missingRouteCode: byStatus.missing_route_code || 0,
  };
}

export function parseGlapsMasterSheets(sheets = []) {
  const routeSheet = findRouteCandidateSheet(sheets);
  const routes = routeSheet ? parseGlapsRouteSheet(routeSheet) : [];
  const aliases = [
    ...buildGlapsAliasesFromRoutes(routes),
    ...buildGlapsAliasesFromCodeSheets(sheets),
  ].filter((alias, idx, list) => (
    list.findIndex(item => aliasKey(item) === aliasKey(alias)) === idx
  ));
  const sheetRows = buildGlapsMasterSheetRows(sheets);
  return {
    routes,
    aliases,
    sheetRows,
    summary: summarizeGlapsRoutes(routes),
    sourceSheets: sheets.map(sheet => cleanGlapsText(sheet.name)).filter(Boolean),
    routeSheetName: routeSheet?.name || '',
  };
}

function findTemplateHeaderRowIndex(rows = [], aliases = {}) {
  const keys = Object.values(aliases).flat();
  for (let idx = 0; idx < Math.min(rows.length, 8); idx += 1) {
    const row = rows[idx] || [];
    const matches = keys.filter(key => findGlapsHeaderIndex(row, [key]) >= 0).length;
    if (matches >= 3) return idx;
  }
  return -1;
}

function buildTemplateColumns(headers = [], aliases = {}) {
  return Object.fromEntries(Object.entries(aliases).map(([key, candidates]) => [
    key,
    findGlapsHeaderIndex(headers, candidates),
  ]));
}

function templateRowsFromSheet(sheet = {}, aliases = {}) {
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const headerRowIndex = findTemplateHeaderRowIndex(rows, aliases);
  if (headerRowIndex < 0) return [];
  const headers = rows[headerRowIndex].map(cleanGlapsText);
  const cols = buildTemplateColumns(headers, aliases);
  return rows.slice(headerRowIndex + 1)
    .map((row, offset) => ({ row, cols, sourceRowNumber: headerRowIndex + offset + 2 }))
    .filter(({ row }) => row.some(cell => cleanGlapsText(cell)));
}

export function parseGlapsRouteTemplateSheets(sheets = []) {
  return sheets.flatMap(sheet => templateRowsFromSheet(sheet, ROUTE_TEMPLATE_ALIASES).map(({ row, cols, sourceRowNumber }) => {
    const route = {
      id: getRowValue(row, cols.id),
      routeCode: getRowValue(row, cols.routeCode),
      routeName: getRowValue(row, cols.routeName),
      startLocationName: getRowValue(row, cols.startLocationName),
      waypointName: getRowValue(row, cols.waypointName),
      waypointElsName: getRowValue(row, cols.waypointElsName),
      destinationName: getRowValue(row, cols.destinationName),
      reviewNote: getRowValue(row, cols.reviewNote),
      deleteFlag: getRowValue(row, cols.deleteFlag).toUpperCase() === 'Y',
      sourceSheet: cleanGlapsText(sheet.name),
      sourceRowNumber,
    };
    route.routeFingerprint = buildGlapsRouteFingerprint(route);
    route.reviewStatus = normalizeReviewStatus(getRowValue(row, cols.reviewStatus), getGlapsRouteReviewStatus(route));
    return route;
  }));
}

export function parseGlapsAliasTemplateSheets(sheets = []) {
  return sheets.flatMap(sheet => templateRowsFromSheet(sheet, ALIAS_TEMPLATE_ALIASES).map(({ row, cols, sourceRowNumber }) => ({
    id: getRowValue(row, cols.id),
    aliasType: GLAPS_CODE_ALIAS_TYPES.has(getRowValue(row, cols.aliasType)) ? getRowValue(row, cols.aliasType) : 'waypoint',
    sourceName: getRowValue(row, cols.sourceName),
    elsName: getRowValue(row, cols.elsName),
    glapsName: getRowValue(row, cols.glapsName),
    glapsCode: getRowValue(row, cols.glapsCode),
    routeCode: getRowValue(row, cols.routeCode),
    reviewStatus: normalizeReviewStatus(getRowValue(row, cols.reviewStatus), getRowValue(row, cols.elsName) ? 'ready' : 'needs_mapping'),
    reviewNote: getRowValue(row, cols.reviewNote),
    deleteFlag: getRowValue(row, cols.deleteFlag).toUpperCase() === 'Y',
    sourceSheet: cleanGlapsText(sheet.name),
    sourceRowNumber,
  })));
}

export function getGlapsRouteMatchQuery() {
  return [
    "branch_id = 'asan'",
    'active_version = true',
    '상세배차.상차지 = route.start_location_name',
    '상세배차.경유지(ELS) = route.waypoint_els_name',
    '상세배차.하차지(선적) = route.destination_name',
  ];
}
