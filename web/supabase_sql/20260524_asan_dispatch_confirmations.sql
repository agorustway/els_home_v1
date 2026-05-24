-- 목적: 아산 상세배차 GLAPS 전환 전 배차확정/취소와 BKG확정 보정값을 원본과 분리해 관리한다.

CREATE TABLE IF NOT EXISTS public.branch_dispatch_confirmations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    dispatch_type TEXT NOT NULL,
    target_date DATE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    confirmed_at TIMESTAMPTZ,
    confirmed_by TEXT,
    canceled_at TIMESTAMPTZ,
    canceled_by TEXT,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT branch_dispatch_confirmations_scope_key UNIQUE (branch_id, dispatch_type, target_date)
);

CREATE TABLE IF NOT EXISTS public.branch_dispatch_confirmation_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    confirmation_id UUID REFERENCES public.branch_dispatch_confirmations(id) ON DELETE SET NULL,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    dispatch_type TEXT NOT NULL,
    target_date DATE NOT NULL,
    action TEXT NOT NULL,
    old_active BOOLEAN,
    new_active BOOLEAN,
    changed_by TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.branch_dispatch_detail_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    dispatch_type TEXT NOT NULL,
    target_date DATE NOT NULL,
    detail_line_key TEXT NOT NULL,
    field_key TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    row_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT branch_dispatch_detail_overrides_scope_key
        UNIQUE (branch_id, dispatch_type, target_date, detail_line_key, field_key)
);

CREATE TABLE IF NOT EXISTS public.branch_dispatch_detail_override_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    override_id UUID REFERENCES public.branch_dispatch_detail_overrides(id) ON DELETE SET NULL,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    dispatch_type TEXT NOT NULL,
    target_date DATE NOT NULL,
    detail_line_key TEXT NOT NULL,
    field_key TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    old_source TEXT,
    new_source TEXT,
    row_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    changed_by TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_dispatch_confirmations_lookup
    ON public.branch_dispatch_confirmations (branch_id, dispatch_type, target_date);

CREATE INDEX IF NOT EXISTS idx_branch_dispatch_confirmation_history_lookup
    ON public.branch_dispatch_confirmation_history (branch_id, dispatch_type, target_date, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_dispatch_detail_overrides_lookup
    ON public.branch_dispatch_detail_overrides (branch_id, dispatch_type, target_date, detail_line_key)
    WHERE active;

CREATE INDEX IF NOT EXISTS idx_branch_dispatch_detail_override_history_lookup
    ON public.branch_dispatch_detail_override_history (branch_id, dispatch_type, target_date, detail_line_key, changed_at DESC);

CREATE OR REPLACE FUNCTION public.touch_branch_dispatch_confirmation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_branch_dispatch_confirmations_updated_at ON public.branch_dispatch_confirmations;
CREATE TRIGGER trg_branch_dispatch_confirmations_updated_at
BEFORE UPDATE ON public.branch_dispatch_confirmations
FOR EACH ROW
EXECUTE FUNCTION public.touch_branch_dispatch_confirmation_updated_at();

DROP TRIGGER IF EXISTS trg_branch_dispatch_detail_overrides_updated_at ON public.branch_dispatch_detail_overrides;
CREATE TRIGGER trg_branch_dispatch_detail_overrides_updated_at
BEFORE UPDATE ON public.branch_dispatch_detail_overrides
FOR EACH ROW
EXECUTE FUNCTION public.touch_branch_dispatch_confirmation_updated_at();

ALTER TABLE public.branch_dispatch_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_dispatch_confirmation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_dispatch_detail_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_dispatch_detail_override_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_branch_dispatch_confirmations ON public.branch_dispatch_confirmations;
DROP POLICY IF EXISTS service_role_branch_dispatch_confirmation_history ON public.branch_dispatch_confirmation_history;
DROP POLICY IF EXISTS service_role_branch_dispatch_detail_overrides ON public.branch_dispatch_detail_overrides;
DROP POLICY IF EXISTS service_role_branch_dispatch_detail_override_history ON public.branch_dispatch_detail_override_history;

CREATE POLICY service_role_branch_dispatch_confirmations
ON public.branch_dispatch_confirmations
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_branch_dispatch_confirmation_history
ON public.branch_dispatch_confirmation_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_branch_dispatch_detail_overrides
ON public.branch_dispatch_detail_overrides
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_branch_dispatch_detail_override_history
ON public.branch_dispatch_detail_override_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.branch_dispatch_confirmations FROM anon, authenticated;
REVOKE ALL ON TABLE public.branch_dispatch_confirmation_history FROM anon, authenticated;
REVOKE ALL ON TABLE public.branch_dispatch_detail_overrides FROM anon, authenticated;
REVOKE ALL ON TABLE public.branch_dispatch_detail_override_history FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_dispatch_confirmations TO service_role;
GRANT SELECT, INSERT ON TABLE public.branch_dispatch_confirmation_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_dispatch_detail_overrides TO service_role;
GRANT SELECT, INSERT ON TABLE public.branch_dispatch_detail_override_history TO service_role;
