-- 아산 GLAPS 마스터 코드 원장
-- 목적: GLAPS_마스터코드.xlsx를 외부 원본 스냅샷으로 받고, WEB DB에서 운송경로/항목 매핑을 버전 관리한다.

CREATE TABLE IF NOT EXISTS public.glaps_master_versions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    source_name TEXT NOT NULL,
    source_hash TEXT,
    source_sheets TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    imported_by TEXT,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    active BOOLEAN NOT NULL DEFAULT FALSE,
    route_count INTEGER NOT NULL DEFAULT 0,
    alias_count INTEGER NOT NULL DEFAULT 0,
    sheet_row_count INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_glaps_master_versions_active
    ON public.glaps_master_versions (branch_id)
    WHERE active;

ALTER TABLE public.glaps_master_versions
    ADD COLUMN IF NOT EXISTS sheet_row_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.glaps_transport_routes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    version_id UUID NOT NULL REFERENCES public.glaps_master_versions(id) ON DELETE CASCADE,
    route_code TEXT NOT NULL DEFAULT '',
    route_name TEXT NOT NULL DEFAULT '',
    start_location_name TEXT NOT NULL DEFAULT '',
    waypoint_name TEXT NOT NULL DEFAULT '',
    waypoint_els_name TEXT NOT NULL DEFAULT '',
    destination_name TEXT NOT NULL DEFAULT '',
    route_fingerprint TEXT NOT NULL DEFAULT '',
    review_status TEXT NOT NULL DEFAULT 'needs_mapping'
        CHECK (review_status IN ('ready', 'needs_mapping', 'missing_route_code')),
    review_note TEXT NOT NULL DEFAULT '',
    source_sheet TEXT NOT NULL DEFAULT '',
    source_row_number INTEGER,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (branch_id, version_id, route_code, source_sheet, source_row_number)
);

ALTER TABLE public.glaps_transport_routes
    DROP CONSTRAINT IF EXISTS glaps_transport_routes_branch_id_version_id_route_code_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'glaps_transport_routes_branch_version_route_source_key'
          AND conrelid = 'public.glaps_transport_routes'::regclass
    ) THEN
        ALTER TABLE public.glaps_transport_routes
            ADD CONSTRAINT glaps_transport_routes_branch_version_route_source_key
            UNIQUE (branch_id, version_id, route_code, source_sheet, source_row_number);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_glaps_transport_routes_match
    ON public.glaps_transport_routes (branch_id, version_id, start_location_name, waypoint_els_name, destination_name)
    WHERE active;

CREATE INDEX IF NOT EXISTS idx_glaps_transport_routes_status
    ON public.glaps_transport_routes (branch_id, version_id, review_status)
    WHERE active;

CREATE TABLE IF NOT EXISTS public.glaps_master_aliases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    version_id UUID NOT NULL REFERENCES public.glaps_master_versions(id) ON DELETE CASCADE,
    alias_type TEXT NOT NULL CHECK (alias_type IN ('start', 'waypoint', 'destination', 'port', 'line', 'container_type', 'carrier', 'consignee', 'generic')),
    source_name TEXT NOT NULL DEFAULT '',
    els_name TEXT NOT NULL DEFAULT '',
    glaps_name TEXT NOT NULL DEFAULT '',
    glaps_code TEXT NOT NULL DEFAULT '',
    route_code TEXT NOT NULL DEFAULT '',
    review_status TEXT NOT NULL DEFAULT 'needs_mapping'
        CHECK (review_status IN ('ready', 'needs_mapping', 'missing_route_code')),
    review_note TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (branch_id, version_id, alias_type, source_name, route_code)
);

ALTER TABLE public.glaps_master_aliases
    DROP CONSTRAINT IF EXISTS glaps_master_aliases_alias_type_check;

ALTER TABLE public.glaps_master_aliases
    ADD CONSTRAINT glaps_master_aliases_alias_type_check
    CHECK (alias_type IN ('start', 'waypoint', 'destination', 'port', 'line', 'container_type', 'carrier', 'consignee', 'generic'));

CREATE INDEX IF NOT EXISTS idx_glaps_master_aliases_lookup
    ON public.glaps_master_aliases (branch_id, version_id, alias_type, source_name)
    WHERE active;

CREATE TABLE IF NOT EXISTS public.glaps_master_sheet_rows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    version_id UUID NOT NULL REFERENCES public.glaps_master_versions(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    header_row BOOLEAN NOT NULL DEFAULT FALSE,
    row_values JSONB NOT NULL DEFAULT '[]'::jsonb,
    row_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (branch_id, version_id, sheet_name, row_number)
);

CREATE INDEX IF NOT EXISTS idx_glaps_master_sheet_rows_lookup
    ON public.glaps_master_sheet_rows (branch_id, version_id, sheet_name, row_number);

CREATE OR REPLACE FUNCTION public.touch_glaps_master_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_glaps_master_versions_updated_at ON public.glaps_master_versions;
CREATE TRIGGER trg_glaps_master_versions_updated_at
BEFORE UPDATE ON public.glaps_master_versions
FOR EACH ROW
EXECUTE FUNCTION public.touch_glaps_master_updated_at();

DROP TRIGGER IF EXISTS trg_glaps_transport_routes_updated_at ON public.glaps_transport_routes;
CREATE TRIGGER trg_glaps_transport_routes_updated_at
BEFORE UPDATE ON public.glaps_transport_routes
FOR EACH ROW
EXECUTE FUNCTION public.touch_glaps_master_updated_at();

DROP TRIGGER IF EXISTS trg_glaps_master_aliases_updated_at ON public.glaps_master_aliases;
CREATE TRIGGER trg_glaps_master_aliases_updated_at
BEFORE UPDATE ON public.glaps_master_aliases
FOR EACH ROW
EXECUTE FUNCTION public.touch_glaps_master_updated_at();

ALTER TABLE public.glaps_master_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glaps_transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glaps_master_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glaps_master_sheet_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_glaps_master_versions ON public.glaps_master_versions;
DROP POLICY IF EXISTS service_role_glaps_transport_routes ON public.glaps_transport_routes;
DROP POLICY IF EXISTS service_role_glaps_master_aliases ON public.glaps_master_aliases;
DROP POLICY IF EXISTS service_role_glaps_master_sheet_rows ON public.glaps_master_sheet_rows;

CREATE POLICY service_role_glaps_master_versions
ON public.glaps_master_versions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_glaps_transport_routes
ON public.glaps_transport_routes
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_glaps_master_aliases
ON public.glaps_master_aliases
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY service_role_glaps_master_sheet_rows
ON public.glaps_master_sheet_rows
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.glaps_master_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.glaps_transport_routes FROM anon, authenticated;
REVOKE ALL ON TABLE public.glaps_master_aliases FROM anon, authenticated;
REVOKE ALL ON TABLE public.glaps_master_sheet_rows FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.glaps_master_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.glaps_transport_routes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.glaps_master_aliases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.glaps_master_sheet_rows TO service_role;
