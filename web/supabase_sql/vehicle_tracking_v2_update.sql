-- ============================================================
-- 차량위치관제 + 운전원정보 연동 스키마 업데이트
-- 실행일: 2026-03-18
-- ============================================================

-- 1. vehicle_trips에 차량아이디(vehicle_id) 추가
ALTER TABLE vehicle_trips ADD COLUMN IF NOT EXISTS vehicle_id TEXT;

-- 2. driver_contacts에 차량관제 연동 컬럼 추가
-- 계약 상태
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'uncontracted'
    CHECK (contract_type IN ('contracted', 'uncontracted'));

-- 차량번호 (관제 매칭용)
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS vehicle_number TEXT;

-- 차량아이디
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS vehicle_id TEXT;

-- 마지막 운행 정보
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS last_container_number TEXT;
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS last_seal_number TEXT;
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS last_container_type TEXT;
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS last_trip_started_at TIMESTAMPTZ;
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS last_trip_completed_at TIMESTAMPTZ;

-- 인덱스: 전화번호+차량번호 매칭용
CREATE INDEX IF NOT EXISTS idx_driver_contacts_phone ON driver_contacts (phone);
CREATE INDEX IF NOT EXISTS idx_driver_contacts_vehicle ON driver_contacts (vehicle_number);
