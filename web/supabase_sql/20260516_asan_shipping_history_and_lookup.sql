-- 아산 선적관리 삭제 이력 + 컨테이너 이력조회 결과 누적
-- 실행일: 2026-05-16
-- 목적:
-- 1) 선적관리 현재 화면은 엑셀 최신본 기준으로만 노출
-- 2) 엑셀에서 사라진 행은 archive 테이블에 보존
-- 3) 선적관리에서 실행한 컨테이너 이력조회 결과는 lookup history로 누적

CREATE TABLE IF NOT EXISTS branch_shipping_row_archive (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    file_path TEXT NOT NULL,
    row_index INTEGER,
    row_values JSONB DEFAULT '[]'::jsonb,
    row_data JSONB DEFAULT '{}'::jsonb,
    container_no TEXT DEFAULT '',
    vessel_name TEXT DEFAULT '',
    search_text TEXT DEFAULT '',
    source_row_hash TEXT DEFAULT '',
    original_file_modified_at TIMESTAMPTZ,
    removed_file_modified_at TIMESTAMPTZ,
    archive_reason TEXT NOT NULL DEFAULT 'deleted_from_excel',
    archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_row_archive_file
ON branch_shipping_row_archive(branch_id, file_path, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_row_archive_container
ON branch_shipping_row_archive(branch_id, container_no, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_row_archive_hash
ON branch_shipping_row_archive(branch_id, file_path, source_row_hash);

CREATE TABLE IF NOT EXISTS branch_shipping_container_lookups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    run_id UUID NOT NULL DEFAULT gen_random_uuid(),
    branch_id TEXT NOT NULL DEFAULT 'asan',
    file_path TEXT NOT NULL,
    container_no TEXT NOT NULL,
    result_rows JSONB DEFAULT '[]'::jsonb,
    main_row JSONB DEFAULT '[]'::jsonb,
    main_status TEXT DEFAULT '',
    terminal TEXT DEFAULT '',
    move_time TEXT DEFAULT '',
    vehicle_no TEXT DEFAULT '',
    lookup_source TEXT DEFAULT 'asan_shipping',
    looked_up_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_container_lookups_file
ON branch_shipping_container_lookups(branch_id, file_path, looked_up_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_container_lookups_container
ON branch_shipping_container_lookups(branch_id, container_no, looked_up_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_container_lookups_run
ON branch_shipping_container_lookups(run_id);

ALTER TABLE branch_shipping_row_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_shipping_container_lookups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_shipping_row_archive" ON branch_shipping_row_archive;
CREATE POLICY "service_role_shipping_row_archive"
ON branch_shipping_row_archive
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_shipping_container_lookups" ON branch_shipping_container_lookups;
CREATE POLICY "service_role_shipping_container_lookups"
ON branch_shipping_container_lookups
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

GRANT ALL ON TABLE branch_shipping_row_archive TO service_role;
GRANT ALL ON TABLE branch_shipping_container_lookups TO service_role;
