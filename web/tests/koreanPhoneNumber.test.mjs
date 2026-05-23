import test from 'node:test';
import assert from 'node:assert/strict';
import { formatKoreanPhoneNumber, normalizeKoreanPhoneNumberInput } from '../utils/koreanPhoneNumber.mjs';

test('전화번호 입력값은 하이픈, 슬래시, 점을 제거해 저장 기준값으로 정규화한다', () => {
  assert.equal(normalizeKoreanPhoneNumberInput('010-2599/6159'), '01025996159');
  assert.equal(normalizeKoreanPhoneNumberInput('041.544.2402'), '0415442402');
  assert.equal(normalizeKoreanPhoneNumberInput('055/540.5616~8'), '0555405616~8');
  assert.equal(normalizeKoreanPhoneNumberInput('051-607-7871~4, 6'), '0516077871~4,6');
});

test('휴대폰 번호는 010 시작 11자리를 3-4-4로 표시한다', () => {
  assert.equal(formatKoreanPhoneNumber('01025996159'), '010-2599-6159');
  assert.equal(formatKoreanPhoneNumber('010-2599-6159'), '010-2599-6159');
});

test('구형 10자리 휴대폰 번호는 3-3-4로 표시한다', () => {
  assert.equal(formatKoreanPhoneNumber('0111234567'), '011-123-4567');
});

test('서울 지역번호는 02 뒤 자릿수에 따라 2-3-4 또는 2-4-4로 표시한다', () => {
  assert.equal(formatKoreanPhoneNumber('025222401'), '02-522-2401');
  assert.equal(formatKoreanPhoneNumber('0263939721'), '02-6393-9721');
});

test('3자리 지역번호 일반전화는 10자리를 3-3-4로 표시한다', () => {
  assert.equal(formatKoreanPhoneNumber('0415442402'), '041-544-2402');
  assert.equal(formatKoreanPhoneNumber('0316179727'), '031-617-9727');
  assert.equal(formatKoreanPhoneNumber('0555474414'), '055-547-4414');
  assert.equal(formatKoreanPhoneNumber('0555405735'), '055-540-5735');
  assert.equal(formatKoreanPhoneNumber('05512345678'), '055-1234-5678');
});

test('내선 또는 번호 범위 표기는 본번호 뒤에 보존한다', () => {
  assert.equal(formatKoreanPhoneNumber('055-540-5616~8'), '055-540-5616~8');
  assert.equal(formatKoreanPhoneNumber('055-540-5601~2'), '055-540-5601~2');
  assert.equal(formatKoreanPhoneNumber('02-2627-2519~20'), '02-2627-2519~20');
  assert.equal(formatKoreanPhoneNumber('051-607-7871~4,6'), '051-607-7871~4,6');
  assert.equal(formatKoreanPhoneNumber('070-7467-8005~6'), '070-7467-8005~6');
});

test('인터넷전화와 0507 가상번호도 국내 번호 규칙으로 표시한다', () => {
  assert.equal(formatKoreanPhoneNumber('07012345678'), '070-1234-5678');
  assert.equal(formatKoreanPhoneNumber('050712345678'), '0507-1234-5678');
});

test('대표번호 8자리는 4-4로 표시한다', () => {
  assert.equal(formatKoreanPhoneNumber('15881234'), '1588-1234');
});
