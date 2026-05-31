-- Release oversized branch_performance_rows indexes before compact-swap migration.
-- These are either unused by current query paths or will be recreated with narrower predicates.

DROP INDEX IF EXISTS public.idx_branch_performance_rows_data;
DROP INDEX IF EXISTS public.idx_branch_performance_rows_hash;
DROP INDEX IF EXISTS public.idx_branch_performance_rows_current;
DROP INDEX IF EXISTS public.idx_branch_performance_rows_route_unit_current_period;
DROP INDEX IF EXISTS public.idx_branch_performance_rows_search;
DROP INDEX IF EXISTS public.idx_branch_performance_rows_year_month;
DROP INDEX IF EXISTS public.idx_branch_performance_rows_annual_ctn;
DROP INDEX IF EXISTS public.idx_branch_performance_rows_annual_seal;
DROP INDEX IF EXISTS public.idx_branch_performance_rows_annual_booking;
DROP INDEX IF EXISTS public.idx_branch_performance_rows_annual_vehicle_no;
DROP INDEX IF EXISTS public.idx_branch_performance_rows_annual_driver_phone;
