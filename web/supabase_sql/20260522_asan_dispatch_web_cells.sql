-- 아산 배차판 WEB 전용 입력 컬럼
-- 목적: BKG1/BKG2/BKG3/TARGET VESSEL/비고를 엑셀 원본이 아닌 WEB DB 값으로 관리

CREATE TABLE IF NOT EXISTS public.branch_dispatch_web_column_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL UNIQUE DEFAULT 'asan',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    effective_at TIMESTAMPTZ,
    web_owned_fields TEXT[] NOT NULL DEFAULT ARRAY['BKG1', 'BKG2', 'BKG3', 'TARGET_VESSEL', 'NOTE'],
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.branch_dispatch_web_cells (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    dispatch_type TEXT NOT NULL CHECK (dispatch_type IN ('glovis', 'mobis')),
    target_date DATE NOT NULL,
    row_signature TEXT NOT NULL,
    row_index INTEGER,
    field_key TEXT NOT NULL CHECK (field_key IN ('BKG1', 'BKG2', 'BKG3', 'TARGET_VESSEL', 'NOTE')),
    value TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('cutover', 'web')),
    row_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (branch_id, dispatch_type, target_date, row_signature, field_key)
);

CREATE TABLE IF NOT EXISTS public.branch_dispatch_web_cell_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cell_id UUID REFERENCES public.branch_dispatch_web_cells(id) ON DELETE SET NULL,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    dispatch_type TEXT NOT NULL CHECK (dispatch_type IN ('glovis', 'mobis')),
    target_date DATE NOT NULL,
    row_signature TEXT NOT NULL,
    row_index INTEGER,
    field_key TEXT NOT NULL CHECK (field_key IN ('BKG1', 'BKG2', 'BKG3', 'TARGET_VESSEL', 'NOTE')),
    old_value TEXT NOT NULL DEFAULT '',
    new_value TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL CHECK (action IN ('cutover', 'create', 'update', 'clear')),
    row_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    changed_by TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_dispatch_web_cells_lookup
    ON public.branch_dispatch_web_cells (branch_id, dispatch_type, target_date, row_signature);

CREATE INDEX IF NOT EXISTS idx_branch_dispatch_web_cell_history_lookup
    ON public.branch_dispatch_web_cell_history (branch_id, dispatch_type, target_date, row_signature, field_key, changed_at DESC);

CREATE OR REPLACE FUNCTION public.touch_branch_dispatch_web_cells_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branch_dispatch_web_cells_updated_at ON public.branch_dispatch_web_cells;
CREATE TRIGGER trg_branch_dispatch_web_cells_updated_at
BEFORE UPDATE ON public.branch_dispatch_web_cells
FOR EACH ROW
EXECUTE FUNCTION public.touch_branch_dispatch_web_cells_updated_at();

DROP TRIGGER IF EXISTS trg_branch_dispatch_web_column_settings_updated_at ON public.branch_dispatch_web_column_settings;
CREATE TRIGGER trg_branch_dispatch_web_column_settings_updated_at
BEFORE UPDATE ON public.branch_dispatch_web_column_settings
FOR EACH ROW
EXECUTE FUNCTION public.touch_branch_dispatch_web_cells_updated_at();

INSERT INTO public.branch_dispatch_web_column_settings (branch_id, enabled)
VALUES ('asan', FALSE)
ON CONFLICT (branch_id) DO NOTHING;

ALTER TABLE public.branch_dispatch_web_column_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_dispatch_web_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_dispatch_web_cell_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_asan_dispatch_web_column_settings ON public.branch_dispatch_web_column_settings;
DROP POLICY IF EXISTS service_role_asan_dispatch_web_cells ON public.branch_dispatch_web_cells;
DROP POLICY IF EXISTS service_role_asan_dispatch_web_cell_history ON public.branch_dispatch_web_cell_history;

CREATE POLICY service_role_asan_dispatch_web_column_settings
ON public.branch_dispatch_web_column_settings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_asan_dispatch_web_cells
ON public.branch_dispatch_web_cells
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_asan_dispatch_web_cell_history
ON public.branch_dispatch_web_cell_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.branch_dispatch_web_column_settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.branch_dispatch_web_cells FROM anon, authenticated;
REVOKE ALL ON TABLE public.branch_dispatch_web_cell_history FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_dispatch_web_column_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_dispatch_web_cells TO service_role;
GRANT SELECT, INSERT ON TABLE public.branch_dispatch_web_cell_history TO service_role;
