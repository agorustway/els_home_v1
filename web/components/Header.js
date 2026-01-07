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
                    <div className={styles.logo}>
                        <span className={styles.logoText}>ELS</span>
                        <span className={styles.logoSub}>SOLUTION</span>
                    </div>
                    <nav className={styles.nav}>
                        <a href="#intro">About</a>
                        <a href="#business">Services</a>
                        <a href="#vision">Vision</a>
                        <a href="#organization">Team</a>
                        <a href="#network">Network</a>
                        <a href="#contact" className={styles.contactBtn}>Contact Us</a>
                    </nav>
                </div>
            </div>
        </header>
    );
}
