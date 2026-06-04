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
  assert.equal(getAiAssistantVersion(), 'v5.14.348');

  const intro = getAiAssistantIntroMessage();
  assert.match(intro, /v5\.14\.348/);
  assert.match(intro, /아산 배차판·운송내역·상세배차·변동내역·GLAPS코드·선적관리·실적관리/);
  assert.match(intro, /사내 데이터베이스/);
  assert.match(intro, /데이터베이스에 저장되거나 색인된 자료/);
  assert.doesNotMatch(intro, /Supabase/);
  assert.doesNotMatch(intro, /\bDB\b/);
  assert.doesNotMatch(intro, /v5\.11\.0/);
  assert.doesNotMatch(intro, /명함 신청서/);
});

test('빠른 질문과 가이드는 실제 연결된 DB·웹·안전운임 기능만 노출한다', () => {
  const quickLabels = getAiQuickPrompts().map(item => item.label).join('\n');
  const guideText = getAiAssistantGuideSections()
    .flatMap(section => [section.title, section.description, ...section.examples])
    .join('\n');

  assert.match(quickLabels, /오늘 아산 배차 총 몇 대야/);
  assert.match(quickLabels, /6월 아산 운송내역 KCC 청구금액/);
  assert.match(quickLabels, /CMAU7631738 이력 조회/);
  assert.match(quickLabels, /부산 신항 40ft 안전운임/);
  assert.match(guideText, /아산 배차판 데이터베이스 조회/);
  assert.match(guideText, /아산 운송내역 데이터베이스 조회/);
  assert.match(guideText, /아산 선적관리 데이터베이스 조회/);
  assert.match(guideText, /아산 실적관리 데이터베이스 조회/);
  assert.match(guideText, /5월 업체\(운송사\) 매출순위/);
  assert.match(guideText, /사내 웹\/데이터베이스 자료 검색/);
  assert.match(guideText, /안전운임 및 물류 관제/);
  assert.doesNotMatch(quickLabels + guideText, /Supabase/);
  assert.doesNotMatch(quickLabels + guideText, /\bDB\b/);
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
  assert.match(summary, /운송내역\/상세배차\/변동내역\/GLAPS코드\/선적관리\/실적관리도 데이터베이스 기준/);
  assert.match(summary, /월별 수출리스트 원장/);
  assert.match(summary, /도출항목\/요약 스냅샷/);
  assert.match(summary, /운송사·청구처·작업지별 breakdown/);
  assert.doesNotMatch(summary, /Supabase/);
  assert.doesNotMatch(summary, /\bDB\b/);
  assert.match(route, /getAiSystemCapabilitySummary/);
  assert.match(route, /getRecentWebDataUpdates/);
  assert.match(route, /buildAsanDispatchDetailRagContext/);
  assert.match(route, /buildAsanTransportHistoryRagContext/);
  assert.match(route, /buildAsanShippingRagContext/);
  assert.match(route, /buildAsanChangeEventsRagContext/);
  assert.match(route, /buildAsanGlapsRagContext/);
  assert.match(route, /buildAsanPerformanceRagContext/);
  assert.match(route, /사내 웹 첨부문서/);
  assert.match(route, /webDataUpdates/);
  assert.doesNotMatch(route, /Supabase DB|시스템 DB|사내 DB|운영 DB|내부 DB|웹 DB|DB 미동기화|DB에|DB 조회/);
  assert.doesNotMatch(route, /getRecentNasUpdates/);
  assert.doesNotMatch(route, /nasUpdates/);
  assert.doesNotMatch(route, /사내 NAS 자료실 문서/);
  assert.doesNotMatch(route, /2026년 5월 9일/);
});
