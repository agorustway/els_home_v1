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
                        <a href="/#intro">About</a>
                        <a href="/#business">Services</a>
                        <a href="/#vision">Vision</a>
                        <a href="/#esg">ESG</a>
                        <a href="/#organization">Team</a>
                        <a href="/#network">Network</a>
                        <a href="/#contact" className={styles.contactBtn}>Contact Us</a>
                        <div className={styles.hasDropdown}>
                            <a href="/employees" className={styles.empBtn}>Employees</a>
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
