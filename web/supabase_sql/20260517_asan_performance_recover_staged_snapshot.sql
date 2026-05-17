-- 아산 연간실적 실패한 staged 스냅샷 빠른 공개
-- 실행일: 2026-05-17
-- 사용 시점: 직접 주입이 행 insert 후 이전 current 정리 UPDATE에서 timeout 난 경우
-- 효과: 36만 행을 다시 파싱/insert하지 않고, 가장 최근의 완성된 staged snapshot을 currentSnapshotId로 지정한다.

WITH latest_snapshot AS (
    SELECT
        snapshot_id,
        COUNT(*)::integer AS row_count,
        MAX(file_modified_at) AS file_modified_at,
        MAX(last_seen_at) AS last_seen_at
    FROM branch_performance_rows
    WHERE branch_id = 'asan'
      AND dataset_type = 'annual'
      AND file_path = '/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx'
      AND sheet_name = '합계'
      AND change_status = 'staged_current'
    GROUP BY snapshot_id
    HAVING COUNT(*) >= 300000
    ORDER BY MAX(first_seen_at) DESC
    LIMIT 1
)
UPDATE branch_performance_files AS f
SET
    row_count = latest_snapshot.row_count,
    current_row_count = latest_snapshot.row_count,
    file_modified_at = COALESCE(latest_snapshot.file_modified_at, f.file_modified_at),
    synced_at = NOW(),
    summary = COALESCE(f.summary, '{}'::jsonb)
        || jsonb_build_object(
            'currentSnapshotId', latest_snapshot.snapshot_id::text,
            'recoveredSnapshotId', latest_snapshot.snapshot_id::text,
            'currentSelectionMode', 'summary.currentSnapshotId',
            'importMode', 'snapshot-replace-recovered'
        )
FROM latest_snapshot
WHERE f.branch_id = 'asan'
  AND f.dataset_type = 'annual'
  AND f.file_path = '/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx'
  AND f.sheet_name = '합계'
RETURNING
    f.file_path,
    f.sheet_name,
    f.current_row_count,
    f.summary->>'currentSnapshotId' AS current_snapshot_id,
    f.synced_at;
