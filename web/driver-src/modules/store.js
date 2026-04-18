/**
 * store.js — 앱 전역 상수, localStorage 헬퍼, 공유 상태
 */

// ─── 상수 ──────────────────────────────────────────────────────────
// ★ 버전은 네이티브 통신으로 자동 갱신됨. 수동 변경 시 fallback 역할
export const AppConfig = {
  APP_VERSION: 'v4.9.18',
  BUILD_CODE: 4918,
};
export const BASE_URL    = 'https://www.nollae.com';
export const VERSION_URL = BASE_URL + '/apk/version.json';

// ─── localStorage 헬퍼 ────────────────────────────────────────────
export const Store = {
  get: (k, def = null) => {
    try {
      const v = localStorage.getItem('els_' + k);
      return v ? JSON.parse(v) : def;
    } catch { return def; }
  },
  set: (k, v) => {
    try { localStorage.setItem('els_' + k, JSON.stringify(v)); } catch { }
  },
  rm: (k) => {
    try { localStorage.removeItem('els_' + k); } catch { }
  },
};

// ─── 앱 공유 상태 ──────────────────────────────────────────────────
export const State = {
  profile:  { name: '', phone: '', vehicleNo: '', driverId: '' },
  trip:     { id: null, status: 'idle', startTime: null, containerNo: '', sealNo: '', isRealtime: false },
  photos:   [],  // { dataUrl, uploaded, serverUrl }
  notices:  [],
  logs:     [],
  currentNoticeId:  null,
  currentLogId:     null,
  currentPhotoIdx:  0,
  emergencyIds:     new Set(Store.get('emergencyIds') || []),
  pendingUpdate:    false,  // 운행 중 업데이트 유예 플래그
  preTripDone:      null,   // 운행 전 점검 항목
};
