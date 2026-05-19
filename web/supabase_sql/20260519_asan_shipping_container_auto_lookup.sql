-- 아산 선적관리 컨테이너 자동조회 설정
-- 실행일: 2026-05-19
-- 목적: 선적관리 설정창의 컨테이너 자동조회 ON/OFF 값을 운영 DB에 저장

ALTER TABLE branch_dispatch_settings
ADD COLUMN IF NOT EXISTS shipping_container_auto_lookup_enabled BOOLEAN DEFAULT true;

UPDATE branch_dispatch_settings
SET shipping_container_auto_lookup_enabled = true
WHERE branch_id = 'asan'
  AND shipping_container_auto_lookup_enabled IS NULL;

ALTER TABLE branch_dispatch_settings
ALTER COLUMN shipping_container_auto_lookup_enabled SET NOT NULL;

COMMENT ON COLUMN branch_dispatch_settings.shipping_container_auto_lookup_enabled
IS '아산 선적관리 컨테이너 자동조회 사용 여부. false면 03:10 자동 조회를 실행하지 않는다.';
