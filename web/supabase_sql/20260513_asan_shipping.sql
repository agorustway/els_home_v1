-- 아산지점 선적관리 DB화
-- 실행일: 2026-05-13
-- 목적: NAS 엑셀 → Supabase 행 단위 저장 → 웹 페이징/검색 조회

CREATE TABLE IF NOT EXISTS branch_shipping_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    file_path TEXT NOT NULL,
    headers JSONB DEFAULT '[]'::jsonb,
    row_count INTEGER DEFAULT 0,
    file_modified_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, file_path)
);

CREATE TABLE IF NOT EXISTS branch_shipping_rows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    file_path TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    row_values JSONB DEFAULT '[]'::jsonb,
    row_data JSONB DEFAULT '{}'::jsonb,
    container_no TEXT DEFAULT '',
    vessel_name TEXT DEFAULT '',
    search_text TEXT DEFAULT '',
    file_modified_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, file_path, row_index)
);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_files_branch
ON branch_shipping_files(branch_id, file_path);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_rows_branch_file
ON branch_shipping_rows(branch_id, file_path, row_index);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_rows_container
ON branch_shipping_rows(branch_id, container_no);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_rows_search
ON branch_shipping_rows USING gin(to_tsvector('simple', search_text));

CREATE INDEX IF NOT EXISTS idx_branch_shipping_rows_data
ON branch_shipping_rows USING gin(row_data);

ALTER TABLE branch_shipping_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_shipping_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_shipping_files"
ON branch_shipping_files FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_shipping_rows"
ON branch_shipping_rows FOR ALL
USING (true)
WITH CHECK (true);
