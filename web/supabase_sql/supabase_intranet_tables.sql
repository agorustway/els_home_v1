-- 인트라넷 업무자료실·서식자료실·사내연락망·외부연락처·작업지확인 테이블
-- Supabase 대시보드 SQL Editor 또는 마이그레이션에서 실행

-- 1. 업무자료실 (게시판형)
create table if not exists public.work_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text default '',
  author_id uuid references auth.users(id) on delete set null,
  author_email text,
  category text default '일반',
  attachments jsonb default '[]',
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

comment on table public.work_docs is '업무자료실 (게시판형)';
comment on column public.work_docs.attachments is '[{ "name": "파일명", "path": "저장경로", "type": "s3" }]';

alter table public.work_docs enable row level security;

create policy "work_docs_select"
  on public.work_docs for select to authenticated using (true);
create policy "work_docs_insert"
  on public.work_docs for insert to authenticated with check (true);
create policy "work_docs_update"
  on public.work_docs for update to authenticated using (true) with check (true);
create policy "work_docs_delete"
  on public.work_docs for delete to authenticated using (true);


-- 2. 서식자료실
create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  file_name text,
  file_path text,
  file_url text,
  category text default '일반',
  author_id uuid references auth.users(id) on delete set null,
  author_email text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

comment on table public.form_templates is '서식자료실';

alter table public.form_templates enable row level security;

create policy "form_templates_select"
  on public.form_templates for select to authenticated using (true);
create policy "form_templates_insert"
  on public.form_templates for insert to authenticated with check (true);
create policy "form_templates_update"
  on public.form_templates for update to authenticated using (true) with check (true);
create policy "form_templates_delete"
  on public.form_templates for delete to authenticated using (true);


-- 3. 사내연락망 (사진 포함)
create table if not exists public.internal_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text default '',
  position text default '',
  phone text default '',
  email text default '',
  photo_url text,
  memo text default '',
  sort_order int default 0,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

comment on table public.internal_contacts is '사내연락망';

alter table public.internal_contacts enable row level security;

create policy "internal_contacts_select"
  on public.internal_contacts for select to authenticated using (true);
create policy "internal_contacts_insert"
  on public.internal_contacts for insert to authenticated with check (true);
create policy "internal_contacts_update"
  on public.internal_contacts for update to authenticated using (true) with check (true);
create policy "internal_contacts_delete"
  on public.internal_contacts for delete to authenticated using (true);


-- 4. 외부연락처 (고객사·협력사)
create table if not exists public.external_contacts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_type text default '고객사',
  address text default '',
  phone text default '',
  email text default '',
  contact_person text default '',
  memo text default '',
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

comment on table public.external_contacts is '외부연락처 (고객사·협력사 등)';
comment on column public.external_contacts.contact_type is '고객사, 협력사 등';

alter table public.external_contacts enable row level security;

create policy "external_contacts_select"
  on public.external_contacts for select to authenticated using (true);
create policy "external_contacts_insert"
  on public.external_contacts for insert to authenticated with check (true);
create policy "external_contacts_update"
  on public.external_contacts for update to authenticated using (true) with check (true);
create policy "external_contacts_delete"
  on public.external_contacts for delete to authenticated using (true);


-- 5. 작업지확인 (작업지 + 담당자 다수 + 첨부)
create table if not exists public.work_sites (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  contact text default '',
  work_method text default '',
  notes text default '',
  attachments jsonb default '[]',
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

comment on table public.work_sites is '작업지확인 (주소·담당자·연락처·작업방식·참고사항·첨부)';
comment on column public.work_sites.attachments is '[{ "name": "파일명", "path": "저장경로" }]';

create table if not exists public.work_site_managers (
  id uuid primary key default gen_random_uuid(),
  work_site_id uuid not null references public.work_sites(id) on delete cascade,
  name text not null,
  phone text default '',
  role text default '',
  sort_order int default 0,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

comment on table public.work_site_managers is '작업지 담당자 (다수)';

alter table public.work_sites enable row level security;
alter table public.work_site_managers enable row level security;

create policy "work_sites_select"
  on public.work_sites for select to authenticated using (true);
create policy "work_sites_insert"
  on public.work_sites for insert to authenticated with check (true);
create policy "work_sites_update"
  on public.work_sites for update to authenticated using (true) with check (true);
create policy "work_sites_delete"
  on public.work_sites for delete to authenticated using (true);

create policy "work_site_managers_select"
  on public.work_site_managers for select to authenticated using (true);
create policy "work_site_managers_insert"
  on public.work_site_managers for insert to authenticated with check (true);
create policy "work_site_managers_update"
  on public.work_site_managers for update to authenticated using (true) with check (true);
create policy "work_site_managers_delete"
  on public.work_site_managers for delete to authenticated using (true);


-- updated_at 자동 갱신 (선택). PostgreSQL: DROP TRIGGER IF EXISTS ... ON table;
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists work_docs_updated_at on public.work_docs;
create trigger work_docs_updated_at before update on public.work_docs
  for each row execute procedure public.set_updated_at();

drop trigger if exists form_templates_updated_at on public.form_templates;
create trigger form_templates_updated_at before update on public.form_templates
  for each row execute procedure public.set_updated_at();

drop trigger if exists internal_contacts_updated_at on public.internal_contacts;
create trigger internal_contacts_updated_at before update on public.internal_contacts
  for each row execute procedure public.set_updated_at();

drop trigger if exists external_contacts_updated_at on public.external_contacts;
create trigger external_contacts_updated_at before update on public.external_contacts
  for each row execute procedure public.set_updated_at();

drop trigger if exists work_sites_updated_at on public.work_sites;
create trigger work_sites_updated_at before update on public.work_sites
  for each row execute procedure public.set_updated_at();
