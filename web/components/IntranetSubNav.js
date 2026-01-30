'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './IntranetSubNav.module.css';
import { useUserRole } from '@/hooks/useUserRole';
import { MAIN_TABS, getActiveMainTab } from '@/constants/intranetMenu';

export default function IntranetSubNav() {
    const pathname = usePathname();
    const { role } = useUserRole();
    const isAdmin = role === 'admin';
    const activeTabId = getActiveMainTab(pathname, isAdmin);

    const tabsForDisplay = [...MAIN_TABS]
        .filter((tab) => !tab.adminOnly || isAdmin)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    return (
        <nav className={styles.mainNav}>
            <div className={styles.container}>
                <ul className={styles.tabList}>
                    {tabsForDisplay.map((tab) => {
                        const isActive = activeTabId === tab.id;
                        return (
                            <li key={tab.id} className={styles.tabItem}>
                                <Link
                                    href={tab.defaultPath}
                                    className={`${styles.tabLink} ${isActive ? styles.tabActive : ''}`}
                                >
                                    {tab.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </nav>
    );
}
