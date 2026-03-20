-- 2026-03-20: 위치 로그 고도화 (수신방식, 행정동/상호 주소 추가)
ALTER TABLE vehicle_locations ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'GPS';
ALTER TABLE vehicle_locations ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE vehicle_locations ADD COLUMN IF NOT EXISTS place_name TEXT;

-- 기존 데이터 기본값 설정
UPDATE vehicle_locations SET method = 'GPS' WHERE method IS NULL;
