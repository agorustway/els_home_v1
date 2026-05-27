CREATE OR REPLACE FUNCTION public.asan_monthly_route_unit_amount_rows(
    p_scope TEXT DEFAULT 'all',
    p_year INTEGER DEFAULT NULL,
    p_month INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 5000
)
RETURNS TABLE (
    key TEXT,
    revenue_amount NUMERIC,
    purchase_amount NUMERIC,
    unit_profit NUMERIC,
    sales_item TEXT,
    region TEXT,
    work_site TEXT,
    carrier TEXT,
    category TEXT,
    pickup TEXT,
    billing_pickup TEXT,
    shipment TEXT,
    bill_to TEXT,
    pay_to TEXT,
    row_count BIGINT,
    revenue NUMERIC,
    purchase NUMERIC,
    profit NUMERIC,
    period_start TEXT,
    period_end TEXT,
    periods TEXT[],
    total_group_count BIGINT,
    total_row_count BIGINT,
    total_revenue NUMERIC,
    total_purchase NUMERIC,
    total_profit NUMERIC
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
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
      AND (coalesce(p_scope, 'all') <> 'year' OR r.year_value = p_year)
      AND (
          coalesce(p_scope, 'all') <> 'month'
          OR (r.year_value = p_year AND r.month_value = p_month)
      )
),
mapped AS (
    SELECT
        CASE
            WHEN regexp_replace(coalesce(row_data ->> '청구', row_data ->> '청구금액', row_data ->> '매출금액', ''), '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
            THEN regexp_replace(coalesce(row_data ->> '청구', row_data ->> '청구금액', row_data ->> '매출금액', ''), '[^0-9.-]', '', 'g')::NUMERIC
            ELSE 0
        END AS revenue_amount,
        CASE
            WHEN regexp_replace(coalesce(row_data ->> '하불', row_data ->> '지급금액', row_data ->> '매입금액', ''), '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
            THEN regexp_replace(coalesce(row_data ->> '하불', row_data ->> '지급금액', row_data ->> '매입금액', ''), '[^0-9.-]', '', 'g')::NUMERIC
            ELSE 0
        END AS purchase_amount,
        coalesce(nullif(row_data ->> '매출', ''), nullif(row_data ->> '매출구분', ''), nullif(row_data ->> '항목', ''), '-') AS sales_item,
        coalesce(nullif(row_data ->> '지역', ''), '-') AS region,
        coalesce(nullif(row_data ->> '작업지', ''), '-') AS work_site,
        coalesce(nullif(row_data ->> '운송사(명의)', ''), nullif(row_data ->> '운송사명의', ''), nullif(row_data ->> '운송사', ''), '-') AS carrier,
        coalesce(nullif(row_data ->> '구분', ''), '-') AS category,
        coalesce(nullif(row_data ->> '픽업', ''), '-') AS pickup,
        coalesce(nullif(row_data ->> '청구픽업', ''), nullif(row_data ->> '청구 픽업', ''), '-') AS billing_pickup,
        coalesce(nullif(row_data ->> '선적', ''), nullif(row_data ->> '선적지', ''), nullif(row_data ->> '선적항', ''), '-') AS shipment,
        coalesce(nullif(row_data ->> '청구처', ''), nullif(row_data ->> '거래처', ''), nullif(row_data ->> '화주', ''), '-') AS bill_to,
        coalesce(nullif(row_data ->> '하불처', ''), nullif(row_data ->> '지급처', ''), nullif(row_data ->> '하불거래처', ''), '-') AS pay_to,
        period_value
    FROM source_rows
),
filtered AS (
    SELECT *
    FROM mapped
    WHERE revenue_amount <> 0 OR purchase_amount <> 0
),
grouped AS (
    SELECT
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
        bill_to,
        pay_to,
        count(*)::BIGINT AS row_count,
        sum(revenue_amount) AS revenue,
        sum(purchase_amount) AS purchase,
        sum(revenue_amount - purchase_amount) AS profit,
        min(period_value) AS period_start,
        max(period_value) AS period_end,
        array_agg(DISTINCT period_value ORDER BY period_value) AS periods
    FROM filtered
    GROUP BY
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
        bill_to,
        pay_to
),
ranked AS (
    SELECT
        grouped.*,
        count(*) OVER ()::BIGINT AS total_group_count,
        sum(row_count) OVER ()::BIGINT AS total_row_count,
        sum(revenue) OVER () AS total_revenue,
        sum(purchase) OVER () AS total_purchase,
        sum(profit) OVER () AS total_profit
    FROM grouped
)
SELECT *
FROM ranked
ORDER BY revenue_amount DESC, purchase_amount DESC, row_count DESC, key ASC
LIMIT least(greatest(coalesce(p_limit, 5000), 1), 10000);
$$;

REVOKE ALL ON FUNCTION public.asan_monthly_route_unit_amount_rows(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.asan_monthly_route_unit_amount_rows(TEXT, INTEGER, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.asan_monthly_route_unit_amount_rows(TEXT, INTEGER, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.asan_monthly_route_unit_amount_rows(TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.asan_monthly_route_unit_amount_payload(
    p_scope TEXT DEFAULT 'all',
    p_year INTEGER DEFAULT NULL,
    p_month INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 5000
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
WITH rows AS (
    SELECT *
    FROM public.asan_monthly_route_unit_amount_rows(p_scope, p_year, p_month, p_limit)
)
SELECT jsonb_build_object(
    'total_group_count', coalesce(max(total_group_count), 0),
    'total_row_count', coalesce(max(total_row_count), 0),
    'total_revenue', coalesce(max(total_revenue), 0),
    'total_purchase', coalesce(max(total_purchase), 0),
    'total_profit', coalesce(max(total_profit), 0),
    'groups', coalesce(
        jsonb_agg(
            jsonb_build_object(
                'key', key,
                'revenue_amount', revenue_amount,
                'purchase_amount', purchase_amount,
                'unit_profit', unit_profit,
                'sales_item', sales_item,
                'region', region,
                'work_site', work_site,
                'carrier', carrier,
                'category', category,
                'pickup', pickup,
                'billing_pickup', billing_pickup,
                'shipment', shipment,
                'bill_to', bill_to,
                'pay_to', pay_to,
                'row_count', row_count,
                'revenue', revenue,
                'purchase', purchase,
                'profit', profit,
                'period_start', period_start,
                'period_end', period_end,
                'periods', periods,
                'total_group_count', total_group_count,
                'total_row_count', total_row_count,
                'total_revenue', total_revenue,
                'total_purchase', total_purchase,
                'total_profit', total_profit
            )
            ORDER BY revenue_amount DESC, purchase_amount DESC, row_count DESC, key ASC
        ) FILTER (WHERE key IS NOT NULL),
        '[]'::jsonb
    )
)
FROM rows;
$$;

REVOKE ALL ON FUNCTION public.asan_monthly_route_unit_amount_payload(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.asan_monthly_route_unit_amount_payload(TEXT, INTEGER, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.asan_monthly_route_unit_amount_payload(TEXT, INTEGER, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.asan_monthly_route_unit_amount_payload(TEXT, INTEGER, INTEGER, INTEGER) TO service_role;
