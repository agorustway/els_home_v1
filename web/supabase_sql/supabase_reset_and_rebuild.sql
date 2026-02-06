-- ============================================
-- 완전 초기화 및 재구축 스크립트
-- ============================================
-- 주의: 이 스크립트는 기존 데이터를 모두 삭제합니다!
-- 실행 전 반드시 백업하세요!

-- ============================================
-- STEP 1: 기존 테이블 및 트리거 완전 삭제
-- ============================================

-- 트리거 삭제
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
DROP TRIGGER IF EXISTS on_profile_update ON public.profiles;

-- 함수 삭제
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_profile() CASCADE;
DROP FUNCTION IF EXISTS public.handle_profile_update_timestamp() CASCADE;

-- 테이블 삭제 (CASCADE로 모든 의존성 제거)
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================
-- STEP 2: 단순화된 테이블 재생성
-- ============================================

-- user_roles 테이블 (Email을 PRIMARY KEY로)
CREATE TABLE public.user_roles (
    email TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'visitor' CHECK (role IN ('admin', 'headquarters', 'asan', 'jungbu', 'dangjin', 'yesan', 'seosan', 'yeoncheon', 'ulsan', 'imgo', 'bulk', 'visitor')),
    name TEXT,
    phone TEXT,
    can_write BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_read_security BOOLEAN DEFAULT false,
    requested_role TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.user_roles IS 'Email 기반 사용자 권한 테이블 (소셜 로그인 통합)';

-- profiles 테이블 (Email을 PRIMARY KEY로)
CREATE TABLE public.profiles (
    email TEXT PRIMARY KEY,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Email 기반 사용자 프로필 테이블';

-- ============================================
-- STEP 3: RLS 정책 설정
-- ============================================

-- user_roles RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view user_roles"
    ON public.user_roles FOR SELECT
    USING (true);

CREATE POLICY "Users can insert their own role"
    ON public.user_roles FOR INSERT
    WITH CHECK (auth.jwt()->>'email' = email);

CREATE POLICY "Users can update their own role"
    ON public.user_roles FOR UPDATE
    USING (auth.jwt()->>'email' = email);

-- profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles"
    ON public.profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.jwt()->>'email' = email);

-- ============================================
-- STEP 4: 자동화 트리거 (Email 기반)
-- ============================================

-- 신규 회원가입 시 user_roles 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_roles (email, role)
    VALUES (NEW.email, 'visitor')
    ON CONFLICT (email) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 신규 회원가입 시 profiles 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (email, full_name, avatar_url)
    VALUES (
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (email) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- ============================================
-- STEP 5: 기존 auth.users 데이터 마이그레이션
-- ============================================

-- user_roles 초기 데이터 생성
INSERT INTO public.user_roles (email, role, name, phone)
SELECT 
    email,
    'visitor' as role,
    raw_user_meta_data->>'full_name' as name,
    raw_user_meta_data->>'phone' as phone
FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- profiles 초기 데이터 생성
INSERT INTO public.profiles (email, full_name, avatar_url)
SELECT 
    email,
    raw_user_meta_data->>'full_name' as full_name,
    raw_user_meta_data->>'avatar_url' as avatar_url
FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- STEP 6: 관리자 계정 설정 (수동)
-- ============================================
-- 아래 이메일을 실제 관리자 이메일로 변경하세요

UPDATE public.user_roles
SET role = 'admin'
WHERE email = 'orakami@gmail.com';  -- ← 형의 이메일

-- ============================================
-- STEP 7: 검증 쿼리
-- ============================================

-- 전체 데이터 확인
SELECT 
    ur.email,
    ur.role,
    ur.name,
    ur.phone,
    p.full_name,
    p.phone as profile_phone
FROM user_roles ur
LEFT JOIN profiles p ON ur.email = p.email
ORDER BY ur.email;

-- 중복 확인 (결과가 없어야 정상)
SELECT email, COUNT(*) as count
FROM user_roles
GROUP BY email
HAVING COUNT(*) > 1;

SELECT email, COUNT(*) as count
FROM profiles
GROUP BY email
HAVING COUNT(*) > 1;
