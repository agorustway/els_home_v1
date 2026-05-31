'use client';
import { useState, useEffect } from 'react';
import styles from './Header.module.css';
import { createClient } from '@/utils/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getRoleLabel } from '@/utils/roles';
import { useUserProfile } from '@/hooks/useUserProfile';
import { buildHeaderEmployeeMenuChildren } from '@/constants/intranetMenu';

// Centralized navigation structure
const navLinks = [
    {
        label: '회사소개',
        href: '/intro',
        children: [
            { href: '/intro', label: '회사개요' },
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
    { href: '/webzine', label: '웹진' },
    { href: '/network', label: '네트워크' },
    { href: '/contact', label: '문의하기', isContact: true },
    {
        label: '인트라넷',
        href: '/employees/ask',
        isEmployee: true,
        children: buildHeaderEmployeeMenuChildren()
    },
];

export default function Header({ darkVariant = false, isEmployees = false, isSidebarOpen = false }) {
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [expandedMenus, setExpandedMenus] = useState([]);
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const { profile, loading } = useUserProfile();

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

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [scrolled]);

    useEffect(() => {
        document.body.style.overflow = menuOpen ? 'hidden' : 'unset';
    }, [menuOpen]);

    useEffect(() => {
        const handleClickOutside = () => {
            if (userMenuOpen) setUserMenuOpen(false);
        };
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, [userMenuOpen]);

    // 사이드바가 열리면 헤더 메뉴 닫기
    useEffect(() => {
        if (isSidebarOpen) setMenuOpen(false);
    }, [isSidebarOpen]);

    // 헤더 메뉴 전용 닫기 이벤트 리스너
    useEffect(() => {
        const handleCloseHeader = () => setMenuOpen(false);
        window.addEventListener('closeHeaderMenu', handleCloseHeader);
        return () => {
            window.removeEventListener('closeHeaderMenu', handleCloseHeader);
        };
    }, []);

    const toggleMenu = () => {
        const nextState = !menuOpen;
        if (nextState) {
            // 헤더 메뉴를 열 때, 인트라넷 사이드바가 있다면 닫으라고 신호 보냄
            window.dispatchEvent(new Event('closeSidebar'));
        }
        setMenuOpen(nextState);
    };

    const toggleUserMenu = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        setUserMenuOpen(!userMenuOpen);
    };

    const handleLinkClick = () => {
        setMenuOpen(false);
    };

    // Special handler for Intranet Item in Global Nav
    const handleIntranetClick = (e, href) => {
        // 모바일에서 인트라넷 홈 클릭 시: 글로벌 네비 닫기 + 사이드바 열기 + 페이지 이동
        if (window.innerWidth < 768) {
            setMenuOpen(false); // Close Global Nav

            if (pathname === href) {
                // 이미 해당 페이지면 즉시 열기
                window.dispatchEvent(new Event('openSidebar'));
            } else {
                // 페이지 이동 시 SiteLayout에서 감지하여 열도록 플래그 설정
                sessionStorage.setItem('shouldOpenSidebar', 'true');
            }
        }
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
    const handleProtectedClick = (e) => {
        if (profile?.role === 'visitor') {
            e.preventDefault();
            window.dispatchEvent(new Event('openApprovalModal'));
        }
    };

    // Determine visual styles based on state
    const isDarkHeader = scrolled || darkVariant || isEmployees;
    const headerBg = isDarkHeader ? '#ffffff' : 'transparent';
    const textColor = isDarkHeader ? '#000000' : '#ffffff';
    const logoFilter = isDarkHeader ? 'none' : 'brightness(0) invert(1)';
    const shadow = (isDarkHeader && !isEmployees) ? '0 4px 20px rgba(0, 0, 0, 0.1)' : 'none';

    const displayName = profile?.name || profile?.full_name || profile?.user_metadata?.name || profile?.email?.split('@')[0] || '사용자';
    const displayInitial = displayName[0]?.toUpperCase() || 'U';

    const renderNavLinks = (isMobile = false) => {
        const linkElements = navLinks.map((link, index) => {
            if (link.isEmployee && !profile) {
                return (
                    <Link
                        key={index}
                        href={`/login?next=${encodeURIComponent('/employees/ask')}`}
                        className={isMobile ? styles.mobileLink : styles.empBtn}
                        style={{ color: isMobile ? '#333' : textColor }}
                        onClick={handleLinkClick}
                        prefetch={false}
                    >
                        인트라넷
                    </Link>
                );
            }

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
                                    if (link.isEmployee) {
                                        handleIntranetClick(e, link.href);
                                        if (link.href) router.push(link.href);
                                        return;
                                    }
                                    toggleDropdown(link.label);
                                } else if (link.isEmployee) {
                                    handleProtectedClick(e);
                                }
                            }}
                        >
                            {link.label}
                            {isMobile && !link.isEmployee && (
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}><path d="m6 9 6 6 6-6" /></svg>
                            )}
                        </a>
                        {(!isMobile || !link.isEmployee) && (
                            <div className={isMobile ? `${styles.mobileSub} ${isExpanded ? styles.showSub : ''}` : styles.dropdown}>
                                {renderSubLinks(link.children, isMobile)}
                            </div>
                        )}
                    </div>
                );
            }

            return (
                <Link
                    key={index}
                    href={link.href}
                    className={isMobile ? styles.mobileLink : ''}
                    style={{ color: isMobile ? '#333' : textColor }}
                    onClick={handleLinkClick}
                    prefetch={false}
                >
                    {link.label}
                </Link>
            );
        }).filter(Boolean);

        // 데스크탑 전용: 로그인 후 프로필 썸네일 표시
        if (!isMobile && !loading && profile) {
            linkElements.push(
                <div key="desktop-auth-profile" className={styles.desktopNavAuth}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <button onClick={(e) => toggleUserMenu(e)} title="사용자 메뉴" className={styles.googleStyleAuthBtn}>
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt={displayName} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', objectFit: 'cover' }} />
                            ) : (
                                <span className={styles.userInitial}>{displayInitial}</span>
                            )}
                        </button>
                        {userMenuOpen && (
                            <div className={styles.userDropdownMenu}>
                                <div className={styles.userDropdownHeader}>
                                    <div className={styles.userDropdownName}>
                                        {displayName}
                                        {(profile.rank || profile.position) && <span className={styles.userDropdownTitle}>{profile.rank}{profile.position ? `(${profile.position})` : ''}</span>}
                                    </div>
                                    <div className={styles.userDropdownRole}>{getRoleLabel(profile.role)}</div>
                                </div>
                                <Link href="/employees/mypage" className={styles.dropdownItem} onClick={() => setUserMenuOpen(false)}>내 정보 수정</Link>
                                <button onClick={handleLogout} className={styles.dropdownItem} style={{ color: '#ef4444', border: 'none', background: 'transparent', cursor: 'pointer', width: '100%', textAlign: 'left' }}>로그아웃</button>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return linkElements;
    };


    const renderSubLinks = (subLinks, isMobile) => {
        return subLinks.map((subLink, subIndex) => {
            if (subLink.isAdmin && profile?.role !== 'admin') return null;
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

            return (
                <Link
                    key={subIndex}
                    href={subLink.href}
                    className={className}
                    onClick={(e) => {
                        if (subLink.href?.startsWith('/employees') || subLink.href?.startsWith('/admin')) handleProtectedClick(e);
                        if (!e.defaultPrevented) handleLinkClick();
                    }}
                    prefetch={false}
                >
                    {subLink.label}
                </Link>
            );
        }).filter(Boolean);
    };

    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

    return (
        <>
            <header
                className={`${styles.header} ${isEmployees ? styles.relativeHeader : ''} ${isDarkHeader ? styles.darkVariant : ''}`}
                style={{
                    backgroundColor: headerBg,
                    color: textColor,
                    height: 'var(--header-height, 64px)',
                    transition: 'background-color 0.3s, color 0.3s',
                    position: !isEmployees ? 'fixed' : 'relative',
                    top: 0,
                    left: 0,
                    width: '100%',
                    zIndex: 1000
                }}
            >
                <div className="container">
                    <div className={styles.inner}>
                        <Link href="/" className={styles.logo} onClick={handleLinkClick}>
                            <img src="/images/logo.png" alt="ELS SOLUTION" className={styles.logoImage} style={{ filter: logoFilter, height: '25px', transition: 'filter 0.3s' }} />
                        </Link>

                        <nav className={styles.nav}>
                            {renderNavLinks(false)}
                        </nav>

                        <div className={styles.utility}>
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
                    <div className={styles.mobileLogo}>
                        <img src="/images/logo.png" alt="ELS SOLUTION" style={{ height: '20px' }} />
                    </div>
                    {!loading && (profile ?
                        <>
                            <div className={styles.welcomeMsg}>
                                환영합니다, <strong>{displayName}</strong>
                                {(profile.rank || profile.position) && <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>&nbsp;{profile.rank}{profile.position ? `(${profile.position})` : ''}</span>} 님!<br />
                                <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 400 }}>({getRoleLabel(profile.role)})</span>
                            </div>
                            <button onClick={handleLogout} className={styles.mobileAuthBtn}>로그아웃</button>
                        </> : null
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
