-- 운전원정보 테이블에 소속지점 (branch) 컬럼 추가
ALTER TABLE driver_contacts
ADD COLUMN branch TEXT;
