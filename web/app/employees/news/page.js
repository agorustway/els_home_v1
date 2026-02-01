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

    useEffect(() => {
        if (!role) return;
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
            .finally(() => setLoading(false));
    }, [role]);

    if (authLoading || !role) return null;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>뉴스</h1>
                <p className={styles.subtitle}>주요 뉴스를 확인할 수 있습니다.</p>
                {lastUpdated && (
                    <p className={styles.updated}>마지막 업데이트: {formatUpdateTime(lastUpdated)}</p>
                )}
            </div>

            <div className={styles.card}>
                {error && <p className={styles.error}>{error}</p>}
                {loading && <p className={styles.loading}>뉴스를 불러오는 중...</p>}

                {!loading && items.length === 0 && !error && (
                    <p className={styles.empty}>표시할 뉴스가 없습니다.</p>
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
                                            onError={(e) => { e.target.onerror = null; e.target.src = '/images/news-placeholder.svg'; }}
                                        />
                                    ) : (
                                        <div className={styles.thumbPlaceholder} aria-hidden />
                                    )}
                                </div>
                                <div className={styles.itemBody}>
                                    {item.link ? (
                                        <Link
                                            href={`/employees/news/article?url=${encodeURIComponent(item.link)}`}
                                            className={styles.link}
                                        >
                                            {item.title}
                                        </Link>
                                    ) : (
                                        <span className={styles.link}>{item.title}</span>
                                    )}
                                    {item.pubDate && (
                                        <span className={styles.meta}>{item.pubDate}</span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
