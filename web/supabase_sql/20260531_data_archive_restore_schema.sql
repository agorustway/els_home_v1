-- 데이터 archive/restore 준비 스키마
-- 적용일: 2026-05-31

create table if not exists public.data_archive_manifest (
    id uuid primary key default gen_random_uuid(),
    archive_key text,
    schema_name text not null default 'public',
    table_name text not null,
    category text,
    branch_id text,
    period_start date not null,
    period_end date not null,
    row_count bigint not null default 0 check (row_count >= 0),
    file_size_bytes bigint not null default 0 check (file_size_bytes >= 0),
    checksum_sha256 text,
    storage_provider text not null default 'nas',
    storage_path text not null,
    compression text not null default 'gzip',
    file_format text not null default 'jsonl',
    status text not null default 'planned'
        check (status in ('planned', 'writing', 'verified', 'failed', 'deleted_from_hot', 'restored', 'expired')),
    archived_by text,
    archived_at timestamptz,
    verified_at timestamptz,
    source_query jsonb not null default '{}'::jsonb,
    sample_keys jsonb not null default '[]'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint data_archive_manifest_period_check check (period_end >= period_start)
);

create unique index if not exists data_archive_manifest_archive_key_uidx
    on public.data_archive_manifest (archive_key)
    where archive_key is not null;

create index if not exists data_archive_manifest_table_period_idx
    on public.data_archive_manifest (schema_name, table_name, period_start, period_end);

create index if not exists data_archive_manifest_status_idx
    on public.data_archive_manifest (status, archived_at desc);

create index if not exists data_archive_manifest_branch_idx
    on public.data_archive_manifest (branch_id, period_start desc)
    where branch_id is not null;

create index if not exists data_archive_manifest_metadata_gin_idx
    on public.data_archive_manifest using gin (metadata);

create table if not exists public.data_restore_jobs (
    id uuid primary key default gen_random_uuid(),
    manifest_id uuid references public.data_archive_manifest(id) on delete set null,
    schema_name text not null default 'public',
    table_name text not null,
    restore_mode text not null default 'staging'
        check (restore_mode in ('staging', 'temporary_view', 'promote')),
    status text not null default 'requested'
        check (status in ('requested', 'validating', 'restoring', 'ready', 'failed', 'expired', 'promoted', 'cancelled')),
    requested_by text,
    requested_reason text,
    period_start date,
    period_end date,
    checksum_verified boolean not null default false,
    staging_table text,
    restored_row_count bigint not null default 0 check (restored_row_count >= 0),
    requested_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    expires_at timestamptz not null default (now() + interval '30 days'),
    options jsonb not null default '{}'::jsonb,
    result jsonb not null default '{}'::jsonb,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint data_restore_jobs_period_check check (
        period_start is null or period_end is null or period_end >= period_start
    )
);

create index if not exists data_restore_jobs_manifest_idx
    on public.data_restore_jobs (manifest_id);

create index if not exists data_restore_jobs_status_idx
    on public.data_restore_jobs (status, requested_at desc);

create index if not exists data_restore_jobs_expiry_idx
    on public.data_restore_jobs (expires_at)
    where status in ('ready', 'expired');

create table if not exists public.data_restore_staging_rows (
    id bigserial primary key,
    restore_job_id uuid not null references public.data_restore_jobs(id) on delete cascade,
    source_schema text not null default 'public',
    source_table text not null,
    source_pk jsonb not null default '{}'::jsonb,
    row_hash text,
    row_data jsonb not null,
    restored_at timestamptz not null default now()
);

create index if not exists data_restore_staging_rows_job_idx
    on public.data_restore_staging_rows (restore_job_id);

create index if not exists data_restore_staging_rows_source_idx
    on public.data_restore_staging_rows (source_schema, source_table);

create index if not exists data_restore_staging_rows_data_gin_idx
    on public.data_restore_staging_rows using gin (row_data);

create table if not exists public.data_operation_events (
    id uuid primary key default gen_random_uuid(),
    event_type text not null,
    target_schema text not null default 'public',
    target_table text,
    actor_email text,
    status text not null default 'info',
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists data_operation_events_created_idx
    on public.data_operation_events (created_at desc);

create index if not exists data_operation_events_target_idx
    on public.data_operation_events (target_schema, target_table, created_at desc);

create or replace function public.touch_data_operation_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists data_archive_manifest_touch_updated_at on public.data_archive_manifest;
create trigger data_archive_manifest_touch_updated_at
before update on public.data_archive_manifest
for each row execute function public.touch_data_operation_updated_at();

drop trigger if exists data_restore_jobs_touch_updated_at on public.data_restore_jobs;
create trigger data_restore_jobs_touch_updated_at
before update on public.data_restore_jobs
for each row execute function public.touch_data_operation_updated_at();

alter table public.data_archive_manifest enable row level security;
alter table public.data_restore_jobs enable row level security;
alter table public.data_restore_staging_rows enable row level security;
alter table public.data_operation_events enable row level security;

revoke all on table public.data_archive_manifest from anon, authenticated;
revoke all on table public.data_restore_jobs from anon, authenticated;
revoke all on table public.data_restore_staging_rows from anon, authenticated;
revoke all on table public.data_operation_events from anon, authenticated;
revoke execute on function public.touch_data_operation_updated_at() from public, anon, authenticated;

grant all on table public.data_archive_manifest to service_role;
grant all on table public.data_restore_jobs to service_role;
grant all on table public.data_restore_staging_rows to service_role;
grant all on table public.data_operation_events to service_role;
grant usage, select on sequence public.data_restore_staging_rows_id_seq to service_role;
grant execute on function public.touch_data_operation_updated_at() to service_role;

comment on table public.data_archive_manifest is 'NAS archive 파일 단위 manifest. 일반 검색과 분리된 장기 보존 catalog.';
comment on table public.data_restore_jobs is 'archive 복원 요청과 staging/promote 상태 관리.';
comment on table public.data_restore_staging_rows is '복원 데이터를 운영 테이블에 바로 섞지 않기 위한 row 단위 staging.';
comment on table public.data_operation_events is '데이터 운영 관리 화면과 archive/restore 작업 감사 이벤트.';
