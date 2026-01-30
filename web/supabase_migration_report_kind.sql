-- 일일 업무일지(daily) / 월간 실적보고(monthly) 구분용 컬럼
-- board_type = 'report' 일 때만 사용. null = 통합(기존), 'daily' | 'monthly'

alter table public.posts
  add column if not exists report_kind text
  check (report_kind is null or report_kind in ('daily', 'monthly'));

comment on column public.posts.report_kind is '업무보고 종류: null(통합), daily(일일 업무일지), monthly(월간 실적보고)';
