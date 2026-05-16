const ISO6346_CHAR_MAP = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

export function normalizeContainerNo(value) {
  return String(value || '').replace(/\s/g, '').toUpperCase();
}

export function isContainerNoShape(value) {
  return /^[A-Z]{4}\d{7}$/.test(normalizeContainerNo(value));
}

export function isIso6346Valid(value) {
  const cn = normalizeContainerNo(value);
  if (!isContainerNoShape(cn)) return false;

  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const c = cn[i];
    const val = c >= '0' && c <= '9' ? Number.parseInt(c, 10) : ISO6346_CHAR_MAP[c];
    if (val === undefined) return false;
    sum += val * (2 ** i);
  }

  const rem = sum % 11;
  return (rem === 10 ? 0 : rem) === Number.parseInt(cn[10], 10);
}

export function parseContainerInput(text) {
  if (!text || !text.trim()) return [];

  const raw = text
    .split(/[\n,;\s]+/)
    .map(normalizeContainerNo)
    .filter(Boolean);

  // 체크섬 오류도 결과 행으로 표시해야 하므로 형식(영문4+숫자7)이 맞으면 유지한다.
  return [...new Set(raw.filter(isContainerNoShape))];
}
