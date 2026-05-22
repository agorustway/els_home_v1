export const ASAN_DISPATCH_WEB_CELL_FIELDS = Object.freeze({
  BKG1: 'BKG1',
  BKG2: 'BKG2',
  BKG3: 'BKG3',
  TARGET_VESSEL: 'TARGET_VESSEL',
  NOTE: 'NOTE',
});

export const ASAN_DISPATCH_WEB_CELL_FIELD_LABELS = Object.freeze({
  BKG1: 'BKG1',
  BKG2: 'BKG2',
  BKG3: 'BKG3',
  TARGET_VESSEL: 'TARGET VESSEL',
  NOTE: '비고',
});

const FIELD_ALIASES = new Map([
  ['BKG1', ASAN_DISPATCH_WEB_CELL_FIELDS.BKG1],
  ['BKG2', ASAN_DISPATCH_WEB_CELL_FIELDS.BKG2],
  ['BKG3', ASAN_DISPATCH_WEB_CELL_FIELDS.BKG3],
  ['TARGETVESSEL', ASAN_DISPATCH_WEB_CELL_FIELDS.TARGET_VESSEL],
  ['TARGETVECELL', ASAN_DISPATCH_WEB_CELL_FIELDS.TARGET_VESSEL],
  ['VESSEL', ASAN_DISPATCH_WEB_CELL_FIELDS.TARGET_VESSEL],
  ['VECELL', ASAN_DISPATCH_WEB_CELL_FIELDS.TARGET_VESSEL],
  ['비고', ASAN_DISPATCH_WEB_CELL_FIELDS.NOTE],
]);

export function normalizeDispatchWebCellHeader(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function normalizeDispatchWebCellFieldKey(value) {
  if (!value) return '';
  const direct = String(value || '').trim().toUpperCase();
  if (ASAN_DISPATCH_WEB_CELL_FIELD_LABELS[direct]) return direct;
  return FIELD_ALIASES.get(normalizeDispatchWebCellHeader(value)) || '';
}

export function isDispatchWebCellField(value) {
  return Boolean(normalizeDispatchWebCellFieldKey(value));
}

export function getDispatchWebCellFieldLabel(fieldKey) {
  return ASAN_DISPATCH_WEB_CELL_FIELD_LABELS[normalizeDispatchWebCellFieldKey(fieldKey)] || '';
}

export function normalizeDispatchWebCellValue(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

export function validateDispatchWebCellValue(fieldKey, value) {
  const normalizedField = normalizeDispatchWebCellFieldKey(fieldKey);
  if (!normalizedField) {
    return { ok: false, value: '', error: 'WEB 입력 대상 컬럼이 아닙니다.' };
  }

  const normalizedValue = normalizeDispatchWebCellValue(value);
  const maxLength = normalizedField === ASAN_DISPATCH_WEB_CELL_FIELDS.NOTE ? 500 : 160;
  if (normalizedValue.length > maxLength) {
    return {
      ok: false,
      value: normalizedValue,
      error: `${getDispatchWebCellFieldLabel(normalizedField)}은 ${maxLength}자 이하로 입력해 주세요.`,
    };
  }

  if (normalizedField !== ASAN_DISPATCH_WEB_CELL_FIELDS.NOTE && /[^\x20-\x7E]/.test(normalizedValue)) {
    return {
      ok: false,
      value: normalizedValue,
      error: 'BKG1/2/3, TARGET VESSEL은 영문, 숫자, 기호만 입력 가능합니다.',
    };
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalizedValue)) {
    return {
      ok: false,
      value: normalizedValue,
      error: '제어 문자는 입력할 수 없습니다.',
    };
  }

  return { ok: true, value: normalizedValue, error: '' };
}
