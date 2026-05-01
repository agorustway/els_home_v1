export const CARGO_TYPES = [
  { value: 'container', label: '컨테이너' },
  { value: 'general', label: '일반화물' },
];

export const MAP_VISIBILITY_OPTIONS = [
  { value: 'own', label: '단독 자기차량만' },
  { value: 'contracted', label: '계약차량끼리' },
  { value: 'all', label: '전체 운행차량' },
];

export const CONTRACT_TYPE_OPTIONS = [
  { value: 'contracted', label: '계약차량' },
  { value: 'uncontracted', label: '미계약차량' },
  { value: 'partner', label: '협력사' },
];

export const GENERAL_VEHICLE_TYPES = ['트럭', '카고', '윙바디', '탑차', '츄레라', '트랙터', '덤프', '기타'];
export const GENERAL_PAYLOADS = ['1ton', '1.2ton', '1.4ton', '2.5ton', '3.5ton', '5ton', '8ton', '11ton', '14ton', '18ton', '25ton', '기타'];
export const GENERAL_BODY_TYPES = ['일반', '일반탑', '냉동탑차', '냉장탑차', '윙바디', '슬라이더', '로베드', '평판', '리프트', '카고크레인', '탱크로리', '기타'];
export const GENERAL_TRANSPORT_TYPES = ['편도', '왕복', '혼적', '전세', '정기', '기타'];

function normalizeVehicle(value = '') {
  return String(value || '').replace(/\s/g, '').toUpperCase();
}

export function isOwnVehicleTrip(trip = {}, profile = {}) {
  const myVehicle = normalizeVehicle(profile.vehicleNo);
  const tripVehicle = normalizeVehicle(trip.vehicle_number);
  return !!myVehicle && !!tripVehicle && myVehicle === tripVehicle;
}

export function contractTypeLabel(value) {
  return CONTRACT_TYPE_OPTIONS.find(o => o.value === value)?.label || '미계약차량';
}

export function filterTripsForMapVisibility(trips = [], profile = {}, includeCompleted = false) {
  const profileCargo = profile.cargoType || 'container';
  const visibility = profile.mapVisibility || 'own';
  return (trips || []).filter((trip) => {
    if (!trip?.lastLocation) return false;
    if (!includeCompleted && trip.status === 'completed') return false;
    if ((trip.cargo_type || 'container') !== profileCargo) return false;
    if (visibility === 'all') return true;
    if (visibility === 'contracted') return (trip.driver_contract_type || trip.contract_type) === 'contracted';
    return isOwnVehicleTrip(trip, profile);
  });
}
