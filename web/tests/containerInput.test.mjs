import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isIso6346Valid,
  parseContainerInput,
} from '../utils/containerInput.mjs';

const VALID_CONTAINERS = [
  'MSKU5071276',
  'MNBU4288136',
  'MNBU4601277',
  'MNBU4659664',
  'MNBU4339444',
  'CAAU6199250',
  'CAAU9345893',
  'GAOU6513001',
  'CMAU8891299',
  'TRHU4510655',
  'ECMU7516146',
];

test('형이 준 정상 컨테이너 번호는 ISO 6346 체크섬을 통과한다', () => {
  assert.deepEqual(VALID_CONTAINERS.filter(isIso6346Valid), VALID_CONTAINERS);
});

test('체크섬이 틀린 번호도 입력 목록에서 제거하지 않는다', () => {
  const input = ['MSKU5071276', 'MSKU5072276', 'MNBU4288136'].join('\n');

  assert.deepEqual(parseContainerInput(input), [
    'MSKU5071276',
    'MSKU5072276',
    'MNBU4288136',
  ]);
  assert.equal(isIso6346Valid('MSKU5072276'), false);
});

test('중복은 제거하되 입력 순서를 유지한다', () => {
  const input = 'msku5071276, MNBU4288136\nMSKU5071276';

  assert.deepEqual(parseContainerInput(input), [
    'MSKU5071276',
    'MNBU4288136',
  ]);
});

test('컨테이너 번호 형식이 아닌 값은 조회 대상에서 제외한다', () => {
  assert.deepEqual(parseContainerInput('abc hello 1234 MSKU5071276'), ['MSKU5071276']);
});
