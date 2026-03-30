-- 1. notices 테이블에 공지사항 분류용 카테고리 컬럼 추가 (기본값 '일반공지' 지정)
ALTER TABLE public.notices
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT '일반공지';

-- 2. 관리자가 참고할 수 있도록 컬럼에 코멘트(설명) 달기
COMMENT ON COLUMN public.notices.category IS '공지사항 카테고리 분류 (일반공지/작업안내/안전교육 등)';
