-- 아산 운송내역 NAS 파일 위치 보정
-- 2026_수출리스트.xlsx는 /아산지점 직하 파일이다.

ALTER TABLE public.branch_dispatch_settings
    ADD COLUMN IF NOT EXISTS transport_history_path TEXT DEFAULT '/아산지점/2026_수출리스트.xlsx';

UPDATE public.branch_dispatch_settings
SET transport_history_path = '/아산지점/2026_수출리스트.xlsx'
WHERE branch_id = 'asan'
  AND (
    transport_history_path IS NULL
    OR transport_history_path = ''
    OR transport_history_path = '/아산지점/A_운송실무/2026_수출리스트.xlsx'
  );
