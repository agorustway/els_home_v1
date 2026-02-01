'use client';

import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SubPageHero from '@/components/SubPageHero';
import SubNav from '@/components/SubNav';
import EmployeeHeader from '@/components/EmployeeHeader';
import EmployeeSidebar from '@/components/EmployeeSidebar';
import { MINIMAL_LAYOUT_PATHS, getHeroForPath } from '@/constants/siteLayout';
import styles from './SiteLayout.module.css';

export default function SiteLayout({ children }) {
    const pathname = usePathname();
    const isMinimal = MINIMAL_LAYOUT_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
    const isEmployees = pathname?.startsWith('/employees') || pathname?.startsWith('/admin');
    const hero = getHeroForPath(pathname);

    if (isMinimal) {
        return <>{children}</>;
    }

    // 랜딩(홈): 헤더 + 본문 + 푸터만 (원래 구성)
    if (pathname === '/') {
        return (
            <>
                <Header />
                {children}
                <Footer />
            </>
        );
    }

    // 인트라넷: 헤더, 히어로, EmployeeHeader, 본문은 사이드 메뉴 + 메인
    if (isEmployees) {
        return (
            <>
                <Header />
                {hero && (
                    <SubPageHero title={hero.title} subtitle={hero.subtitle} bgImage={hero.bgImage} />
                )}
                <EmployeeHeader />
                <div className={styles.bodyWrap}>
                    <EmployeeSidebar />
                    <main className={styles.mainContent}>{children}</main>
                </div>
                <Footer />
            </>
        );
    }

    // 그 외 서브 페이지: 헤더, 히어로, 상단 네비, 메인(사이드 없음), 푸터
    return (
        <>
            <Header />
            {hero && (
                <SubPageHero title={hero.title} subtitle={hero.subtitle} bgImage={hero.bgImage} />
            )}
            <SubNav />
            <main className={styles.mainContent}>{children}</main>
            <Footer />
        </>
    );
}
