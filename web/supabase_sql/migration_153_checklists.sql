-- 1. vehicle_trips 테이블에 운행 전 점검 항목 5가지 컬럼 추가 (기본값 false 지정)
ALTER TABLE public.vehicle_trips
ADD COLUMN IF NOT EXISTS chk_brake BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chk_tire BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chk_lamp BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chk_cargo BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS chk_driver BOOLEAN DEFAULT false;

-- 2. 관리자가 참고할 수 있도록 각 컬럼에 코멘트(설명) 달기
COMMENT ON COLUMN public.vehicle_trips.chk_brake IS '운행 전 제동장치 점검 여부 (정상 응답성/파손 및 누출)';
COMMENT ON COLUMN public.vehicle_trips.chk_tire IS '운행 전 타이어/바퀴 점검 여부 (공기압/마모/체결)';
COMMENT ON COLUMN public.vehicle_trips.chk_lamp IS '운행 전 등화장치 점검 여부 (전조등/방향지시등/차폭등)';
COMMENT ON COLUMN public.vehicle_trips.chk_cargo IS '운행 전 적재물/적재함 점검 여부 (결박/이탈방지/덮개)';
COMMENT ON COLUMN public.vehicle_trips.chk_driver IS '운행 전 운전자 건강 및 음주상태 점검 여부 (건강/음주/과로)';
