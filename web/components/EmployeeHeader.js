'use client';

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

    const handleCreateShortcut = () => {
        // 바탕화면 바로가기 생성용 CMD 스크립트
        const script = `@echo off
chcp 65001 > nul
set "targetUrl=https://nollae.com"
set "shortcutName=이엘에스솔루션"

echo 바탕화면에 바로가기를 생성하고 있습니다...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $d = [System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), '%shortcutName%.lnk'); $s = $ws.CreateShortcut($d); $s.TargetPath = 'chrome.exe'; $s.Arguments = '%targetUrl%'; $s.Save();"

if %errorlevel% equ 0 (
    echo.
    echo [성공] 바탕화면에 '%shortcutName%' 바로가기가 생성되었습니다!
) else (
    echo.
    echo [오류] 바로가기 생성에 실패했습니다.
)
pause`;

        const blob = new Blob([script], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'els_shortcut_installer.cmd';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert('다운로드된 "els_shortcut_installer.cmd" 파일을 실행하면\\n바탕화면에 "이엘에스솔루션" 크롬 바로가기가 생성됩니다!');
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
