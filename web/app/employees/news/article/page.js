'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from './article.module.css';

function ArticleContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { role, loading: authLoading } = useUserRole();
    const url = searchParams.get('url');
    const [article, setArticle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/news');
    }, [role, authLoading, router]);

    useEffect(() => {
        if (!role || !url) {
            if (!url && !authLoading) router.replace('/employees/news');
            return;
        }
        setLoading(true);
        setError(null);
        fetch(`/api/news/article?url=${encodeURIComponent(url)}`)
            .then(async (res) => {
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return res.json();
                }
                const text = await res.text();
                throw new Error('뉴스 본문을 불러올 수 없습니다. 아래 [원본 보기]를 이용해주세요.');
            })
            .then((json) => {
                if (json.error && !json.content) {
                    setError(json.error);
                    setArticle(null);
                } else {
                    setError(null);
                    setArticle({ title: json.title || '', content: json.content || '', source: json.source });
                }
            })
            .catch((e) => {
                console.error('Fetch error:', e);
                setError(e.message || '본문을 불러올 수 없습니다.');
                setArticle(null);
            })
            .finally(() => setLoading(false));
    }, [role, url, authLoading, router]);

    if (authLoading || !role) return null;
    if (!url) return null;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <Link href="/employees/news" className={styles.backLink}>← 뉴스 목록</Link>
            </div>
            <div className={styles.card}>
                {loading && <p className={styles.loading}>본문을 불러오는 중...</p>}
                {error && !article && (
                    <div className={styles.errorBlock}>
                        <p className={styles.error}>{error}</p>
                        <p className={styles.errorHint}>원본에서 기사를 확인할 수 있습니다.</p>
                        <a href={url} target="_blank" rel="noopener noreferrer" className={styles.originalLink}>원본 보기</a>
                    </div>
                )}
                {article && (
                    <>
                        <h1 className={styles.title}>{article.title}</h1>
                        {article.source && (
                            <p className={styles.source}>
                                출처: <a href={article.source} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>{article.source}</a>
                            </p>
                        )}
                        <div
                            className={styles.body}
                            dangerouslySetInnerHTML={{ __html: article.content }}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

export default function NewsArticlePage() {
    return (
        <Suspense fallback={<div className={styles.page}><p className={styles.loading}>로딩 중...</p></div>}>
            <ArticleContent />
        </Suspense>
    );
}
