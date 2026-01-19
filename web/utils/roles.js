export const ROLE_LABELS = {
    admin: '관리자',
    headquarters: '본사직원',
    asan: '아산지점',
    central: '중부지점',
    dangjin: '당진지점',
    yesan: '예산지점',
    visitor: '방문자'
};

export function getRoleLabel(role) {
    return ROLE_LABELS[role?.toLowerCase()] || role || '방문자';
}
