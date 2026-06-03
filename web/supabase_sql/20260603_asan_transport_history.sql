-- 아산 운송내역 테이블
-- 목적: NAS 2026_수출리스트.xlsx 월별 시트 -> Supabase -> 웹 테이블 관리

CREATE TABLE IF NOT EXISTS public.branch_transport_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    target_month DATE NOT NULL,
    sheet_name TEXT NOT NULL,
    headers JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_headers JSONB NOT NULL DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '[]'::jsonb,
    row_count INTEGER NOT NULL DEFAULT 0,
    valid_row_count INTEGER NOT NULL DEFAULT 0,
    file_modified_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT branch_transport_history_scope_key UNIQUE (branch_id, target_month, sheet_name)
);

ALTER TABLE public.branch_dispatch_settings
    ADD COLUMN IF NOT EXISTS transport_history_path TEXT DEFAULT '/아산지점/A_운송실무/2026_수출리스트.xlsx';

UPDATE public.branch_dispatch_settings
SET transport_history_path = COALESCE(NULLIF(transport_history_path, ''), '/아산지점/A_운송실무/2026_수출리스트.xlsx')
WHERE branch_id = 'asan';

CREATE INDEX IF NOT EXISTS idx_branch_transport_history_meta_lookup
    ON public.branch_transport_history(branch_id, target_month, sheet_name);

ALTER TABLE public.branch_transport_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_branch_transport_history ON public.branch_transport_history;
CREATE POLICY service_role_branch_transport_history
ON public.branch_transport_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.branch_transport_history FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_transport_history TO service_role;

COMMENT ON TABLE public.branch_transport_history IS
'아산 운송내역 원장. NAS 2026_수출리스트.xlsx를 월 시트 단위 JSONB로 저장하며 화면은 meta/date 지연 조회를 사용한다.';

COMMENT ON COLUMN public.branch_transport_history.headers IS
'화면 표시용 정규화 헤더. 원본 출차시간 헤더는 청구금액으로 통합한다.';

COMMENT ON COLUMN public.branch_transport_history.source_headers IS
'원본 엑셀 헤더. 헤더 정규화 차이 추적용.';
