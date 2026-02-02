'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './EmployeeSidebar.module.css';
import { useUserProfile } from '@/hooks/useUserProfile';
import { createClient } from '@/utils/supabase/client';
import { getRoleLabel } from '@/utils/roles';
import { MAIN_TABS, getActiveMainTab, SIDEBAR_ITEMS } from '@/constants/intranetMenu';
import IntranetSearch from '@/components/IntranetSearch';

export default function EmployeeSidebar() {
    const pathname = usePathname();
    const { profile, loading } = useUserProfile();
    const supabase = createClient();
    const isAdmin = profile?.role === 'admin';
    const activeTabId = getActiveMainTab(pathname, isAdmin);
    const items = SIDEBAR_ITEMS[activeTabId] || SIDEBAR_ITEMS.home;

    const mainTabs = [...MAIN_TABS]
        .filter((tab) => !tab.adminOnly || isAdmin)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    const handleLogout = async () => {
        if (!confirm('로그아웃 하시겠습니까?')) return;
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    const handleProtectedClick = (e) => {
        if (profile?.role === 'visitor') {
            e.preventDefault();
            window.dispatchEvent(new Event('openApprovalModal'));
        }
    };

    const isActive = (path) => pathname === path || pathname.startsWith(path + '/');

    const displayName = profile?.full_name || profile?.email?.split('@')[0] || '사용자';
    const displayInitial = displayName[0]?.toUpperCase() || 'U';

    return (
        <aside className={styles.sidebar}>
            <div className={styles.searchWrap}>
                <IntranetSearch placeholder="메뉴·게시글 검색" />
            </div>
            <div className={styles.navBlock}>
                <span className={styles.navLabel}>메인메뉴</span>
                <nav className={styles.tabNav}>
                    {mainTabs.map((tab) => {
                        const isTabActive = activeTabId === tab.id;
                        return (
                            <Link
                                key={tab.id}
                                href={tab.defaultPath}
                                className={`${styles.tabItem} ${isTabActive ? styles.tabActive : ''}`}
                                onClick={handleProtectedClick}
                            >
                                {tab.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>
            <div className={styles.navBlock}>
                <span className={styles.navLabel}>서브메뉴</span>
                <nav className={styles.menu}>
                    {items.map((item) => (
                        <Link
                            key={item.path}
                            href={item.path}
                            className={`${styles.item} ${isActive(item.path) ? styles.active : ''}`}
                            onClick={handleProtectedClick}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>
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
    );
}
