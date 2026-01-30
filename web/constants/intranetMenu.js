/**
 * 임직원 메뉴 구조: 메인 탭 → 탭별 사이드 메뉴 (eTrans 3.0 스타일)
 */

/** 배열 순서 = 경로 매칭 우선순위(앞일수록 우선). displayOrder = 탭 표시 순서. */
export const MAIN_TABS = [
    {
        id: 'admin',
        label: '관리',
        defaultPath: '/admin/users',
        pathPatterns: ['/admin'],
        adminOnly: true,
        displayOrder: 40,
    },
    {
        id: 'reports',
        label: '업무보고',
        defaultPath: '/employees/reports',
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
        id: 'system',
        label: '시스템',
        defaultPath: '/employees',
        pathPatterns: ['/employees/archive', '/employees/container-history', '/employees/board', '/employees'],
        displayOrder: 10,
    },
];

export const SIDEBAR_ITEMS = {
    system: [
        { label: '인트라넷 홈', path: '/employees' },
        { label: '자료실 (NAS)', path: '/employees/archive' },
        { label: '컨테이너 이력조회', path: '/employees/container-history' },
        { label: '자유게시판', path: '/employees/board/free' },
    ],
    reports: [
        { label: '통합 업무보고', path: '/employees/reports' },
        { label: '일일 업무일지', path: '/employees/reports/daily' },
        { label: '월간 실적보고', path: '/employees/reports/monthly' },
        { label: '내 업무보고', path: '/employees/reports/my' },
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

export function getActiveMainTab(pathname, isAdmin) {
    for (const tab of MAIN_TABS) {
        if (tab.adminOnly && !isAdmin) continue;
        const match = tab.pathPatterns.some((p) => pathname === p || pathname.startsWith(p + '/'));
        if (match) return tab.id;
    }
    return 'system';
}
