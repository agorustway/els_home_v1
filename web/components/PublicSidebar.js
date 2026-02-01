'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './PublicSidebar.module.css';

const SIDEBAR_ITEMS = [
    { label: '회사소개', path: '/intro' },
    { label: '비전', path: '/vision' },
    { label: 'ESG', path: '/esg' },
    { label: '조직도', path: '/team' },
    { label: '연혁', path: '/history' },
    { label: '사원복지', path: '/welfare' },
    { label: '서비스', path: '/services' },
    { label: '네트워크', path: '/network' },
    { label: '문의하기', path: '/contact' },
    { label: '임직원', path: '/employees' },
];

export default function PublicSidebar() {
    const pathname = usePathname();
    const isActive = (path) => pathname === path || (path !== '/' && pathname.startsWith(path + '/'));

    return (
        <aside className={styles.sidebar}>
            <nav className={styles.menu}>
                {SIDEBAR_ITEMS.map((item) => (
                    <Link
                        key={item.path}
                        href={item.path}
                        className={`${styles.item} ${isActive(item.path) ? styles.active : ''}`}
                    >
                        {item.label}
                    </Link>
                ))}
            </nav>
        </aside>
    );
}
