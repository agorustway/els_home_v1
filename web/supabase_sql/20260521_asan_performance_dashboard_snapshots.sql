-- 아산 실적관리 현황판 스냅샷 캐시
-- 실행일: 2026-05-21
-- 목적: 원장 DB는 테이블 검색용으로 유지하고, 종합/월간/연간 현황판은 계산 완료 JSON 한 줄을 먼저 읽는다.

CREATE TABLE IF NOT EXISTS branch_performance_dashboard_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    dashboard_type TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    source_signature TEXT NOT NULL,
    source_synced_at TIMESTAMPTZ,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(branch_id, dashboard_type, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_branch_performance_dashboard_snapshots_key
ON branch_performance_dashboard_snapshots(branch_id, dashboard_type, scope_key);

CREATE INDEX IF NOT EXISTS idx_branch_performance_dashboard_snapshots_source
ON branch_performance_dashboard_snapshots(branch_id, dashboard_type, source_synced_at DESC);

ALTER TABLE branch_performance_dashboard_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_branch_performance_dashboard_snapshots" ON branch_performance_dashboard_snapshots;
CREATE POLICY "service_role_branch_performance_dashboard_snapshots"
ON branch_performance_dashboard_snapshots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE branch_performance_dashboard_snapshots TO service_role;
