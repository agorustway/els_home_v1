-- 2026-05-17
-- 아산 연간실적 월별 summary 복구 쿼리.
-- 목적: 기존 월 파서가 10/11/12월을 1월로 집계한 summary.monthly를
--       current snapshot의 원본 row_data->>'마감월' 기준으로 재생성한다.
-- 참고: 실행 중 statement timeout 메시지가 보일 수 있으나, 적용 여부는 아래 검증 쿼리로 확인한다.

with meta as (
  select id, (summary->>'currentSnapshotId')::uuid as snapshot_id
  from public.branch_performance_files
  where branch_id = 'asan'
    and dataset_type = 'annual'
    and sheet_name = '합계'
  limit 1
),
parsed as (
  select
    r.row_data->>'마감월' as period,
    regexp_replace(coalesce(r.row_data->>'청구', ''), '[^0-9.-]', '', 'g') as revenue_text,
    regexp_replace(coalesce(r.row_data->>'하불', ''), '[^0-9.-]', '', 'g') as purchase_text
  from public.branch_performance_rows r
  join meta m on r.snapshot_id = m.snapshot_id
  where r.row_data->>'마감월' ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
),
amounts as (
  select
    period,
    case when revenue_text ~ '^-?[0-9]+(\.[0-9]+)?$' then revenue_text::numeric else 0 end as revenue,
    case when purchase_text ~ '^-?[0-9]+(\.[0-9]+)?$' then purchase_text::numeric else 0 end as purchase
  from parsed
),
monthly as (
  select
    period,
    substring(period, 1, 4)::int as year,
    substring(period, 6, 2)::int as month,
    count(*) as row_count,
    round(sum(revenue)::numeric, 2) as revenue,
    round(sum(purchase)::numeric, 2) as purchase,
    round(sum(revenue - purchase)::numeric, 2) as profit
  from amounts
  group by period
),
monthly_json as (
  select jsonb_agg(
    jsonb_build_object(
      'year', year,
      'month', month,
      'period', period,
      'revenue', revenue,
      'purchase', purchase,
      'profit', profit,
      'rowCount', row_count
    )
    order by period
  ) as value
  from monthly
)
update public.branch_performance_files f
set summary = jsonb_set(
    jsonb_set(
      jsonb_set(f.summary, '{monthly}', coalesce((select value from monthly_json), '[]'::jsonb), true),
      '{monthlyBasis}', to_jsonb('마감월'::text), true
    ),
    '{monthlyRebuiltAt}', to_jsonb(now()::text), true
  ),
  synced_at = now()
from meta m
where f.id = m.id;

-- 검증:
-- select
--   summary->>'monthlyBasis' as monthly_basis,
--   summary->>'monthlyRebuiltAt' as monthly_rebuilt_at,
--   jsonb_path_query_array(
--     summary->'monthly',
--     '$[*] ? (@.period == "2022-01" || @.period == "2024-01" || @.period == "2025-01")'
--   ) as selected_months
-- from public.branch_performance_files
-- where branch_id = 'asan'
--   and dataset_type = 'annual'
--   and sheet_name = '합계'
-- limit 1;
