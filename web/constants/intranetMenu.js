/**
 * 임직원 메뉴 구조: 메인 탭 → 탭별 사이드 메뉴 (eTrans 3.0 스타일)
 * 인트라넷 홈 상위, 자료/연락처 분리, 시스템 → 자동화시스템
 */

/** 배열 순서 = 경로 매칭 우선순위(앞일수록 우선). displayOrder = 탭 표시 순서. */
export const MAIN_TABS = [
    {
        id: 'home',
        label: '인트라넷 홈',
        defaultPath: '/employees',
        pathPatterns: ['/employees', '/employees/weather', '/employees/news'],
        displayOrder: 5,
    },
    {
        id: 'docs',
        label: '자료실',
        defaultPath: '/employees/work-docs',
        pathPatterns: ['/employees/work-docs', '/employees/form-templates'],
        displayOrder: 10,
    },
    {
        id: 'contacts',
        label: '연락처',
        defaultPath: '/employees/work-sites',
        pathPatterns: ['/employees/work-sites', '/employees/internal-contacts', '/employees/external-contacts', '/employees/partner-contacts', '/employees/driver-contacts'],
        displayOrder: 11,
    },
    {
        id: 'automation',
        label: '자동화시스템',
        defaultPath: '/employees/safe-freight',
        pathPatterns: ['/employees/archive', '/employees/container-history', '/employees/safe-freight'],
        displayOrder: 15,
    },
    {
        id: 'reports',
        label: '업무보고',
        defaultPath: '/employees/reports/daily',
        pathPatterns: ['/employees/reports'],
        displayOrder: 20,
    },
    {
        id: 'branches',
        label: '지점서비스',
        defaultPath: '/employees/branches/asan',
        pathPatterns: ['/employees/branches'],
        displayOrder: 30,
    },
    {
        id: 'admin',
        label: '관리',
        defaultPath: '/admin/users',
        pathPatterns: ['/admin'],
        adminOnly: true,
        displayOrder: 40,
    },
];

export const SIDEBAR_ITEMS = {
    home: [
        { label: '자유게시판', path: '/employees/board/free' },
        { label: '날씨', path: '/employees/weather' },
        { label: '뉴스', path: '/employees/news' },
    ],
    docs: [
        { label: '업무자료실', path: '/employees/work-docs' },
        { label: '서식자료실', path: '/employees/form-templates' },
    ],
    contacts: [
        { label: '작업지안내', path: '/employees/work-sites' },
        { label: '사내연락망', path: '/employees/internal-contacts' },
        { label: '외부연락처', path: '/employees/external-contacts' },
        { label: '협력사정보', path: '/employees/partner-contacts' },
        { label: '운전원정보', path: '/employees/driver-contacts' },
    ],
    automation: [
        { label: '안전운임 조회', path: '/employees/safe-freight' },
        { label: '컨테이너 이력조회', path: '/employees/container-history' },
        { label: '자료실 (NAS)', path: '/employees/archive' },
    ],
    reports: [
        { label: '일일 업무일지', path: '/employees/reports/daily' },
        { label: '월간 실적보고', path: '/employees/reports/monthly' },
        { label: '내가 쓴 보고서', path: '/employees/reports/my' },
    ],
    branches: [
        { label: '서울본사', path: '/employees/branches/headquarters' },
        { label: '아산지점', path: '/employees/branches/asan' },
        { label: '중부지점', path: '/employees/branches/jungbu' },
        { label: '당진지점', path: '/employees/branches/dangjin' },
        { label: '예산지점', path: '/employees/branches/yesan' },
    ],
    admin: [
        { label: '권한관리', path: '/admin/users' },
        { label: '고객 문의 관리', path: '/admin' },
    ],
};

/**
 * 현재 경로에 해당하는 메인 탭 ID 반환.
 * 인트라넷 홈: /employees 정확히 또는 /employees/board/* (자유게시판)
 */
export function getActiveMainTab(pathname, isAdmin) {
    const p = pathname || '';
    if (p === '/employees' || p === '/employees/' || p.startsWith('/employees/board') || p.startsWith('/employees/weather') || p.startsWith('/employees/news')) return 'home';
    for (const tab of MAIN_TABS) {
        if (tab.adminOnly && !isAdmin) continue;
        if (tab.id === 'home') continue;
        const match = tab.pathPatterns.some((path) => p === path || p.startsWith(path + '/'));
        if (match) return tab.id;
    }
    return 'home';
}
