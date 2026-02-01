'use client';
import styles from './SubNav.module.css';
import { usePathname } from 'next/navigation';
import { getSubNavItems } from '@/constants/siteLayout';

export default function SubNav() {
    const pathname = usePathname();
    const menuItems = getSubNavItems(pathname);

    if (menuItems.length === 0) return null;

    return (
        <nav className={styles.subNav}>
            <div className="container">
                <div className={styles.inner}>
                    {menuItems.map((item) => (
                        <a
                            key={item.path}
                            href={item.path}
                            className={`${styles.navItem} ${pathname === item.path ? styles.active : ''}`}
                        >
                            {item.name}
                        </a>
                    ))}
                </div>
            </div>
        </nav>
    );
}
