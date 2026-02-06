-- Email 기반 계정 통합 마이그레이션
-- 실행 순서: 이 파일을 Supabase SQL Editor에서 실행

-- 1. 기존 중복 데이터 정리 (같은 이메일의 여러 레코드 중 가장 높은 권한만 남김)

-- 1-0. NULL email 처리 (auth.users에서 email 가져오기)
UPDATE user_roles ur
SET email = au.email
FROM auth.users au
WHERE ur.id = au.id AND ur.email IS NULL;

-- 1-1. 여전히 NULL인 레코드 삭제 (auth.users에도 없는 경우)
DELETE FROM user_roles WHERE email IS NULL;

DO $$
DECLARE
    rec RECORD;
    best_role TEXT;
    best_id UUID;
BEGIN
    -- 각 이메일별로 처리
    FOR rec IN 
        SELECT DISTINCT email 
        FROM user_roles 
        WHERE email IS NOT NULL
    LOOP
        -- 해당 이메일의 가장 높은 권한 찾기 (admin > 지점 > visitor)
        SELECT id, role INTO best_id, best_role
        FROM user_roles
        WHERE email = rec.email
        ORDER BY 
            CASE 
                WHEN role = 'admin' THEN 0
                WHEN role != 'visitor' THEN 1
                ELSE 2
            END,
            created_at ASC
        LIMIT 1;
        
        -- 나머지 레코드 삭제
        DELETE FROM user_roles
        WHERE email = rec.email AND id != best_id;
        
        RAISE NOTICE 'Email: %, Kept ID: %, Role: %', rec.email, best_id, best_role;
    END LOOP;
END $$;

-- 2. user_roles 테이블 스키마 수정
-- 2-0. posts 테이블의 외래 키 제약조건 제거 (의존성 해결)
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_author_id_fkey;

-- 2-1. 기존 PRIMARY KEY 제약조건 제거
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_pkey;

-- 2-2. email을 PRIMARY KEY로 설정 (NOT NULL 제약 추가)
ALTER TABLE user_roles ALTER COLUMN email SET NOT NULL;
ALTER TABLE user_roles ADD PRIMARY KEY (email);

-- 2-3. id는 nullable로 변경하고 인덱스 추가 (빠른 조회용)
ALTER TABLE user_roles ALTER COLUMN id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_roles_id ON user_roles(id);

-- 2-4. posts 테이블의 외래 키를 다시 생성 (선택사항, 필요시)
-- posts.author_id는 auth.users.id를 참조하므로 user_roles와 직접 연결 불필요
-- 따라서 외래 키 재생성 생략

-- 2-4. updated_at 컬럼 추가 (없는 경우)
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. 트리거 함수 수정 (Email 기반 UPSERT)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Email 기반으로 UPSERT (이미 있으면 ID만 업데이트, 없으면 새로 생성)
  INSERT INTO public.user_roles (id, email, role, created_at, updated_at)
  VALUES (NEW.id, NEW.email, 'visitor', NOW(), NOW())
  ON CONFLICT (email) DO UPDATE
  SET 
    id = NEW.id,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. profiles 테이블 자동 생성 트리거 추가
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Email 기반으로 UPSERT
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (email) DO UPDATE
  SET id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. profiles 트리거 생성
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_profile();

-- 6. 기존 auth.users에 대해 profiles 생성 (누락된 데이터 보완)
INSERT INTO public.profiles (id, email, full_name, avatar_url)
SELECT 
    u.id,
    u.email,
    u.raw_user_meta_data->>'full_name' AS full_name,
    u.raw_user_meta_data->>'avatar_url' AS avatar_url
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- 7. 검증 쿼리 (실행 후 확인용)
-- 이메일당 user_roles 레코드 개수 확인 (모두 1개여야 함)
SELECT email, COUNT(*) as count
FROM user_roles
GROUP BY email
HAVING COUNT(*) > 1;

-- 이메일당 profiles 레코드 개수 확인 (모두 1개여야 함)
SELECT email, COUNT(*) as count
FROM profiles
GROUP BY email
HAVING COUNT(*) > 1;

-- 전체 데이터 확인
SELECT 
    ur.email,
    ur.role,
    ur.id as user_roles_id,
    p.id as profiles_id,
    p.full_name
FROM user_roles ur
LEFT JOIN profiles p ON ur.email = p.email
ORDER BY ur.email;
