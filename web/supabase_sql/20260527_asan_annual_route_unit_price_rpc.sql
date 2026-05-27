-- 아산 연간실적 구간단가: 원장 전체를 웹 프로세스로 끌고 오지 않고 DB에서 구간/기간 단위로 먼저 집계한다.

CREATE OR REPLACE FUNCTION public.asan_performance_amount_to_numeric(value text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
    WITH parsed AS (
        SELECT
            btrim(coalesce(value, '')) AS raw,
            regexp_replace(btrim(coalesce(value, '')), '[^0-9.]', '', 'g') AS amount_text
    )
    SELECT CASE
        WHEN raw = '' OR raw = '-' OR amount_text = '' OR amount_text !~ '^[0-9]+(\.[0-9]+)?$' THEN 0::numeric
        ELSE (CASE WHEN raw ~ '^\(' OR raw ~ '^-' THEN -1 ELSE 1 END) * amount_text::numeric
    END
    FROM parsed;
$$;

CREATE OR REPLACE FUNCTION public.asan_annual_route_unit_price_rows(
    p_scope text DEFAULT 'all',
    p_year integer DEFAULT NULL,
    p_month integer DEFAULT NULL,
    p_limit integer DEFAULT 160
)
RETURNS TABLE (
    route_key text,
    route_label text,
    pickup text,
    region text,
    work_site text,
    unload text,
    sales_item text,
    bill_to text,
    pay_to text,
    type_value text,
    trend_key text,
    trend_label text,
    trend_basis text,
    revenue numeric,
    purchase numeric,
    profit numeric,
    row_count bigint,
    group_revenue numeric,
    group_purchase numeric,
    group_profit numeric,
    group_row_count bigint,
    scope_revenue numeric,
    scope_purchase numeric,
    scope_profit numeric,
    scope_row_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH current_files AS (
        SELECT
            file_path,
            sheet_name,
            nullif(coalesce(summary->>'currentSnapshotId', summary->>'snapshotId'), '') AS snapshot_id
        FROM branch_performance_files
        WHERE branch_id = 'asan'
          AND dataset_type = 'annual'
          AND (
              nullif(coalesce(summary->>'currentSnapshotId', summary->>'snapshotId'), '') IS NOT NULL
              OR coalesce(current_row_count, row_count, 0) > 0
          )
    ),
    current_rows AS (
        SELECT r.row_data, r.year_value, r.month_value
        FROM branch_performance_rows r
        JOIN current_files f
          ON (
              f.snapshot_id IS NOT NULL
              AND r.snapshot_id::text = f.snapshot_id
          )
          OR (
              f.snapshot_id IS NULL
              AND r.is_current IS TRUE
              AND r.file_path = f.file_path
              AND r.sheet_name = f.sheet_name
          )
        WHERE r.branch_id = 'asan'
          AND r.dataset_type = 'annual'
    ),
    normal_rows AS (
        SELECT
            coalesce(nullif(btrim(row_data->>'픽업'), ''), nullif(btrim(row_data->>'청구픽업'), ''), '-') AS pickup,
            coalesce(nullif(btrim(row_data->>'지역'), ''), '-') AS region,
            coalesce(nullif(btrim(row_data->>'작업지'), ''), '-') AS work_site,
            coalesce(nullif(btrim(row_data->>'하차'), ''), nullif(btrim(row_data->>'하차지'), ''), '-') AS unload_point,
            coalesce(nullif(btrim(row_data->>'매출'), ''), nullif(btrim(row_data->>'매출구분'), ''), nullif(btrim(row_data->>'항목'), ''), '-') AS sales_item,
            coalesce(nullif(btrim(row_data->>'청구처'), ''), nullif(btrim(row_data->>'거래처'), ''), nullif(btrim(row_data->>'화주'), ''), '-') AS bill_to,
            coalesce(nullif(btrim(row_data->>'지급처'), ''), nullif(btrim(row_data->>'하불처'), ''), nullif(btrim(row_data->>'운송사'), ''), '-') AS pay_to,
            coalesce(nullif(btrim(row_data->>'TYPE'), ''), nullif(btrim(row_data->>'타입'), ''), nullif(btrim(row_data->>'규격'), ''), '-') AS type_value,
            public.asan_performance_amount_to_numeric(coalesce(row_data->>'청구', row_data->>'청구금액', row_data->>'매출금액')) AS revenue,
            public.asan_performance_amount_to_numeric(coalesce(row_data->>'하불', row_data->>'지급금액', row_data->>'매입금액')) AS purchase,
            year_value::integer AS period_year,
            month_value::integer AS period_month,
            row_data
        FROM current_rows
    ),
    dated_rows AS (
        SELECT
            n.*,
            regexp_match(
                coalesce(row_data->>'작업일자', row_data->>'작업일', row_data->>'운송일자', ''),
                '^(\d{4})[-./]?(0?[1-9]|1[0-2])[-./]?(0?[1-9]|[12][0-9]|3[01])'
            ) AS work_parts
        FROM normal_rows n
    ),
    prepared AS (
        SELECT
            pickup,
            region,
            work_site,
            unload_point,
            sales_item,
            bill_to,
            pay_to,
            type_value,
            revenue,
            purchase,
            revenue - purchase AS profit,
            period_year,
            period_month,
            period_year::text || '-' || lpad(period_month::text, 2, '0') AS period_key,
            CASE
                WHEN work_parts IS NULL THEN NULL
                ELSE (work_parts)[1] || '-' || lpad((work_parts)[2], 2, '0') || '-' || lpad((work_parts)[3], 2, '0')
            END AS work_date,
            concat_ws(' - ', pickup, region, work_site, unload_point) AS route_label,
            concat_ws('||', pickup, region, work_site, unload_point, sales_item, bill_to, pay_to, type_value) AS route_key
        FROM dated_rows
        WHERE period_year IS NOT NULL
          AND period_month IS NOT NULL
          AND period_month BETWEEN 1 AND 12
          AND (revenue <> 0 OR purchase <> 0)
    ),
    scoped AS (
        SELECT
            *,
            CASE
                WHEN lower(coalesce(p_scope, 'all')) = 'month' THEN coalesce(work_date, period_key)
                WHEN lower(coalesce(p_scope, 'all')) = 'year' THEN period_key
                ELSE period_year::text
            END AS trend_key,
            CASE
                WHEN lower(coalesce(p_scope, 'all')) = 'month' THEN coalesce(work_date, period_key)
                WHEN lower(coalesce(p_scope, 'all')) = 'year' THEN period_key
                ELSE period_year::text || '년'
            END AS trend_label,
            CASE
                WHEN lower(coalesce(p_scope, 'all')) = 'month' THEN '작업일자별'
                WHEN lower(coalesce(p_scope, 'all')) = 'year' THEN '월별'
                ELSE '연도별'
            END AS trend_basis
        FROM prepared
        WHERE (
            lower(coalesce(p_scope, 'all')) NOT IN ('year', 'month')
            OR period_year = p_year
        )
          AND (
            lower(coalesce(p_scope, 'all')) <> 'month'
            OR (period_year = p_year AND period_month = p_month)
          )
    ),
    scope_totals AS (
        SELECT
            coalesce(sum(revenue), 0)::numeric AS scope_revenue,
            coalesce(sum(purchase), 0)::numeric AS scope_purchase,
            coalesce(sum(profit), 0)::numeric AS scope_profit,
            count(*)::bigint AS scope_row_count
        FROM scoped
    ),
    aggregated AS (
        SELECT
            route_key,
            route_label,
            pickup,
            region,
            work_site,
            unload_point,
            sales_item,
            bill_to,
            pay_to,
            type_value,
            trend_key,
            trend_label,
            trend_basis,
            sum(revenue)::numeric AS revenue,
            sum(purchase)::numeric AS purchase,
            sum(profit)::numeric AS profit,
            count(*)::bigint AS row_count
        FROM scoped
        GROUP BY route_key, route_label, pickup, region, work_site, unload_point, sales_item, bill_to, pay_to, type_value, trend_key, trend_label, trend_basis
    ),
    group_totals AS (
        SELECT
            route_key,
            sum(revenue)::numeric AS group_revenue,
            sum(purchase)::numeric AS group_purchase,
            sum(profit)::numeric AS group_profit,
            sum(row_count)::bigint AS group_row_count
        FROM aggregated
        GROUP BY route_key
    ),
    ranked_groups AS (
        SELECT *
        FROM group_totals
        ORDER BY abs(group_revenue) DESC, route_key
        LIMIT greatest(1, least(coalesce(p_limit, 160), 500))
    )
    SELECT
        a.route_key,
        a.route_label,
        a.pickup,
        a.region,
        a.work_site,
        a.unload_point AS unload,
        a.sales_item,
        a.bill_to,
        a.pay_to,
        a.type_value,
        a.trend_key,
        a.trend_label,
        a.trend_basis,
        a.revenue,
        a.purchase,
        a.profit,
        a.row_count,
        g.group_revenue,
        g.group_purchase,
        g.group_profit,
        g.group_row_count,
        st.scope_revenue,
        st.scope_purchase,
        st.scope_profit,
        st.scope_row_count
    FROM aggregated a
    JOIN ranked_groups g ON g.route_key = a.route_key
    CROSS JOIN scope_totals st
    ORDER BY abs(g.group_revenue) DESC, a.route_key, a.trend_key;
$$;

REVOKE ALL ON FUNCTION public.asan_performance_amount_to_numeric(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.asan_annual_route_unit_price_rows(text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_performance_amount_to_numeric(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.asan_annual_route_unit_price_rows(text, integer, integer, integer) TO service_role;
