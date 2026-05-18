const SIDO_MAP = {
  '서울특별시': '서울시',
  '부산광역시': '부산시',
  '대구광역시': '대구시',
  '인천광역시': '인천시',
  '광주광역시': '광주시',
  '대전광역시': '대전시',
  '울산광역시': '울산시',
  '세종특별자치시': '세종시',
  '경기도': '경기도',
  '강원특별자치도': '강원도',
  '강원도': '강원도',
  '충청북도': '충북',
  '충청남도': '충남',
  '전라북도': '전북',
  '전북특별자치도': '전북',
  '전라남도': '전남',
  '경상북도': '경북',
  '경상남도': '경남',
  '제주특별자치도': '제주도',
  '제주도': '제주도',
  '경기': '경기도',
  '강원': '강원도',
  '서울': '서울시',
  '부산': '부산시',
  '대구': '대구시',
  '인천': '인천시',
  '광주': '광주시',
  '대전': '대전시',
  '울산': '울산시',
  '세종': '세종시',
  '충북': '충북',
  '충남': '충남',
  '전북': '전북',
  '전남': '전남',
  '경북': '경북',
  '경남': '경남',
  '제주': '제주도',
};

function compact(value = '') {
  return String(value).replace(/\s/g, '');
}

function cleanDong(value = '') {
  return compact(value).replace(/[0-9.]/g, '').replace(/(동|읍|면|리)$/, '');
}

function uniqueHints(values) {
  return values.map((v) => String(v || '').trim()).filter(Boolean)
    .filter((v, idx, arr) => arr.indexOf(v) === idx);
}

export function normalizeSafeFreightSido(value = '') {
  const trimmed = String(value || '').trim();
  return SIDO_MAP[trimmed] || trimmed;
}

export function matchSafeFreightSigungu(regionsData = {}, sido = '', sigunguHint = '') {
  const sigunguMap = regionsData?.[sido] || {};
  const keys = Object.keys(sigunguMap);
  if (!keys.length) return sigunguHint || '';
  if (keys.includes(sigunguHint)) return sigunguHint;

  const hint = compact(sigunguHint);
  if (!hint) return '';

  return keys.find((key) => compact(key) === hint)
    || keys.find((key) => hint.includes(compact(key)) || compact(key).includes(hint))
    || '';
}

export function matchSafeFreightDong(regionsData = {}, sido = '', sigungu = '', hints = []) {
  const dongs = regionsData?.[sido]?.[sigungu];
  const availableDongs = Array.isArray(dongs) ? dongs : (dongs ? Object.keys(dongs) : []);
  if (!availableDongs.length) return '';

  const candidates = uniqueHints(hints);

  for (const hint of candidates) {
    if (availableDongs.includes(hint)) return hint;
  }

  for (const hint of candidates) {
    const normalized = compact(hint);
    const exactCompact = availableDongs.find((dong) => compact(dong) === normalized);
    if (exactCompact) return exactCompact;
  }

  for (const hint of candidates) {
    const target = cleanDong(hint);
    if (!target) continue;
    const fuzzy = availableDongs.find((dong) => {
      const source = cleanDong(dong);
      return source === target || source.includes(target) || target.includes(source);
    });
    if (fuzzy) return fuzzy;
  }

  const merged = compact(candidates.join(' '));
  if (merged.includes('온천동')) {
    const onyang = availableDongs.find((dong) => dong.includes('온양1'));
    if (onyang) return onyang;
  }

  return '';
}

export function resolveSafeFreightRegion(regionsData = {}, item = {}) {
  const admParts = String(item.admNm || '').trim().split(/\s+/).filter(Boolean);
  const sido = normalizeSafeFreightSido(item.siNm || item.r1 || admParts[0] || '');
  const sigunguHint = item.sggNm || item.r2 || admParts[1] || '';
  const sigungu = matchSafeFreightSigungu(regionsData, sido, sigunguHint);
  const dongHints = [
    item.hDong,
    item.emdNm,
    item.bDong,
    item.r3,
    admParts.slice(2).join(' '),
  ];
  const dong = matchSafeFreightDong(regionsData, sido, sigungu, dongHints);

  return {
    r1: sido,
    r2: sigungu || sigunguHint,
    r3: dong,
  };
}
