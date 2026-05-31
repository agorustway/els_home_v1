'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { NOTICE_SECTIONS } from '../safe-freight-notice';
import {
  SAFE_FREIGHT_NOTE_MAP,
  SAFE_FREIGHT_WIKI_NOTES,
  SAFE_FREIGHT_WIKI_TREE,
  SAFE_FREIGHT_WIKI_VERSION,
} from '../safe-freight-wiki';
import styles from './wiki.module.css';

const normalize = (value) => String(value || '').toLowerCase();

const flattenTree = (nodes) => nodes.flatMap((node) => [node, ...flattenTree(node.children || [])]);

const collectNodeIds = (nodes) => nodes.flatMap((node) => [node.id, ...collectNodeIds(node.children || [])]);

const findNode = (nodes, id) => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children || [], id);
    if (child) return child;
  }
  return null;
};

const nodeText = (node) => {
  const noteText = (node.noteRefs || [])
    .map((ref) => {
      const note = SAFE_FREIGHT_NOTE_MAP[ref];
      return note ? `${note.shortLabel} ${note.title} ${note.page} ${note.summary}` : '';
    })
    .join(' ');
  return [
    node.title,
    node.status,
    node.category,
    node.sourceLabel,
    node.summary,
    (node.tags || []).join(' '),
    noteText,
  ].join(' ');
};

const filterTree = (nodes, query) => {
  const q = normalize(query).trim();
  if (!q) return nodes;

  return nodes
    .map((node) => {
      const children = filterTree(node.children || [], query);
      const ownMatch = normalize(nodeText(node)).includes(q);
      if (!ownMatch && children.length === 0) return null;
      return { ...node, children };
    })
    .filter(Boolean);
};

const splitParagraphs = (text) => String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);

const DETAIL_PARAGRAPHS = {
  'guidance-1st': [
    '1차 운영지침은 2026년 1차 고시를 새 운임표로 다시 고친 문서가 아니라, 고시 원문을 현장에서 적용할 때 헷갈리는 계산 순서와 예외를 질의응답 형태로 보완한 자료입니다.',
    '따라서 먼저 1차 고시의 원운임과 조문을 확정하고, 그 다음 운영지침에서 제22호 예시, 인천·평택 구간표 재산정, 공휴일·심야 비례 적용, X-ray와 공컨 예외를 확인해야 합니다.',
  ],
  'guidance-1st-overview': [
    '운영지침 p.1은 기존운임과 복화운송 정의를 보완합니다. 기존운임은 안전운임 대상이 아니던 협의운임이 안전운임 고시로 새로 편입되는 경우를 말하고, 이미 고시된 운임이 변경 고시로 인하된 경우와는 구분합니다.',
    '복화운송은 상행·하행 모두 내품이 있는 컨테이너 운송을 전제로 하므로, 단순 공컨 이동이나 재고 보충과 섞어서 보면 안 됩니다.',
  ],
  'guidance-1st-surcharge': [
    '운영지침 p.2는 제22호 계산을 예시로 다시 풉니다. 화약류 100% + 중량 80% + 공휴일 20% + 심야 20%는 높은 순 3개만 남겨 100% + 40% + 10% = 150%입니다.',
    '인천·평택 기점 할증도 제22호 규칙 안의 할증 후보입니다. 화약류 100% + 인천 20% + 심야 20%는 100% + 10% + 10% = 120%입니다.',
    '구간표 금액에 인천·평택 기점 할증이 이미 들어가 있는데 더 높은 할증이 함께 붙는 경우, 이미 할증된 구간표 금액을 그대로 쓰지 않고 거리별 원운임 기준으로 되돌려 계산합니다.',
  ],
  'guidance-1st-exception': [
    '운영지침 p.5-6은 탱크·냉동·냉장과 공휴일·심야 예외를 보완합니다. 냉동 발전기 부착 샤시는 장치 가동 여부와 무관하게 할증 대상이지만, 상·하행 모두 공컨 운송이면 탱크 및 냉동·냉장 할증을 적용하지 않습니다.',
    '공휴일·심야는 전체 작업 또는 운행 시간이 전부 해당될 때만 20% 전체를 봅니다. 일부 시간만 걸치면 해당 시간 비율만큼만 적용합니다.',
    '운영지침 p.7은 X-ray 10만 원 지급 원칙에 예외를 둡니다. 차주가 영수증 제출 후 화주에게 실비를 반환받는 것으로 협의된 경우에는 중복 지급을 피해야 합니다.',
  ],
  'guidance-1st-distance-fuel': [
    '운영지침 p.10-12는 공차운행, 철도 CY 직송, 다중 작업지 거리측정처럼 운행 경로가 단순 왕복이 아닌 경우의 판단 기준을 보완합니다.',
    '운영지침 p.11의 선박이용료는 운임표 안에 묻어 두는 비용이 아니라 도선, 대형교량 왕복 통행료, 인천공항 주차료처럼 실제 발생 시 실비로 추가하는 항목입니다.',
    '운영지침 p.13-14는 유가 반영 주기를 설명합니다. 3개월 평균 유가가 기준 대비 50원 이상 변동할 때 다음 적용기간 운임에 반영합니다.',
  ],
  'diff-1st-guidance': [
    '이 가지는 1차 고시와 1차 운영지침을 나란히 놓고 “실무 판단이 달라지는 부분”만 모아 보는 영역입니다.',
    '운영지침이 고시 문구를 삭제하거나 새 고시로 대체한 것이 아니라, 중복 산정 방지와 예외 확인을 위해 계산 순서와 문맥을 명확히 한 항목을 변경건으로 추적합니다.',
  ],
  'diff-surcharge-aggregation': [
    '변경 핵심은 제22호의 원칙 자체가 새로 생긴 것이 아니라, 인천·평택 기점 할증도 그 원칙 안에 들어간다는 점을 분명히 한 것입니다.',
    '구간표에 이미 기점 할증이 포함된 금액을 기준으로 다시 다른 할증을 붙이면 중복 산정이 됩니다. 운영지침은 이런 경우 거리별 원운임으로 되돌린 뒤 높은 순 3개 규칙을 적용하라는 의도입니다.',
  ],
  'diff-time-empty-xray': [
    '공휴일·심야는 “해당 시간에 조금이라도 걸치면 20% 전체”가 아니라, 전체 작업·운행 시간 중 해당 시간 비율만큼입니다.',
    '탱크·냉동·냉장은 공컨 예외를 함께 봐야 하고, X-ray는 실제 비용 반환 협의가 있으면 10만 원 지급을 그대로 적용하지 않습니다.',
  ],
  'diff-rate-context': [
    '150%는 제22호 예시에서 나온 계산 결과입니다. 일반 상한이 없어졌거나 새로 150% 상한이 생긴 의미가 아닙니다.',
    '200%는 방사성물질 할증률, 밥테일 왕복 횟수 운임 기준, 배차취소 회차 기준처럼 서로 다른 조문에서 쓰입니다. 숫자만 보고 같은 기준으로 묶으면 안 됩니다.',
  ],
  'notice-2nd': [
    '2차 고시는 아직 공표 전이므로 현재 계산에는 적용하지 않습니다. 이 가지는 나중에 2차 문서가 들어올 때 원문과 변경건을 같은 방식으로 붙이기 위한 자리입니다.',
  ],
  'future-2nd-original': [
    '2차 고시가 나오면 고시번호, 공표일, 적용기간, 운임표, 부대조항 페이지를 먼저 원문 상세로 등록합니다.',
    '1차처럼 제1장부터 장/조문 단위로 쪼개고, 각 항목에는 페이지·조문·산식 영향·화면 반영 여부를 붙입니다.',
  ],
  'future-2nd-diff': [
    '2차 원문을 등록한 다음 1차 고시와 1차 운영지침 대비 삭제, 유지, 변경, 신설 항목을 비교합니다.',
    '운임 금액표 변경인지, 해석 문구 변경인지, 적용기간 변경인지, UI 산식 변경인지 분리해 기록해야 검색과 검증이 쉬워집니다.',
  ],
};

export default function SafeFreightWikiPage() {
  const [query, setQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('notice-1st');
  const [selectedNoteId, setSelectedNoteId] = useState('GF-22-EX');
  const [expandedIds, setExpandedIds] = useState(() => new Set(collectNodeIds(SAFE_FREIGHT_WIKI_TREE)));

  const flatNodes = useMemo(() => flattenTree(SAFE_FREIGHT_WIKI_TREE), []);
  const filteredTree = useMemo(() => filterTree(SAFE_FREIGHT_WIKI_TREE, query), [query]);
  const expandedForSearch = query.trim() ? new Set(collectNodeIds(filteredTree)) : expandedIds;
  const selectedNode = findNode(SAFE_FREIGHT_WIKI_TREE, selectedNodeId) || SAFE_FREIGHT_WIKI_TREE[0];
  const selectedNote = SAFE_FREIGHT_NOTE_MAP[selectedNoteId] || SAFE_FREIGHT_WIKI_NOTES[0];
  const visibleNodeCount = flattenTree(filteredTree).length;

  useEffect(() => {
    const applyHash = () => {
      const id = decodeURIComponent(window.location.hash.replace('#', ''));
      if (SAFE_FREIGHT_NOTE_MAP[id]) setSelectedNoteId(id);
      if (flatNodes.some((node) => node.id === id)) setSelectedNodeId(id);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [flatNodes]);

  const handleNodeSelect = (node) => {
    setSelectedNodeId(node.id);
    if (Array.isArray(node.noteRefs) && node.noteRefs.length > 0) {
      setSelectedNoteId(node.noteRefs[0]);
    }
    if (node.children?.length) {
      setExpandedIds((current) => {
        const next = new Set(current);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    }
    window.history.replaceState(null, '', `#${node.id}`);
  };

  const renderNoteChips = (noteRefs = []) => {
    const validRefs = noteRefs.filter((ref) => SAFE_FREIGHT_NOTE_MAP[ref]);
    if (validRefs.length === 0) return null;
    return (
      <div className={styles.noteChips} aria-label="관련 주석">
        {validRefs.map((ref) => {
          const note = SAFE_FREIGHT_NOTE_MAP[ref];
          return (
            <button
              key={ref}
              type="button"
              className={`${styles.noteChip} ${selectedNote.id === ref ? styles.noteChipActive : ''}`}
              onClick={() => setSelectedNoteId(ref)}
              title={`${note.title} · ${note.source} ${note.page}`}
            >
              [{note.shortLabel}] {note.page}
            </button>
          );
        })}
      </div>
    );
  };

  const renderTreeNode = (node, depth = 0) => {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isOpen = expandedForSearch.has(node.id);
    const isActive = selectedNode.id === node.id;

    return (
      <li key={node.id} className={styles.navNode} style={{ '--depth': depth }}>
        <button
          type="button"
          className={`${styles.navButton} ${isActive ? styles.navButtonActive : ''}`}
          onClick={() => handleNodeSelect(node)}
          aria-current={isActive ? 'page' : undefined}
          aria-expanded={hasChildren ? isOpen : undefined}
        >
          <span className={styles.navToggle}>{hasChildren ? (isOpen ? '-' : '+') : ''}</span>
          <span className={styles.navText}>
            <strong>{node.title}</strong>
            <small>{node.status}</small>
          </span>
        </button>
        {hasChildren && isOpen && (
          <ul className={styles.navChildren}>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const renderNoticeArticle = (section, index) => (
    <article key={section.id} className={styles.noticeArticle} id={`notice-${section.id}`}>
      <div className={styles.articleHead}>
        <span className={styles.articleOrder}>{String(index + 1).padStart(2, '0')}</span>
        <div>
          <h3>{section.title}</h3>
          <p>{section.summary}</p>
        </div>
      </div>
      {renderNoteChips(section.noteRefs)}
      <div className={styles.pointBox}>
        <strong>핵심 확인사항</strong>
        <ul>
          {section.points.map((point, pointIndex) => (
            <li key={`${section.id}-point-${pointIndex}`}>{point}</li>
          ))}
        </ul>
      </div>
      <div className={styles.fullTextBox}>
        <strong>원문 구간</strong>
        {splitParagraphs(section.fullText).map((paragraph, paragraphIndex) => (
          <p key={`${section.id}-paragraph-${paragraphIndex}`}>{paragraph}</p>
        ))}
      </div>
    </article>
  );

  const renderNodeDetail = (node) => {
    const paragraphs = DETAIL_PARAGRAPHS[node.id] || [node.summary];
    return (
      <section className={styles.nodeDetail}>
        {paragraphs.map((paragraph, index) => (
          <p key={`${node.id}-paragraph-${index}`}>{paragraph}</p>
        ))}
        {renderNoteChips(node.noteRefs)}
      </section>
    );
  };

  const renderGuidanceDocument = (node) => {
    const nodes = node.id === 'guidance-1st'
      ? [node, ...(node.children || [])]
      : [node];
    return (
      <div className={styles.documentSections}>
        {nodes.map((item) => (
          <article key={item.id} className={styles.wikiArticle}>
            <div className={styles.articleMeta}>
              <span>{item.category}</span>
              <span>{item.sourceLabel}</span>
            </div>
            <h3>{item.title}</h3>
            <p className={styles.articleSummary}>{item.summary}</p>
            {renderNodeDetail(item)}
          </article>
        ))}
      </div>
    );
  };

  const renderDiffDocument = (node) => {
    const nodes = node.id === 'diff-1st-guidance'
      ? [node, ...(node.children || [])]
      : [node];
    return (
      <div className={styles.documentSections}>
        {nodes.map((item) => (
          <article key={item.id} className={styles.wikiArticle}>
            <div className={styles.articleMeta}>
              <span>{item.status}</span>
              <span>{item.sourceLabel}</span>
            </div>
            <h3>{item.title}</h3>
            <p className={styles.articleSummary}>{item.summary}</p>
            {renderNodeDetail(item)}
          </article>
        ))}
      </div>
    );
  };

  const renderFutureDocument = (node) => {
    const nodes = node.id === 'notice-2nd'
      ? [node, ...(node.children || [])]
      : [node];
    return (
      <div className={styles.documentSections}>
        {nodes.map((item) => (
          <article key={item.id} className={styles.futureArticle}>
            <div className={styles.articleMeta}>
              <span>{item.status}</span>
              <span>{item.sourceLabel}</span>
            </div>
            <h3>{item.title}</h3>
            <p className={styles.articleSummary}>{item.summary}</p>
            {renderNodeDetail(item)}
          </article>
        ))}
      </div>
    );
  };

  const renderSelectedDocument = () => {
    if (selectedNode.documentKind === 'first-notice-section') {
      const section = NOTICE_SECTIONS.find((item) => item.id === selectedNode.sectionId);
      return section ? renderNoticeArticle(section, NOTICE_SECTIONS.findIndex((item) => item.id === section.id)) : null;
    }

    if (selectedNode.documentKind === 'first-notice') {
      return (
        <div className={styles.documentSections}>
          {NOTICE_SECTIONS.map((section, index) => renderNoticeArticle(section, index))}
        </div>
      );
    }

    if (selectedNode.documentKind === 'guidance' || selectedNode.documentKind === 'guidance-section') {
      return renderGuidanceDocument(selectedNode);
    }

    if (selectedNode.documentKind === 'diff' || selectedNode.documentKind === 'diff-section') {
      return renderDiffDocument(selectedNode);
    }

    return renderFutureDocument(selectedNode);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>컨테이너 안전운임 고시해석</p>
          <h1 className={styles.title}>고시해석(위키트리)</h1>
          <p className={styles.desc}>
            왼쪽 트리에서 1차 고시, 1차 운영지침, 1차-1차 운영지침 변경건, 2차 고시 예정 가지를 선택하면 오른쪽 문서가 바뀝니다.
          </p>
        </div>
        <a className={styles.backLink} href="/employees/safe-freight">
          안전운임으로 돌아가기
        </a>
      </header>

      <section className={styles.answerBox} aria-label="고시해석 위키트리 사용 기준">
        <strong>트리 기준</strong>
        <p>
          1차 고시는 스크린샷의 관련 법령·고시 안내를 더 상세하게 풀어쓴 원문 축입니다.
          1차 운영지침은 2026-04-01 추가 해석 자료이고, 1차-1차 운영지침 변경건은 실제 판단이 달라지는 항목만 따로 비교합니다.
        </p>
      </section>

      <main className={styles.wikiShell}>
        <aside className={styles.treeRail} aria-label="고시해석 위키트리 목차">
          <div className={styles.treeSticky}>
            <label className={styles.searchLabel} htmlFor="safe-freight-wiki-search">
              위키트리 검색
            </label>
            <input
              id="safe-freight-wiki-search"
              className={styles.searchInput}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예: 1차, 제22호, 인천, 150%, 2차"
            />
            <div className={styles.searchMeta}>
              <span>버전 {SAFE_FREIGHT_WIKI_VERSION}</span>
              <span>표시 {visibleNodeCount} / 전체 {flatNodes.length}</span>
            </div>
            {filteredTree.length > 0 ? (
              <ul className={styles.navTree}>{filteredTree.map((node) => renderTreeNode(node))}</ul>
            ) : (
              <p className={styles.empty}>검색 결과가 없습니다.</p>
            )}
          </div>
        </aside>

        <section className={styles.documentPanel} aria-live="polite">
          <div className={styles.documentHeader}>
            <div>
              <p>{selectedNode.category}</p>
              <h2>{selectedNode.title}</h2>
              <span>{selectedNode.sourceLabel}</span>
            </div>
            <strong>{selectedNode.status}</strong>
          </div>
          <p className={styles.documentIntro}>{selectedNode.summary}</p>
          {renderNoteChips(selectedNode.noteRefs)}

          <div className={styles.documentGrid}>
            <div className={styles.documentMain}>{renderSelectedDocument()}</div>
            <aside className={styles.referencePanel} aria-label="선택 주석 상세">
              <div className={styles.noteSticky}>
                <h2>주석 상세</h2>
                <article id={selectedNote.id} className={styles.noteCard}>
                  <div className={styles.noteCardHead}>
                    <span className={styles.noteId}>[{selectedNote.shortLabel}]</span>
                    <strong>{selectedNote.title}</strong>
                  </div>
                  <dl className={styles.noteInfo}>
                    <div>
                      <dt>출처</dt>
                      <dd>{selectedNote.source}</dd>
                    </div>
                    <div>
                      <dt>위치</dt>
                      <dd>{selectedNote.page} · {selectedNote.clause}</dd>
                    </div>
                  </dl>
                  <p>{selectedNote.summary}</p>
                </article>

                <h3>전체 주석</h3>
                <div className={styles.noteIndex}>
                  {SAFE_FREIGHT_WIKI_NOTES.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      className={`${styles.noteIndexButton} ${selectedNote.id === note.id ? styles.noteIndexButtonActive : ''}`}
                      onClick={() => setSelectedNoteId(note.id)}
                    >
                      <span>[{note.shortLabel}]</span>
                      <span>{note.page}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
