-- 아산 배차 현황판 첫 화면 전용 뷰어 캐시
-- 원본 원장과 full dashboard cache는 유지하고, 화면 노출용 완성 payload만 작게 저장한다.

CREATE TABLE IF NOT EXISTS public.branch_dispatch_dashboard_view_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id TEXT NOT NULL DEFAULT 'asan',
    view_type TEXT NOT NULL,
    snapshot_key TEXT NOT NULL DEFAULT 'default',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_signature TEXT,
    source_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT branch_dispatch_dashboard_view_cache_unique UNIQUE (branch_id, view_type, snapshot_key),
    CONSTRAINT branch_dispatch_dashboard_view_cache_view_type_chk
        CHECK (view_type IN ('integrated', 'glovis', 'mobis'))
);

CREATE INDEX IF NOT EXISTS idx_branch_dispatch_dashboard_view_cache_lookup
    ON public.branch_dispatch_dashboard_view_cache(branch_id, view_type, snapshot_key);

ALTER TABLE public.branch_dispatch_dashboard_view_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.branch_dispatch_dashboard_view_cache FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.branch_dispatch_dashboard_view_cache TO service_role;
