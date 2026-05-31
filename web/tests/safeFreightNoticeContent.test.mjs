import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NOTICE_SECTIONS } from '../app/(main)/employees/safe-freight/safe-freight-notice.js';
import {
  SAFE_FREIGHT_NOTE_MAP,
  SAFE_FREIGHT_WIKI_NOTES,
  SAFE_FREIGHT_WIKI_TREE,
} from '../app/(main)/employees/safe-freight/safe-freight-wiki.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => readFileSync(resolve(__dirname, relativePath), 'utf8');

test('안전운임 법령 안내는 각 장별 핵심 확인사항을 함께 제공한다', () => {
  assert.ok(NOTICE_SECTIONS.length >= 7, '고시 장별 안내 항목이 유지되어야 합니다.');

  for (const section of NOTICE_SECTIONS) {
    assert.ok(section.summary.length >= 40, `${section.title} 요약은 충분한 안내 문장이어야 합니다.`);
    assert.ok(Array.isArray(section.points), `${section.title} 핵심 확인사항 배열이 있어야 합니다.`);
    assert.ok(section.points.length >= 3, `${section.title} 핵심 확인사항은 3개 이상이어야 합니다.`);
  }

  const guidance = NOTICE_SECTIONS.find((section) => section.id === 'guidance-20260401');
  assert.ok(guidance, '2026-04-01 추가 운영지침 안내가 있어야 합니다.');

  const guidanceText = [guidance.summary, ...guidance.points, guidance.fullText].join('\n');
  assert.match(guidanceText, /120%/, '인천 기점 할증 가산 예시를 안내해야 합니다.');
  assert.match(guidanceText, /거리별 원운임/, '구간표 기점 할증 중복 방지 기준을 안내해야 합니다.');
  assert.match(guidanceText, /공컨테이너/, '상하행 공컨 운송 예외를 안내해야 합니다.');
});

test('안전운임 압축 안내는 원문 주석번호와 고시해석 위키트리로 이어진다', () => {
  const sectionsWithRefs = NOTICE_SECTIONS.filter((section) => Array.isArray(section.noteRefs) && section.noteRefs.length > 0);
  assert.ok(sectionsWithRefs.length >= 4, '주요 안내 장에는 관련 주석번호가 있어야 합니다.');

  for (const section of sectionsWithRefs) {
    for (const ref of section.noteRefs) {
      assert.ok(SAFE_FREIGHT_NOTE_MAP[ref], `${section.title}의 주석 ${ref}는 위키 주석 원장에 있어야 합니다.`);
    }
  }

  const rootTitles = SAFE_FREIGHT_WIKI_TREE.map((node) => node.title);
  const detailNodeCount = SAFE_FREIGHT_WIKI_TREE.reduce((sum, node) => sum + (node.children || []).length, 0);
  assert.deepEqual(rootTitles, ['1차 고시', '1차 추가 운영지침', '1차-운영지침 해석'], '고시해석 위키트리는 리스트 3개 구조여야 합니다.');
  assert.equal(detailNodeCount, 7, '고시해석 위키트리는 상세 7개 구조여야 합니다.');

  const wikiText = JSON.stringify({ notes: SAFE_FREIGHT_WIKI_NOTES, tree: SAFE_FREIGHT_WIKI_TREE });
  assert.match(wikiText, /150%/, '150% 예시 오해를 위키에서 추적해야 합니다.');
  assert.match(wikiText, /200%/, '200% 문구의 별도 문맥을 위키에서 추적해야 합니다.');
  assert.match(wikiText, /배차취소/, '배차취소 150%·200%는 제22호와 분리 안내해야 합니다.');
  assert.match(wikiText, /거리별 원운임/, '기점 할증 재산정 기준을 위키에서 추적해야 합니다.');
  assert.match(wikiText, /2차/, '2차 고시 대비 확장 가지를 위키트리에 준비해야 합니다.');
  assert.match(wikiText, /원문 위치/, '상세 노드에는 원문 페이지와 구간 위치가 표시되어야 합니다.');
});

test('안전운임 안내 UI는 모바일에서 요약과 포인트가 잘리지 않도록 구성한다', () => {
  const modalPage = read('../app/(main)/employees/safe-freight/page.js');
  const noticesPage = read('../app/(main)/employees/safe-freight/notices/page.js');
  const wikiPage = read('../app/(main)/employees/safe-freight/wiki/page.js');
  const modalCss = read('../app/(main)/employees/safe-freight/safe-freight.module.css');
  const noticesCss = read('../app/(main)/employees/safe-freight/notices/notices.module.css');
  const wikiCss = read('../app/(main)/employees/safe-freight/wiki/wiki.module.css');

  assert.match(modalPage, /noticeQuickGuide/, '모달에 산정 전 확인 박스가 있어야 합니다.');
  assert.match(modalPage, /noticePointList/, '모달에 장별 핵심 포인트 목록이 있어야 합니다.');
  assert.match(modalPage, /employees\/safe-freight\/wiki/, '메인 화면에서 고시해석 위키트리로 이동할 수 있어야 합니다.');
  assert.match(modalPage, /고시해석\(위키트리\)/, '메인 화면 링크명은 고시해석(위키트리)여야 합니다.');
  assert.match(modalPage, /noticeRefChip/, '모달 요약에는 원문 주석 칩이 있어야 합니다.');
  assert.match(noticesPage, /quickGuide/, '전용 페이지에도 산정 전 확인 박스가 있어야 합니다.');
  assert.match(noticesPage, /pointList/, '전용 페이지에도 장별 핵심 포인트 목록이 있어야 합니다.');
  assert.match(noticesPage, /refChip/, '전용 페이지 요약에는 원문 주석 칩이 있어야 합니다.');
  assert.match(wikiPage, /type="search"/, '고시해석 위키트리에는 검색 입력이 있어야 합니다.');
  assert.match(wikiPage, /filterTree/, '고시해석 위키트리는 트리 검색 필터를 제공해야 합니다.');
  assert.match(wikiPage, /고시해석\(위키트리\)/, '고시해석 위키트리 화면명은 고정되어야 합니다.');
  assert.doesNotMatch(modalPage, /onTouchMove=\{\(e\) => e\.preventDefault\(\)\}/, '오버레이가 내부 스크롤을 막으면 안 됩니다.');

  assert.match(modalCss, /\.noticeModalOverlay\s*\{[\s\S]*overflow-y:\s*auto/, '오버레이는 작은 화면에서 자체 스크롤 가능해야 합니다.');
  assert.match(modalCss, /\.noticeModal\s*\{[\s\S]*display:\s*flex/, '모달은 헤더/본문 flex 레이아웃이어야 합니다.');
  assert.match(modalCss, /\.noticeModal \.noticeList\s*\{[\s\S]*min-height:\s*0/, '모달 본문 스크롤 영역은 flex 축소가 가능해야 합니다.');
  assert.match(modalCss, /\.noticeSummary\s*\{[\s\S]*overflow-wrap:\s*anywhere/, '요약문은 긴 문장 줄바꿈이 가능해야 합니다.');
  assert.match(modalCss, /\.noticePointList/, '모달 핵심 포인트 스타일이 있어야 합니다.');
  assert.doesNotMatch(modalCss, /height:\s*75vh/, '모바일 모달 높이를 고정 vh로 되돌리면 안 됩니다.');
  assert.doesNotMatch(modalCss, /letter-spacing:\s*-/, '안전운임 화면에 음수 자간이 남으면 안 됩니다.');

  assert.match(noticesCss, /\.quickGuide/, '전용 페이지 산정 전 확인 스타일이 있어야 합니다.');
  assert.match(noticesCss, /\.pointList/, '전용 페이지 핵심 포인트 스타일이 있어야 합니다.');
  assert.match(noticesCss, /\.item\s*\{[\s\S]*overflow:\s*visible/, '전용 페이지 카드는 긴 안내를 자르면 안 됩니다.');
  assert.doesNotMatch(noticesCss, /letter-spacing:\s*-/, '전용 페이지에 음수 자간이 남으면 안 됩니다.');
  assert.match(wikiCss, /\.content\s*\{[\s\S]*grid-template-columns/, '고시해석 위키트리는 트리와 주석 패널을 나눠야 합니다.');
  assert.match(wikiCss, /\.sourceBadge/, '고시해석 위키트리는 상세 원문 위치 배지를 표시해야 합니다.');
  assert.doesNotMatch(wikiCss, /letter-spacing:\s*-/, '고시해석 위키트리에 음수 자간이 남으면 안 됩니다.');
});
