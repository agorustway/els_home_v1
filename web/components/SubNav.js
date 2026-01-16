'use client';
import styles from './SubNav.module.css';
import { usePathname } from 'next/navigation';

const menuItems = [
    { name: '회사소개', path: '/intro' },
    { name: '비전', path: '/vision' },
    { name: 'ESG', path: '/esg' },
    { name: '조직도', path: '/team' },
    { name: '연혁', path: '/history' },
    { name: '사원복지', path: '/welfare' }
];

export default function SubNav() {
    const pathname = usePathname();

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
