/**
 * 차량위치관제 설정 상수
 * GPS 전송 주기, 사진 업로드 설정 등을 이곳에서 일괄 관리
 * → 나중에 변경이 필요하면 이 파일만 수정하면 됨
 */

// GPS 전송 주기 (ms)
export const GPS_INTERVALS = {
    driving: 30 * 1000,    // 이동 중: 30초
    paused:  60 * 1000,    // 대기(일시중지): 60초
    idle:    180 * 1000,   // 장기대기(3분 무이동 감지): 3분
};

// GPS 옵션
export const GPS_OPTIONS = {
    enableHighAccuracy: true,   // true=GPS(정밀), false=기지국/Wi-Fi
    timeout: 15000,             // 15초 타임아웃
    maximumAge: 0,              // 캐시 사용 안함 (신선한 데이터)
};

// 무이동 감지 임계값 (m) — 이 거리 이내면 "정지"로 판단
export const IDLE_DISTANCE_THRESHOLD = 30; // 30m

// 사진 업로드 설정
export const PHOTO_CONFIG = {
    maxCount: 10,
    maxSizeMB: 10,
    // 'nas' 또는 'supabase' — 나중에 쉽게 변경 가능
    storageProvider: 'nas',
    // NAS 업로드 경로
    nasBasePath: '/vehicle-tracking/photos',
};

// 컨테이너 타입 및 종류 옵션
export const CONTAINER_TYPES = ['40FT', '20FT', '45FT'];
export const CONTAINER_KINDS = ['DRY', 'REEFER(냉동)', 'OPEN-TOP', '위험물(일반)', '위험물(화약류)', '냉동위험물'];

// 운행 상태
export const TRIP_STATUS = {
    DRIVING: 'driving',
    PAUSED: 'paused',
    COMPLETED: 'completed',
};

export const TRIP_STATUS_LABELS = {
    driving: '운행 중',
    paused: '일시중지',
    completed: '운행 완료',
};

export const TRIP_STATUS_COLORS = {
    driving: '#10b981',    // 초록
    paused: '#f59e0b',     // 노랑
    completed: '#6b7280',  // 회색
};
