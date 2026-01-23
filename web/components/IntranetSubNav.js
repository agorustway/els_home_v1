'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './IntranetSubNav.module.css';
import { useUserRole } from '@/hooks/useUserRole';

export default function IntranetSubNav() {
    const pathname = usePathname();
    const { role } = useUserRole();

    const menuItems = [
        { name: '홈', path: '/employees' },
        { name: '자료실', path: '/employees/archive' },
        { name: '자유게시판', path: '/employees/board/free' },
        { name: '웹진', path: '/employees/webzine' },
        { name: '업무보고', path: '/employees/reports' },
        { name: '내 업무보고', path: '/employees/reports/my' },
    ];

    if (role === 'admin') {
        menuItems.push({ name: '권한관리', path: '/admin/users' });
        menuItems.push({ name: '문의관리', path: '/admin' });
    }

    const isActive = (path) => {
        if (path === '/employees') return pathname === '/employees' || pathname === '/employees/dashboard';

        // Exact match
        if (pathname === path) return true;

        // Prevent parent-child overlap in the same level menu
        if (path === '/employees/reports' && pathname.startsWith('/employees/reports/my')) return false;
        if (path === '/admin' && pathname.startsWith('/admin/users')) return false;

        return pathname.startsWith(path + '/');
    };

    const handleLogout = async () => {
        const supabase = (await import('@/utils/supabase/client')).createClient();
        if (!confirm('로그아웃 하시겠습니까?')) return;
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    return (
        <nav className={styles.subNav}>
            <div className="container">
                <div className={styles.inner}>
                    <div className={styles.menuList}>
                        {menuItems.map((item) => (
                            <Link
                                key={item.path}
                                href={item.path}
                                className={`${styles.navItem} ${isActive(item.path) ? styles.active : ''}`}
                            >
                                {item.name}
                            </Link>
                        ))}
                    </div>
                    <button onClick={handleLogout} className={styles.logoutBtn}>
                        <span>로그아웃</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    </button>
                </div>
            </div>
        </nav>
    );
}
