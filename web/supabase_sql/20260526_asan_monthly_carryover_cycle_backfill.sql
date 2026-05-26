-- 아산 월간실적 이월 순환 summary 백필
-- 목적:
-- 1) 청구/하불은 해당 마감월 반영 금액으로 유지한다.
-- 2) 첫 컬럼 값이 '이월'인 행의 청구/하불은 청구이월 반영분(incoming/included)으로 분리한다.
-- 3) 이월구분 + 청구_1/하불_1은 익월이월 발생분(outgoing)으로 분리한다.

WITH monthly_files AS (
  SELECT file_path, sheet_name, summary
  FROM public.branch_performance_files
  WHERE branch_id = 'asan'
    AND dataset_type = 'monthly'
),
parsed_rows AS (
  SELECT
    r.file_path,
    r.sheet_name,
    COALESCE(f.summary->>'sourcePeriod', '') AS source_period,
    COALESCE(r.row_data->>'이월여부', '') AS category,
    COALESCE(r.row_data->>'이월구분', '') AS carryover_type,
    COALESCE(NULLIF(r.row_data->>'청구처', ''), '미분류') AS client_name,
    COALESCE(NULLIF(r.row_data->>'지급처', ''), NULLIF(r.row_data->>'운송사(명의)', ''), '미분류') AS vendor_name,
    CASE
      WHEN regexp_replace(COALESCE(r.row_data->>'청구', ''), '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      THEN regexp_replace(r.row_data->>'청구', '[^0-9.-]', '', 'g')::numeric
      ELSE 0
    END AS revenue,
    CASE
      WHEN regexp_replace(COALESCE(r.row_data->>'하불', ''), '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      THEN regexp_replace(r.row_data->>'하불', '[^0-9.-]', '', 'g')::numeric
      ELSE 0
    END AS purchase,
    CASE
      WHEN regexp_replace(COALESCE(r.row_data->>'청구_1', ''), '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      THEN regexp_replace(r.row_data->>'청구_1', '[^0-9.-]', '', 'g')::numeric
      ELSE 0
    END AS carryover_revenue,
    CASE
      WHEN regexp_replace(COALESCE(r.row_data->>'하불_1', ''), '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\\.[0-9]+)?$'
      THEN regexp_replace(r.row_data->>'하불_1', '[^0-9.-]', '', 'g')::numeric
      ELSE 0
    END AS carryover_purchase
  FROM public.branch_performance_rows r
  JOIN monthly_files f
    ON f.file_path = r.file_path
   AND f.sheet_name = r.sheet_name
  WHERE r.branch_id = 'asan'
    AND r.dataset_type = 'monthly'
    AND r.is_current = TRUE
),
target_rows AS (
  SELECT
    *,
    CASE
      WHEN carryover_type ~ '(1[0-2]|0?[1-9])월이월'
      THEN (
        WITH parts AS (
          SELECT
            split_part(source_period, '-', 1)::int AS source_year,
            split_part(source_period, '-', 2)::int AS source_month,
            substring(carryover_type FROM '(1[0-2]|0?[1-9])월이월')::int AS target_month
        )
        SELECT
          ((CASE WHEN target_month <= source_month THEN source_year + 1 ELSE source_year END)::text)
          || '-' || lpad(target_month::text, 2, '0')
        FROM parts
      )
      ELSE '미정'
    END AS target_period
  FROM parsed_rows
),
file_agg AS (
  SELECT
    file_path,
    sheet_name,
    source_period,
    SUM(CASE WHEN category = '이월' THEN revenue ELSE 0 END) AS incoming_revenue,
    SUM(CASE WHEN category = '이월' THEN purchase ELSE 0 END) AS incoming_purchase,
    COUNT(*) FILTER (WHERE category = '이월' AND (revenue <> 0 OR purchase <> 0)) AS incoming_rows,
    SUM(carryover_revenue) AS outgoing_revenue,
    SUM(carryover_purchase) AS outgoing_purchase,
    COUNT(*) FILTER (WHERE carryover_type LIKE '%이월%' OR carryover_revenue <> 0 OR carryover_purchase <> 0) AS outgoing_rows
  FROM target_rows
  GROUP BY file_path, sheet_name, source_period
),
incoming_clients AS (
  SELECT file_path, sheet_name,
         jsonb_agg(jsonb_build_object(
           'name', client_name,
           'label', client_name,
           'revenue', revenue,
           'purchase', purchase,
           'profit', revenue - purchase,
           'rowCount', row_count,
           'profitRate', CASE WHEN revenue <> 0 THEN round(((revenue - purchase) / revenue) * 100, 2) ELSE 0 END
         ) ORDER BY abs(revenue) DESC) AS items
  FROM (
    SELECT file_path, sheet_name, client_name,
           round(SUM(revenue), 2) AS revenue,
           round(SUM(purchase), 2) AS purchase,
           COUNT(*) AS row_count
    FROM target_rows
    WHERE category = '이월'
      AND (revenue <> 0 OR purchase <> 0)
    GROUP BY file_path, sheet_name, client_name
  ) s
  GROUP BY file_path, sheet_name
),
incoming_vendors AS (
  SELECT file_path, sheet_name,
         jsonb_agg(jsonb_build_object(
           'name', vendor_name,
           'label', vendor_name,
           'revenue', revenue,
           'purchase', purchase,
           'profit', revenue - purchase,
           'rowCount', row_count,
           'profitRate', CASE WHEN revenue <> 0 THEN round(((revenue - purchase) / revenue) * 100, 2) ELSE 0 END
         ) ORDER BY abs(purchase) DESC) AS items
  FROM (
    SELECT file_path, sheet_name, vendor_name,
           round(SUM(revenue), 2) AS revenue,
           round(SUM(purchase), 2) AS purchase,
           COUNT(*) AS row_count
    FROM target_rows
    WHERE category = '이월'
      AND (revenue <> 0 OR purchase <> 0)
    GROUP BY file_path, sheet_name, vendor_name
  ) s
  GROUP BY file_path, sheet_name
),
outgoing_clients AS (
  SELECT file_path, sheet_name,
         jsonb_agg(jsonb_build_object(
           'name', client_name,
           'label', client_name,
           'revenue', revenue,
           'purchase', purchase,
           'profit', revenue - purchase,
           'rowCount', row_count,
           'profitRate', CASE WHEN revenue <> 0 THEN round(((revenue - purchase) / revenue) * 100, 2) ELSE 0 END
         ) ORDER BY abs(revenue) DESC) AS items
  FROM (
    SELECT file_path, sheet_name, client_name,
           round(SUM(carryover_revenue), 2) AS revenue,
           round(SUM(carryover_purchase), 2) AS purchase,
           COUNT(*) AS row_count
    FROM target_rows
    WHERE carryover_type LIKE '%이월%'
       OR carryover_revenue <> 0
       OR carryover_purchase <> 0
    GROUP BY file_path, sheet_name, client_name
  ) s
  GROUP BY file_path, sheet_name
),
outgoing_vendors AS (
  SELECT file_path, sheet_name,
         jsonb_agg(jsonb_build_object(
           'name', vendor_name,
           'label', vendor_name,
           'revenue', revenue,
           'purchase', purchase,
           'profit', revenue - purchase,
           'rowCount', row_count,
           'profitRate', CASE WHEN revenue <> 0 THEN round(((revenue - purchase) / revenue) * 100, 2) ELSE 0 END
         ) ORDER BY abs(purchase) DESC) AS items
  FROM (
    SELECT file_path, sheet_name, vendor_name,
           round(SUM(carryover_revenue), 2) AS revenue,
           round(SUM(carryover_purchase), 2) AS purchase,
           COUNT(*) AS row_count
    FROM target_rows
    WHERE carryover_type LIKE '%이월%'
       OR carryover_revenue <> 0
       OR carryover_purchase <> 0
    GROUP BY file_path, sheet_name, vendor_name
  ) s
  GROUP BY file_path, sheet_name
),
target_periods AS (
  SELECT file_path, sheet_name,
         jsonb_agg(jsonb_build_object(
           'period', target_period,
           'label', target_period,
           'revenue', revenue,
           'purchase', purchase,
           'profit', revenue - purchase,
           'rowCount', row_count,
           'profitRate', CASE WHEN revenue <> 0 THEN round(((revenue - purchase) / revenue) * 100, 2) ELSE 0 END
         ) ORDER BY target_period) AS items
  FROM (
    SELECT file_path, sheet_name, target_period,
           round(SUM(carryover_revenue), 2) AS revenue,
           round(SUM(carryover_purchase), 2) AS purchase,
           COUNT(*) AS row_count
    FROM target_rows
    WHERE carryover_type LIKE '%이월%'
       OR carryover_revenue <> 0
       OR carryover_purchase <> 0
    GROUP BY file_path, sheet_name, target_period
  ) s
  GROUP BY file_path, sheet_name
),
cycle_payload AS (
  SELECT
    a.file_path,
    a.sheet_name,
    jsonb_build_object(
      'sourcePeriod', a.source_period,
      'basis', '마감월',
      'included', jsonb_build_object(
        'key', 'incoming',
        'label', '청구이월 반영분',
        'description', '전월에서 넘어와 이번 마감월 청구/하불에 반영된 상단 이월분입니다.',
        'revenue', round(a.incoming_revenue, 2),
        'purchase', round(a.incoming_purchase, 2),
        'profit', round(a.incoming_revenue - a.incoming_purchase, 2),
        'rowCount', a.incoming_rows,
        'profitRate', CASE WHEN a.incoming_revenue <> 0 THEN round(((a.incoming_revenue - a.incoming_purchase) / a.incoming_revenue) * 100, 2) ELSE 0 END,
        'clientItems', COALESCE(ic.items, '[]'::jsonb),
        'vendorItems', COALESCE(iv.items, '[]'::jsonb)
      ),
      'incoming', jsonb_build_object(
        'key', 'incoming',
        'label', '청구이월 반영분',
        'description', '전월에서 넘어와 이번 마감월 청구/하불에 반영된 상단 이월분입니다.',
        'revenue', round(a.incoming_revenue, 2),
        'purchase', round(a.incoming_purchase, 2),
        'profit', round(a.incoming_revenue - a.incoming_purchase, 2),
        'rowCount', a.incoming_rows,
        'profitRate', CASE WHEN a.incoming_revenue <> 0 THEN round(((a.incoming_revenue - a.incoming_purchase) / a.incoming_revenue) * 100, 2) ELSE 0 END,
        'clientItems', COALESCE(ic.items, '[]'::jsonb),
        'vendorItems', COALESCE(iv.items, '[]'::jsonb)
      ),
      'outgoing', jsonb_build_object(
        'key', 'outgoing',
        'label', '익월이월 발생분',
        'description', '이번 마감에서 정리되어 다음 마감월로 넘어갈 이월 발생분입니다.',
        'revenue', round(a.outgoing_revenue, 2),
        'purchase', round(a.outgoing_purchase, 2),
        'profit', round(a.outgoing_revenue - a.outgoing_purchase, 2),
        'rowCount', a.outgoing_rows,
        'profitRate', CASE WHEN a.outgoing_revenue <> 0 THEN round(((a.outgoing_revenue - a.outgoing_purchase) / a.outgoing_revenue) * 100, 2) ELSE 0 END,
        'clientItems', COALESCE(oc.items, '[]'::jsonb),
        'vendorItems', COALESCE(ov.items, '[]'::jsonb)
      ),
      'netChange', jsonb_build_object(
        'label', '이월 순증감',
        'revenue', round(a.outgoing_revenue - a.incoming_revenue, 2),
        'purchase', round(a.outgoing_purchase - a.incoming_purchase, 2),
        'profit', round((a.outgoing_revenue - a.outgoing_purchase) - (a.incoming_revenue - a.incoming_purchase), 2),
        'rowCount', a.outgoing_rows - a.incoming_rows
      ),
      'targetPeriods', COALESCE(tp.items, '[]'::jsonb)
    ) AS cycle,
    jsonb_build_object(
      'key', 'outgoing',
      'label', '익월이월 발생분',
      'description', '이번 마감에서 정리되어 다음 마감월로 넘어갈 이월 발생분입니다.',
      'revenue', round(a.outgoing_revenue, 2),
      'purchase', round(a.outgoing_purchase, 2),
      'profit', round(a.outgoing_revenue - a.outgoing_purchase, 2),
      'rowCount', a.outgoing_rows,
      'profitRate', CASE WHEN a.outgoing_revenue <> 0 THEN round(((a.outgoing_revenue - a.outgoing_purchase) / a.outgoing_revenue) * 100, 2) ELSE 0 END,
      'clientItems', COALESCE(oc.items, '[]'::jsonb),
      'vendorItems', COALESCE(ov.items, '[]'::jsonb)
    ) AS outgoing
  FROM file_agg a
  LEFT JOIN incoming_clients ic USING (file_path, sheet_name)
  LEFT JOIN incoming_vendors iv USING (file_path, sheet_name)
  LEFT JOIN outgoing_clients oc USING (file_path, sheet_name)
  LEFT JOIN outgoing_vendors ov USING (file_path, sheet_name)
  LEFT JOIN target_periods tp USING (file_path, sheet_name)
)
UPDATE public.branch_performance_files f
SET summary = jsonb_set(
    jsonb_set(COALESCE(f.summary, '{}'::jsonb), '{carryoverCycle}', c.cycle, TRUE),
    '{carryover}', c.outgoing, TRUE
  ),
  synced_at = f.synced_at
FROM cycle_payload c
WHERE f.branch_id = 'asan'
  AND f.dataset_type = 'monthly'
  AND f.file_path = c.file_path
  AND f.sheet_name = c.sheet_name;
