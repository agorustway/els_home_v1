'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'next/navigation';
import styles from './news.module.css';

function formatUpdateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatPubDate(pubDate) {
    if (!pubDate || typeof pubDate !== 'string') return '';
    try {
        const d = new Date(pubDate.trim());
        if (Number.isNaN(d.getTime())) return pubDate;
        const y = d.getFullYear();
        const month = d.getMonth() + 1;
        const date = d.getDate();
        const h = d.getHours();
        const m = d.getMinutes();
        return `${y}년 ${month}월 ${date}일 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    } catch {
        return pubDate;
    }
}

export default function NewsPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/news');
    }, [role, authLoading, router]);

    const fetchNews = () => {
        setLoading(true);
        setError(null);

        fetch('/api/news')
            .then((res) => res.json())
            .then((json) => {
                if (json.error) throw new Error(json.error);
                setItems(json.items || []);
                if (json.updatedAt) setLastUpdated(json.updatedAt);
            })
            .catch((e) => setError(e.message))
            .finally(() => {
                setLoading(false);
            });
    };

    useEffect(() => {
        if (!role) return;
        fetchNews();
    }, [role]);

    if (authLoading || !role) return null;

    return (
        <div className={styles.page}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>연합뉴스</h1>
                <p className={styles.subtitle}>실시간 주요 기사를 한눈에 확인하세요.</p>

                {lastUpdated && (
                    <p className={styles.updated}>업데이트: {formatUpdateTime(lastUpdated)}</p>
                )}
            </div>

            <div className={styles.card}>
                {error && <div className={styles.errorBox}><p className={styles.error}>{error}</p></div>}
                {loading && <p className={styles.loading}>뉴스를 수집하는 중입니다...</p>}

                {!loading && items.length === 0 && !error && (
                    <p className={styles.empty}>뉴스를 불러올 수 없습니다.</p>
                )}

                {!loading && items.length > 0 && (
                    <ul className={styles.list}>
                        {items.map((item, i) => (
                            <li key={i} className={styles.item}>
                                <div className={styles.thumbWrap}>
                                    {item.thumbnail ? (
                                        <img
                                            src={item.thumbnail}
                                            alt=""
                                            className={styles.thumb}
                                            decoding="async"
                                            loading="lazy"
                                            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                        />
                                    ) : null}
                                    <div className={styles.thumbPlaceholder} style={{ display: item.thumbnail ? 'none' : 'flex' }} aria-hidden />
                                </div>
                                <div className={styles.itemBody}>
                                    <div className={styles.itemTop}>
                                        <span className={styles.sourceTag}>연합뉴스</span>
                                        {item.pubDate && (
                                            <span className={styles.meta}>{formatPubDate(item.pubDate)}</span>
                                        )}
                                    </div>
                                    <Link
                                        href={`/employees/news/article?url=${encodeURIComponent(item.link)}`}
                                        className={styles.link}
                                    >
                                        <h2 className={styles.itemTitle}>{item.title}</h2>
                                    </Link>
                                    <div className={styles.itemActions}>
                                        <a href={item.link} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>원본으로 보기 ↗</a>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
