-- 아산 연간실적 snapshot 기준 조회 인덱스
-- 실행일: 2026-05-17
-- 목적: branch_performance_files.summary.currentSnapshotId가 가리키는 스냅샷을 is_current 대량 UPDATE 없이 바로 조회한다.

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_snapshot_row_index
ON branch_performance_rows(snapshot_id, row_index);
