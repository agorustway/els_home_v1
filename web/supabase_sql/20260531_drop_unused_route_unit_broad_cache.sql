-- 구간단가 최적화 검증 중 만든 넓은 범용 캐시 정리.
-- 실제 웹 화면은 asan_monthly_route_unit_amount_payload 경로를 사용하므로,
-- 최종 운영 캐시는 branch_performance_monthly_route_unit_amount_cache만 유지한다.

DROP FUNCTION IF EXISTS public.asan_performance_route_unit_price_rows(text, integer, integer, integer);
DROP TRIGGER IF EXISTS trg_refresh_route_unit_rank_caches_after_insert
ON public.branch_performance_route_unit_aggregates;
DROP TRIGGER IF EXISTS trg_refresh_route_unit_rank_caches_after_truncate
ON public.branch_performance_route_unit_aggregates;
DROP FUNCTION IF EXISTS public.refresh_asan_performance_route_unit_rank_caches_after_aggregate();
DROP FUNCTION IF EXISTS public.refresh_asan_performance_route_unit_rank_caches();
DROP FUNCTION IF EXISTS public.refresh_asan_performance_route_unit_aggregates();
DROP TABLE IF EXISTS public.branch_performance_route_unit_scope_totals;
DROP TABLE IF EXISTS public.branch_performance_route_unit_group_totals;
DROP TABLE IF EXISTS public.branch_performance_route_unit_aggregates;

ANALYZE public.branch_performance_rows;
ANALYZE public.branch_performance_monthly_route_unit_amount_cache;
