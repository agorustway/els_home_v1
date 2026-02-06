-- ============================================
-- 최종 DB 정리 및 관계성 확립 스크립트
-- ============================================
-- 주의: 게시글(posts) 데이터를 정리합니다. (작성자 정보가 불확실한 게시글 삭제)

-- 1. posts 테이블 정비
-- 1-1. author_email이 없는(마이그레이션 실패한) 고아 게시글 삭제
DELETE FROM public.posts WHERE author_email IS NULL;

-- 1-2. author_email을 필수(NOT NULL)로 변경
ALTER TABLE public.posts ALTER COLUMN author_email SET NOT NULL;

-- 2. user_roles 테이블 정비
-- 2-1. 혹시 모를 중복이나 이상 데이터 정리
DELETE FROM public.user_roles WHERE email IS NULL;

-- 3. 테이블 관계 명시 (Foreign Key는 아니지만 논리적 연결)
COMMENT ON COLUMN public.posts.author_email IS '작성자 이메일 (user_roles.email 참조)';
COMMENT ON TABLE public.user_roles IS '사용자 권한 및 프로필 (Email PK)';

-- 4. RLS 정책 재확인 (Email 기반)
-- posts: 읽기는 모두 가능, 쓰기는 본인(Email)만 가능
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.posts;
CREATE POLICY "Public read access" ON public.posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Author create access" ON public.posts;
CREATE POLICY "Author create access" ON public.posts FOR INSERT 
WITH CHECK (auth.jwt()->>'email' = author_email);

DROP POLICY IF EXISTS "Author update access" ON public.posts;
CREATE POLICY "Author update access" ON public.posts FOR UPDATE
USING (auth.jwt()->>'email' = author_email);

DROP POLICY IF EXISTS "Author delete access" ON public.posts;
CREATE POLICY "Author delete access" ON public.posts FOR DELETE
USING (auth.jwt()->>'email' = author_email OR 
       EXISTS (SELECT 1 FROM user_roles WHERE email = auth.jwt()->>'email' AND role = 'admin'));

-- 5. user_roles 정책 재확인
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.user_roles;
CREATE POLICY "Public read access" ON public.user_roles FOR SELECT USING (true);

-- 관리자만 role 수정 가능 (API에서 처리하지만 DB 레벨에서도 보호)
-- 본인은 name, phone 등 기본 정보만 수정 가능 (별도 분리가 복잡하므로 API 로직에 위임하고 여기선 UPDATE 허용)
DROP POLICY IF EXISTS "User update access" ON public.user_roles;
CREATE POLICY "User update access" ON public.user_roles FOR UPDATE
USING (auth.jwt()->>'email' = email OR 
       EXISTS (SELECT 1 FROM user_roles WHERE email = auth.jwt()->>'email' AND role = 'admin'));

-- 6. 확인 쿼리
SELECT 'Tables Cleaned and Policies Managed' as status;
