-- 아산지점 연간/월별 실적 원장 DB화
-- 실행일: 2026-05-17
-- 목적: NAS 엑셀 → Supabase 누적 원장 → 웹 분석/테이블 조회
-- 원칙: 엑셀에서 행이 수정/삭제되어도 DB 행은 물리 삭제하지 않고 is_current 상태만 변경한다.

CREATE TABLE IF NOT EXISTS branch_performance_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    dataset_type TEXT NOT NULL DEFAULT 'annual',
    file_path TEXT NOT NULL,
    sheet_name TEXT NOT NULL DEFAULT '합계',
    header_row INTEGER,
    headers JSONB DEFAULT '[]'::jsonb,
    row_count INTEGER DEFAULT 0,
    current_row_count INTEGER DEFAULT 0,
    summary JSONB DEFAULT '{}'::jsonb,
    file_modified_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, dataset_type, file_path, sheet_name)
);

CREATE TABLE IF NOT EXISTS branch_performance_rows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    dataset_type TEXT NOT NULL DEFAULT 'annual',
    file_path TEXT NOT NULL,
    sheet_name TEXT NOT NULL DEFAULT '합계',
    snapshot_id UUID NOT NULL DEFAULT gen_random_uuid(),
    row_index INTEGER NOT NULL,
    row_values JSONB DEFAULT '[]'::jsonb,
    row_data JSONB DEFAULT '{}'::jsonb,
    search_text TEXT DEFAULT '',
    source_row_hash TEXT NOT NULL,
    year_value INTEGER,
    month_value INTEGER,
    revenue_amount NUMERIC DEFAULT 0,
    purchase_amount NUMERIC DEFAULT 0,
    profit_amount NUMERIC DEFAULT 0,
    is_current BOOLEAN NOT NULL DEFAULT true,
    change_status TEXT NOT NULL DEFAULT 'current',
    file_modified_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    replaced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_branch_performance_files_key
ON branch_performance_files(branch_id, dataset_type, file_path, sheet_name);

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_current
ON branch_performance_rows(branch_id, dataset_type, file_path, sheet_name, row_index)
WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_snapshot
ON branch_performance_rows(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_search
ON branch_performance_rows USING gin(to_tsvector('simple', search_text))
WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_data
ON branch_performance_rows USING gin(row_data);

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_year_month
ON branch_performance_rows(branch_id, dataset_type, year_value, month_value)
WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_hash
ON branch_performance_rows(branch_id, dataset_type, file_path, sheet_name, source_row_hash);

ALTER TABLE branch_performance_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_performance_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_branch_performance_files" ON branch_performance_files;
CREATE POLICY "service_role_branch_performance_files"
ON branch_performance_files FOR ALL
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_branch_performance_rows" ON branch_performance_rows;
CREATE POLICY "service_role_branch_performance_rows"
ON branch_performance_rows FOR ALL
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE branch_performance_files TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE branch_performance_rows TO service_role;
