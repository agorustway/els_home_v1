'use client';

import React, { useState } from 'react';
import { NOTICE_GUIDANCE_SOURCE, NOTICE_SECTIONS, NOTICE_SOURCE } from '../safe-freight-notice';
import { SAFE_FREIGHT_NOTE_MAP } from '../safe-freight-wiki';
import styles from './notices.module.css';

export default function NoticesPage() {
    const [expandedId, setExpandedId] = useState(null);

    return (
        <div className={styles.page}>
            {/* 상단 헤더 */}
            <header className={styles.header}>
                <div className={styles.headerInner}>
                    <h1 className={styles.title}>관련 법령·고시 안내</h1>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={() => window.close()}
                        aria-label="닫기"
                    >
                        ✕ 닫기
                    </button>
                </div>
                <p className={styles.source}>
                    {NOTICE_SOURCE}
                    <br />
                    {NOTICE_GUIDANCE_SOURCE}
                </p>
                <p className={styles.desc}>
                    부대조항을 압축 정리했습니다. 각 항목을 클릭하면 해당 조문 전체를 볼 수 있습니다.
                </p>
                <div className={styles.quickGuide} aria-label="안전운임 산정 핵심 확인사항">
                    <strong>산정 전 확인</strong>
                    <ul>
                        <li>인천·평택 기점 할증은 제22호 할증 3개 제한에 포함합니다.</li>
                        <li>기점 할증이 이미 들어간 구간표 운임은 추가 할증 시 거리별 원운임 기준을 확인합니다.</li>
                        <li>공휴일·심야는 전체 작업·운행 시간 중 해당 시간 비율만 적용합니다.</li>
                    </ul>
                    <a className={styles.wikiLink} href="/employees/safe-freight/wiki" target="_blank" rel="noreferrer">
                        고시해석(위키트리)에서 주석·페이지별로 보기
                    </a>
                </div>
            </header>

            {/* 법규 목록 */}
            <main className={styles.main}>
                <ul className={styles.list}>
                    {NOTICE_SECTIONS.map((sec) => {
                        const isOpen = expandedId === sec.id;
                        return (
                            <li key={sec.id} className={styles.item}>
                                {/* 제목 + 접기/펴기 */}
                                <button
                                    type="button"
                                    className={`${styles.itemHead} ${isOpen ? styles.itemHeadOpen : ''}`}
                                    onClick={() => setExpandedId(isOpen ? null : sec.id)}
                                    aria-expanded={isOpen}
                                >
                                    <span className={styles.itemTitle}>{sec.title}</span>
                                    <span className={styles.itemToggle}>
                                        {isOpen ? '▲ 접기' : '▼ 상세 보기'}
                                    </span>
                                </button>

                                {/* 요약 (항상 보임) */}
                                <div className={styles.summary}>{sec.summary}</div>
                                {Array.isArray(sec.noteRefs) && sec.noteRefs.length > 0 && (
                                    <div className={styles.refList} aria-label={`${sec.title} 관련 주석`}>
                                        {sec.noteRefs.map((ref) => {
                                            const note = SAFE_FREIGHT_NOTE_MAP[ref];
                                            return note ? (
                                                <a
                                                    key={ref}
                                                    className={styles.refChip}
                                                    href={`/employees/safe-freight/wiki#${ref}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    title={`${note.title} · ${note.source} ${note.page}`}
                                                >
                                                    [{note.shortLabel}] {note.page}
                                                </a>
                                            ) : null;
                                        })}
                                    </div>
                                )}
                                {Array.isArray(sec.points) && sec.points.length > 0 && (
                                    <ul className={styles.pointList}>
                                        {sec.points.map((point, idx) => (
                                            <li key={`${sec.id}-point-${idx}`}>{point}</li>
                                        ))}
                                    </ul>
                                )}

                                {/* 전문 (펼쳤을 때) */}
                                {isOpen && (
                                    <div className={styles.fullText}>
                                        <div className={styles.fullTextLabel}>조문 전문</div>
                                        {sec.fullText.split('\n').map((para, i) => {
                                            const trimmed = para.trim();
                                            if (!trimmed) return <br key={i} />;
                                            // 조항 번호로 시작하는 문단은 굵게
                                            const isClause = /^\d+\./.test(trimmed) || /^[가-힣]\./.test(trimmed);
                                            return (
                                                <p key={i} className={isClause ? styles.clause : styles.paragraph}>
                                                    {trimmed}
                                                </p>
                                            );
                                        })}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </main>

            {/* 하단 고정 버튼 */}
            <footer className={styles.footer}>
                <button
                    type="button"
                    className={styles.backBtn}
                    onClick={() => {
                        // window.close()가 안 되면 뒤로가기
                        window.close();
                        setTimeout(() => window.history.back(), 100);
                    }}
                >
                    ← 안전운임 페이지로 돌아가기
                </button>
            </footer>
        </div>
    );
}
