'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useUserProfile } from '@/hooks/useUserProfile';
import { createClient } from '@/utils/supabase/client';
import { getRoleLabel } from '@/utils/roles';
import IntranetSearch from '@/components/IntranetSearch';
import styles from './EmployeeHeader.module.css';

export default function EmployeeHeader({ isEmployees = false, onMenuClick }) {
    const { profile, loading } = useUserProfile();
    const supabase = createClient();

    const displayName = profile?.name || profile?.full_name || profile?.user_metadata?.name || profile?.email?.split('@')[0] || '사용자';
    const rank = profile?.rank || '';
    const position = profile?.position || '';
    const roleLabel = profile ? getRoleLabel(profile.role) : '';

    const handleLogout = async () => {
        // 모바일에서 confirm 창이 차단되거나 반응 없는 문제를 방지하기 위해 확인 절차 제거
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    return (
        <header className={`${styles.employeeHeader} ${isEmployees ? styles.relativeHeader : ''}`}>
            <div className={styles.inner}>
                <div className={styles.brandGroup}>
                    <div className={styles.leftSection}>
                        <button
                            className={styles.mobileMenuBtn}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onMenuClick) onMenuClick();
                                else window.dispatchEvent(new Event('openSidebar'));
                            }}
                            aria-label="Open Sidebar"
                        >
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 12h18M3 6h18M3 18h18" />
                            </svg>
                        </button>
                        <Link href="/employees" className={styles.logo}>
                            ELS <span className={styles.logoSub}>Intranet</span>
                        </Link>
                    </div>
                    <div className={styles.searchWrap}>
                        <IntranetSearch placeholder="메뉴·게시글 검색" className={styles.searchInputWrap} />
                    </div>
                </div>

                <div className={styles.userArea}>
                    {!loading && profile && (
                        <span className={styles.greeting}>
                            <strong>{displayName}</strong>
                            {(rank || position) && (
                                <span className={styles.titleText}>
                                    &nbsp;{rank}{position ? `(${position})` : ''}
                                </span>
                            )}
                            {roleLabel && (
                                <span className={styles.roleBadge}>({roleLabel})</span>
                            )}
                            님 안녕하세요?
                        </span>
                    )}
                    <div className={styles.links}>
                        <Link href="/employees/mypage" className={styles.link}>
                            개인정보수정
                        </Link>
                        <button type="button" onClick={handleLogout} className={styles.linkBtn}>
                            로그아웃
                        </button>
                        <Link href="/contact" className={styles.link}>
                            문의하기
                        </Link>
                    </div>
                </div>
            </div>
        </header>
    );
}
