-- 배차 테이블에 셀 메모(코멘트) 칼럼 추가
ALTER TABLE branch_dispatch ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '{}'::jsonb;
