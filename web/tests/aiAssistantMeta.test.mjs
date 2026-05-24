import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getAiAssistantGuideSections,
  getAiAssistantIntroMessage,
  getAiAssistantVersion,
  getAiQuickPrompts,
  getAiSystemCapabilitySummary,
} from '../utils/aiAssistantMeta.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('AI 어시스턴트 버전과 소개는 함수형 메타에서 관리한다', () => {
  assert.equal(getAiAssistantVersion(), 'v5.14.161');

  const intro = getAiAssistantIntroMessage();
  assert.match(intro, /v5\.14\.161/);
  assert.match(intro, /branch_dispatch/);
  assert.match(intro, /DB에 저장되거나 색인된 자료/);
  assert.doesNotMatch(intro, /v5\.11\.0/);
  assert.doesNotMatch(intro, /명함 신청서/);
});

test('빠른 질문과 가이드는 실제 연결된 DB·웹·안전운임 기능만 노출한다', () => {
  const quickLabels = getAiQuickPrompts().map(item => item.label).join('\n');
  const guideText = getAiAssistantGuideSections()
    .flatMap(section => [section.title, section.description, ...section.examples])
    .join('\n');

  assert.match(quickLabels, /오늘 아산 배차 총 몇 대야/);
  assert.match(quickLabels, /부산 신항 40ft 안전운임/);
  assert.match(guideText, /아산 배차판 DB 조회/);
  assert.match(guideText, /사내 웹\/DB 자료 검색/);
  assert.match(guideText, /안전운임 및 물류 관제/);
  assert.doesNotMatch(quickLabels + guideText, /24년_운임표\.xlsx/);
  assert.doesNotMatch(quickLabels + guideText, /명함 신청서\(이미지\)/);
  assert.doesNotMatch(quickLabels + guideText, /NAS 자료실/);
});

test('AI 화면은 버전·가이드·빠른 질문을 하드코딩하지 않는다', () => {
  const page = readFileSync(resolve(__dirname, '../app/(main)/employees/(intranet)/ask/page.js'), 'utf8');

  assert.match(page, /getAiAssistantVersion/);
  assert.match(page, /getAiAssistantIntroMessage/);
  assert.match(page, /getAiQuickPrompts/);
  assert.match(page, /GUIDE_SECTIONS\.map/);
  assert.doesNotMatch(page, /v5\.11\.0/);
  assert.doesNotMatch(page, /명함 신청서\(이미지\)/);
  assert.doesNotMatch(page, /24년_운임표\.xlsx/);
});

test('채팅 API는 웹 첨부문서 색인을 NAS 원본 파싱처럼 설명하지 않는다', () => {
  const route = readFileSync(resolve(__dirname, '../app/api/chat/route.js'), 'utf8');
  const summary = getAiSystemCapabilitySummary();

  assert.match(summary, /source_type=web_attachment/);
  assert.match(summary, /현재 제외/);
  assert.match(route, /getAiSystemCapabilitySummary/);
  assert.match(route, /getRecentWebDataUpdates/);
  assert.match(route, /사내 웹 첨부문서/);
  assert.match(route, /webDataUpdates/);
  assert.doesNotMatch(route, /getRecentNasUpdates/);
  assert.doesNotMatch(route, /nasUpdates/);
  assert.doesNotMatch(route, /사내 NAS 자료실 문서/);
  assert.doesNotMatch(route, /2026년 5월 9일/);
});
