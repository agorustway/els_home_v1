'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from './article.module.css';

function ArticleContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { role, loading: authLoading } = useUserRole();
    const url = searchParams.get('url');

    // 인증 로딩 중이거나 역할이 없으면 로그인 페이지로 리디렉션
    // 뉴스 목록으로 가는 Link가 있으니 별도 로직 불필요
    // useEffect(() => {
    //     if (!authLoading && !role) router.replace('/login?next=/employees/news');
    // }, [role, authLoading, router]);

    if (authLoading || !role) return null; // 인증 로딩 중이거나 역할이 없으면 렌더링하지 않음
    if (!url) return <div className={styles.page}><p className={styles.error}>기사 URL이 없습니다.</p></div>;

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <iframe
                    src={url}
                    className={styles.articleIframe}
                    title="뉴스 기사 본문"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals" // 팝업만 막고 스크립트 등 기본 동작 허용
                />
                <div className={styles.iframeFooter}>
                    <Link href="/employees/news" className={styles.backLink}>← 뉴스 목록</Link>
                    <a href={url} target="_blank" rel="noopener noreferrer" className={styles.originalLink}>새 창에서 보기</a>
                </div>
            </div>
        </div>
    );
}

export default function NewsArticlePage() {
    return (
        <Suspense fallback={<div className={styles.page}><p className={styles.loading}>뉴스 기사를 불러오는 중...</p></div>}>
            <ArticleContent />
        </Suspense>
    );
}
