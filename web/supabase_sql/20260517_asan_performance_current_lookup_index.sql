-- 아산 연간실적 current 원장 조회 timeout 완화
-- 실행일: 2026-05-17
-- 목적: 직접 주입 diff-current 모드와 웹 current 조회가 row_index 정렬/해시 조회를 인덱스로 처리하도록 보강

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_current_lookup
ON branch_performance_rows(branch_id, dataset_type, file_path, sheet_name, row_index)
INCLUDE (id, source_row_hash, snapshot_id)
WHERE is_current = true;

