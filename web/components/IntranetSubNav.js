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
        return pathname === path || pathname.startsWith(path + '/');
    };

    const handleLogout = async () => {
        const supabase = (await import('@/utils/supabase/client')).createClient();
        if (!confirm('로그아웃 하시겠습니까?')) return;
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    return (
        <nav className={styles.subNav}>
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
                    로그아웃
                </button>
            </div>
        </nav>
    );
}
