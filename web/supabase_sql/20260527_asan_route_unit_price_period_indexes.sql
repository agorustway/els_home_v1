-- 아산 구간단가 fallback 집계용 기간 인덱스.
-- 구간단가는 연간+월간 current 원장을 직접 읽으므로 snapshot_id + 마감년월 조건을 먼저 태운다.

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_route_unit_snapshot_period
ON public.branch_performance_rows (
    branch_id,
    dataset_type,
    snapshot_id,
    year_value,
    month_value,
    row_index
)
WHERE snapshot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_branch_performance_rows_route_unit_current_period
ON public.branch_performance_rows (
    branch_id,
    dataset_type,
    is_current,
    file_path,
    sheet_name,
    year_value,
    month_value,
    row_index
)
WHERE is_current = true;
