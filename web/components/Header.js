'use client';
import { useState, useEffect } from 'react';
import styles from './Header.module.css';

export default function Header() {
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState(null);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const toggleMenu = () => {
        setMenuOpen(!menuOpen);
        setActiveDropdown(null); // Reset dropdowns when menu toggles
        if (!menuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
    };

    const toggleDropdown = (name) => {
        setActiveDropdown(activeDropdown === name ? null : name);
    };

    const handleLinkClick = () => {
        setMenuOpen(false);
        document.body.style.overflow = 'unset';
    };

    return (
        <header className={`${styles.header} ${scrolled ? styles.scrolled : ''}`}>
            <div className="container">
                <div className={styles.inner}>
                    <a href="/" className={styles.logo} onClick={handleLinkClick}>
                        <img src="/images/logo.png" alt="ELS SOLUTION" className={styles.logoImage} />
                    </a>

                    {/* Desktop Navigation */}
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
                        <a href="/dashboard">실적현황</a>
                        <a href="/network">네트워크</a>
                        <a href="/contact" className={styles.contactBtn}>문의하기</a>
                        <div className={styles.hasDropdown}>
                            <a href="/employees" className={styles.empBtn}>임직원전용</a>
                            <div className={styles.dropdown}>
                                <a href="/employees#satisfaction" className={styles.dropdownItem}>직원만족도 조사</a>
                                <a href="/employees#grievance" className={styles.dropdownItem}>고충상담</a>
                                <a href="https://elssolution.synology.me" target="_blank" rel="noopener noreferrer" className={styles.dropdownItem}>직원용 NAS접속</a>
                            </div>
                        </div>
                    </nav>

                    {/* Mobile Toggle Button */}
                    <button
                        className={`${styles.mobileToggle} ${menuOpen ? styles.active : ''}`}
                        onClick={toggleMenu}
                        aria-label="Toggle Menu"
                    >
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>

                    {/* Mobile Navigation */}
                    <div className={`${styles.mobileNav} ${menuOpen ? styles.mobileNavOpen : ''}`}>
                        <div className={styles.mobileNavLinks}>
                            <div className={styles.mobileNode}>
                                <button
                                    className={`${styles.mobileLink} ${activeDropdown === 'intro' ? styles.activeSub : ''}`}
                                    onClick={() => toggleDropdown('intro')}
                                >
                                    회사소개
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
                                </button>
                                <div className={`${styles.mobileSub} ${activeDropdown === 'intro' ? styles.showSub : ''}`}>
                                    <a href="/intro" onClick={handleLinkClick}>회사 개요</a>
                                    <a href="/vision" onClick={handleLinkClick}>비전</a>
                                    <a href="/esg" onClick={handleLinkClick}>ESG</a>
                                    <a href="/team" onClick={handleLinkClick}>조직도</a>
                                    <a href="/history" onClick={handleLinkClick}>연혁</a>
                                </div>
                            </div>

                            <a href="/services" className={styles.mobileLink} onClick={handleLinkClick}>서비스</a>
                            <a href="/dashboard" className={styles.mobileLink} onClick={handleLinkClick}>실적현황</a>
                            <a href="/network" className={styles.mobileLink} onClick={handleLinkClick}>네트워크</a>

                            <div className={styles.mobileNode}>
                                <button
                                    className={`${styles.mobileLink} ${activeDropdown === 'emp' ? styles.activeSub : ''}`}
                                    onClick={() => toggleDropdown('emp')}
                                >
                                    임직원사이트
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
                                </button>
                                <div className={`${styles.mobileSub} ${activeDropdown === 'emp' ? styles.showSub : ''}`}>
                                    <a href="/employees" onClick={handleLinkClick}>임직원 홈</a>
                                    <a href="/employees#satisfaction" onClick={handleLinkClick}>직원만족도 조사</a>
                                    <a href="/employees#grievance" onClick={handleLinkClick}>고충상담</a>
                                    <a href="https://elssolution.synology.me" target="_blank" rel="noopener noreferrer" onClick={handleLinkClick}>NAS 접속</a>
                                </div>
                            </div>
                            <a href="/contact" className={styles.mobileContactBtn} onClick={handleLinkClick}>문의하기</a>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
