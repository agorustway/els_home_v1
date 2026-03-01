-- 엑셀 파일의 실제 수정시간 저장용 칼럼 추가
ALTER TABLE branch_dispatch ADD COLUMN IF NOT EXISTS file_modified_at TIMESTAMPTZ;
