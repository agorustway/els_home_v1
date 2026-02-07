-- 임직원별 개별 이트렌스 계정 정보 저장 테이블
CREATE TABLE IF NOT EXISTS public.user_els_credentials (
    email TEXT PRIMARY KEY REFERENCES public.profiles(email) ON DELETE CASCADE,
    els_id TEXT NOT NULL,
    els_pw TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS 보안 설정: 본인 데이터만 읽고 쓸 수 있음
ALTER TABLE public.user_els_credentials ENABLE ROW LEVEL SECURITY;

-- 기존 정책이 있을 수 있으니 drop 후 생성 (선택 사항)
DROP POLICY IF EXISTS "Users can manage their own ELS credentials" ON public.user_els_credentials;

CREATE POLICY "Users can manage their own ELS credentials" 
    ON public.user_els_credentials 
    FOR ALL 
    USING (auth.jwt() ->> 'email' = email);
