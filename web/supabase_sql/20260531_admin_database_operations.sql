-- 관리자 데이터 운영 화면용 DB 용량 진단 RPC
-- 적용일: 2026-05-31

create or replace function public.admin_database_overview()
returns table (
    database_name text,
    database_bytes bigint,
    database_size text,
    checked_at timestamptz,
    postgres_version text
)
language sql
stable
set search_path = pg_catalog, public
as $$
    select
        current_database()::text as database_name,
        pg_database_size(current_database())::bigint as database_bytes,
        pg_size_pretty(pg_database_size(current_database()))::text as database_size,
        now() as checked_at,
        version()::text as postgres_version;
$$;

create or replace function public.admin_database_table_sizes()
returns table (
    schema_name text,
    table_name text,
    category text,
    row_estimate bigint,
    total_bytes bigint,
    table_bytes bigint,
    index_bytes bigint,
    toast_bytes bigint,
    total_size text,
    table_size text,
    index_size text,
    toast_size text,
    last_vacuum timestamptz,
    last_autovacuum timestamptz,
    last_analyze timestamptz,
    last_autoanalyze timestamptz,
    optimization_status text,
    recommendation text
)
language sql
stable
set search_path = pg_catalog, public
as $$
    with relation_sizes as (
        select
            n.nspname::text as schema_name,
            c.relname::text as table_name,
            coalesce(c.reltuples, 0)::bigint as row_estimate,
            pg_total_relation_size(c.oid)::bigint as total_bytes,
            pg_relation_size(c.oid)::bigint as table_bytes,
            pg_indexes_size(c.oid)::bigint as index_bytes,
            greatest(
                pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid),
                0
            )::bigint as toast_bytes,
            s.last_vacuum,
            s.last_autovacuum,
            s.last_analyze,
            s.last_autoanalyze
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_stat_user_tables s on s.relid = c.oid
        where c.relkind in ('r', 'p')
          and n.nspname = 'public'
    )
    select
        rs.schema_name,
        rs.table_name,
        case
            when rs.table_name like 'branch_performance%' then '실적/배차 원장'
            when rs.table_name like 'branch_dispatch%' then '배차 상세/변동'
            when rs.table_name like 'vehicle_%' or rs.table_name like 'driver_%' then '차량/GPS'
            when rs.table_name in ('document_chunks', 'nas_file_index', 'ai_chat_memory') then 'AI/RAG'
            when rs.table_name like '%contact%' or rs.table_name like 'work_sites%' then '연락처/기준정보'
            when rs.table_name like '%log%' or rs.table_name like '%history%' then '로그/이력'
            else '기타'
        end as category,
        rs.row_estimate,
        rs.total_bytes,
        rs.table_bytes,
        rs.index_bytes,
        rs.toast_bytes,
        pg_size_pretty(rs.total_bytes)::text as total_size,
        pg_size_pretty(rs.table_bytes)::text as table_size,
        pg_size_pretty(rs.index_bytes)::text as index_size,
        pg_size_pretty(rs.toast_bytes)::text as toast_size,
        rs.last_vacuum,
        rs.last_autovacuum,
        rs.last_analyze,
        rs.last_autoanalyze,
        case
            when rs.table_name = 'branch_performance_rows' and rs.total_bytes > 512 * 1024 * 1024 then 'critical'
            when rs.table_name = 'document_chunks' and rs.total_bytes > 96 * 1024 * 1024 then 'watch'
            when rs.total_bytes > 1024 * 1024 * 1024 then 'critical'
            when rs.total_bytes > 256 * 1024 * 1024 then 'watch'
            else 'ok'
        end as optimization_status,
        case
            when rs.table_name = 'branch_performance_rows' then '월간은 1년 3개월 hot 보관 후 리셋, 연간은 fix Excel source 기준 변경분만 upsert한다.'
            when rs.table_name = 'document_chunks' then '원본 삭제/교체분 stale chunk 제거와 vector index 상태를 주기 점검한다.'
            when rs.table_name = 'user_activity_logs' then '180일 초과분은 월별 JSONL gzip 보관 후 삭제한다.'
            when rs.table_name like 'vehicle_%' or rs.table_name like 'driver_%' then 'GPS raw는 hot 기간 이후 운행 요약과 일별 gzip archive로 분리한다.'
            when rs.table_name like 'branch_dispatch%' then '배차 상세/변동은 1년 1개월 hot 이후 manifest 검증 archive로 이동한다.'
            else '현 상태 유지. autovacuum/analyze 통계만 주기 확인한다.'
        end as recommendation
    from relation_sizes rs
    order by rs.total_bytes desc;
$$;

revoke execute on function public.admin_database_overview() from public, anon, authenticated;
revoke execute on function public.admin_database_table_sizes() from public, anon, authenticated;

grant execute on function public.admin_database_overview() to service_role;
grant execute on function public.admin_database_table_sizes() to service_role;
