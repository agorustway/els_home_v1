'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import styles from './EmployeeSidebar.module.css';
import { useUserRole } from '@/hooks/useUserRole';
import { createClient } from '@/utils/supabase/client';
import { getRoleLabel } from '@/utils/roles';

export default function EmployeeSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { role, user } = useUserRole();
    const supabase = createClient();

    const handleLogout = async () => {
        if (!confirm('로그아웃 하시겠습니까?')) return;
        await supabase.auth.signOut();
        router.push('/login');
    };

    const isActive = (path) => pathname === path || pathname.startsWith(path + '/');

    return (
        <aside className={styles.sidebar}>
            <div className={styles.logo}>
                <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
                    ELS Solution <span style={{ fontWeight: 300 }}>Intranet</span>
                </Link>
            </div>

            <nav className={styles.menu}>
                <div className={styles.sectionTitle}>시스템</div>
                <Link href="/employees/dashboard" className={`${styles.item} ${isActive('/employees/dashboard') ? styles.active : ''}`}>
                    🏠 대시보드
                </Link>
                <Link href="/employees/archive" className={`${styles.item} ${isActive('/employees/archive') ? styles.active : ''}`}>
                    📂 자료실 (NAS)
                </Link>
                <Link href="/employees/board/free" className={`${styles.item} ${isActive('/employees/board/free') ? styles.active : ''}`}>
                    💬 자유게시판
                </Link>

                <div className={styles.sectionTitle}>업무관리</div>
                <Link href="/employees/reports" className={`${styles.item} ${isActive('/employees/reports') ? styles.active : ''}`}>
                    📊 통합 업무보고
                </Link>
                <Link href="/employees/reports/my" className={`${styles.item} ${isActive('/employees/reports/my') ? styles.active : ''}`}>
                    📝 내 업무보고
                </Link>

                {role === 'admin' && (
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
                <div className={styles.userInfo}>
                    <div className={styles.avatar}>
                        {user?.email?.[0].toUpperCase()}
                    </div>
                    <div>
                        <div className={styles.username}>{user?.user_metadata?.name || user?.email?.split('@')[0]}</div>
                        <div className={styles.role}>{getRoleLabel(role)}</div>
                    </div>
                </div>
                <button onClick={handleLogout} className={styles.logoutBtn}>
                    로그아웃
                </button>
            </div>
        </aside>
    );
}
