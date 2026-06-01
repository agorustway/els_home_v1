-- 아산 배차 현황판 집계 캐시 서버 전용 권한
-- anon/authenticated는 차단하고, Next.js route/service role만 캐시를 읽고 갱신한다.

GRANT SELECT, INSERT, UPDATE ON TABLE public.branch_dispatch_dashboard_cache TO service_role;
