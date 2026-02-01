/**
 * 전체 사이트 공통 레이아웃: 경로별 히어로·최소 레이아웃 여부
 */

export const HERO_MAP = {
    '/intro': {
        title: '회사소개',
        subtitle: '고객공감 서비스를 실현하는 운송 및 제조 서비스 전문 기업',
        bgImage: '/images/office_intro.png',
    },
    '/vision': {
        title: '경영이념',
        subtitle: '이엘에스솔루션이 추구하는 핵심 가치와 미래상',
        bgImage: '/images/hero_cy.png',
    },
    '/esg': {
        title: 'ESG',
        subtitle: '지속가능한 물류의 미래를 위한 약속',
        bgImage: '/images/container_logistics.png',
    },
    '/team': {
        title: '조직도',
        subtitle: '효율적인 의사결정과 전문성을 갖춘 조직 구성',
        bgImage: '/images/steel_logistics.png',
    },
    '/history': {
        title: '연혁',
        subtitle: '끊임없는 변화와 성장의 발걸음',
        bgImage: '/images/hero_logistics.png',
    },
    '/welfare': {
        title: '사원복지',
        subtitle: '구성원과 함께 성장하는 회사',
        bgImage: '/images/hero_logistics.png',
    },
    '/contact': {
        title: '문의하기',
        subtitle: '이엘에스솔루션에 궁금하신 점을 남겨주세요',
        bgImage: '/images/hero_logistics.png',
    },
    '/services': {
        title: 'Service',
        subtitle: '고객의 가치를 최우선으로 하는 맞춤형 물류 및 제조 서비스',
        bgImage: '/images/hero_cy.png',
    },
    '/network': {
        title: '네트워크',
        subtitle: '전국 주요 거점을 잇는 이엘에스솔루션의 인프라',
        bgImage: '/images/hero_cy.png',
    },
    '/employees': {
        title: 'Intranet',
        subtitle: '자유로운 정보 공유와 효율적인 업무 협업을 위한 사내 인트라넷입니다.',
        bgImage: '/images/hero_cy.png',
    },
    '/dashboard': {
        title: '실적현황',
        subtitle: '실시간 물류 현황 및 지표 데이터',
        bgImage: '/images/hero_logistics.png',
    },
    '/webzine': {
        title: '웹진',
        subtitle: '회사 소식과 이야기를 전합니다.',
        bgImage: '/images/hero_logistics.png',
    },
    '/admin': {
        title: '관리',
        subtitle: '고객 문의 및 권한 관리',
        bgImage: '/images/hero_cy.png',
    },
};

/** /admin 은 경로 매칭 시 employees 구간과 동일한 상단/사이드 적용 */
export function isEmployeesPath(pathname) {
    return pathname?.startsWith('/employees') || pathname?.startsWith('/admin');
}

/** 이 경로들은 상단 네비·사이드바 없이 Header + children + Footer 만 (또는 children만) */
export const MINIMAL_LAYOUT_PATHS = ['/login', '/auth'];

/**
 * 본문 상단 서브메뉴: 그룹별 하위 메뉴 목록
 * 예: 회사소개 구간에서는 회사개요, 비전, 조직도 등만 표시
 */
export const SUB_NAV_GROUPS = [
    {
        pathPatterns: ['/intro', '/vision', '/team', '/history', '/esg', '/welfare'],
        items: [
            { name: '회사개요', path: '/intro' },
            { name: '비전', path: '/vision' },
            { name: '조직도', path: '/team' },
            { name: '연혁', path: '/history' },
            { name: 'ESG', path: '/esg' },
            { name: '사원복지', path: '/welfare' },
        ],
    },
    {
        pathPatterns: ['/contact'],
        items: [{ name: '문의하기', path: '/contact' }],
    },
];

export function getSubNavItems(pathname) {
    if (!pathname) return [];
    for (const group of SUB_NAV_GROUPS) {
        const match = group.pathPatterns.some(
            (p) => pathname === p || pathname.startsWith(p + '/')
        );
        if (match) return group.items;
    }
    return [];
}

/** 홈(/) 은 히어로 없이 SubNav + 사이드 + 메인 */
export function getHeroForPath(pathname) {
    if (!pathname || pathname === '/') return null;
    const exact = HERO_MAP[pathname];
    if (exact) return exact;
    if (pathname.startsWith('/employees')) return HERO_MAP['/employees'];
    if (pathname.startsWith('/admin')) return HERO_MAP['/admin'];
    if (pathname.startsWith('/webzine')) return HERO_MAP['/webzine'];
    return null;
}
