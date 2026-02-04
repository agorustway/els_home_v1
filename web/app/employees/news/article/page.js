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
            <div className={styles.header}>
                <Link href="/employees/news" className={styles.backLink}>← 뉴스 목록</Link>
            </div>
            <div className={styles.card}>
                <p className={styles.infoText}>
                    뉴스 본문이 바로 보이지 않거나 광고가 많을 경우, 우측 상단의 <a href={url} target="_blank" rel="noopener noreferrer" className={styles.originalLink}>새 창에서 보기</a>를 이용해 주세요.
                </p>
                <iframe
                    src={url}
                    className={styles.articleIframe}
                    title="뉴스 기사 본문"
                    // sandbox 속성을 사용하여 보안 강화 및 팝업 차단
                    // allow-scripts: iframe 내 스크립트 실행 허용 (기사 내용 표시를 위해 필요)
                    // allow-same-origin: 동일 출처 스크립트 허용 (일부 기능 동작에 필요할 수 있으나, 외부 사이트에서는 제한적)
                    // allow-popups: 팝업 차단 (이것을 제거하면 팝업이 막힘)
                    // allow-forms: 폼 제출 허용
                    // allow-modals: 모달 허용 (alert, confirm 등)
                    // allow-top-navigation: iframe 내에서 최상위 창 탐색 허용 (이것을 제거하면 iframe 내에서 새 페이지로 이동하는 것이 제한됨)
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals" // 팝업만 막고 스크립트 등 기본 동작 허용
                />
                <div className={styles.iframeFooter}>
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
