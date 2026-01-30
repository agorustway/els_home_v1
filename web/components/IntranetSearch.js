'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MAIN_TABS, SIDEBAR_ITEMS } from '@/constants/intranetMenu';
import styles from './IntranetSearch.module.css';

const ALL_MENUS = [
    ...MAIN_TABS.map((t) => ({ label: t.label, path: t.defaultPath, type: 'menu' })),
    ...Object.values(SIDEBAR_ITEMS).flat().map((item) => ({ ...item, type: 'menu' })),
];

function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debouncedValue;
}

export default function IntranetSearch({ placeholder = '메뉴·게시글 검색', className = '' }) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [menuHits, setMenuHits] = useState([]);
    const [postHits, setPostHits] = useState([]);
    const wrapperRef = useRef(null);

    const debouncedQuery = useDebounce(query.trim(), 300);

    const searchPosts = useCallback(async (q) => {
        if (q.length < 2) return [];
        const res = await fetch(`/api/employees/search?q=${encodeURIComponent(q)}`);
        const data = await res.json().catch(() => ({}));
        return data.posts || [];
    }, []);

    useEffect(() => {
        if (debouncedQuery.length < 2) {
            setMenuHits([]);
            setPostHits([]);
            return;
        }
        const q = debouncedQuery.toLowerCase();
        const menus = ALL_MENUS.filter((m) => m.label.toLowerCase().includes(q));
        setMenuHits(menus);

        setLoading(true);
        searchPosts(debouncedQuery)
            .then((posts) => setPostHits(posts))
            .finally(() => setLoading(false));
    }, [debouncedQuery, searchPosts]);

    useEffect(() => {
        function handleClickOutside(e) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const hasResults = menuHits.length > 0 || postHits.length > 0;
    const showDropdown = open && (query.trim().length >= 2 && (hasResults || loading));

    const navigateTo = (path) => {
        setOpen(false);
        setQuery('');
        router.push(path);
    };

    const boardTypeLabel = (type) => {
        if (type === 'free') return '자유게시판';
        if (type === 'report') return '업무보고';
        if (type === 'webzine') return '웹진';
        return type;
    };

    return (
        <div className={`${styles.wrap} ${className}`} ref={wrapperRef}>
            <input
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setOpen(e.target.value.trim().length >= 2);
                }}
                onFocus={() => query.trim().length >= 2 && setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') setOpen(false);
                }}
                placeholder={placeholder}
                className={styles.input}
                aria-label="인트라넷 메뉴·게시글 검색"
                autoComplete="off"
            />
            {showDropdown && (
                <div className={styles.dropdown}>
                    {loading && !postHits.length && (
                        <div className={styles.loading}>검색 중...</div>
                    )}
                    {menuHits.length > 0 && (
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>메뉴</div>
                            {menuHits.slice(0, 8).map((m, i) => (
                                <button
                                    key={`${m.path}-${i}`}
                                    type="button"
                                    className={styles.item}
                                    onClick={() => navigateTo(m.path)}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {postHits.length > 0 && (
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>게시글</div>
                            {postHits.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    className={styles.item}
                                    onClick={() => navigateTo(p.path)}
                                >
                                    <span className={styles.itemMeta}>{boardTypeLabel(p.board_type)}</span>
                                    {p.title}
                                </button>
                            ))}
                        </div>
                    )}
                    {!loading && debouncedQuery.length >= 2 && !hasResults && (
                        <div className={styles.empty}>검색 결과가 없습니다.</div>
                    )}
                </div>
            )}
        </div>
    );
}
