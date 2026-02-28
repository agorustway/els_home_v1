'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SubPageHero from '@/components/SubPageHero';
import SubNav from '@/components/SubNav';
import EmployeeHeader from '@/components/EmployeeHeader';
import EmployeeSidebar from '@/components/EmployeeSidebar';
import ApprovalModal from '@/components/ApprovalModal';
import { useUserProfile } from '@/hooks/useUserProfile';
import { MINIMAL_LAYOUT_PATHS, getHeroForPath } from '@/constants/siteLayout';
import styles from './SiteLayout.module.css';
import InfoTicker from '@/components/InfoTicker';
import PwaMigrationNotice from '@/components/PwaMigrationNotice';

export default function SiteLayout({ children }) {
    const pathname = usePathname();
    const { profile, loading } = useUserProfile();
    const [showModal, setShowModal] = useState(false);

    const isMinimal = MINIMAL_LAYOUT_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
    const isEmployees = pathname?.startsWith('/employees') || pathname?.startsWith('/admin');
    const isVisitor = profile?.role === 'visitor';

    useEffect(() => {
        if (!loading && isEmployees && isVisitor) {
            setShowModal(true);
        }
    }, [loading, isEmployees, isVisitor]);

    useEffect(() => {
        const handleOpenModal = () => setShowModal(true);
        window.addEventListener('openApprovalModal', handleOpenModal);
        return () => window.removeEventListener('openApprovalModal', handleOpenModal);
    }, []);

    const [isMobile, setIsMobile] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024); // 사이드바가 사라지는 기준인 1024px로 조정
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // 경로 변경 시 동작
    useEffect(() => {
        // 모바일 인트라넷 메뉴 클릭으로 이동한 경우 사이드바 열기
        const shouldOpen = sessionStorage.getItem('shouldOpenSidebar');
        if (shouldOpen) {
            setIsSidebarOpen(true);
            sessionStorage.removeItem('shouldOpenSidebar');
        } else {
            setIsSidebarOpen(false);
        }
        window.dispatchEvent(new Event('closeHeaderMenu'));
    }, [pathname]);

    // 사이드바 전용 닫기 이벤트 리스너
    useEffect(() => {
        const handleCloseSidebar = () => setIsSidebarOpen(false);
        const handleOpenSidebar = () => setIsSidebarOpen(true);

        window.addEventListener('closeSidebar', handleCloseSidebar);
        window.addEventListener('openSidebar', handleOpenSidebar);

        return () => {
            window.removeEventListener('closeSidebar', handleCloseSidebar);
            window.removeEventListener('openSidebar', handleOpenSidebar);
        };
    }, []);

    const handleSidebarToggle = () => {
        const nextState = !isSidebarOpen;
        if (nextState) {
            window.dispatchEvent(new Event('closeHeaderMenu'));
        }
        setIsSidebarOpen(nextState);
    };

    const hero = getHeroForPath(pathname);

    if (isMinimal) {
        return <>{children}</>;
    }

    // 랜딩(홈): 헤더 + 본문 + 푸터만
    if (pathname === '/') {
        return (
            <>
                <Header isSidebarOpen={isSidebarOpen} />
                {children}
                <Footer />
            </>
        );
    }

    /**
     * 공통 레이아웃 구성 (인트라넷/서브 통합)
     * 1. Header (Fixed 70px)
     * 2. Spacer (70px) 또는 Hero (Min-height 300px)
     * 3. InfoTicker (Sticky 70px)
     * 4. SubHeader (Sticky 114px) - EmployeeHeader 또는 SubNav
     */
    return (
        <>
            <Header isEmployees={isEmployees} isSidebarOpen={isSidebarOpen} />

            {/* 배경 및 상단 영역: 인트라넷 환경에서는 업무 효율성 및 공간 확보를 위해 랜딩 이미지 숨김 */}
            {hero && !isEmployees ? (
                <SubPageHero
                    title={hero.title}
                    subtitle={hero.subtitle}
                    bgImage={hero.bgImage}
                    compact={false}
                />
            ) : null}

            {/* 실시간 티커: 인트라넷 데스크탑(PC) 환경에서만 렌더링, 모바일은 숨김 */}
            {isEmployees && !isMobile ? (
                <InfoTicker isEmployees={isEmployees} />
            ) : null}

            {/* 부가 헤더 */}
            {isEmployees ? (
                <EmployeeHeader
                    isEmployees={isEmployees}
                    onMenuClick={handleSidebarToggle}
                />
            ) : (
                <SubNav topOffset={70} />
            )}

            {/* 본문 영역: 인트라넷 모바일 전체에 뉴스 기사처럼 패딩/여백 최소화 레이아웃(newsArticleFull) 적용 */}
            <div className={`${isEmployees ? styles.bodyWrap : ''} ${isEmployees && isMobile ? styles.newsArticleFull : ''}`}>
                {isEmployees && (
                    <EmployeeSidebar
                        isOpen={isSidebarOpen}
                        onClose={() => setIsSidebarOpen(false)}
                    />
                )}
                <main className={styles.mainContent}>{children}</main>
            </div>

            {/* 푸터 영역: 인트라넷 모바일 환경에서는 낭비되는 면적을 줄이기 위해 푸터를 숨김 */}
            {!(isEmployees && isMobile) && <Footer />}
            <ApprovalModal isOpen={showModal} onClose={() => setShowModal(false)} />
            <PwaMigrationNotice />
        </>
    );
}
