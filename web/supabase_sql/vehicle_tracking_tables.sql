-- ============================================================
-- 차량위치관제 시스템 테이블
-- 생성일: 2026-03-18
-- ============================================================

-- 1. 운행 기록 테이블
CREATE TABLE IF NOT EXISTS vehicle_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    driver_name TEXT NOT NULL,
    driver_phone TEXT,
    vehicle_number TEXT NOT NULL,
    container_number TEXT,
    seal_number TEXT,
    container_type TEXT DEFAULT '40FT' CHECK (container_type IN ('40FT', '20FT')),
    special_notes TEXT,
    photos JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'driving' CHECK (status IN ('driving', 'paused', 'completed')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    paused_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 위치 로그 테이블
CREATE TABLE IF NOT EXISTS vehicle_locations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id UUID NOT NULL REFERENCES vehicle_trips(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    accuracy REAL,
    speed REAL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스: 최신 위치 빠른 조회
CREATE INDEX IF NOT EXISTS idx_vehicle_locations_trip_time
    ON vehicle_locations (trip_id, recorded_at DESC);

-- 인덱스: 활성 운행 빠른 조회
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_status
    ON vehicle_trips (status) WHERE status IN ('driving', 'paused');

-- 인덱스: 사용자별 운행 기록 조회
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_user
    ON vehicle_trips (user_id, created_at DESC);

-- RLS (Row Level Security) 정책
ALTER TABLE vehicle_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_locations ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자만 접근 (API 서버가 service_role 사용하므로 기본 허용)
CREATE POLICY "Allow all for authenticated" ON vehicle_trips
    FOR ALL USING (true);

CREATE POLICY "Allow all for authenticated" ON vehicle_locations
    FOR ALL USING (true);
