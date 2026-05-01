export const CARGO_TYPES = [
  { value: 'container', label: '컨테이너' },
  { value: 'general', label: '일반화물' },
];

export const MAP_VISIBILITY_OPTIONS = [
  { value: 'own', label: '단독 자기차량만' },
  { value: 'contracted', label: '계약차량끼리' },
  { value: 'all', label: '전체 운행차량' },
];

export const GENERAL_VEHICLE_TYPES = ['트럭', '카고', '윙바디', '탑차', '츄레라', '트랙터', '덤프', '기타'];

export const GENERAL_PAYLOADS = [
  '1ton', '1.2ton', '1.4ton', '2.5ton', '3.5ton', '5ton', '8ton', '11ton', '14ton', '18ton', '25ton', '기타',
];

export const GENERAL_BODY_TYPES = [
  '일반', '일반탑', '냉동탑차', '냉장탑차', '윙바디', '슬라이더', '로베드', '평판', '리프트', '카고크레인', '탱크로리', '기타',
];

export const GENERAL_TRANSPORT_TYPES = ['편도', '왕복', '혼적', '전세', '정기', '기타'];

export function cargoTypeLabel(value) {
  return CARGO_TYPES.find(o => o.value === value)?.label || '컨테이너';
}

export function mapVisibilityLabel(value) {
  return MAP_VISIBILITY_OPTIONS.find(o => o.value === value)?.label || '단독 자기차량만';
}
