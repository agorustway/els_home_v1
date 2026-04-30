-- ============================================================
-- 차량관제 안전교육 영상/이수기록 지원 스키마
-- 적용일: 2026-04-30
-- 목적:
--  1) notices에 안전교육 영상 URL/첨부자료 컬럼 보강
--  2) vehicle_trip_logs 이력 테이블 생성
-- ============================================================

ALTER TABLE public.notices
ADD COLUMN IF NOT EXISTS education_url TEXT;

ALTER TABLE public.notices
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.notices.education_url IS '안전교육 YouTube/외부 영상 URL';
COMMENT ON COLUMN public.notices.attachments IS '공지/안전교육 첨부자료 [{name,url,type,size}]';

CREATE TABLE IF NOT EXISTS public.vehicle_trip_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    trip_id UUID NOT NULL REFERENCES public.vehicle_trips(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    modified_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_trip_logs_trip_time
    ON public.vehicle_trip_logs (trip_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_trip_logs_field
    ON public.vehicle_trip_logs (field_name);

ALTER TABLE public.vehicle_trip_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'vehicle_trip_logs'
          AND policyname = 'Allow all for authenticated'
    ) THEN
        CREATE POLICY "Allow all for authenticated" ON public.vehicle_trip_logs
            FOR ALL USING (true);
    END IF;
END $$;
