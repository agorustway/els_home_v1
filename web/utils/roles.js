export const ROLE_LABELS = {
    admin: '관리자',
    headquarters: '서울본사',
    asan: '아산지점',
    asan_cy: '아산CY',
    jungbu: '중부지점',
    dangjin: '당진지점',
    yesan: '예산지점',
    seosan: '서산지점',
    yeoncheon: '연천지점',
    ulsan: '울산지점',
    imgo: '임고지점',
    bulk: '벌크사업부',
    visitor: '방문자'
};

export function getRoleLabel(role) {
    return ROLE_LABELS[role?.toLowerCase()] || role || '방문자';
}
