'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from './EmployeeSidebar.module.css';
import { useUserProfile } from '@/hooks/useUserProfile';
import { createClient } from '@/utils/supabase/client';
import { getRoleLabel } from '@/utils/roles';

export default function EmployeeSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { profile, loading } = useUserProfile();
    const supabase = createClient();

    const handleLogout = async () => {
        if (!confirm('로그아웃 하시겠습니까?')) return;
        await supabase.auth.signOut();
        router.push('/login');
    };

    const isActive = (path) => pathname === path || pathname.startsWith(path + '/');
    
    const displayName = profile?.full_name || profile?.email?.split('@')[0] || '사용자';
    const displayInitial = displayName[0]?.toUpperCase() || 'U';

    return (
        <aside className={styles.sidebar}>
            <div className={styles.logo}>
                <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                    ELS Solution <span style={{ fontWeight: 300 }}>Intranet</span>
                </Link>
            </div>

            <nav className={styles.menu}>
                <div className={styles.sectionTitle}>시스템</div>
                <Link href="/employees" className={`${styles.item} ${pathname === '/employees' ? styles.active : ''}`}>
                    🏠 인트라넷 홈
                </Link>
                <Link href="/employees/archive" className={`${styles.item} ${isActive('/employees/archive') ? styles.active : ''}`}>
                    📂 자료실 (NAS)
                </Link>
                <Link href="/employees/board/free" className={`${styles.item} ${isActive('/employees/board/free') ? styles.active : ''}`}>
                    💬 자유게시판
                </Link>
                <Link href="/employees/webzine" className={`${styles.item} ${isActive('/employees/webzine') ? styles.active : ''}`}>
                    📰 웹진 (블로그)
                </Link>

                <div className={styles.sectionTitle}>업무관리</div>
                <Link href="/employees/reports" className={`${styles.item} ${isActive('/employees/reports') ? styles.active : ''}`}>
                    📊 통합 업무보고
                </Link>
                <Link href="/employees/reports/my" className={`${styles.item} ${isActive('/employees/reports/my') ? styles.active : ''}`}>
                    📝 내 업무보고
                </Link>

                {profile?.role === 'admin' && (
                    <>
                        <div className={styles.sectionTitle}>관리 설정</div>
                        <Link href="/admin/users" className={`${styles.item} ${isActive('/admin/users') ? styles.active : ''}`}>
                            🔐 권한관리
                        </Link>
                        <Link href="/admin" className={`${styles.item} ${isActive('/admin') ? styles.active : ''}`}>
                            📋 고객 문의 관리
                        </Link>
                    </>
                )}
            </nav>

            <div className={styles.footer}>
                {loading ? (
                    <div className={styles.userInfo}>
                        <div className={styles.avatar} style={{ backgroundColor: '#e2e8f0' }} />
                        <div>
                            <div className={styles.username} style={{ backgroundColor: '#e2e8f0', width: '80px', height: '14px', borderRadius: '4px' }}/>
                            <div className={styles.role} style={{ backgroundColor: '#e2e8f0', width: '50px', height: '12px', borderRadius: '4px', marginTop: '4px' }}/>
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
                            <div className={styles.role}>{getRoleLabel(profile.role)}</div>
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
