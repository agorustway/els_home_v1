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

    const displayName = profile?.full_name || profile?.email?.split('@')[0] || '사용자';
    const rank = profile?.rank || '';
    const position = profile?.position || '';
    const roleLabel = profile ? getRoleLabel(profile.role) : '';

    const handleLogout = async () => {
        if (!confirm('로그아웃 하시겠습니까?')) return;
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    const [deferredPrompt, setDeferredPrompt] = useState(null);

    useEffect(() => {
        const handler = (e) => {
            // 브라우저 기본 설치 팝업 방지 및 이벤트 저장
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleCreateShortcut = async () => {
        if (!deferredPrompt) {
            // 이미 설치되었거나 브라우저에서 지원하지 않는 경우 가이드
            alert('이미 앱이 설치되어 있거나, 브라우저가 자동 설치를 지원하지 않습니다.\\n브라우저 주소창 우측의 [설치] 아이콘을 확인해주세요!');
            return;
        }

        // PWA 설치 프롬프트 표시
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            setDeferredPrompt(null);
            alert('바탕화면에 바로가기 앱이 설치되었습니다!');
        }
    };

    return (
        <header className={`${styles.employeeHeader} ${isEmployees ? styles.relativeHeader : ''}`}>
            <div className={styles.inner}>
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
                        <button
                            type="button"
                            onClick={handleCreateShortcut}
                            className={styles.shortcutBtn}
                            title="바탕화면으로 바로가기를 만듭니다"
                        >
                            <img src="/favicon.png" alt="ELS" className={styles.shortcutIcon} />
                            바로가기
                        </button>
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
                <div className={styles.searchWrap}>
                    <IntranetSearch placeholder="메뉴·게시글 검색" className={styles.searchInputWrap} />
                </div>
            </div>
        </header>
    );
}
