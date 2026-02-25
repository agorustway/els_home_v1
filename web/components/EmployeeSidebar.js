'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import styles from './EmployeeSidebar.module.css';
import { useUserProfile } from '@/hooks/useUserProfile';
import { createClient } from '@/utils/supabase/client';
import { getRoleLabel } from '@/utils/roles';
import { MAIN_TABS, getActiveMainTab, SIDEBAR_ITEMS } from '@/constants/intranetMenu';
import IntranetSearch from '@/components/IntranetSearch';

export default function EmployeeSidebar({ isOpen, onClose }) {
    const pathname = usePathname();
    const { profile, loading } = useUserProfile();
    const supabase = createClient();
    const isAdmin = profile?.role === 'admin';
    const activeTabId = getActiveMainTab(pathname, isAdmin);

    // Accordion State
    const [openSections, setOpenSections] = useState({});

    // Initialize open sections based on current path
    useEffect(() => {
        if (!activeTabId) return;
        setOpenSections(prev => ({
            ...prev,
            [activeTabId]: true
        }));
    }, [activeTabId]);

    const mainTabs = [...MAIN_TABS]
        .filter((tab) => !tab.adminOnly || isAdmin)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    const handleLogout = async () => {
        // 모바일/PWA 환경 호환성을 위해 confirm 제거
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    const handleProtectedClick = (e) => {
        if (profile?.role === 'visitor') {
            e.preventDefault();
            window.dispatchEvent(new Event('openApprovalModal'));
        }
        if (window.innerWidth < 768 && onClose) {
            // Close sidebar on mobile item click
            setTimeout(onClose, 300);
        }
    };

    const toggleSection = (tabId) => {
        setOpenSections(prev => ({
            ...prev,
            [tabId]: !prev[tabId]
        }));
    };

    const isActive = (path) => pathname === path || pathname.startsWith(path + '/');

    const displayName = profile?.full_name || profile?.email?.split('@')[0] || '사용자';
    const displayInitial = displayName[0]?.toUpperCase() || 'U';

    return (
        <>
            <div className={`${styles.overlay} ${isOpen ? styles.overlayOpen : ''}`} onClick={onClose} />
            <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
                <div className={styles.mobileHeader}>
                    <span className={styles.mobileTitle}>인트라넷 메뉴</span>
                    <button className={styles.closeBtn} onClick={onClose}>&times;</button>
                </div>

                <div className={styles.searchWrap}>
                    <IntranetSearch placeholder="메뉴·게시글 검색" />
                </div>

                <div className={styles.accordionContainer}>
                    {mainTabs.map((tab) => {
                        const items = SIDEBAR_ITEMS[tab.id] || [];
                        const isOpenSection = openSections[tab.id];
                        const isTabActive = activeTabId === tab.id;

                        // Check if any child is active
                        const hasActiveChild = items.some(item => isActive(item.path));

                        return (
                            <div key={tab.id} className={`${styles.accordionItem} ${isOpenSection ? styles.open : ''}`}>
                                <button
                                    className={`${styles.accordionTrigger} ${isTabActive || hasActiveChild ? styles.activeTrigger : ''}`}
                                    onClick={() => toggleSection(tab.id)}
                                >
                                    <span className={styles.triggerLabel}>{tab.label}</span>
                                    <svg
                                        className={styles.chevron}
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>

                                <div
                                    className={styles.accordionContent}
                                    style={{ maxHeight: isOpenSection ? `${items.length * 50 + 20}px` : '0' }}
                                >
                                    <div className={styles.contentInner}>
                                        {items.map((item) => (
                                            <Link
                                                key={item.path}
                                                href={item.path}
                                                className={`${styles.subItem} ${isActive(item.path) ? styles.activeSub : ''}`}
                                                onClick={handleProtectedClick}
                                            >
                                                {item.label}
                                            </Link>
                                        ))}
                                        {items.length === 0 && (
                                            <div className={styles.emptyMsg}>하위 메뉴 없음</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className={styles.footer}>
                    {loading ? (
                        <div className={styles.userInfo}>
                            <div className={styles.avatar} style={{ backgroundColor: '#e2e8f0' }} />
                            <div>
                                <div className={styles.username} style={{ backgroundColor: '#e2e8f0', width: '80px', height: '14px', borderRadius: '4px' }} />
                                <div className={styles.role} style={{ backgroundColor: '#e2e8f0', width: '50px', height: '12px', borderRadius: '4px', marginTop: '4px' }} />
                            </div>
                        </div>
                    ) : profile ? (
                        <div className={styles.userInfo}>
                            <div className={styles.avatar}>
                                {profile.avatar_url ? (
                                    <img src={profile.avatar_url} alt={displayName} className={styles.avatarImg} />
                                ) : (
                                    displayInitial
                                )}
                            </div>
                            <div>
                                <div className={styles.username}>{displayName}</div>
                                <div className={styles.role}>
                                    {getRoleLabel(profile.role)}
                                    {(profile.rank || profile.position) && (
                                        <span className={styles.titleText}>
                                            &nbsp;| {profile.rank}{profile.position ? `(${profile.position})` : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : null}
                    <button onClick={handleLogout} className={styles.logoutBtn}>
                        로그아웃
                    </button>
                </div>
            </aside>
        </>
    );
}
