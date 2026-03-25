-- ELS emergency_notices 테이블
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS emergency_notices (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '긴급 알림',
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT,
  expires_at  TIMESTAMPTZ
);

-- RLS 비활성화 (앱은 admin client 사용)
ALTER TABLE emergency_notices DISABLE ROW LEVEL SECURITY;

-- 인덱스 (최신순 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_emergency_created_at ON emergency_notices (created_at DESC);

-- 오래된 알림 자동 삭제 (48시간 초과 시)
-- 별도 pg_cron 스케줄 또는 주기적 수동 실행
-- DELETE FROM emergency_notices WHERE created_at < NOW() - INTERVAL '48 hours';
