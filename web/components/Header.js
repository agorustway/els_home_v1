'use client';
import { useState, useEffect } from 'react';
import styles from './Header.module.css';
import { createClient } from '@/utils/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getRoleLabel } from '@/utils/roles';
import { useUserProfile } from '@/hooks/useUserProfile';

// Centralized navigation structure
const navLinks = [
    {
        label: '회사소개',
        href: '/intro',
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
    { href: '/webzine', label: '웹진' },
    { href: '/network', label: '네트워크' },
    { href: '/contact', label: '문의하기', isContact: true },
    {
        label: '인트라넷',
        href: '/employees/weather',
        isEmployee: true,
        children: [
            { href: '/employees/weather', label: '인트라넷 홈' },
            { type: 'divider' },
            { label: '자동화시스템', type: 'label' },
            { href: '/employees/safe-freight', label: '안전운임 조회' },
            { href: '/employees/container-history', label: '컨테이너 이력조회' },
            { href: '/employees/archive', label: '자료실 (NAS)' },
            { type: 'divider' },
            {
                label: '업무보고',
                children: [
                    { href: '/employees/reports/daily', label: '일일 업무일지', isSubItem: true },
                    { href: '/employees/reports/monthly', label: '월간 실적보고', isSubItem: true },
                    { href: '/employees/reports/my', label: '내 업무보고', isSubItem: true },
                ]
            },
            { type: 'divider' },
            {
                label: '자료실',
                children: [
                    { href: '/employees/work-docs', label: '업무자료실', isSubItem: true },
                    { href: '/employees/form-templates', label: '서식자료실', isSubItem: true },
                ]
            },
            {
                label: '연락처',
                children: [
                    { href: '/employees/work-sites', label: '작업지안내', isSubItem: true },
                    { href: '/employees/internal-contacts', label: '사내연락망', isSubItem: true },
                    { href: '/employees/external-contacts', label: '외부연락처', isSubItem: true },
                    { href: '/employees/partner-contacts', label: '협력사정보', isSubItem: true },
                    { href: '/employees/driver-contacts', label: '운전원정보', isSubItem: true },
                ]
            },
            { type: 'divider' },
            {
                label: '직원 서비스',
                children: [
                    { href: '/employees/weather', label: '날씨' },
                    { href: '/employees/news', label: '뉴스' },
                    { href: '/employees/board/free', label: '자유게시판' },
                    { href: '/employees/random-game', label: '랜덤게임' },
                ]
            },
            {
                label: '지점별 서비스',
                children: [
                    { label: '수도권/본사', type: 'label' },
                    { href: '/employees/branches/headquarters', label: '서울본사', isSubItem: true },
                    { type: 'divider' },
                    { label: '충청권 지점', type: 'label' },
                    { href: '/employees/branches/asan', label: '아산지점', isSubItem: true },
                    { href: '/employees/branches/jungbu', label: '중부지점', isSubItem: true },
                    { href: '/employees/branches/dangjin', label: '당진지점', isSubItem: true },
                    { href: '/employees/branches/yesan', label: '예산지점', isSubItem: true },
                ]
            },
            { type: 'divider' },
            { href: '/admin/users', label: '회원 권한 관리', isAdmin: true },
            { href: '/admin', label: '고객 문의 관리', isAdmin: true },
        ]
    },
];

export default function Header({ darkVariant = false, isEmployees = false, isSidebarOpen = false }) {
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [expandedMenus, setExpandedMenus] = useState([]);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [deferredPrompt, setDeferredPrompt] = useState(null);

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

    // Close menus when clicking outside
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
        const handlePWA = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('closeHeaderMenu', handleCloseHeader);
        window.addEventListener('beforeinstallprompt', handlePWA);
        return () => {
            window.removeEventListener('closeHeaderMenu', handleCloseHeader);
            window.removeEventListener('beforeinstallprompt', handlePWA);
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

    const toggleUserMenu = () => setUserMenuOpen(!userMenuOpen);

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

    const handleLoginClick = () => {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
        handleLinkClick();
    };

    const handleCreateShortcut = async () => {
        if (!deferredPrompt) {
            alert('이미 앱이 설치되어 있거나, 브라우저가 자동 설치를 지원하지 않습니다.\\n브라우저 주소창 우측의 [설치] 아이콘을 확인해주세요!');
            return;
        }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setDeferredPrompt(null);
        }
    };

    // Determine visual styles based on state
    // 새로운 인트라넷 홈(/employees/weather)에서는 일반 페이지처럼 투명 헤더 적용
    const isIntranetHome = pathname === '/employees/weather' || pathname === '/employees/weather/';
    const isDarkHeader = scrolled || darkVariant || (isEmployees && !isIntranetHome);
    const headerBg = isDarkHeader ? '#ffffff' : 'transparent';
    const textColor = isDarkHeader ? '#1a1a1a' : '#ffffff';
    const logoFilter = isDarkHeader ? 'none' : 'brightness(0) invert(1)';
    const shadow = (isDarkHeader && !isEmployees) ? '0 4px 20px rgba(0, 0, 0, 0.1)' : 'none';

    const displayName = profile?.full_name || profile?.email?.split('@')[0] || '사용자';
    const displayInitial = displayName[0]?.toUpperCase() || 'U';

    const renderNavLinks = (isMobile = false) => {
        const linkElements = navLinks.map((link, index) => {
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

                                    // Special logic for '인트라넷' parent item on mobile
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
                            {isMobile && !link.isEmployee && <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}><path d="m6 9 6 6 6-6" /></svg>}
                        </a>
                        {/* Render children only if NOT Employee menu on mobile (since it opens sidebar instead) */}
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
                    prefetch={false} // 모바일 세션 충돌 방지
                >
                    {link.label}
                </Link>
            );
        }).filter(Boolean); // Filter out nulls from conditional rendering

        // Push Employee Portal link on Desktop if not loading and user is not a visitor
        if (!isMobile && !loading && profile && profile.role !== 'visitor') {
            // This block is already being handled within the map filter above.
            // If the original navLinks already contain an entry for '임직원전용',
            // this duplicate push might be problematic. Let's make sure it's not a duplicate.
            // Assuming the `navLinks` array contains a top-level `isEmployee` item.
            // If so, the filter above is sufficient.
            // Remove the push logic from here, as the filtering in map should take care of it.
        }

        // PUSH AUTH BUTTON FIRST
        if (!isMobile && !loading) {
            linkElements.push(
                <div key="auth-btn" style={{ marginLeft: '20px', display: 'flex', alignItems: 'center', position: 'relative' }}>
                    {profile ? (
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
                                {profile?.avatar_url ? (
                                    <img
                                        src={profile.avatar_url}
                                        alt={displayName}
                                        style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '50%',
                                            border: '2px solid white',
                                            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                                            objectFit: 'cover'
                                        }}
                                    />
                                ) : (
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
                                )}
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
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#1e293b' }}>
                                            {displayName}
                                            {(profile.rank || profile.position) && (
                                                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 400, marginLeft: '4px' }}>
                                                    {profile.rank}{profile.position ? `(${profile.position})` : ''}
                                                </span>
                                            )}
                                            님
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{getRoleLabel(profile.role)}</div>
                                    </div>
                                    <Link
                                        href="/employees/mypage"
                                        style={{ display: 'block', padding: '10px 20px', fontSize: '0.9rem', color: '#334155', textDecoration: 'none', transition: 'background 0.2s' }}
                                        onClick={() => setUserMenuOpen(false)}
                                        onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                    >
                                        내 정보 수정
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
                                        로그아웃
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

        // PUSH SHORTCUT BUTTON AT THE VERY END
        linkElements.push(
            <div key="shortcut-btn" style={{ marginLeft: '15px', display: 'flex', alignItems: 'center' }}>
                <button
                    type="button"
                    onClick={handleCreateShortcut}
                    className={styles.shortcutBtn}
                    title="바탕화면에 바로가기를 만듭니다"
                >
                    <img src="/favicon.png" alt="ELS" className={styles.shortcutIcon} />
                    바로가기
                </button>
            </div>
        );

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
                        if (subLink.href?.startsWith('/employees') || subLink.href?.startsWith('/admin')) {
                            handleProtectedClick(e);
                        }
                        if (!e.defaultPrevented) handleLinkClick();
                    }}
                    prefetch={false} // 모바일 세션 충돌 방지
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
                className={`${styles.header} ${isEmployees && !isIntranetHome ? styles.relativeHeader : ''}`}
                style={{
                    backgroundColor: headerBg,
                    color: textColor,
                    height: '70px',
                    transition: 'background-color 0.3s, color 0.3s',
                    position: (isIntranetHome || !isEmployees) ? 'fixed' : 'relative',
                    top: 0,
                    left: 0,
                    width: '100%',
                    zIndex: 1000
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
                    {!loading && (profile ?
                        <>
                            <div className={styles.welcomeMsg}>
                                환영합니다, <strong>{displayName}</strong>
                                {(profile.rank || profile.position) && (
                                    <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>
                                        &nbsp;{profile.rank}{profile.position ? `(${profile.position})` : ''}
                                    </span>
                                )} 님!<br />
                                <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 400 }}>({getRoleLabel(profile.role)})</span>
                            </div>
                            <button onClick={handleLogout} className={styles.mobileAuthBtn}>로그아웃</button>
                        </> :
                        <button onClick={handleLoginClick} className={styles.mobileAuthBtn}>로그인</button>
                    )}
                    <button
                        type="button"
                        onClick={handleCreateShortcut}
                        className={styles.mobileShortcutBtn}
                        style={{
                            width: '100%',
                            marginTop: '10px',
                            padding: '12px',
                            background: '#fff',
                            color: '#1a1a1a',
                            border: '1px solid #ddd',
                            borderRadius: '8px',
                            fontSize: '0.95rem',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        <img src="/favicon.png" alt="ELS" style={{ width: '20px', height: '20px' }} />
                        바로가기 설치 (바탕화면)
                    </button>
                </div>
                <div className={styles.mobileNavLinks}>
                    {renderNavLinks(true)}
                </div>
            </div>
            <div className={`${styles.overlay} ${menuOpen ? styles.overlayOpen : ''}`} onClick={toggleMenu} />
        </>
    );
}