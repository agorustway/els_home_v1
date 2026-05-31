-- ELS database retention and compaction policy.
-- 목표:
-- 1) 실적 원장은 화면이 실제로 읽는 최신 연간 스냅샷과 월간 current 행만 유지한다.
-- 2) 배차변동 히스토리는 사용자가 의미 있게 볼 수 있는 action만 보존하고 자동 refreshed/resolved 로그를 제거한다.
-- 3) 대형 GIN/부분 인덱스 팽창을 줄이고 필요한 조회 인덱스만 다시 만든다.

-- branch_performance_rows compact swap
DROP TABLE IF EXISTS public.branch_performance_rows_compact_20260531;

CREATE TABLE public.branch_performance_rows_compact_20260531 (
    LIKE public.branch_performance_rows INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);

INSERT INTO public.branch_performance_rows_compact_20260531
SELECT r.*
FROM public.branch_performance_rows r
WHERE (
    r.dataset_type = 'annual'
    AND r.snapshot_id = (
        SELECT (f.summary->>'currentSnapshotId')::uuid
        FROM public.branch_performance_files f
        WHERE f.branch_id = 'asan'
          AND f.dataset_type = 'annual'
        LIMIT 1
    )
)
OR (
    r.dataset_type = 'monthly'
    AND r.is_current IS TRUE
);

DO $$
DECLARE
    kept_rows bigint;
    annual_rows bigint;
    monthly_rows bigint;
BEGIN
    SELECT count(*) INTO kept_rows
    FROM public.branch_performance_rows_compact_20260531;

    SELECT count(*) INTO annual_rows
    FROM public.branch_performance_rows_compact_20260531
    WHERE dataset_type = 'annual';

    SELECT count(*) INTO monthly_rows
    FROM public.branch_performance_rows_compact_20260531
    WHERE dataset_type = 'monthly';

    IF annual_rows < 300000 THEN
        RAISE EXCEPTION 'branch_performance_rows compaction aborted: annual rows too small (%)', annual_rows;
    END IF;

    IF monthly_rows < 10000 THEN
        RAISE EXCEPTION 'branch_performance_rows compaction aborted: monthly rows too small (%)', monthly_rows;
    END IF;

    RAISE NOTICE 'branch_performance_rows compact rows: total %, annual %, monthly %', kept_rows, annual_rows, monthly_rows;
END $$;

ALTER TABLE public.branch_performance_rows RENAME TO branch_performance_rows_bloat_20260531;
ALTER TABLE public.branch_performance_rows_compact_20260531 RENAME TO branch_performance_rows;
DROP TABLE public.branch_performance_rows_bloat_20260531;

ALTER TABLE public.branch_performance_rows
    ADD CONSTRAINT branch_performance_rows_pkey PRIMARY KEY (id);

CREATE INDEX idx_branch_performance_rows_snapshot_row_index
    ON public.branch_performance_rows (snapshot_id, row_index);

CREATE INDEX idx_branch_performance_rows_route_unit_snapshot_period
    ON public.branch_performance_rows (branch_id, dataset_type, snapshot_id, year_value, month_value, row_index)
    WHERE snapshot_id IS NOT NULL;

CREATE INDEX idx_branch_performance_rows_monthly_current_lookup
    ON public.branch_performance_rows (branch_id, dataset_type, file_path, sheet_name, row_index)
    WHERE dataset_type = 'monthly' AND is_current IS TRUE;

CREATE INDEX idx_branch_performance_rows_monthly_current_period
    ON public.branch_performance_rows (branch_id, dataset_type, is_current, file_path, sheet_name, year_value, month_value, row_index)
    WHERE dataset_type = 'monthly' AND is_current IS TRUE;

CREATE INDEX idx_branch_performance_rows_monthly_search
    ON public.branch_performance_rows USING gin (to_tsvector('simple', search_text))
    WHERE dataset_type = 'monthly' AND is_current IS TRUE;

CREATE INDEX idx_branch_performance_rows_annual_ctn
    ON public.branch_performance_rows ((row_data->>'C/Tn'))
    WHERE branch_id = 'asan' AND dataset_type = 'annual';

CREATE INDEX idx_branch_performance_rows_annual_seal
    ON public.branch_performance_rows ((row_data->>'SEALn'))
    WHERE branch_id = 'asan' AND dataset_type = 'annual';

CREATE INDEX idx_branch_performance_rows_annual_booking
    ON public.branch_performance_rows ((row_data->>'BOOKINGNO-'))
    WHERE branch_id = 'asan' AND dataset_type = 'annual';

CREATE INDEX idx_branch_performance_rows_annual_vehicle_no
    ON public.branch_performance_rows ((row_data->>'영업넘버'))
    WHERE branch_id = 'asan' AND dataset_type = 'annual';

CREATE INDEX idx_branch_performance_rows_annual_driver_phone
    ON public.branch_performance_rows ((row_data->>'기사전화번호'))
    WHERE branch_id = 'asan' AND dataset_type = 'annual';

ALTER TABLE public.branch_performance_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_branch_performance_rows
ON public.branch_performance_rows
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.branch_performance_rows FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_performance_rows TO service_role;

COMMENT ON TABLE public.branch_performance_rows IS
'Retention policy 2026-05-31: keep the active annual currentSnapshotId rows and monthly is_current rows only. Historical Excel sources remain on NAS.';

-- branch_dispatch_detail_change_history compact swap
DROP TABLE IF EXISTS public.branch_dispatch_detail_change_history_compact_20260531;

CREATE TABLE public.branch_dispatch_detail_change_history_compact_20260531 (
    LIKE public.branch_dispatch_detail_change_history INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);

INSERT INTO public.branch_dispatch_detail_change_history_compact_20260531
SELECT *
FROM public.branch_dispatch_detail_change_history
WHERE action NOT IN ('refreshed', 'resolved');

ALTER TABLE public.branch_dispatch_detail_change_history RENAME TO branch_dispatch_detail_change_history_bloat_20260531;
ALTER TABLE public.branch_dispatch_detail_change_history_compact_20260531 RENAME TO branch_dispatch_detail_change_history;
DROP TABLE public.branch_dispatch_detail_change_history_bloat_20260531;

ALTER TABLE public.branch_dispatch_detail_change_history
    ADD CONSTRAINT branch_dispatch_detail_change_history_pkey PRIMARY KEY (id);

ALTER TABLE public.branch_dispatch_detail_change_history
    ADD CONSTRAINT branch_dispatch_detail_change_history_event_id_fkey
    FOREIGN KEY (event_id)
    REFERENCES public.branch_dispatch_detail_change_events(id)
    ON DELETE SET NULL;

ALTER TABLE public.branch_dispatch_detail_change_history
    ADD CONSTRAINT branch_dispatch_detail_change_history_confirmation_id_fkey
    FOREIGN KEY (confirmation_id)
    REFERENCES public.branch_dispatch_confirmations(id)
    ON DELETE SET NULL;

CREATE INDEX idx_branch_dispatch_detail_change_history_lookup
    ON public.branch_dispatch_detail_change_history (branch_id, dispatch_type, target_date, changed_at DESC);

CREATE INDEX idx_branch_dispatch_detail_change_history_event_id
    ON public.branch_dispatch_detail_change_history (event_id);

CREATE INDEX idx_branch_dispatch_detail_change_history_confirmation_id
    ON public.branch_dispatch_detail_change_history (confirmation_id);

ALTER TABLE public.branch_dispatch_detail_change_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_branch_dispatch_detail_change_history
ON public.branch_dispatch_detail_change_history
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.branch_dispatch_detail_change_history FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.branch_dispatch_detail_change_history TO service_role;

COMMENT ON TABLE public.branch_dispatch_detail_change_history IS
'Retention policy 2026-05-31: keep meaningful audit actions; skip automatic refreshed/resolved noise.';

ANALYZE public.branch_performance_rows;
ANALYZE public.branch_dispatch_detail_change_history;
