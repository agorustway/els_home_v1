-- 아산 배차 현황판 전용 집계 캐시
-- 원장 JSONB를 화면 첫 진입 때마다 읽지 않고, 작은 집계 payload 1건만 조회한다.

CREATE TABLE IF NOT EXISTS public.branch_dispatch_dashboard_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id TEXT NOT NULL DEFAULT 'asan',
    view_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_signature TEXT,
    source_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT branch_dispatch_dashboard_cache_unique UNIQUE (branch_id, view_type),
    CONSTRAINT branch_dispatch_dashboard_cache_view_type_chk
        CHECK (view_type IN ('integrated', 'glovis', 'mobis'))
);

CREATE INDEX IF NOT EXISTS idx_branch_dispatch_dashboard_cache_lookup
    ON public.branch_dispatch_dashboard_cache(branch_id, view_type);

ALTER TABLE public.branch_dispatch_dashboard_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.branch_dispatch_dashboard_cache FROM anon, authenticated;
