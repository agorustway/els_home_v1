-- ============================================================
-- 차량관제 운행일보/마감 필드 추가
-- 적용일: 2026-04-30
-- ============================================================

ALTER TABLE public.vehicle_trips
ADD COLUMN IF NOT EXISTS transport_type TEXT DEFAULT '왕복';

ALTER TABLE public.vehicle_trips
ADD COLUMN IF NOT EXISTS billing_amount BIGINT;

ALTER TABLE public.vehicle_trips
ADD COLUMN IF NOT EXISTS work_site TEXT;

ALTER TABLE public.vehicle_trips
ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT false;

ALTER TABLE public.vehicle_trips
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE public.vehicle_trips
ADD COLUMN IF NOT EXISTS closed_by TEXT;

COMMENT ON COLUMN public.vehicle_trips.transport_type IS '운송구분: 왕복/편도/복화/기타';
COMMENT ON COLUMN public.vehicle_trips.billing_amount IS '기사 입력 청구금액';
COMMENT ON COLUMN public.vehicle_trips.work_site IS '기사 입력 작업지';
COMMENT ON COLUMN public.vehicle_trips.is_closed IS '웹 담당자 마감 완료 여부. true이면 기사 앱 수정 제한';

CREATE INDEX IF NOT EXISTS idx_vehicle_trips_is_closed
    ON public.vehicle_trips (is_closed);
