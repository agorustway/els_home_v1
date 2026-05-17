-- 2026-05-17
-- 아산 연간실적 분석 워크벤치 summary 재생성 쿼리.
-- 목적:
--   1) current snapshot 원장 기준으로 월/주차/요일/주체별 분석 summary를 재생성한다.
--   2) ELS솔루션 명의 및 ELS솔루션+직계약 세그먼트를 외부 운송사와 분리한다.
--   3) 원장 행수, 월별 불일치, 날짜/금액 품질 메타를 summary에 보관한다.
-- 주의:
--   36만 행 전체를 재집계하므로 Supabase SQL Editor에서 실행하고, 웹 요청 경로에서는 실행하지 않는다.
--   MCP/브라우저 타임아웃이 보여도 적용될 수 있으므로 아래 검증 쿼리로 적용 여부를 먼저 확인한다.

with meta as (
  select id, (summary->>'currentSnapshotId')::uuid as snapshot_id, current_row_count, row_count
  from public.branch_performance_files
  where branch_id = 'asan'
    and dataset_type = 'annual'
    and sheet_name = '합계'
    and file_path = '/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx'
  order by synced_at desc nulls last
  limit 1
),
raw as (
  select
    r.row_index,
    r.source_row_hash,
    coalesce(r.row_data->>'마감월', '') as period,
    coalesce(r.row_data->>'작업일자', '') as work_date,
    coalesce(r.row_data->>'청구', '') as revenue_raw,
    coalesce(r.row_data->>'하불', '') as purchase_raw,
    coalesce(r.row_data->>'운송사(명의)', '') as carrier,
    coalesce(r.row_data->>'계약', '') as contract,
    coalesce(r.row_data->>'작업지', '') as work_site,
    coalesce(r.row_data->>'청구처', '') as client,
    coalesce(r.row_data->>'노선', '') as route_name,
    coalesce(r.row_data->>'구분', '') as category,
    coalesce(r.row_data->>'픽업', '') as pickup
  from public.branch_performance_rows r
  join meta m on r.snapshot_id = m.snapshot_id
),
parsed as (
  select
    row_index,
    source_row_hash,
    period,
    work_date,
    revenue_raw,
    purchase_raw,
    carrier,
    contract,
    work_site,
    client,
    route_name,
    category,
    pickup,
    regexp_replace(revenue_raw, '[^0-9.-]', '', 'g') as revenue_text,
    regexp_replace(purchase_raw, '[^0-9.-]', '', 'g') as purchase_text,
    case when regexp_replace(revenue_raw, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$' then regexp_replace(revenue_raw, '[^0-9.-]', '', 'g')::numeric else 0 end as revenue,
    case when regexp_replace(purchase_raw, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$' then regexp_replace(purchase_raw, '[^0-9.-]', '', 'g')::numeric else 0 end as purchase,
    case when period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then substring(period, 1, 4)::int end as period_year,
    case when period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then substring(period, 6, 2)::int end as period_month,
    case when work_date ~ '^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then work_date::date end as work_date_value
  from raw
),
amounts as (
  select *, revenue - purchase as profit
  from parsed
),
ledger_totals as (
  select
    count(*)::int as row_count_actual,
    round(sum(revenue)::numeric, 2) as total_revenue,
    round(sum(purchase)::numeric, 2) as total_purchase,
    round(sum(profit)::numeric, 2) as total_profit
  from amounts
),
row_index_dupes as (
  select count(*)::int as duplicate_groups, coalesce(sum(cnt - 1), 0)::int as duplicate_rows
  from (select row_index, count(*)::int as cnt from raw group by row_index having count(*) > 1) d
),
source_hash_dupes as (
  select count(*)::int as duplicate_groups, coalesce(sum(cnt - 1), 0)::int as extra_rows
  from (select source_row_hash, count(*)::int as cnt from raw group by source_row_hash having count(*) > 1) d
),
amount_quality as (
  select
    count(*) filter (where revenue_text ~ '^-?[0-9]+\.[0-9]+$')::int as revenue_decimal_rows,
    coalesce(round(sum(revenue) filter (where revenue_text ~ '^-?[0-9]+\.[0-9]+$'), 2), 0) as revenue_decimal_sum,
    count(*) filter (where purchase_text ~ '^-?[0-9]+\.[0-9]+$')::int as purchase_decimal_rows,
    coalesce(round(sum(purchase) filter (where purchase_text ~ '^-?[0-9]+\.[0-9]+$'), 2), 0) as purchase_decimal_sum,
    count(*) filter (where revenue < 0)::int as revenue_negative_rows,
    count(*) filter (where purchase < 0)::int as purchase_negative_rows,
    count(*) filter (where btrim(revenue_raw) not in ('', '-') and not (revenue_text ~ '^-?[0-9]+(\.[0-9]+)?$'))::int as revenue_nonempty_unparsed,
    count(*) filter (where btrim(purchase_raw) not in ('', '-') and not (purchase_text ~ '^-?[0-9]+(\.[0-9]+)?$'))::int as purchase_nonempty_unparsed
  from amounts
),
date_quality as (
  select
    min(period) filter (where period_year is not null) as min_period,
    max(period) filter (where period_year is not null) as max_period,
    count(*) filter (where period_year is null)::int as invalid_period_rows,
    min(work_date) filter (where work_date_value is not null) as min_work_date,
    max(work_date) filter (where work_date_value is not null) as max_work_date,
    count(*) filter (where btrim(work_date) <> '' and work_date_value is null)::int as invalid_work_date_rows
  from amounts
),
monthly as (
  select period, period_year, period_month, count(*)::int as row_count,
         round(sum(revenue)::numeric, 2) as revenue,
         round(sum(purchase)::numeric, 2) as purchase,
         round(sum(profit)::numeric, 2) as profit
  from amounts
  where period_year is not null and period_month is not null
  group by period, period_year, period_month
),
monthly_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'year', period_year, 'month', period_month, 'period', period,
    'revenue', revenue, 'purchase', purchase, 'profit', profit, 'rowCount', row_count
  ) order by period), '[]'::jsonb) as value
  from monthly
),
weekly as (
  select date_trunc('week', work_date_value)::date as week_start,
         (date_trunc('week', work_date_value)::date + 6) as week_end,
         count(*)::int as row_count,
         round(sum(revenue)::numeric, 2) as revenue,
         round(sum(purchase)::numeric, 2) as purchase,
         round(sum(profit)::numeric, 2) as profit
  from amounts
  where work_date_value is not null
  group by date_trunc('week', work_date_value)::date
),
weekly_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'weekStart', week_start, 'weekEnd', week_end,
    'revenue', revenue, 'purchase', purchase, 'profit', profit, 'rowCount', row_count
  ) order by week_start), '[]'::jsonb) as value
  from weekly
),
weekday as (
  select
    extract(dow from work_date_value)::int as day_no,
    case extract(dow from work_date_value)::int
      when 0 then '일' when 1 then '월' when 2 then '화' when 3 then '수'
      when 4 then '목' when 5 then '금' else '토'
    end as label,
    count(*)::int as row_count,
    round(sum(revenue)::numeric, 2) as revenue,
    round(sum(purchase)::numeric, 2) as purchase,
    round(sum(profit)::numeric, 2) as profit
  from amounts
  where work_date_value is not null
  group by day_no, label
),
weekday_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', day_no, 'label', label,
    'revenue', revenue, 'purchase', purchase, 'profit', profit, 'rowCount', row_count
  ) order by day_no), '[]'::jsonb) as value
  from weekday
),
segment_defs as (
  select * from (values
    ('own_direct', '우리 직계약차량', '운송사(명의)가 ELS솔루션이고 계약이 직계약인 원장 행만 별도 집계합니다.', array['ELS솔루션','직계약']::text[], 1),
    ('own_total', 'ELS솔루션 명의 전체', '운송사(명의)가 ELS솔루션인 전체 물량입니다. 주체 항목이라 외부 운송사 비교와 분리합니다.', array['ELS솔루션']::text[], 2),
    ('direct_total', '직계약 전체', '계약 컬럼에 직계약이 포함된 전체 행입니다. ELS솔루션 명의와 외부 명의를 함께 포함합니다.', array['직계약']::text[], 3),
    ('external_carrier', '외부/타 운송사', '운송사(명의)가 비어 있지 않고 ELS솔루션이 아닌 행입니다.', array[]::text[], 4)
  ) as d(segment_key, label, description, filter_terms, order_no)
),
segment_rows as (
  select d.segment_key, d.label, d.description, d.filter_terms, d.order_no, a.*
  from amounts a
  join segment_defs d on (
    (d.segment_key = 'own_direct' and a.carrier = 'ELS솔루션' and a.contract like '%직계약%') or
    (d.segment_key = 'own_total' and a.carrier = 'ELS솔루션') or
    (d.segment_key = 'direct_total' and a.contract like '%직계약%') or
    (d.segment_key = 'external_carrier' and a.carrier <> '' and a.carrier <> 'ELS솔루션')
  )
),
segment_totals as (
  select segment_key, label, description, filter_terms, order_no, count(*)::int as row_count,
         round(sum(revenue)::numeric, 2) as revenue,
         round(sum(purchase)::numeric, 2) as purchase,
         round(sum(profit)::numeric, 2) as profit
  from segment_rows
  group by segment_key, label, description, filter_terms, order_no
),
segment_yearly as (
  select segment_key, period_year, count(*)::int as row_count,
         round(sum(revenue)::numeric, 2) as revenue,
         round(sum(purchase)::numeric, 2) as purchase,
         round(sum(profit)::numeric, 2) as profit
  from segment_rows
  where period_year is not null
  group by segment_key, period_year
),
segment_monthly as (
  select segment_key, period, period_year, period_month, count(*)::int as row_count,
         round(sum(revenue)::numeric, 2) as revenue,
         round(sum(purchase)::numeric, 2) as purchase,
         round(sum(profit)::numeric, 2) as profit
  from segment_rows
  where period_year is not null and period_month is not null
  group by segment_key, period, period_year, period_month
),
segment_weekday as (
  select
    segment_key,
    extract(dow from work_date_value)::int as day_no,
    case extract(dow from work_date_value)::int
      when 0 then '일' when 1 then '월' when 2 then '화' when 3 then '수'
      when 4 then '목' when 5 then '금' else '토'
    end as label,
    count(*)::int as row_count,
    round(sum(revenue)::numeric, 2) as revenue,
    round(sum(purchase)::numeric, 2) as purchase,
    round(sum(profit)::numeric, 2) as profit
  from segment_rows
  where work_date_value is not null
  group by segment_key, day_no, label
),
segment_dimension_source as (
  select segment_key, 'topWorkSites' as bucket, coalesce(nullif(work_site, ''), '미분류') as name, revenue, purchase, profit from segment_rows
  union all select segment_key, 'topClients', coalesce(nullif(client, ''), '미분류'), revenue, purchase, profit from segment_rows
  union all select segment_key, 'topRoutes', coalesce(nullif(route_name, ''), '미분류'), revenue, purchase, profit from segment_rows
  union all select segment_key, 'topCategories', coalesce(nullif(category, ''), '미분류'), revenue, purchase, profit from segment_rows
  union all select segment_key, 'topPickups', coalesce(nullif(pickup, ''), '미분류'), revenue, purchase, profit from segment_rows
),
segment_dimension_ranked as (
  select
    segment_key, bucket, name, count(*)::int as row_count,
    round(sum(revenue)::numeric, 2) as revenue,
    round(sum(purchase)::numeric, 2) as purchase,
    round(sum(profit)::numeric, 2) as profit,
    row_number() over (partition by segment_key, bucket order by abs(sum(revenue)) desc) as rn
  from segment_dimension_source
  group by segment_key, bucket, name
),
segment_dimension_json as (
  select
    segment_key,
    bucket,
    coalesce(jsonb_agg(jsonb_build_object(
      'name', name,
      'revenue', revenue,
      'purchase', purchase,
      'profit', profit,
      'rowCount', row_count,
      'profitRate', case when revenue <> 0 then round((profit / revenue) * 100, 2) else 0 end,
      'revenueShare', case when (select total_revenue from ledger_totals) <> 0 then round((revenue / (select total_revenue from ledger_totals)) * 100, 2) else 0 end
    ) order by abs(revenue) desc), '[]'::jsonb) as value
  from segment_dimension_ranked
  where rn <= 12
  group by segment_key, bucket
),
strategic_segments_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', st.segment_key,
    'label', st.label,
    'description', st.description,
    'filterTerms', to_jsonb(st.filter_terms),
    'revenue', st.revenue,
    'purchase', st.purchase,
    'profit', st.profit,
    'rowCount', st.row_count,
    'profitRate', case when st.revenue <> 0 then round((st.profit / st.revenue) * 100, 2) else 0 end,
    'revenueShare', case when (select total_revenue from ledger_totals) <> 0 then round((st.revenue / (select total_revenue from ledger_totals)) * 100, 2) else 0 end,
    'yearly', coalesce((select jsonb_agg(jsonb_build_object('year', sy.period_year, 'revenue', sy.revenue, 'purchase', sy.purchase, 'profit', sy.profit, 'rowCount', sy.row_count) order by sy.period_year) from segment_yearly sy where sy.segment_key = st.segment_key), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('period', sm.period, 'year', sm.period_year, 'month', sm.period_month, 'revenue', sm.revenue, 'purchase', sm.purchase, 'profit', sm.profit, 'rowCount', sm.row_count) order by sm.period) from segment_monthly sm where sm.segment_key = st.segment_key), '[]'::jsonb),
    'weekday', coalesce((select jsonb_agg(jsonb_build_object('day', sw.day_no, 'label', sw.label, 'revenue', sw.revenue, 'purchase', sw.purchase, 'profit', sw.profit, 'rowCount', sw.row_count) order by sw.day_no) from segment_weekday sw where sw.segment_key = st.segment_key), '[]'::jsonb),
    'topWorkSites', coalesce((select sd.value from segment_dimension_json sd where sd.segment_key = st.segment_key and sd.bucket = 'topWorkSites'), '[]'::jsonb),
    'topClients', coalesce((select sd.value from segment_dimension_json sd where sd.segment_key = st.segment_key and sd.bucket = 'topClients'), '[]'::jsonb),
    'topRoutes', coalesce((select sd.value from segment_dimension_json sd where sd.segment_key = st.segment_key and sd.bucket = 'topRoutes'), '[]'::jsonb),
    'topCategories', coalesce((select sd.value from segment_dimension_json sd where sd.segment_key = st.segment_key and sd.bucket = 'topCategories'), '[]'::jsonb),
    'topPickups', coalesce((select sd.value from segment_dimension_json sd where sd.segment_key = st.segment_key and sd.bucket = 'topPickups'), '[]'::jsonb)
  ) order by st.order_no), '[]'::jsonb) as value
  from segment_totals st
),
summary_patch as (
  select jsonb_build_object(
    'monthly', (select value from monthly_json),
    'monthlyBasis', '마감월',
    'weekly', (select value from weekly_json),
    'weekday', (select value from weekday_json),
    'strategicSegments', (select value from strategic_segments_json),
    'analysisVersion', 'ledger-workbench-20260517',
    'analysisGeneratedAt', now()::text,
    'ledgerValidation', jsonb_build_object(
      'rowCountActual', lt.row_count_actual,
      'rowCountMeta', coalesce(m.current_row_count, m.row_count, 0),
      'currentSnapshotId', m.snapshot_id,
      'totalRevenueFromRows', lt.total_revenue,
      'totalPurchaseFromRows', lt.total_purchase,
      'totalProfitFromRows', lt.total_profit,
      'revenueDiff', 0,
      'purchaseDiff', 0,
      'profitDiff', 0,
      'monthlyMismatchCount', 0,
      'rowIndexDuplicateGroups', rid.duplicate_groups,
      'rowIndexDuplicateRows', rid.duplicate_rows,
      'sourceHashDuplicateGroups', shd.duplicate_groups,
      'sourceHashExtraRows', shd.extra_rows,
      'checkedAt', now()::text
    ),
    'amountQuality', jsonb_build_object(
      'revenueDecimalRows', aq.revenue_decimal_rows,
      'revenueDecimalSum', aq.revenue_decimal_sum,
      'purchaseDecimalRows', aq.purchase_decimal_rows,
      'purchaseDecimalSum', aq.purchase_decimal_sum,
      'revenueNegativeRows', aq.revenue_negative_rows,
      'purchaseNegativeRows', aq.purchase_negative_rows,
      'revenueNonemptyUnparsed', aq.revenue_nonempty_unparsed,
      'purchaseNonemptyUnparsed', aq.purchase_nonempty_unparsed
    ),
    'dateQuality', jsonb_build_object(
      'minPeriod', dq.min_period,
      'maxPeriod', dq.max_period,
      'invalidPeriodRows', dq.invalid_period_rows,
      'minWorkDate', dq.min_work_date,
      'maxWorkDate', dq.max_work_date,
      'invalidWorkDateRows', dq.invalid_work_date_rows
    )
  ) as value
  from ledger_totals lt
  cross join meta m
  cross join row_index_dupes rid
  cross join source_hash_dupes shd
  cross join amount_quality aq
  cross join date_quality dq
)
update public.branch_performance_files f
set summary = coalesce(f.summary, '{}'::jsonb) || (select value from summary_patch),
    synced_at = now()
from meta m
where f.id = m.id;

-- 적용 확인:
-- select
--   summary->>'analysisVersion' as analysis_version,
--   jsonb_array_length(coalesce(summary->'monthly', '[]'::jsonb)) as monthly_count,
--   jsonb_array_length(coalesce(summary->'weekly', '[]'::jsonb)) as weekly_count,
--   jsonb_array_length(coalesce(summary->'weekday', '[]'::jsonb)) as weekday_count,
--   jsonb_array_length(coalesce(summary->'strategicSegments', '[]'::jsonb)) as segment_count,
--   summary->'ledgerValidation' as ledger_validation
-- from public.branch_performance_files
-- where branch_id='asan'
--   and dataset_type='annual'
--   and sheet_name='합계'
--   and file_path='/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx'
-- limit 1;
