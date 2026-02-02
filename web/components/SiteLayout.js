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
            <Header />

            {/* 배경 및 상단 영역 */}
            {hero ? (
                <SubPageHero
                    title={hero.title}
                    subtitle={hero.subtitle}
                    bgImage={hero.bgImage}
                    compact={isEmployees} // 인트라넷은 히어로 축소
                />
            ) : (
                <div style={{ height: '70px' }} />
            )}

            {/* 실시간 티커 (히어로가 있을 땐 위로 44px 끌어올려 이미지 하단에 얹기) */}
            <InfoTicker style={hero ? { marginTop: '-44px' } : {}} />

            {/* 부가 헤더 */}
            {isEmployees ? <EmployeeHeader /> : <SubNav />}

            {/* 본문 영역 */}
            <div className={isEmployees ? styles.bodyWrap : ''}>
                {isEmployees && <EmployeeSidebar />}
                <main className={styles.mainContent}>{children}</main>
            </div>

            <Footer />
            <ApprovalModal isOpen={showModal} onClose={() => setShowModal(false)} />
        </>
    );
}
