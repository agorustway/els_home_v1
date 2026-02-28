'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'next/navigation';
import styles from './news.module.css';
import { motion } from 'framer-motion';

function formatUpdateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getHours()}시 ${d.getMinutes()}분 ${d.getSeconds()}초`;
}

function formatPubDate(pubDate) {
    if (!pubDate) return '';
    try {
        const d = new Date(pubDate);
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return pubDate; }
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
            .finally(() => setLoading(false));
    };

    useEffect(() => { if (role) fetchNews(); }, [role]);

    if (authLoading || !role) return null;

    const headline = items[0];
    const restNews = items.slice(1);

    return (
        <div className={styles.page}>
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>실시간 연합뉴스 대시보드</h1>
                <p className={styles.subtitle}>오늘의 주요 기사와 실시간 뉴스를 카드 모듈 형식으로 제공합니다.</p>
                {lastUpdated && <p className={styles.updated}>최종 업데이트: {formatUpdateTime(lastUpdated)}</p>}
            </div>

            {loading ? (
                <div className={styles.card}><p className={styles.loading}>최신 뉴스를 수집하는 중입니다...</p></div>
            ) : error ? (
                <div className={styles.card}><p className={styles.error}>{error}</p></div>
            ) : (
                <div className={styles.splitLayout}>
                    {/* 1열: 주요 헤드라인 */}
                    <aside className={styles.column}>
                        <h2 className={styles.sectionTitle}>오늘의 헤드라인</h2>
                        {headline && (
                            <Link href={`/employees/news/article?url=${encodeURIComponent(headline.link)}`} className={styles.card + ' ' + styles.headlineCard}>
                                {headline.thumbnail && <img src={headline.thumbnail} alt="" className={styles.headlineThumb} onError={(e) => { e.target.onerror = null; e.target.src = '/images/news-placeholder.svg'; }} />}
                                <div className={styles.headlineBody}>
                                    <span className={styles.headlineTag}>TOP NEWS</span>
                                    <h2 className={styles.headlineTitle}>{headline.title}</h2>
                                    <div className={styles.newsMeta}>{formatPubDate(headline.pubDate)} · 연합뉴스</div>
                                </div>
                            </Link>
                        )}
                    </aside>

                    {/* 2열: 뉴스 그리드 */}
                    <main className={styles.column}>
                        <h2 className={styles.sectionTitle}>최신 기사 리스트</h2>
                        <div className={styles.newsGrid}>
                            {restNews.map((item, i) => (
                                <Link key={i} href={`/employees/news/article?url=${encodeURIComponent(item.link)}`} className={styles.newsItem}>
                                    {item.thumbnail && <img src={item.thumbnail} alt="" className={styles.newsThumbSmall} onError={(e) => { e.target.onerror = null; e.target.src = '/images/news-placeholder.svg'; }} />}
                                    <div className={styles.newsBody}>
                                        <h3 className={styles.newsTitle}>{item.title}</h3>
                                        <div className={styles.newsMeta}>{formatPubDate(item.pubDate)}</div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </main>

                    {/* 3열: 상태 및 기타 */}
                    <aside className={styles.column}>
                        <h2 className={styles.sectionTitle}>뉴스 센터 정보</h2>
                        <div className={styles.card + ' ' + styles.statusCard}>
                            <div className={styles.statusItem}><span>기사 수</span><strong>{items.length}개</strong></div>
                            <div className={styles.statusItem}><span>출처</span><strong>연합뉴스 (Yonhap)</strong></div>
                            <div className={styles.statusItem}><span>상태</span><strong style={{ color: '#059669' }}>정상 작동 중</strong></div>
                        </div>
                        <div className={styles.card}>
                            <h3 style={{ fontSize: '0.9rem', marginBottom: '10px' }}>💡 이용 안내</h3>
                            <p style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                                제목을 클릭하면 상세 내용을 확인하실 수 있습니다. 실시간으로 수집되는 정보이므로 가장 최신 소식을 전해드립니다.
                            </p>
                        </div>
                    </aside>
                </div>
            )}
        </div>
    );
}