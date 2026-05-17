-- 2026-05-18
-- 아산 연간실적 summary에 차량별 손익(vehiclePerformance)과 조사범위 UI용 최신 분석 버전을 반영한다.
-- DDL 없음. current snapshot 원장만 읽어 branch_performance_files.summary JSON을 갱신한다.

with meta as (
  select id, (summary->>'currentSnapshotId')::uuid as snapshot_id, summary
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
    coalesce(r.row_data->>'마감월', '') as period,
    coalesce(r.row_data->>'청구', '') as revenue_raw,
    coalesce(r.row_data->>'하불', '') as purchase_raw,
    coalesce(r.row_data->>'영업넘버', '') as vehicle_no,
    coalesce(r.row_data->>'기사', '') as driver
  from public.branch_performance_rows r
  join meta m on r.snapshot_id = m.snapshot_id
),
amounts as (
  select
    period,
    vehicle_no,
    driver,
    case when regexp_replace(revenue_raw, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$' then regexp_replace(revenue_raw, '[^0-9.-]', '', 'g')::numeric else 0 end as revenue,
    case when regexp_replace(purchase_raw, '[^0-9.-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$' then regexp_replace(purchase_raw, '[^0-9.-]', '', 'g')::numeric else 0 end as purchase,
    case when period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then substring(period, 1, 4)::int end as period_year,
    case when period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then substring(period, 6, 2)::int end as period_month
  from raw
),
profit_rows as (
  select *, revenue - purchase as profit
  from amounts
),
ledger as (
  select round(sum(revenue)::numeric, 2) as total_revenue
  from profit_rows
),
vehicle_totals as (
  select
    btrim(vehicle_no) as vehicle_no,
    string_agg(distinct nullif(driver, ''), ', ') filter (where nullif(driver, '') is not null) as drivers,
    count(*)::int as row_count,
    round(sum(revenue)::numeric, 2) as revenue,
    round(sum(purchase)::numeric, 2) as purchase,
    round(sum(profit)::numeric, 2) as profit,
    row_number() over (order by abs(sum(revenue)) desc) as rn
  from profit_rows
  where btrim(vehicle_no) <> ''
    and btrim(vehicle_no) <> '-'
  group by btrim(vehicle_no)
),
vehicle_monthly as (
  select
    btrim(vehicle_no) as vehicle_no,
    period,
    period_year,
    period_month,
    count(*)::int as row_count,
    round(sum(revenue)::numeric, 2) as revenue,
    round(sum(purchase)::numeric, 2) as purchase,
    round(sum(profit)::numeric, 2) as profit
  from profit_rows
  where btrim(vehicle_no) <> ''
    and btrim(vehicle_no) <> '-'
    and period_year is not null
    and period_month is not null
  group by btrim(vehicle_no), period, period_year, period_month
),
vehicle_quality as (
  select jsonb_build_object(
    'missingVehicle', jsonb_build_object(
      'rowCount', count(*)::int,
      'blankRows', count(*) filter (where btrim(vehicle_no) = '')::int,
      'dashRows', count(*) filter (where btrim(vehicle_no) = '-')::int,
      'revenue', round(sum(revenue)::numeric, 2),
      'purchase', round(sum(purchase)::numeric, 2),
      'profit', round(sum(profit)::numeric, 2)
    )
  ) as value
  from profit_rows
  where btrim(vehicle_no) = ''
     or btrim(vehicle_no) = '-'
),
vehicle_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', vt.vehicle_no,
    'vehicleNo', vt.vehicle_no,
    'drivers', coalesce(vt.drivers, ''),
    'revenue', vt.revenue,
    'purchase', vt.purchase,
    'profit', vt.profit,
    'rowCount', vt.row_count,
    'profitRate', case when vt.revenue <> 0 then round((vt.profit / vt.revenue) * 100, 2) else 0 end,
    'revenueShare', case when (select total_revenue from ledger) <> 0 then round((vt.revenue / (select total_revenue from ledger)) * 100, 2) else 0 end,
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'year', vm.period_year,
        'month', vm.period_month,
        'period', vm.period,
        'revenue', vm.revenue,
        'purchase', vm.purchase,
        'profit', vm.profit,
        'rowCount', vm.row_count
      ) order by vm.period)
      from vehicle_monthly vm
      where vm.vehicle_no = vt.vehicle_no
    ), '[]'::jsonb)
  ) order by abs(vt.revenue) desc), '[]'::jsonb) as value
  from vehicle_totals vt
  where vt.rn <= 80
),
segments_fixed as (
  select coalesce(jsonb_agg(
    case
      when elem->>'key' = 'own_total'
        then elem || jsonb_build_object('description', '운송사(명의)가 ELS솔루션인 전체 물량입니다. 외부 운송사 비교와 분리합니다.')
      else elem
    end
    order by ord
  ), '[]'::jsonb) as value
  from meta m,
       jsonb_array_elements(coalesce(m.summary->'strategicSegments', '[]'::jsonb)) with ordinality as s(elem, ord)
)
update public.branch_performance_files f
set summary = coalesce(f.summary, '{}'::jsonb)
  || jsonb_build_object(
    'vehiclePerformance', (select value from vehicle_json),
    'vehicleDataQuality', (select value from vehicle_quality),
    'strategicSegments', (select value from segments_fixed),
    'analysisVersion', 'ledger-workbench-20260518-scope-vehicle-quality',
    'analysisGeneratedAt', now()::text
  ),
  synced_at = now()
from meta m
where f.id = m.id;

-- 적용 확인:
-- select
--   summary->>'analysisVersion' as analysis_version,
--   jsonb_array_length(coalesce(summary->'vehiclePerformance', '[]'::jsonb)) as vehicle_count,
--   (summary->'vehiclePerformance'->0) as top_vehicle
-- from public.branch_performance_files
-- where branch_id='asan'
--   and dataset_type='annual'
--   and sheet_name='합계'
--   and file_path='/아산지점/B_총무/C_마감/합계연간실적/합계연간실적.xlsx';
