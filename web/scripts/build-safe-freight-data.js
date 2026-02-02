/**
 * work-docs/안전운임조회.xlsx → web/data/safe-freight.json
 * 구간별운임 + 거리별운임 + 이외구간 3개 시트 모두 사용
 * 실행: node scripts/build-safe-freight-data.js (web 폴더에서)
 */
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const workDocsDir = path.join(__dirname, '..', '..', 'work-docs');
const files = fs.readdirSync(workDocsDir);
const xlsxPath = path.join(workDocsDir, files.find(f => f.endsWith('.xlsx') && !f.startsWith('~$') && f !== 'container_list.xlsx'));

const wb = XLSX.readFile(xlsxPath);

const LATEST_PERIOD = '26.02월';

function periodToNum(p) {
  if (!p) return 0;
  const s = String(p).trim();
  const ym = s.match(/^(\d{2,4})[.\s]*(\d{1,2})월$/);
  if (ym) return parseInt(ym[1], 10) * 12 + parseInt(ym[2], 10);
  const m = s.match(/^(\d{1,2})월$/);
  if (m) return parseInt(m[1], 10);
  return 0;
}

const toNum = (v) => {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  return parseInt(String(v).replace(/,/g, ''), 10) || 0;
};

// ========== 1. 구간별운임 ==========
const sheet1 = wb.Sheets['구간별운임'];
const rows1 = XLSX.utils.sheet_to_json(sheet1, { header: 1, defval: '' });
const dataRows1 = rows1.slice(2).filter(r => r && r.length >= 10 && String(r[3]).trim());

const periodSet = new Set();
const originMap = new Map();
const originsIn2026 = new Set(); // 엑셀 구간별운임 시트에서 적용=26.02월인 행에 등장한 기점축약만
const regionsTree = {};
const faresByKeyPeriod = {};

dataRows1.forEach((row) => {
  const 적용 = String(row[3] || '').trim();
  const 기점전체 = String(row[4] || '').trim();
  const 기점축약 = String(row[5] || '').trim();
  const 시도 = String(row[6] || '').trim();
  const 시군구 = String(row[7] || '').trim();
  const 읍면동 = String(row[8] || '').trim();
  const 구간거리 = row[9];
  if (!적용 || !기점축약 || !시도) return;

  periodSet.add(적용);
  if (기점축약 && !originMap.has(기점축약)) originMap.set(기점축약, 기점전체 || 기점축약);
  if (적용 === LATEST_PERIOD && 기점축약) originsIn2026.add(기점축약);

  if (!regionsTree[시도]) regionsTree[시도] = {};
  if (!regionsTree[시도][시군구]) regionsTree[시도][시군구] = [];
  if (시군구 && 읍면동 && !regionsTree[시도][시군구].includes(읍면동)) {
    regionsTree[시도][시군구].push(읍면동);
  }

  const numKm = typeof 구간거리 === 'number' ? 구간거리 : parseInt(구간거리, 10);
  if (Number.isNaN(numKm)) return;

  const key = `${기점축약}|${시도}|${시군구}|${읍면동}`;
  if (!faresByKeyPeriod[key]) faresByKeyPeriod[key] = {};
  const existing = faresByKeyPeriod[key][적용];
  if (!existing || numKm < existing.km) {
    faresByKeyPeriod[key][적용] = {
      period: 적용,
      km: numKm,
      f40위탁: toNum(row[10]),
      f40운수자: toNum(row[11]),
      f40안전: toNum(row[12]),
      f20위탁: toNum(row[13]),
      f20운수자: toNum(row[14]),
      f20안전: toNum(row[15]),
    };
  }
});

const fares = {};
const faresLatest = {};
Object.keys(faresByKeyPeriod).forEach((key) => {
  const byPeriod = faresByKeyPeriod[key];
  const arr = Object.values(byPeriod).sort((a, b) => periodToNum(b.period) - periodToNum(a.period));
  fares[key] = arr;
  if (arr.length) faresLatest[key] = { km: arr[0].km, fare20: arr[0].f20안전, fare40: arr[0].f40안전 };
});

Object.keys(regionsTree).forEach((시도) => {
  regionsTree[시도] = Object.keys(regionsTree[시도])
    .sort()
    .reduce((acc, 시군구) => {
      acc[시군구] = [...(regionsTree[시도][시군구] || [])].sort();
      return acc;
    }, {});
});

// ========== 2. 거리별운임 ==========
// 헤더: 시작일,열1,종료일,적용,구분,구간,운송, 안전위탁(40),운수자간(40),안전운송(40), 안전위탁(20),운수자간(20),안전운송(20)
const sheet2 = wb.Sheets['거리별운임'];
const rows2 = XLSX.utils.sheet_to_json(sheet2, { header: 1, defval: '' });
const dataRows2 = rows2.slice(2).filter(r => r && r.length >= 10 && String(r[3]).trim());

const distanceByPeriod = {}; // period -> { distType -> [ { km, 운송, f40위탁, f40운수자, f40안전, f20위탁, f20운수자, f20안전 } ] }
const distanceTypes = new Set();

dataRows2.forEach((row) => {
  const 적용 = String(row[3] || '').trim();
  const 구분 = String(row[4] || '').trim();
  const 구간 = row[5];
  const 운송 = row[6];
  if (!적용 || !구분) return;

  const km = typeof 구간 === 'number' ? Math.round(구간) : parseInt(구간, 10);
  if (Number.isNaN(km)) return;

  distanceTypes.add(구분);
  const pk = `${적용}|${구분}`;
  if (!distanceByPeriod[pk]) distanceByPeriod[pk] = [];
  distanceByPeriod[pk].push({
    km,
    운송: toNum(운송),
    f40위탁: toNum(row[7]),
    f40운수자: toNum(row[8]),
    f40안전: toNum(row[9]),
    f20위탁: toNum(row[10]),
    f20운수자: toNum(row[11]),
    f20안전: toNum(row[12]),
  });
});

Object.keys(distanceByPeriod).forEach((pk) => {
  distanceByPeriod[pk].sort((a, b) => a.km - b.km);
});

// ========== 3. 이외구간 ==========
// 기점, 시도, 시군구, 행정동, 법정동, 거리, 거리(정수)
const sheet3 = wb.Sheets['이외구간'];
const rows3 = XLSX.utils.sheet_to_json(sheet3, { header: 1, defval: '' });
const dataRows3 = rows3.slice(1).filter(r => r && r.length >= 6 && String(r[0]).trim());

const otherSections = {};
const otherRegions = {}; // 기점 -> { 시도 -> { 시군구 -> [ 동 ] } }

dataRows3.forEach((row) => {
  const 기점 = String(row[0] || '').trim();
  const 시도 = String(row[1] || '').trim();
  const 시군구 = String(row[2] || '').trim();
  const 행정동 = String(row[3] || '').trim();
  const 법정동 = String(row[4] || '').trim();
  const 거리 = row[5];
  const 거리정수 = row[6];
  if (!기점 || !시도 || !시군구) return;

  const km = typeof 거리 === 'number' ? 거리 : parseFloat(거리);
  const kmInt = typeof 거리정수 === 'number' ? Math.round(거리정수) : parseInt(거리정수, 10);
  if (Number.isNaN(kmInt)) return;

  const val = { km, kmInt, hDong: 행정동, bDong: 법정동 };
  if (행정동) {
    otherSections[`${기점}|${시도}|${시군구}|${행정동}`] = val;
    if (!otherRegions[기점]) otherRegions[기점] = {};
    if (!otherRegions[기점][시도]) otherRegions[기점][시도] = {};
    if (!otherRegions[기점][시도][시군구]) otherRegions[기점][시도][시군구] = [];
    if (!otherRegions[기점][시도][시군구].includes(행정동)) otherRegions[기점][시도][시군구].push(행정동);
  }
  if (법정동 && 법정동 !== 행정동) {
    otherSections[`${기점}|${시도}|${시군구}|${법정동}`] = val;
    if (!otherRegions[기점][시도][시군구].includes(법정동)) otherRegions[기점][시도][시군구].push(법정동);
  }
});

Object.keys(otherRegions).forEach((기점) => {
  Object.keys(otherRegions[기점]).forEach((시도) => {
    otherRegions[기점][시도] = Object.keys(otherRegions[기점][시도])
      .sort()
      .reduce((acc, 시군구) => {
        acc[시군구] = [...(otherRegions[기점][시도][시군구] || [])].sort();
        return acc;
      }, {});
  });
});

// ========== 출력 ==========
const periods = Array.from(periodSet)
  .filter(Boolean)
  .sort()
  .reverse()
  .map((p) => ({ id: p, label: p === LATEST_PERIOD ? '2026년 2월 1일 ~ 진행중' : p }));

const origins = Array.from(originMap.entries())
  .map(([id, label]) => ({ id, label: label || id }))
  .sort((a, b) => a.label.localeCompare(b.label));

// 2026년 2월 선택 시: 엑셀 구간별운임에서 적용=26.02월인 행에 등장한 기점만 노출
const origins2026OrLater = origins.filter((o) => originsIn2026.has(o.id));

const surcharges = [
  { id: 'flexibag_liquid', label: '플렉시백 컨테이너 (액체 20%)', pct: 20, group: 'flexibag' },
  { id: 'flexibag_powder', label: '플렉시백 컨테이너 (분말 10%)', pct: 10, group: 'flexibag' },
  { id: 'tank', label: 'TANK 컨테이너(비위험물) 30%', pct: 30 },
  { id: 'reefer', label: '냉동냉장 컨테이너 30% (편도미적용)', pct: 30 },
  { id: 'rough', label: '험로 및 오지', pct: 20, note: '*진행시 확인서 증빙이 필요합니다.' },
  { id: 'dump', label: '덤프 컨테이너 25%', pct: 25 },
  { id: 'holiday', label: '일요일 및 공휴일 20%', pct: 20 },
  { id: 'night', label: '심야(22:00-06:00) 20%', pct: 20 },
  { id: 'hazard_30', label: '위험물, 유독물, 유해화학물질 30%', pct: 30, group: 'hazard' },
  { id: 'hazard_100', label: '화약류 100%', pct: 100, group: 'hazard' },
  { id: 'hazard_200', label: '방사성물질 200%', pct: 200, group: 'hazard' },
  { id: 'oversize_10', label: '10cm 초과 10%', pct: 10, group: 'oversize' },
  { id: 'oversize_20', label: '20cm 초과 20%', pct: 20, group: 'oversize' },
  { id: 'oversize_30', label: '30cm 초과 30%', pct: 30, group: 'oversize' },
  { id: 'oversize_40', label: '40cm 초과 40%', pct: 40, group: 'oversize' },
  { id: 'oversize_50', label: '50cm 초과 50%', pct: 50, group: 'oversize' },
  { id: 'heavy_10', label: '중량1톤 초과 10%', pct: 10, group: 'heavy' },
  { id: 'heavy_20', label: '중량2톤 초과 20%', pct: 20, group: 'heavy' },
  { id: 'heavy_30', label: '중량3톤 초과 30%', pct: 30, group: 'heavy' },
  { id: 'heavy_40', label: '중량4톤 초과 40%', pct: 40, group: 'heavy' },
  { id: 'heavy_50', label: '중량5톤 초과 50%', pct: 50, group: 'heavy' },
  { id: 'heavy_60', label: '중량6톤 초과 60%', pct: 60, group: 'heavy' },
  { id: 'heavy_70', label: '중량7톤 초과 70%', pct: 70, group: 'heavy' },
  { id: 'heavy_80', label: '중량8톤 초과 80%', pct: 80, group: 'heavy' },
  { id: 'heavy_90', label: '중량9톤 초과 90%', pct: 90, group: 'heavy' },
  { id: 'xray', label: '검색대(X-RAY) 통과비용 : 100,000원', fixed: 100000, otherCost: true },
  { id: 'incheon_empty', label: '인천터미널 공컨 반납비(편도): 40,000원', fixed: 40000, otherCost: true },
];

// 2026년 적용 화물자동차 안전운임 고시 [별표1] 제22조(할증률 가산)
const surchargeRegulation = {
  maxPctCount: 3,
  firstFull: true,
  restHalf: true,
  legalRef: '2026년 적용 화물자동차 안전운임 고시 [별표1] 제22조',
  notice: '다수의 할증이 적용될 경우 가장 높은 할증률 1개는 전액, 나머지는 50%씩 적용하며, 할증 항목은 3개까지만 합산합니다.',
  excludedReason: '할증 항목이 3개를 초과하여 본 운송에는 적용되지 않습니다(고시 제22조 나목).',
};

const output = {
  meta: { generatedAt: new Date().toISOString(), period: LATEST_PERIOD },
  periods,
  origins,
  origins2026OrLater,
  regions: regionsTree,
  otherRegions,
  surcharges,
  surchargeRegulation,
  distanceTypes: Array.from(distanceTypes).filter(Boolean).sort(),
  fares,
  faresLatest,
  distanceByPeriod,
  otherSections,
};

const outPath = path.join(__dirname, '..', 'data', 'safe-freight.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 0), 'utf8');
console.log('Written', outPath);
console.log('  구간별운임 fare keys:', Object.keys(fares).length);
console.log('  거리별운임 period+type keys:', Object.keys(distanceByPeriod).length);
console.log('  이외구간 keys:', Object.keys(otherSections).length);
