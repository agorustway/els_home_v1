const MOBILE_PREFIX_PATTERN = /^01[016789]/;
const FOUR_DIGIT_PREFIX_PATTERN = /^(0303|050[2-8])/;
const RANGE_SUFFIX_PATTERN = /\s*([~∼～]\s*\d{1,4}(?:\s*,\s*\d{1,4})*)\s*$/;

function getOption(options, key, fallback) {
  return Object.prototype.hasOwnProperty.call(options, key) ? options[key] : fallback;
}

function formatSeoulNumber(digits) {
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
}

function formatFourDigitPrefixNumber(digits) {
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  if (digits.length <= 11) return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}

function formatThreeDigitPrefixNumber(digits) {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function splitRangeSuffix(value) {
  const text = String(value).trim();
  const match = text.match(RANGE_SUFFIX_PATTERN);

  if (!match) return { body: text, suffix: '' };

  return {
    body: text.slice(0, match.index).trim(),
    suffix: match[1].replace(/[∼～]/g, '~').replace(/\s+/g, ''),
  };
}

export function normalizeKoreanPhoneNumberInput(value, options = {}) {
  const emptyValue = getOption(options, 'emptyValue', '');

  if (value === undefined || value === null || value === '') return emptyValue;

  const { body, suffix } = splitRangeSuffix(value);
  const digits = body.replace(/\D/g, '');

  if (!digits) return emptyValue;
  return `${digits}${suffix}`;
}

export function formatKoreanPhoneNumber(value, options = {}) {
  const emptyValue = getOption(options, 'emptyValue', '-');
  const noDigitsValue = getOption(options, 'noDigitsValue', emptyValue);

  if (value === undefined || value === null || value === '') return emptyValue;

  const { body, suffix } = splitRangeSuffix(value);
  const digits = body.replace(/\D/g, '');
  if (!digits) return noDigitsValue;
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}${suffix}`;
  if (digits.startsWith('02')) return `${formatSeoulNumber(digits)}${suffix}`;
  if (FOUR_DIGIT_PREFIX_PATTERN.test(digits)) return `${formatFourDigitPrefixNumber(digits)}${suffix}`;
  if (MOBILE_PREFIX_PATTERN.test(digits)) return `${formatThreeDigitPrefixNumber(digits)}${suffix}`;

  return `${formatThreeDigitPrefixNumber(digits)}${suffix}`;
}
