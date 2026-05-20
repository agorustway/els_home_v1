-- 인트라넷 행사일정 및 사용자별 알림 숨김
-- 적용 위치: Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.intranet_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    event_date date NOT NULL,
    start_time time,
    end_time time,
    location text,
    audience_roles text[] NOT NULL DEFAULT ARRAY['all']::text[],
    reminder_offsets integer[] NOT NULL DEFAULT ARRAY[7, 3, 1, 0]::integer[],
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid,
    created_by_email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT intranet_events_title_not_blank CHECK (length(trim(title)) > 0),
    CONSTRAINT intranet_events_audience_not_empty CHECK (array_length(audience_roles, 1) > 0),
    CONSTRAINT intranet_events_reminders_not_empty CHECK (array_length(reminder_offsets, 1) > 0)
);

CREATE TABLE IF NOT EXISTS public.intranet_event_dismissals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES public.intranet_events(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    user_email text,
    reminder_offset integer NOT NULL,
    dismissed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT intranet_event_dismissals_offset_check CHECK (reminder_offset = ANY (ARRAY[7, 3, 1, 0]::integer[])),
    CONSTRAINT intranet_event_dismissals_unique UNIQUE (event_id, user_id, reminder_offset)
);

CREATE INDEX IF NOT EXISTS idx_intranet_events_date_active
    ON public.intranet_events(event_date, is_active);

CREATE INDEX IF NOT EXISTS idx_intranet_events_audience_roles
    ON public.intranet_events USING gin(audience_roles);

CREATE INDEX IF NOT EXISTS idx_intranet_event_dismissals_user
    ON public.intranet_event_dismissals(user_id, event_id, reminder_offset);

ALTER TABLE public.intranet_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intranet_event_dismissals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.intranet_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.intranet_event_dismissals TO service_role;

DROP POLICY IF EXISTS "service_role_manage_intranet_events" ON public.intranet_events;
CREATE POLICY "service_role_manage_intranet_events"
    ON public.intranet_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_manage_intranet_event_dismissals" ON public.intranet_event_dismissals;
CREATE POLICY "service_role_manage_intranet_event_dismissals"
    ON public.intranet_event_dismissals
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
