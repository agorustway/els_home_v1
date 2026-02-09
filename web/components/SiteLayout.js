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

    // 경로 변경 시 사이드바 닫기
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [pathname]);

    // 사이드바 전용 닫기 이벤트 리스너
    useEffect(() => {
        const handleCloseSidebar = () => setIsSidebarOpen(false);
        window.addEventListener('closeSidebar', handleCloseSidebar);
        return () => window.removeEventListener('closeSidebar', handleCloseSidebar);
    }, []);

    const handleSidebarToggle = () => {
        const nextState = !isSidebarOpen;
        if (nextState) {
            // 사이드바를 열 때, 헤더 메뉴가 있다면 닫으라고 신호 보냄
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
                <Header />
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
            <Header isEmployees={isEmployees} />

            {/* 배경 및 상단 영역 */}
            {hero ? (
                <SubPageHero
                    title={hero.title}
                    subtitle={hero.subtitle}
                    bgImage={hero.bgImage}
                    compact={isEmployees} // 인트라넷은 히어로 축소
                />
            ) : null}

            {/* 실시간 티커 (인트라넷 페이지에서만 보이도록 조건부 렌더링, 모바일 제외) */}
            {isEmployees && !isMobile ? (
                <InfoTicker isEmployees={isEmployees} style={hero && !isEmployees ? { marginTop: '-44px' } : {}} />
            ) : null}

            {/* 부가 헤더 */}
            {isEmployees ? (
                <EmployeeHeader
                    isEmployees={isEmployees}
                    onMenuClick={handleSidebarToggle}
                />
            ) : (
                <SubNav topOffset={isEmployees ? 114 : 70} />
            )}

            {/* 본문 영역 */}
            <div className={isEmployees ? styles.bodyWrap : ''}>
                {isEmployees && (
                    <EmployeeSidebar
                        isOpen={isSidebarOpen}
                        onClose={() => setIsSidebarOpen(false)}
                    />
                )}
                <main className={styles.mainContent}>{children}</main>
            </div>

            <Footer />
            <ApprovalModal isOpen={showModal} onClose={() => setShowModal(false)} />
        </>
    );
}
