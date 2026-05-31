'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  SAFE_FREIGHT_NOTE_MAP,
  SAFE_FREIGHT_WIKI_NOTES,
  SAFE_FREIGHT_WIKI_TREE,
  SAFE_FREIGHT_WIKI_VERSION,
} from '../safe-freight-wiki';
import styles from './wiki.module.css';

const normalize = (value) => String(value || '').toLowerCase();

const countNodes = (nodes) => nodes.reduce((sum, node) => sum + 1 + countNodes(node.children || []), 0);

const collectNodeIds = (nodes) => nodes.flatMap((node) => [node.id, ...collectNodeIds(node.children || [])]);

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
    node.before,
    node.after,
    node.operation,
    node.caution,
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

export default function SafeFreightWikiPage() {
  const [query, setQuery] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState('GF-22-EX');
  const [expandedIds, setExpandedIds] = useState(() => new Set(collectNodeIds(SAFE_FREIGHT_WIKI_TREE)));

  const filteredTree = useMemo(() => filterTree(SAFE_FREIGHT_WIKI_TREE, query), [query]);
  const expandedForSearch = query.trim() ? new Set(collectNodeIds(filteredTree)) : expandedIds;
  const selectedNote = SAFE_FREIGHT_NOTE_MAP[selectedNoteId] || SAFE_FREIGHT_WIKI_NOTES[0];
  const totalNodeCount = countNodes(SAFE_FREIGHT_WIKI_TREE);
  const visibleNodeCount = countNodes(filteredTree);

  useEffect(() => {
    const applyHashNote = () => {
      const id = decodeURIComponent(window.location.hash.replace('#', ''));
      if (SAFE_FREIGHT_NOTE_MAP[id]) setSelectedNoteId(id);
    };
    applyHashNote();
    window.addEventListener('hashchange', applyHashNote);
    return () => window.removeEventListener('hashchange', applyHashNote);
  }, []);

  const toggleNode = (id) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNoteChips = (noteRefs = []) => (
    <div className={styles.noteChips} aria-label="관련 주석">
      {noteRefs.map((ref) => {
        const note = SAFE_FREIGHT_NOTE_MAP[ref];
        if (!note) return null;
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

  const renderNode = (node, depth = 0) => {
    const isOpen = expandedForSearch.has(node.id);
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;

    return (
      <li key={node.id} className={styles.treeNode} style={{ '--depth': depth }}>
        <button
          type="button"
          className={styles.nodeHead}
          onClick={() => hasChildren && toggleNode(node.id)}
          aria-expanded={hasChildren ? isOpen : undefined}
        >
          <span className={styles.toggleMark}>{hasChildren ? (isOpen ? '-' : '+') : ''}</span>
          <span className={styles.nodeTitle}>{node.title}</span>
          <span className={styles.statusBadge}>{node.status}</span>
        </button>
        <div className={styles.nodeBody}>
          <div className={styles.nodeMeta}>
            <span>{node.category}</span>
            {node.sourceLabel && <span className={styles.sourceBadge}>{node.sourceLabel}</span>}
            {renderNoteChips(node.noteRefs)}
          </div>
          <p className={styles.nodeSummary}>{node.summary}</p>
          <dl className={styles.changeGrid}>
            <div>
              <dt>기준/기존</dt>
              <dd>{node.before}</dd>
            </div>
            <div>
              <dt>변경/해석</dt>
              <dd>{node.after}</dd>
            </div>
            <div>
              <dt>실무 적용</dt>
              <dd>{node.operation}</dd>
            </div>
            <div>
              <dt>주의</dt>
              <dd>{node.caution}</dd>
            </div>
          </dl>
        </div>
        {hasChildren && isOpen && (
          <ul className={styles.childList}>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>컨테이너 안전운임 고시해석</p>
          <h1 className={styles.title}>고시해석(위키트리)</h1>
          <p className={styles.desc}>
            1차 고시, 1차 추가 운영지침, 1차-운영지침 해석을 리스트 3개·상세 7개 구조로 나누고 원문 페이지와 주석번호를 함께 추적합니다.
          </p>
        </div>
        <a className={styles.backLink} href="/employees/safe-freight">
          안전운임으로 돌아가기
        </a>
      </header>

      <section className={styles.answerBox} aria-label="이번 운영지침 핵심 답변">
        <strong>고시해석 핵심</strong>
        <p>
          이번 트리는 1차 고시 원문을 기준점으로 두고, 2026-04-01 추가 운영지침이 보강한 계산 예시와
          실무 예외를 별도 가지로 분리합니다. 제22호의 “높은 순 3개, 최고 1개 전액·나머지 50%” 규칙은
          유지되며, 운영지침은 인천·평택 기점 할증도 이 규칙 안에서 보라고 명확히 한 것입니다.
        </p>
        <p>
          150%는 새 상한이 아니라 예시 계산 결과입니다. 200%도 방사성물질 할증, 밥테일 운임 적용,
          배차취소 회차 기준처럼 문맥이 다르므로 상세 노드에서 페이지·구간별로 분리해 확인합니다.
        </p>
      </section>

      <section className={styles.searchPanel} aria-label="고시해석 검색">
        <label className={styles.searchLabel} htmlFor="safe-freight-wiki-search">
          검색
        </label>
        <input
          id="safe-freight-wiki-search"
          className={styles.searchInput}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예: 1차, 추가 운영지침, 인천, 150%, 제22호, 2차"
        />
        <div className={styles.searchMeta}>
          <span>버전 {SAFE_FREIGHT_WIKI_VERSION}</span>
          <span>표시 {visibleNodeCount} / 전체 {totalNodeCount}</span>
        </div>
      </section>

      <main className={styles.content}>
        <section className={styles.treePanel} aria-label="고시해석 위키트리">
          {filteredTree.length > 0 ? (
            <ul className={styles.treeList}>{filteredTree.map((node) => renderNode(node))}</ul>
          ) : (
            <p className={styles.empty}>검색 결과가 없습니다. 조문번호, 할증명, 비율 또는 항목명을 다시 입력해 주세요.</p>
          )}
        </section>

        <aside className={styles.notePanel} aria-label="선택 주석 상세">
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
      </main>
    </div>
  );
}
