-- DB Migration: Add photo columns for Driver, Vehicle, and Chassis
-- Version: v4.2.10 (Build 154)
-- Date: 2026-03-29

ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS photo_driver TEXT;
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS photo_vehicle TEXT;
ALTER TABLE driver_contacts ADD COLUMN IF NOT EXISTS photo_chassis TEXT;

-- Comments for reference
COMMENT ON COLUMN driver_contacts.photo_driver IS '운전원 프로필 사진 URL/Base64';
COMMENT ON COLUMN driver_contacts.photo_vehicle IS '차량 사진 URL/Base64';
COMMENT ON COLUMN driver_contacts.photo_chassis IS '샤시 사진 URL/Base64';
