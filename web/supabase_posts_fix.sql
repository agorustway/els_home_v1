-- posts 테이블에 author_email 컬럼 추가 및 데이터 마이그레이션
-- 실행 후 API에서 author_email을 사용하도록 변경

-- 1. author_email 컬럼 추가
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS author_email TEXT;

-- 2. 기존 데이터 마이그레이션 (auth.users에서 이메일 가져오기)
UPDATE public.posts p
SET author_email = u.email
FROM auth.users u
WHERE p.author_id = u.id
AND p.author_email IS NULL;

-- 3. 인덱스 추가 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_posts_author_email ON public.posts(author_email);

-- 4. RLS 정책 업데이트 (필요시)
-- 기존 정책이 ID 기반이라면 Email 기반으로 변경하거나 유지 (작성자는 본인 게시글 수정 가능 등)
DROP POLICY IF EXISTS "Users can update their own posts." ON public.posts;
CREATE POLICY "Users can update their own posts."
  ON public.posts FOR UPDATE
  USING (auth.uid() = author_id OR auth.jwt()->>'email' = author_email);

DROP POLICY IF EXISTS "Users can delete their own posts." ON public.posts;
CREATE POLICY "Users can delete their own posts."
  ON public.posts FOR DELETE
  USING (auth.uid() = author_id OR auth.jwt()->>'email' = author_email);
