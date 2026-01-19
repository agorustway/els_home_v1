'use client';
import { useState, useEffect } from 'react';
import styles from './Header.module.css';
import { createClient } from '../utils/supabase/client';
import { useRouter, usePathname } from 'next/navigation';

export default function Header({ darkVariant = false }) {
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null);
    const [isMounted, setIsMounted] = useState(false);
    const supabase = createClient();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);

        // Fetch user session and role
        const getUserAndRole = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);

            if (user) {
                const { data: roleData } = await supabase
                    .from('user_roles')
                    .select('role')
                    .eq('id', user.id)
                    .single();
                setRole(roleData?.role);
            }
        };
        getUserAndRole();

        setIsMounted(true);

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null);
        });

        return () => {
            window.removeEventListener('scroll', handleScroll);
            subscription.unsubscribe();
        };
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

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.refresh();
    };

    const handleLoginClick = () => {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
    };

    const isDarkHeader = scrolled || darkVariant;

    return (
        <header className={`${styles.header} ${isDarkHeader ? styles.scrolled : ''} ${darkVariant && !scrolled ? styles.darkVariant : ''}`}>
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
                                <div className={styles.dropdownDivider}></div>
                                <div className={styles.hasSubDropdown}>
                                    <a href="#" className={styles.dropdownItem} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={(e) => e.preventDefault()}>
                                        사원복지
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6" /></svg>
                                    </a>
                                    <div className={styles.subDropdown}>
                                        <a href="/welfare#satisfaction" className={styles.dropdownItem}>직원만족도 조사</a>
                                        <a href="/welfare#grievance" className={styles.dropdownItem}>고충상담</a>
                                        <a href="/welfare#roadmap" className={styles.dropdownItem}>지속가능 일터</a>
                                        <a href="/welfare#report" className={styles.dropdownItem}>부조리/인권침해 제보</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <a href="/services">서비스</a>
                        <a href="/dashboard">실적현황</a>
                        <a href="/network">네트워크</a>
                        <a href="/contact" className={styles.contactBtn}>문의하기</a>
                        {isMounted && (
                            user ? (
                                <button onClick={handleLogout} className={styles.authBtn}>로그아웃</button>
                            ) : (
                                <button onClick={handleLoginClick} className={styles.authBtn}>로그인</button>
                            )
                        )}
                        <div className={styles.hasDropdown}>
                            <a href="/employees" className={styles.empBtn}>임직원전용</a>
                            <div className={styles.dropdown}>
                                {/* 관리자 */}
                                {role === 'admin' && (
                                    <>
                                        <a href="/admin/users" className={styles.dropdownItem} style={{ fontWeight: '800', color: '#ef4444' }}>🔐 회원 권한 관리</a>
                                        <a href="/admin" className={styles.dropdownItem} style={{ fontWeight: '800', color: '#ef4444' }}>📋 고객 문의 관리</a>
                                        <div className={styles.dropdownDivider}></div>
                                    </>
                                )}

                                {/* 시스템 */}
                                <div className={styles.dropdownLabel}>사내 시스템</div>
                                <a href="/employees/archive" className={styles.dropdownItem}>📂 자료실 (NAS)</a>
                                <a href="/employees/board/free" className={styles.dropdownItem}>💬 자유게시판</a>
                                <div className={styles.dropdownDivider}></div>

                                {/* 업무보고 */}
                                <div className={styles.dropdownLabel}>업무보고</div>
                                <a href="/employees/reports" className={styles.dropdownItem}>📊 통합 업무보고</a>
                                <a href="/employees/reports/my" className={styles.dropdownItem}>📝 내 업무보고</a>
                                <div className={styles.dropdownDivider}></div>

                                {/* 지점 */}
                                <div className={styles.hasSubDropdown}>
                                    <a href="#" className={styles.dropdownItem} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={(e) => e.preventDefault()}>
                                        지점별 서비스
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6" /></svg>
                                    </a>
                                    <div className={styles.subDropdown}>
                                        <a href="/employees/branches/asan" className={styles.dropdownItem}>아산지점</a>
                                        <a href="/employees/branches/asan/menu" className={styles.dropdownSubItem}>└ 식단선택</a>
                                        <a href="/employees/branches/jungbu" className={styles.dropdownItem}>중부지점</a>
                                        <a href="/employees/branches/dangjin" className={styles.dropdownItem}>당진지점</a>
                                        <a href="/employees/branches/yesan" className={styles.dropdownItem}>예산지점</a>
                                    </div>
                                </div>
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
                                    <div className={styles.mobileSubDivider}></div>
                                    <div style={{ padding: '10px 20px', fontWeight: '700', color: '#1a1a1a', fontSize: '1rem' }}>사원복지</div>
                                    <a href="/welfare#satisfaction" onClick={handleLinkClick} style={{ paddingLeft: '35px', fontSize: '0.95rem' }}>└ 직원만족도 조사</a>
                                    <a href="/welfare#grievance" onClick={handleLinkClick} style={{ paddingLeft: '35px', fontSize: '0.95rem' }}>└ 고충상담</a>
                                    <a href="/welfare#roadmap" onClick={handleLinkClick} style={{ paddingLeft: '35px', fontSize: '0.95rem' }}>└ 지속가능 일터</a>
                                    <a href="/welfare#report" onClick={handleLinkClick} style={{ paddingLeft: '35px', fontSize: '0.95rem' }}>└ 부조리/인권침해 제보</a>
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
                                    <div className={styles.mobileSubDivider}></div>

                                    {role === 'admin' && (
                                        <>
                                            <a href="/admin/users" onClick={handleLinkClick} style={{ color: '#ef4444', fontWeight: '800' }}>🔐 회원 권한 관리</a>
                                            <a href="/admin" onClick={handleLinkClick} style={{ color: '#ef4444', fontWeight: '800' }}>📋 고객 문의 관리</a>
                                            <div className={styles.mobileSubDivider}></div>
                                        </>
                                    )}

                                    <div className={styles.mobileSubLabel}>시스템</div>
                                    <a href="https://elssolution.synology.me" target="_blank" rel="noopener noreferrer" onClick={handleLinkClick}>NAS 시스템</a>
                                    <div className={styles.mobileSubDivider}></div>

                                    <div className={styles.mobileSubDivider}></div>

                                    <div style={{ padding: '10px 20px', fontWeight: '700', color: '#1a1a1a', fontSize: '1rem' }}>지점별 서비스</div>
                                    <a href="/employees/branches/asan" onClick={handleLinkClick} style={{ paddingLeft: '35px', fontSize: '0.95rem' }}>└ 아산지점</a>
                                    <a href="/employees/branches/asan/menu" onClick={handleLinkClick} style={{ paddingLeft: '50px', fontSize: '0.9rem', color: 'var(--primary-blue)' }}>└ 식단선택</a>
                                    <a href="/employees/branches/jungbu" onClick={handleLinkClick} style={{ paddingLeft: '35px', fontSize: '0.95rem' }}>└ 중부지점</a>
                                    <a href="/employees/branches/dangjin" onClick={handleLinkClick} style={{ paddingLeft: '35px', fontSize: '0.95rem' }}>└ 당진지점</a>
                                    <a href="/employees/branches/yesan" onClick={handleLinkClick} style={{ paddingLeft: '35px', fontSize: '0.95rem' }}>└ 예산지점</a>
                                </div>
                            </div>
                            <a href="/contact" className={styles.mobileContactBtn} onClick={handleLinkClick}>문의하기</a>
                            {isMounted && (
                                user ? (
                                    <button onClick={handleLogout} className={styles.mobileAuthBtn}>로그아웃</button>
                                ) : (
                                    <button onClick={handleLoginClick} className={styles.mobileAuthBtn}>로그인</button>
                                )
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
