-- DB Migration: Add speed column to vehicle_locations table
-- Version: v4.2.12 (Build 156)
-- Date: 2026-03-29

ALTER TABLE vehicle_locations ADD COLUMN IF NOT EXISTS speed FLOAT;

-- Comment for reference
COMMENT ON COLUMN vehicle_locations.speed IS '차량 운행 속도 (km/h)';

-- 최신 위치 조회 RPC 함수가 있다면 speed 컬럼도 포함되도록 확인 필요
-- 만약 get_latest_vehicle_locations RPC가 정의되어 있다면 재정의 또는 확인 권장
