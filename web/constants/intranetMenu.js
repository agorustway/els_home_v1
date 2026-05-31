/**
 * 임직원 메뉴 구조: 메인 탭 → 탭별 사이드 메뉴 (eTrans 3.0 스타일)
 */

/** 배열 순서 = 경로 매칭 우선순위(앞일수록 우선). displayOrder = 탭 표시 순서. */
export const MAIN_TABS = [
    {
        id: 'home',
        label: '인트라넷 홈',
        defaultPath: '/employees/ask', // AI 어시스턴트가 첫 화면이 되도록 변경
        pathPatterns: ['/employees', '/employees/weather', '/employees/news', '/employees/board', '/employees/ask', '/employees/events'],
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
        defaultPath: '/employees/internal-contacts',
        pathPatterns: ['/employees/internal-contacts', '/employees/external-contacts', '/employees/work-sites', '/employees/partner-contacts', '/employees/driver-contacts'],
        displayOrder: 11,
    },
    {
        id: 'automation',
        label: '자동화시스템',
        defaultPath: '/employees/safe-freight',
        pathPatterns: ['/employees/archive', '/employees/container-history', '/employees/safe-freight', '/employees/vehicle-tracking'],
        displayOrder: 6, // Moved right after Home (5)
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
        { label: 'AI 어시스턴트', path: '/employees/ask' },
        { label: '행사일정', path: '/employees/events' },
        { label: '날씨', path: '/employees/weather' },
        { label: '뉴스', path: '/employees/news' },
        { label: '자유게시판', path: '/employees/board/free' },
    ],
    docs: [
        { label: '업무자료실', path: '/employees/work-docs' },
        { label: '서식자료실', path: '/employees/form-templates' },
    ],
    contacts: [
        { label: '사내연락망', path: '/employees/internal-contacts' },
        { label: '외부연락처', path: '/employees/external-contacts' },
        { label: '작업지정보', path: '/employees/work-sites' },
        { label: '협력사정보', path: '/employees/partner-contacts' },
        { label: '운전원정보', path: '/employees/driver-contacts' },
    ],
    automation: [
        { label: '안전운임 조회', path: '/employees/safe-freight' },
        { label: '컨테이너 이력조회', path: '/employees/container-history' },
        { label: '차량위치관제', path: '/employees/vehicle-tracking' },
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
        { label: '예산지점', path: '/employees/branches/yesan' },
        { label: '당진지점', path: '/employees/branches/dangjin' },
    ],
    admin: [
        { label: '회원 권한 관리', path: '/admin/users' },
        { label: '고객 문의 관리', path: '/admin', exact: true },
        { label: '활동 로그 관리', path: '/admin/logs' },
        { label: '데이터 운영 관리', path: '/admin/data-operations' },
    ],
};

const HEADER_SECTION_ORDER = ['automation', 'reports', 'docs', 'contacts', 'home', 'branches'];
const HEADER_SECTION_LABELS = {
    home: '직원 서비스',
    branches: '지점별 서비스',
};

function toHeaderLink(item, extra = {}) {
    return {
        href: item.path,
        label: item.label,
        ...(item.exact ? { exact: true } : {}),
        ...extra,
    };
}

function buildHeaderSection(tabId) {
    const tab = MAIN_TABS.find((entry) => entry.id === tabId);
    const items = SIDEBAR_ITEMS[tabId] || [];
    if (!tab || items.length === 0) return null;

    if (tabId === 'automation') {
        return [
            { label: tab.label, type: 'label' },
            ...items.map((item) => toHeaderLink(item)),
        ];
    }

    return {
        label: HEADER_SECTION_LABELS[tabId] || tab.label,
        children: items.map((item) => toHeaderLink(item, { isSubItem: true })),
    };
}

export function buildHeaderEmployeeMenuChildren() {
    const homeTab = MAIN_TABS.find((entry) => entry.id === 'home');
    const children = [
        { href: homeTab?.defaultPath || '/employees/ask', label: '인트라넷 홈' },
        { type: 'divider' },
    ];

    const sections = HEADER_SECTION_ORDER
        .map((tabId) => buildHeaderSection(tabId))
        .filter(Boolean);

    sections.forEach((section, index) => {
        if (Array.isArray(section)) children.push(...section);
        else children.push(section);
        if (index < sections.length - 1) children.push({ type: 'divider' });
    });

    const adminItems = SIDEBAR_ITEMS.admin || [];
    children.push({ type: 'divider', isAdmin: true });
    children.push(...adminItems.map((item) => toHeaderLink(item, { isAdmin: true })));

    return children;
}

export function getActiveMainTab(pathname, isAdmin) {
    const p = pathname || '';
    if (p === '/employees' || p === '/employees/' || p.startsWith('/employees/board') || p.startsWith('/employees/weather') || p.startsWith('/employees/news') || p.startsWith('/employees/ask') || p.startsWith('/employees/events')) return 'home';
    for (const tab of MAIN_TABS) {
        if (tab.adminOnly && !isAdmin) continue;
        if (tab.id === 'home') continue;
        const match = tab.pathPatterns.some((path) => p === path || p.startsWith(path + '/'));
        if (match) return tab.id;
    }
    return 'home';
}
