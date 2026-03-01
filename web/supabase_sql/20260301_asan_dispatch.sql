-- 아산지점 배차판 테이블
-- 실행일: 2026-03-01
-- 목적: NAS 엑셀 → Supabase → 웹 배차판 시스템

-- 1. 배차 데이터 테이블 (시트별 날짜 단위로 저장)
CREATE TABLE IF NOT EXISTS branch_dispatch (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',          -- 지점 ID
    type TEXT NOT NULL,                               -- 'glovis' 또는 'mobis'
    target_date DATE NOT NULL,                        -- 시트 날짜 (예: 2026-03-03)
    headers JSONB DEFAULT '[]'::jsonb,                -- 헤더 이름 배열 (동적)
    data JSONB DEFAULT '[]'::jsonb,                   -- 행 데이터 배열
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, type, target_date)
);

-- 2. 배차판 설정 테이블 (파일 경로 등)
CREATE TABLE IF NOT EXISTS branch_dispatch_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan' UNIQUE,
    glovis_path TEXT DEFAULT '',                       -- 글로비스 엑셀 NAS 경로
    mobis_path TEXT DEFAULT '',                        -- 모비스 엑셀 NAS 경로
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 초기 설정 삽입
INSERT INTO branch_dispatch_settings (branch_id, glovis_path, mobis_path) 
VALUES ('asan', '/아산지점/A_운송실무/2025년_배차-일일배차(글로비스KD외).xlsm', '/아산지점/A_운송실무/2025년_배차-일일배차(모비스AS).xlsm')
ON CONFLICT (branch_id) DO NOTHING;

-- 4. RLS 활성화
ALTER TABLE branch_dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_dispatch_settings ENABLE ROW LEVEL SECURITY;

-- 5. 서비스 키 전용 정책 (서버사이드에서만 접근)
CREATE POLICY "service_role_dispatch" ON branch_dispatch FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_dispatch_settings" ON branch_dispatch_settings FOR ALL USING (true) WITH CHECK (true);
