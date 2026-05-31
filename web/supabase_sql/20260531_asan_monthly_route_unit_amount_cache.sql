-- 아산 구간단가 화면이 실제 호출하는 monthly amount RPC 캐시.
-- 월간 current JSONB 행을 매 요청마다 다시 파싱하지 않고, import 이후 한 번 집계한 결과를 읽는다.

CREATE TABLE IF NOT EXISTS public.branch_performance_monthly_route_unit_amount_cache (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL DEFAULT 'asan',
    scope_mode TEXT NOT NULL,
    filter_year INTEGER NOT NULL DEFAULT 0,
    filter_month INTEGER NOT NULL DEFAULT 0,
    key TEXT NOT NULL,
    rank_order INTEGER NOT NULL,
    revenue_amount NUMERIC NOT NULL DEFAULT 0,
    purchase_amount NUMERIC NOT NULL DEFAULT 0,
    unit_profit NUMERIC NOT NULL DEFAULT 0,
    sales_item TEXT NOT NULL DEFAULT '-',
    region TEXT NOT NULL DEFAULT '-',
    work_site TEXT NOT NULL DEFAULT '-',
    carrier TEXT NOT NULL DEFAULT '-',
    category TEXT NOT NULL DEFAULT '-',
    pickup TEXT NOT NULL DEFAULT '-',
    billing_pickup TEXT NOT NULL DEFAULT '-',
    shipment TEXT NOT NULL DEFAULT '-',
    type TEXT NOT NULL DEFAULT '-',
    bill_to TEXT NOT NULL DEFAULT '-',
    pay_to TEXT NOT NULL DEFAULT '-',
    row_count BIGINT NOT NULL DEFAULT 0,
    revenue NUMERIC NOT NULL DEFAULT 0,
    purchase NUMERIC NOT NULL DEFAULT 0,
    profit NUMERIC NOT NULL DEFAULT 0,
    period_start TEXT NOT NULL DEFAULT '',
    period_end TEXT NOT NULL DEFAULT '',
    periods TEXT[] NOT NULL DEFAULT '{}',
    total_group_count BIGINT NOT NULL DEFAULT 0,
    total_row_count BIGINT NOT NULL DEFAULT 0,
    total_revenue NUMERIC NOT NULL DEFAULT 0,
    total_purchase NUMERIC NOT NULL DEFAULT 0,
    total_profit NUMERIC NOT NULL DEFAULT 0,
    refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_performance_monthly_route_unit_amount_cache_lookup
    ON public.branch_performance_monthly_route_unit_amount_cache (branch_id, scope_mode, filter_year, filter_month, rank_order);

ALTER TABLE public.branch_performance_monthly_route_unit_amount_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_branch_performance_monthly_route_unit_amount_cache
ON public.branch_performance_monthly_route_unit_amount_cache;

CREATE POLICY service_role_branch_performance_monthly_route_unit_amount_cache
ON public.branch_performance_monthly_route_unit_amount_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON TABLE public.branch_performance_monthly_route_unit_amount_cache FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.branch_performance_monthly_route_unit_amount_cache TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_asan_monthly_route_unit_amount_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    inserted_count integer := 0;
BEGIN
    TRUNCATE TABLE public.branch_performance_monthly_route_unit_amount_cache;

    WITH source_rows AS (
        SELECT
            r.row_data,
            r.year_value,
            r.month_value,
            concat(r.year_value::text, '-', lpad(r.month_value::text, 2, '0')) AS period_value
        FROM public.branch_performance_rows r
        WHERE r.branch_id = 'asan'
          AND r.dataset_type = 'monthly'
          AND r.is_current = true
    ),
    mapped AS (
        SELECT
            public.asan_performance_amount_to_numeric(coalesce(row_data ->> '청구', row_data ->> '청구금액', row_data ->> '매출금액')) AS revenue_amount,
            public.asan_performance_amount_to_numeric(coalesce(row_data ->> '하불', row_data ->> '지급금액', row_data ->> '매입금액')) AS purchase_amount,
            coalesce(nullif(row_data ->> '매출', ''), nullif(row_data ->> '매출구분', ''), nullif(row_data ->> '항목', ''), '-') AS sales_item,
            coalesce(nullif(row_data ->> '지역', ''), '-') AS region,
            coalesce(nullif(row_data ->> '작업지', ''), '-') AS work_site,
            coalesce(nullif(row_data ->> '운송사(명의)', ''), nullif(row_data ->> '운송사명의', ''), nullif(row_data ->> '운송사', ''), '-') AS carrier,
            coalesce(nullif(row_data ->> '구분', ''), '-') AS category,
            coalesce(nullif(row_data ->> '픽업', ''), '-') AS pickup,
            coalesce(nullif(row_data ->> '청구픽업', ''), nullif(row_data ->> '청구 픽업', ''), '-') AS billing_pickup,
            coalesce(nullif(row_data ->> '선적', ''), nullif(row_data ->> '선적지', ''), nullif(row_data ->> '선적항', ''), '-') AS shipment,
            coalesce(nullif(row_data ->> 'TYPE', ''), nullif(row_data ->> '타입', ''), nullif(row_data ->> '규격', ''), '-') AS type,
            coalesce(nullif(row_data ->> '청구처', ''), nullif(row_data ->> '거래처', ''), nullif(row_data ->> '화주', ''), '-') AS bill_to,
            coalesce(nullif(row_data ->> '하불처', ''), nullif(row_data ->> '지급처', ''), nullif(row_data ->> '하불거래처', ''), '-') AS pay_to,
            period_value,
            year_value::integer AS period_year,
            month_value::integer AS period_month
        FROM source_rows
    ),
    filtered AS (
        SELECT *
        FROM mapped
        WHERE revenue_amount <> 0 OR purchase_amount <> 0
    ),
    scoped AS (
        SELECT 'all'::text AS scope_mode, 0::integer AS filter_year, 0::integer AS filter_month, *
        FROM filtered
        UNION ALL
        SELECT 'year'::text AS scope_mode, period_year AS filter_year, 0::integer AS filter_month, *
        FROM filtered
        UNION ALL
        SELECT 'month'::text AS scope_mode, period_year AS filter_year, period_month AS filter_month, *
        FROM filtered
    ),
    grouped AS (
        SELECT
            scope_mode,
            filter_year,
            filter_month,
            md5(concat_ws(
                '||',
                revenue_amount::text,
                purchase_amount::text,
                sales_item,
                region,
                work_site,
                carrier,
                category,
                pickup,
                billing_pickup,
                shipment,
                type,
                bill_to,
                pay_to
            )) AS key,
            revenue_amount,
            purchase_amount,
            revenue_amount - purchase_amount AS unit_profit,
            sales_item,
            region,
            work_site,
            carrier,
            category,
            pickup,
            billing_pickup,
            shipment,
            type,
            bill_to,
            pay_to,
            count(*)::BIGINT AS row_count,
            sum(revenue_amount) AS revenue,
            sum(purchase_amount) AS purchase,
            sum(revenue_amount - purchase_amount) AS profit,
            min(period_value) AS period_start,
            max(period_value) AS period_end,
            array_agg(DISTINCT period_value ORDER BY period_value) AS periods
        FROM scoped
        GROUP BY
            scope_mode,
            filter_year,
            filter_month,
            revenue_amount,
            purchase_amount,
            sales_item,
            region,
            work_site,
            carrier,
            category,
            pickup,
            billing_pickup,
            shipment,
            type,
            bill_to,
            pay_to
    ),
    ranked AS (
        SELECT
            grouped.*,
            row_number() OVER (
                PARTITION BY scope_mode, filter_year, filter_month
                ORDER BY revenue_amount DESC, purchase_amount DESC, row_count DESC, key ASC
            )::integer AS rank_order,
            count(*) OVER (PARTITION BY scope_mode, filter_year, filter_month)::BIGINT AS total_group_count,
            sum(row_count) OVER (PARTITION BY scope_mode, filter_year, filter_month)::BIGINT AS total_row_count,
            sum(revenue) OVER (PARTITION BY scope_mode, filter_year, filter_month) AS total_revenue,
            sum(purchase) OVER (PARTITION BY scope_mode, filter_year, filter_month) AS total_purchase,
            sum(profit) OVER (PARTITION BY scope_mode, filter_year, filter_month) AS total_profit
        FROM grouped
    )
    INSERT INTO public.branch_performance_monthly_route_unit_amount_cache (
        id,
        branch_id,
        scope_mode,
        filter_year,
        filter_month,
        key,
        rank_order,
        revenue_amount,
        purchase_amount,
        unit_profit,
        sales_item,
        region,
        work_site,
        carrier,
        category,
        pickup,
        billing_pickup,
        shipment,
        type,
        bill_to,
        pay_to,
        row_count,
        revenue,
        purchase,
        profit,
        period_start,
        period_end,
        periods,
        total_group_count,
        total_row_count,
        total_revenue,
        total_purchase,
        total_profit,
        refreshed_at
    )
    SELECT
        md5(concat_ws('||', 'asan', scope_mode, filter_year, filter_month, key)) AS id,
        'asan',
        scope_mode,
        filter_year,
        filter_month,
        key,
        rank_order,
        revenue_amount,
        purchase_amount,
        unit_profit,
        sales_item,
        region,
        work_site,
        carrier,
        category,
        pickup,
        billing_pickup,
        shipment,
        type,
        bill_to,
        pay_to,
        row_count,
        revenue,
        purchase,
        profit,
        period_start,
        period_end,
        periods,
        total_group_count,
        total_row_count,
        total_revenue,
        total_purchase,
        total_profit,
        now()
    FROM ranked
    WHERE rank_order <= 10000;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    ANALYZE public.branch_performance_monthly_route_unit_amount_cache;

    RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_asan_monthly_route_unit_amount_cache() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_asan_monthly_route_unit_amount_cache() TO service_role;

CREATE OR REPLACE FUNCTION public.asan_monthly_route_unit_amount_rows(
    p_scope text DEFAULT 'all',
    p_year integer DEFAULT NULL,
    p_month integer DEFAULT NULL,
    p_limit integer DEFAULT 5000
)
RETURNS TABLE (
    key text,
    revenue_amount numeric,
    purchase_amount numeric,
    unit_profit numeric,
    sales_item text,
    region text,
    work_site text,
    carrier text,
    category text,
    pickup text,
    billing_pickup text,
    shipment text,
    type text,
    bill_to text,
    pay_to text,
    row_count bigint,
    revenue numeric,
    purchase numeric,
    profit numeric,
    period_start text,
    period_end text,
    periods text[],
    total_group_count bigint,
    total_row_count bigint,
    total_revenue numeric,
    total_purchase numeric,
    total_profit numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH scope_input AS (
        SELECT
            CASE
                WHEN lower(coalesce(p_scope, 'all')) = 'month' THEN 'month'
                WHEN lower(coalesce(p_scope, 'all')) = 'year' THEN 'year'
                ELSE 'all'
            END AS scope_mode,
            CASE
                WHEN lower(coalesce(p_scope, 'all')) IN ('year', 'month') THEN coalesce(p_year, 0)
                ELSE 0
            END AS filter_year,
            CASE
                WHEN lower(coalesce(p_scope, 'all')) = 'month' THEN coalesce(p_month, 0)
                ELSE 0
            END AS filter_month
    )
    SELECT
        c.key,
        c.revenue_amount,
        c.purchase_amount,
        c.unit_profit,
        c.sales_item,
        c.region,
        c.work_site,
        c.carrier,
        c.category,
        c.pickup,
        c.billing_pickup,
        c.shipment,
        c.type,
        c.bill_to,
        c.pay_to,
        c.row_count,
        c.revenue,
        c.purchase,
        c.profit,
        c.period_start,
        c.period_end,
        c.periods,
        c.total_group_count,
        c.total_row_count,
        c.total_revenue,
        c.total_purchase,
        c.total_profit
    FROM public.branch_performance_monthly_route_unit_amount_cache c
    CROSS JOIN scope_input i
    WHERE c.branch_id = 'asan'
      AND c.scope_mode = i.scope_mode
      AND c.filter_year = i.filter_year
      AND c.filter_month = i.filter_month
    ORDER BY c.rank_order
    LIMIT least(greatest(coalesce(p_limit, 5000), 1), 10000);
$$;

REVOKE ALL ON FUNCTION public.asan_monthly_route_unit_amount_rows(text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_monthly_route_unit_amount_rows(text, integer, integer, integer) TO service_role;

COMMENT ON TABLE public.branch_performance_monthly_route_unit_amount_cache IS
'Retention/speed policy 2026-05-31: 구간단가 화면용 월간 current 금액표 캐시. 원본 JSONB 행은 import 후 집계하고 화면 조회는 캐시만 읽는다.';
