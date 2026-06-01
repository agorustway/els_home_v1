-- 아산 배차판 날짜 메타 경량화를 위한 행수 컬럼
-- 화면 mode=meta 조회가 data JSONB 전체를 읽지 않도록 동기화 시 행수를 저장한다.

ALTER TABLE public.branch_dispatch
    ADD COLUMN IF NOT EXISTS row_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valid_row_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.branch_dispatch
SET
    row_count = jsonb_array_length(COALESCE(data, '[]'::jsonb)),
    valid_row_count = jsonb_array_length(COALESCE(data, '[]'::jsonb))
WHERE row_count = 0
   OR valid_row_count = 0;

CREATE INDEX IF NOT EXISTS idx_branch_dispatch_meta_lookup
    ON public.branch_dispatch(branch_id, type, target_date);
