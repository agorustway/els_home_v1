-- 차량 업무유형/일반화물/웹 관제 지도 공개범위 확장

ALTER TABLE driver_contacts
  ADD COLUMN IF NOT EXISTS cargo_type TEXT DEFAULT 'container',
  ADD COLUMN IF NOT EXISTS map_visibility TEXT DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS partner_company TEXT,
  ADD COLUMN IF NOT EXISTS general_vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS general_payload TEXT,
  ADD COLUMN IF NOT EXISTS general_body_type TEXT;

ALTER TABLE vehicle_trips
  ADD COLUMN IF NOT EXISTS cargo_type TEXT DEFAULT 'container',
  ADD COLUMN IF NOT EXISTS cargo_item TEXT,
  ADD COLUMN IF NOT EXISTS cargo_order_number TEXT,
  ADD COLUMN IF NOT EXISTS cargo_weight TEXT,
  ADD COLUMN IF NOT EXISTS general_vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS general_payload TEXT,
  ADD COLUMN IF NOT EXISTS general_body_type TEXT,
  ADD COLUMN IF NOT EXISTS map_visibility TEXT DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS driver_contract_type TEXT;

CREATE INDEX IF NOT EXISTS idx_driver_contacts_cargo_contract
  ON driver_contacts (cargo_type, contract_type);

CREATE INDEX IF NOT EXISTS idx_vehicle_trips_cargo_status
  ON vehicle_trips (cargo_type, status, started_at DESC);
