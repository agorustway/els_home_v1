export const DISPATCH_DETAIL_HEADERS = Object.freeze([
  '작업일자',
  '구분',
  '화주',
  '상차지',
  '작업지',
  '하차지(선적)',
  '운송경로',
  '운송경로코드',
  '고객사',
  '포트',
  '포트코드',
  '라인',
  '라인코드',
  '타입',
  '타입코드',
  '업체명',
  'BKG1',
  'BKG2',
  'BKG3',
  'TARGET VESSEL',
  '비고',
]);

export const GLAPS_START_LOCATION_OPTIONS = Object.freeze([
  '',
  '부산신항',
  '인천항국제여객터미널',
  '인천신항',
  '인천항',
  '광양항',
  '평택항',
  '부산북항',
  '울산신항',
  '울산구항',
  '의왕ICD',
  '아산',
  '군산항',
  '온산항',
]);

const DISPATCH_REGION_HEADERS = Object.freeze([
  '기타/철송',
  '기타',
  '아산',
  '부산',
  '신항',
  '광양',
  '평택',
  '중부',
  '부곡',
  '인천',
  '울산',
]);

const MANUAL_START_REGIONS = new Set(['기타/철송', '기타', '아산', '중부']);

function cleanText(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value) {
  return cleanText(value).replace(/\s+/g, '').toUpperCase();
}

export function findDispatchDetailHeaderIndex(headers = [], candidates = []) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const targets = candidates.map(normalizeHeader).filter(Boolean);
  for (const target of targets) {
    const idx = normalizedHeaders.findIndex((header) => header === target);
    if (idx >= 0) return idx;
  }
  for (const target of targets) {
    const idx = normalizedHeaders.findIndex((header) => header && header.includes(target));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseDispatchAssignmentCell(value = '') {
  const text = cleanText(value)
    .replace(/[，、]/g, ',')
    .replace(/(\d)\.(?=[^\d\s])/g, '$1,');
  if (!text) return [];

  const records = [];
  const regex = /([^,\s/]+?)\s*(-?\d+(?:\.\d+)?)(?=$|[,/\s])/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const companyToken = cleanText(match[1]);
    const count = Number(match[2]);
    if (!companyToken || !Number.isFinite(count) || count <= 0) continue;
    records.push({
      companyToken,
      count,
      rawText: match[0],
    });
  }
  return records;
}

function splitCompanySuffix(companyToken, region) {
  const text = cleanText(companyToken);
  const match = text.match(/^(.*?)([BK])$/i);
  if (!match) return { company: text, suffix: '' };

  const suffix = match[2].toUpperCase();
  const normalizedRegion = cleanText(region);
  const suffixIsMeaningful = suffix === 'B'
    ? ['부산', '인천', '울산'].includes(normalizedRegion)
    : normalizedRegion === '인천';
  if (!suffixIsMeaningful) return { company: text, suffix: '' };

  return {
    company: cleanText(match[1]) || text,
    suffix,
  };
}

export function resolveGlapsStartLocation(region, suffix = '') {
  const normalizedRegion = cleanText(region);
  const normalizedSuffix = cleanText(suffix).toUpperCase();

  if (normalizedRegion === '부산' || normalizedRegion === '신항') {
    return normalizedSuffix === 'B' ? '부산북항' : '부산신항';
  }
  if (normalizedRegion === '인천') {
    if (normalizedSuffix === 'K') return '인천항국제여객터미널';
    if (normalizedSuffix === 'B') return '인천항';
    return '인천신항';
  }
  if (normalizedRegion === '울산') {
    return normalizedSuffix === 'B' ? '울산구항' : '울산신항';
  }
  if (normalizedRegion === '부곡') return '의왕ICD';
  if (normalizedRegion === '광양') return '광양항';
  if (normalizedRegion === '평택') return '평택항';
  return '';
}

function detailValue(row, cols, key) {
  const idx = cols[key];
  return idx >= 0 ? cleanText(row[idx]) : '';
}

function getDetailColumns(headers = []) {
  return {
    date: findDispatchDetailHeaderIndex(headers, ['날짜', '작업일자']),
    direction: findDispatchDetailHeaderIndex(headers, ['구분']),
    shipper: findDispatchDetailHeaderIndex(headers, ['화주']),
    workplace: findDispatchDetailHeaderIndex(headers, ['작업지']),
    destination: findDispatchDetailHeaderIndex(headers, ['선적', '하차지(선적)', '하차지']),
    customer: findDispatchDetailHeaderIndex(headers, ['고객사(국가)', '고객사', '국가명', '국가']),
    port: findDispatchDetailHeaderIndex(headers, ['포트(도착항)', '포트', '도착항']),
    line: findDispatchDetailHeaderIndex(headers, ['라인(선사명)', '라인', '선사명', '선사']),
    containerType: findDispatchDetailHeaderIndex(headers, ['TYPE', 'T']),
    bkg1: findDispatchDetailHeaderIndex(headers, ['BKG1']),
    bkg2: findDispatchDetailHeaderIndex(headers, ['BKG2']),
    bkg3: findDispatchDetailHeaderIndex(headers, ['BKG3']),
    targetVessel: findDispatchDetailHeaderIndex(headers, ['TARGET VESSEL', 'TARGETVESSEL']),
    note: findDispatchDetailHeaderIndex(headers, ['비고']),
  };
}

function findExactDispatchDetailHeaderIndex(headers = [], target) {
  const normalizedTarget = normalizeHeader(target);
  return headers.findIndex((header) => normalizeHeader(header) === normalizedTarget);
}

function buildBaseLine(row, cols, fallbackWorkDate) {
  return {
    workDate: detailValue(row, cols, 'date') || fallbackWorkDate || '',
    direction: detailValue(row, cols, 'direction'),
    shipper: detailValue(row, cols, 'shipper'),
    workplace: detailValue(row, cols, 'workplace'),
    destination: detailValue(row, cols, 'destination'),
    customer: detailValue(row, cols, 'customer'),
    port: detailValue(row, cols, 'port'),
    line: detailValue(row, cols, 'line'),
    containerType: detailValue(row, cols, 'containerType'),
    bkg1: detailValue(row, cols, 'bkg1'),
    bkg2: detailValue(row, cols, 'bkg2'),
    bkg3: detailValue(row, cols, 'bkg3'),
    targetVessel: detailValue(row, cols, 'targetVessel'),
    note: detailValue(row, cols, 'note'),
  };
}

export function buildDispatchDetailLines({ headers = [], rows = [], workDate = '' } = {}) {
  const cols = getDetailColumns(headers);
  const regionCols = DISPATCH_REGION_HEADERS
    .map((region) => ({
      region,
      idx: findExactDispatchDetailHeaderIndex(headers, region),
    }))
    .filter((item) => item.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  const detailLines = [];
  rows.forEach((row = [], rowIndex) => {
    const baseLine = buildBaseLine(row, cols, workDate);
    regionCols.forEach(({ region, idx }) => {
      const assignments = parseDispatchAssignmentCell(row[idx]);
      assignments.forEach((assignment) => {
        const { company, suffix } = splitCompanySuffix(assignment.companyToken, region);
        const startLocation = resolveGlapsStartLocation(region, suffix);
        const unitCount = Math.max(0, Math.round(assignment.count));
        for (let unitIndex = 0; unitIndex < unitCount; unitIndex += 1) {
          detailLines.push({
            ...baseLine,
            startLocation,
            startRegion: region,
            startSuffix: suffix,
            company,
            rawCompany: assignment.companyToken,
            sourceText: assignment.rawText,
            sourceRowIndex: Number.isFinite(row.origIdx) ? row.origIdx : rowIndex,
            sourceUnitIndex: unitIndex + 1,
            needsStartLocationSelection: MANUAL_START_REGIONS.has(region) || !startLocation,
          });
        }
      });
    });
  });

  return detailLines.map((line, idx) => ({
    ...line,
    lineNo: idx + 1,
  }));
}

export function detailLineToRow(line = {}) {
  return [
    line.workDate || '',
    line.direction || '',
    line.shipper || '',
    line.startLocation || '',
    line.workplace || '',
    line.destination || '',
    line.glapsRouteName || '',
    line.glapsRouteCode || '',
    line.customer || '',
    line.port || '',
    line.glapsPortCode || '',
    line.line || '',
    line.glapsLineCode || '',
    line.containerType || '',
    line.glapsTypeCode || '',
    line.company || '',
    line.bkg1 || '',
    line.bkg2 || '',
    line.bkg3 || '',
    line.targetVessel || '',
    line.note || '',
  ];
}

export function summarizeDispatchDetailLines(lines = []) {
  return {
    total: lines.length,
    manualStartLocationCount: lines.filter((line) => line.needsStartLocationSelection).length,
  };
}
