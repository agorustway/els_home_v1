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

    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const displayName = profile?.name || profile?.full_name || profile?.user_metadata?.name || profile?.email?.split('@')[0] || '사용자';
    const rank = profile?.rank || '';
    const position = profile?.position || '';
    const roleLabel = profile ? getRoleLabel(profile.role) : '';

    useEffect(() => {
        const handlePWA = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handlePWA);
        return () => window.removeEventListener('beforeinstallprompt', handlePWA);
    }, []);

    const handleLogout = async () => {
        // 모바일에서 confirm 창이 차단되거나 반응 없는 문제를 방지하기 위해 확인 절차 제거
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    const handleCreateShortcut = async () => {
        const isMac = navigator.userAgent.toLowerCase().includes('mac');
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const shortcut = isMac ? 'Cmd + D' : 'Ctrl + D';
        const ua = navigator.userAgent.toLowerCase();

        // --- 1. 인앱 브라우저(카카오, 네이버, 인스타 등) 차단 우회 ---
        const isInApp = /(kakaotalk|naver|line|instagram|inapp|fba|fb_iab)/i.test(ua);
        if (isInApp && isMobile) {
            const currentUrl = window.location.href;
            const domainAndPath = currentUrl.replace(/^https?:\/\//i, '');
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

            if (!isIOS) { // 안드로이드
                alert("현재 카카오/네이버 등 내장 브라우저에서는 앱 설치가 제한되어 있습니다.\n\n[확인]을 누르시면 일반 브라우저(Chrome)로 자동 전환됩니다. 전환 후 우측 상단 메뉴(점 3개)에서 [앱 설정] 또는 [홈 화면에 추가]를 진행해 주세요!");
                window.location.href = `intent://${domainAndPath}#Intent;scheme=https;package=com.android.chrome;end;`;
                return;
            } else { // iOS
                if (ua.includes('kakaotalk')) {
                    alert("카카오톡 내장 브라우저에서는 앱 설치가 지원되지 않습니다.\nSafari 브라우저로 전환합니다.");
                    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`;
                } else {
                    alert("앱 설치는 Safari 브라우저에서만 지원됩니다.\n\n화면 하단(또는 우측)의 [메뉴]를 눌러 [다른 브라우저로 열기(Safari)]를 선택하신 후, Safari에서 하단의 [공유(네모 안 화살표)] ➔ [홈 화면에 추가]를 진행해 주세요.");
                }
                return;
            }
        }

        if (!deferredPrompt) {
            if (isMobile) {
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                if (isIOS) {
                    alert('iOS(아이폰/아이패드)에서는 브라우저 하단의 [공유(네모 안 화살표)] 버튼을 누른 후 [홈 화면에 추가]를 선택하여 설치해 주세요.');
                } else {
                    alert('안드로이드 환경에서는 브라우저(Chrome 권장) 우측 상단 [점 3개] 메뉴를 누른 후 [앱 설치] 또는 [홈 화면에 추가]를 선택하시면 바탕화면에 설치됩니다.\n\n자동 설치 팝업이 뜨지 않을 경우 이 방법을 이용해 주세요!');
                }
            } else {
                alert(`브라우저가 자동 설치를 지원하지 않거나 이미 브라우저 내부에 앱이 설치되어 있습니다.\n\n⚠️ 참고: 바탕화면에서 아이콘만 지운 경우, 웹 브라우저에는 여전히 앱이 설치된 것으로 인식됩니다.\n\n재설치가 안 될 경우, 주소창 가장 우측의 [앱 제거] 버튼이나 PC 웹 브라우저 설정에서 기존 앱을 완전히 삭제하신 후 다시 시도해 주세요.\n\n(꿀팁: 키보드의 [${shortcut}] 키를 누르시면 브라우저 북마크에도 즉시 추가 가능합니다!)`);
            }
            return;
        }

        // 먼저 안내
        const installMsg = isMobile
            ? '스마트폰 홈 화면에 "이엘에스솔루션" 앱을 설치하시겠습니까?\n\n설치 후에는 브라우저 없이도 즉시 실행이 가능합니다.'
            : `바탕화면(홈 화면) 앱 설치를 진행합니다!\n\n(참고: 웹 브라우저 북마크에도 추가하시려면 설치 후 키보드의 [${shortcut}] 키를 눌러주세요.)`;

        alert(installMsg);

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
        }
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
                            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
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
                            <span className={styles.desktopOnly}>개인정보수정</span>
                            <span className={styles.mobileOnly}>내정보</span>
                        </Link>
                        <button type="button" onClick={handleLogout} className={styles.linkBtn}>
                            <span className={styles.desktopOnly}>로그아웃</span>
                            <span className={styles.mobileOnly}>로그아웃</span>
                        </button>
                        <Link href="/contact" className={styles.link}>
                            <span className={styles.desktopOnly}>문의하기</span>
                            <span className={styles.mobileOnly}>문의</span>
                        </Link>
                        <button
                            type="button"
                            onClick={handleCreateShortcut}
                            className={styles.link}
                            title="바탕화면에 앱 설치하기"
                        >
                            <img src="/favicon.png" alt="App" style={{ width: '14px', height: '14px' }} />
                            <span className={styles.desktopOnly}>앱 설치</span>
                            <span className={styles.mobileOnly}>설치</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}
