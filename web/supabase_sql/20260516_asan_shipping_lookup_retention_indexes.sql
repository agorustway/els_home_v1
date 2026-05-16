-- 아산 선적관리 lookup/retention 성능 인덱스
-- 실행일: 2026-05-16
-- 목적:
-- 1) 컨테이너별 최신 조회 결과를 6개월치 누적 데이터에서도 빠르게 조회
-- 2) archive 1년, lookup 6개월 보존기간 정리 시 날짜 조건 delete 보조

CREATE INDEX IF NOT EXISTS idx_branch_shipping_container_lookups_latest
ON branch_shipping_container_lookups(branch_id, file_path, container_no, looked_up_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_container_lookups_retention
ON branch_shipping_container_lookups(looked_up_at);

CREATE INDEX IF NOT EXISTS idx_branch_shipping_row_archive_retention
ON branch_shipping_row_archive(archived_at);
