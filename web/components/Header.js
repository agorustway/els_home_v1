'use client';
import { useState, useEffect } from 'react';
import styles from './Header.module.css';
import { createClient } from '../utils/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getRoleLabel } from '../utils/roles';

// Centralized navigation structure
const navLinks = [
    {
        label: '회사소개',
        children: [
            { href: '/intro', label: '회사 개요' },
            { href: '/vision', label: '비전' },
            { href: '/esg', label: 'ESG' },
            { href: '/team', label: '조직도' },
            { href: '/history', label: '연혁' },
            { type: 'divider' },
            {
                label: '사원복지',
                children: [
                    { href: '/welfare#satisfaction', label: '직원만족도 조사' },
                    { href: '/welfare#grievance', label: '고충상담' },
                    { href: '/welfare#roadmap', label: '지속가능 일터' },
                    { href: '/welfare#report', label: '부조리/인권침해 제보' },
                ]
            }
        ]
    },
    { href: '/services', label: '서비스' },
    { href: '/dashboard', label: '실적현황' },
    { href: '/network', label: '네트워크' },
    { href: '/contact', label: '문의하기', isContact: true },
    {
        label: '임직원전용',
        isEmployee: true,
        children: [
            { href: '/admin/users', label: '🔐 회원 권한 관리', isAdmin: true },
            { href: '/admin', label: '📋 고객 문의 관리', isAdmin: true },
            { type: 'divider', isAdmin: true },
            { label: '사내 시스템', type: 'label' },
            { href: '/employees/archive', label: '📂 자료실 (NAS)' },
            { href: '/employees/board/free', label: '💬 자유게시판' },
            { href: '/employees/webzine', label: '📰 웹진 (블로그)' },
            { type: 'divider' },
            { label: '업무보고', type: 'label' },
            { href: '/employees/reports', label: '📊 통합 업무보고' },
            { href: '/employees/reports/my', label: '📝 내 업무보고' },
            { type: 'divider' },
            {
                label: '지점별 서비스',
                children: [
                    { href: '/employees/branches/asan', label: '아산지점' },
                    { href: '/employees/branches/asan/menu', label: '└ 식단선택', isSubItem: true },
                    { href: '/employees/branches/asan_cy', label: '아산CY' },
                    { href: '/employees/branches/jungbu', label: '중부지점' },
                    { href: '/employees/branches/dangjin', label: '당진지점' },
                    { href: '/employees/branches/yesan', label: '예산지점' },
                    { href: '/employees/branches/seosan', label: '서산지점' },
                    { href: '/employees/branches/yeoncheon', label: '연천지점' },
                    { href: '/employees/branches/ulsan', label: '울산지점' },
                    { href: '/employees/branches/imgo', label: '임고지점' },
                    { href: '/employees/branches/bulk', label: '벌크사업부' },
                ]
            }
        ]
    },
];

export default function Header({ darkVariant = false }) {
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [expandedMenus, setExpandedMenus] = useState([]);
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(null);
    const [userName, setUserName] = useState(null);
    const [isMounted, setIsMounted] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false); // User Menu Dropdown State

    const supabase = createClient();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const handleScroll = () => {
            const isScrolled = window.scrollY > 20;
            if (scrolled !== isScrolled) setScrolled(isScrolled);
        };

        window.addEventListener('scroll', handleScroll);
        handleScroll();

        const getUserAndRole = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
            if (user) {
                const { data: roleData } = await supabase.from('user_roles').select('role, name').eq('id', user.id).single();
                setRole(roleData?.role);
                setUserName(roleData?.name);
            }
        };
        getUserAndRole();
        setIsMounted(true);

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null);
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
                getUserAndRole();
            }
        });

        return () => {
            window.removeEventListener('scroll', handleScroll);
            subscription?.unsubscribe();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        document.body.style.overflow = menuOpen ? 'hidden' : 'unset';
    }, [menuOpen]);

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            if (userMenuOpen) setUserMenuOpen(false);
        };
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, [userMenuOpen]);

    const toggleMenu = () => setMenuOpen(!menuOpen);
    const toggleUserMenu = () => setUserMenuOpen(!userMenuOpen);

    const handleLinkClick = () => {
        setMenuOpen(false);
    };

    const toggleDropdown = (label) => {
        setExpandedMenus(prev => {
            if (prev.includes(label)) return prev.filter(item => item !== label);
            else return [...prev, label];
        });
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.refresh();
        setUserMenuOpen(false);
        handleLinkClick();
    };

    const handleLoginClick = () => {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
        handleLinkClick();
    };

    // Determine visual styles based on state
    const isDarkHeader = scrolled || darkVariant;
    const headerBg = isDarkHeader ? '#ffffff' : 'transparent';
    const textColor = isDarkHeader ? '#1a1a1a' : '#ffffff';
    const logoFilter = isDarkHeader ? 'none' : 'brightness(0) invert(1)';
    const shadow = isDarkHeader ? '0 4px 20px rgba(0, 0, 0, 0.1)' : 'none';

    const displayName = userName || user?.email?.split('@')[0] || '사용자';
    const displayInitial = displayName[0]?.toUpperCase() || 'U';

    const renderNavLinks = (isMobile = false) => {
        const linkElements = navLinks.filter(link => {
            return isMobile ? true : !link.isEmployee;
        }).map((link, index) => {
            if (link.children) {
                const isExpanded = expandedMenus.includes(link.label);
                return (
                    <div key={index} className={isMobile ? styles.mobileNode : styles.hasDropdown}>
                        <a
                            href={link.href || '#'}
                            className={isMobile ? styles.mobileLink : `${styles.dropBtn} ${link.isEmployee ? styles.empBtn : ''}`}
                            style={{ color: isMobile ? '#333' : textColor }}
                            onClick={(e) => {
                                if (isMobile) {
                                    e.preventDefault();
                                    toggleDropdown(link.label);
                                }
                            }}
                        >
                            {link.label}
                            {isMobile && <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}><path d="m6 9 6 6 6-6" /></svg>}
                        </a>
                        <div className={isMobile ? `${styles.mobileSub} ${isExpanded ? styles.showSub : ''}` : styles.dropdown}>
                            {renderSubLinks(link.children, isMobile)}
                        </div>
                    </div>
                );
            }

            return <Link key={index} href={link.href} className={isMobile ? styles.mobileLink : ''} style={{ color: isMobile ? '#333' : textColor }} onClick={handleLinkClick}>{link.label}</Link>;
        });

        // Always show Employee Portal link on Desktop
        if (!isMobile && isMounted) {
            linkElements.push(
                <div key="employee-nav" className={styles.hasDropdown}>
                    <a
                        href="/employees"
                        className={styles.empBtn}
                        style={{
                            color: textColor,
                            borderColor: isDarkHeader ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.4)',
                        }}
                    >
                        임직원전용
                    </a>
                    <div className={styles.dropdown}>
                        {renderSubLinks(navLinks.find(l => l.isEmployee)?.children || [], false)}
                        <div className={styles.dropdownDivider} />
                        <Link href="/employees/mypage" className={styles.dropdownItem} onClick={handleLinkClick}>👤 내 정보 수정</Link>
                    </div>
                </div>
            );

            // USER AUTH DROPDOWN
            linkElements.push(
                <div key="auth-btn" style={{ marginLeft: '20px', display: 'flex', alignItems: 'center', position: 'relative' }}>
                    {user ? (
                        <>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleUserMenu();
                                }}
                                title="사용자 메뉴"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 0,
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <span style={{
                                    width: '32px',
                                    height: '32px',
                                    backgroundColor: '#3b82f6',
                                    color: 'white',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold',
                                    fontSize: '0.9rem',
                                    border: '2px solid white',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                                }}>
                                    {displayInitial}
                                </span>
                            </button>

                            {userMenuOpen && (
                                <div style={{
                                    position: 'absolute',
                                    top: '120%',
                                    right: 0,
                                    background: 'white',
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                                    padding: '8px 0',
                                    minWidth: '160px',
                                    zIndex: 1000,
                                    overflow: 'hidden'
                                }}>
                                    <div style={{ padding: '8px 20px', borderBottom: '1px solid #f1f5f9', marginBottom: '4px' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#1e293b' }}>{displayName}님</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{getRoleLabel(role)}</div>
                                    </div>
                                    <Link
                                        href="/employees/mypage"
                                        style={{ display: 'block', padding: '10px 20px', fontSize: '0.9rem', color: '#334155', textDecoration: 'none', transition: 'background 0.2s' }}
                                        onClick={() => setUserMenuOpen(false)}
                                        onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                    >
                                        👤 내 정보 수정
                                    </Link>
                                    <button
                                        onClick={handleLogout}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '10px 20px',
                                            fontSize: '0.9rem',
                                            color: '#ef4444',
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.target.style.background = '#fef2f2'}
                                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                    >
                                        🚪 로그아웃
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <Link
                            href={`/login?next=${encodeURIComponent(pathname)}`}
                            style={{
                                backgroundColor: '#0056b3',
                                color: 'white',
                                padding: '8px 16px',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                textDecoration: 'none',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            로그인
                        </Link>
                    )}
                </div>
            );
        }

        return linkElements;
    };

    const renderSubLinks = (subLinks, isMobile) => {
        return subLinks.map((subLink, subIndex) => {
            if (subLink.isAdmin && role !== 'admin') return null;
            if (subLink.type === 'divider') return <div key={subIndex} className={isMobile ? styles.mobileSubDivider : styles.dropdownDivider} />;
            if (subLink.type === 'label') return <div key={subIndex} className={isMobile ? styles.mobileSubLabel : styles.dropdownLabel}>{subLink.label}</div>;

            if (subLink.children) {
                const isExpanded = expandedMenus.includes(subLink.label);
                return (
                    <div key={subIndex} className={isMobile ? '' : styles.hasSubDropdown}>
                        <a href="#" className={isMobile ? styles.mobileSubToggle : styles.dropdownItem} onClick={(e) => {
                            e.preventDefault();
                            if (isMobile) toggleDropdown(subLink.label);
                        }}>
                            {subLink.label}
                            <svg viewBox="0 0 24 24" width="14" height="14" style={{ transform: isMobile && isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}><path d="m9 18 6-6-6-6" /></svg>
                        </a>
                        <div className={isMobile ? `${styles.mobileSub} ${isExpanded ? styles.showSub : ''}` : styles.subDropdown}>
                            {renderSubLinks(subLink.children, isMobile)}
                        </div>
                    </div>
                );
            }

            const className = isMobile
                ? `${styles.mobileSubItem} ${subLink.isSubItem ? styles.mobileSubItemNested : ''}`
                : `${styles.dropdownItem} ${subLink.isSubItem ? styles.dropdownSubItem : ''} ${subLink.isAdmin ? styles.adminLink : ''}`;

            return <Link key={subIndex} href={subLink.href} className={className} onClick={handleLinkClick}>{subLink.label}</Link>;
        }).filter(Boolean);
    };

    return (
        <>
            <header
                className={styles.header}
                style={{
                    backgroundColor: headerBg,
                    boxShadow: shadow,
                    color: textColor,
                    height: '70px',
                    transition: 'background-color 0.3s, color 0.3s'
                }}
            >
                <div className="container">
                    <div className={styles.inner}>
                        <Link href="/" className={styles.logo} onClick={handleLinkClick}>
                            <img
                                src="/images/logo.png"
                                alt="ELS SOLUTION"
                                className={styles.logoImage}
                                style={{
                                    filter: logoFilter,
                                    height: '27px',
                                    transition: 'filter 0.3s'
                                }}
                            />
                        </Link>

                        <nav className={styles.nav}>
                            {renderNavLinks(false)}
                        </nav>

                        {/* Mobile Toggle Button Only */}
                        <div className={styles.utility} style={{ marginLeft: '0' }}>
                            <button
                                className={`${styles.mobileToggle} ${menuOpen ? styles.active : ''}`}
                                onClick={toggleMenu}
                                aria-label="Toggle Menu"
                                style={{ color: isDarkHeader ? '#1a1a1a' : '#ffffff' }}
                            >
                                <span style={{ backgroundColor: 'currentColor' }} />
                                <span style={{ backgroundColor: 'currentColor' }} />
                                <span style={{ backgroundColor: 'currentColor' }} />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className={`${styles.mobileNav} ${menuOpen ? styles.mobileNavOpen : ''}`}>
                <div className={styles.mobileNavHeader}>
                    {isMounted && (user ?
                        <>
                            <div className={styles.welcomeMsg}>
                                환영합니다, <strong>{displayName}</strong>님!<br />
                                <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 400 }}>({getRoleLabel(role)})</span>
                            </div>
                            <button onClick={handleLogout} className={styles.mobileAuthBtn}>로그아웃</button>
                        </> :
                        <button onClick={handleLoginClick} className={styles.mobileAuthBtn}>로그인</button>
                    )}
                </div>
                <div className={styles.mobileNavLinks}>
                    {renderNavLinks(true)}
                </div>
            </div>
            <div className={`${styles.overlay} ${menuOpen ? styles.overlayOpen : ''}`} onClick={toggleMenu} />
        </>
    );
}