'use client';
import { useState, useEffect } from 'react';
import styles from './Header.module.css';

export default function Header() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
            <div className="container">
                <div className={styles.inner}>
                    <a href="/" className={styles.logo}>
                        <img src="/images/logo.png" alt="ELS SOLUTION" className={styles.logoImage} />
                    </a>
                    <nav className={styles.nav}>
                        <div className={styles.hasDropdown}>
                            <a href="/intro" className={styles.dropBtn}>회사소개</a>
                            <div className={styles.dropdown}>
                                <a href="/vision" className={styles.dropdownItem}>비전</a>
                                <a href="/esg" className={styles.dropdownItem}>ESG</a>
                                <a href="/team" className={styles.dropdownItem}>조직도</a>
                                <a href="/history" className={styles.dropdownItem}>연혁</a>
                            </div>
                        </div>
                        <a href="/services">서비스</a>
                        <a href="/dashboard">라이브 대시보드</a>
                        <a href="/network">네트워크</a>
                        <a href="/#contact" className={styles.contactBtn}>문의하기</a>
                        <div className={styles.hasDropdown}>
                            <a href="/employees" className={styles.empBtn}>임직원전용</a>
                            <div className={styles.dropdown}>
                                <a href="/employees#satisfaction" className={styles.dropdownItem}>직원만족도 조사</a>
                                <a href="/employees#grievance" className={styles.dropdownItem}>고충상담</a>
                                <a href="https://elssolution.synology.me" target="_blank" className={styles.dropdownItem}>직원용 NAS접속</a>
                            </div>
                        </div>
                    </nav>
                </div>
            </div>
        </header>
    );
}
