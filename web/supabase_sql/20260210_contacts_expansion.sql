-- 1. 협력사정보 (Partner Contacts)
create table if not exists public.partner_contacts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  ceo_name text default '',
  phone text default '',
  address text default '',
  manager_name text default '',
  manager_phone text default '',
  memo text default '',
  attachments jsonb default '[]', -- [{ "name": "파일명", "url": "전체경로", "category": "계약서|보험|회사소개서|기타" }]
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

comment on table public.partner_contacts is '협력사정보 (회사·대표·담당자·첨부파일)';

alter table public.partner_contacts enable row level security;

create policy "partner_contacts_select" on public.partner_contacts for select to authenticated using (true);
create policy "partner_contacts_insert" on public.partner_contacts for insert to authenticated with check (true);
create policy "partner_contacts_update" on public.partner_contacts for update to authenticated using (true) with check (true);
create policy "partner_contacts_delete" on public.partner_contacts for delete to authenticated using (true);

-- 2. 운전원정보 (Driver Info)
create table if not exists public.driver_contacts (
  id uuid primary key default gen_random_uuid(),
  photo_url text, -- 프로필 사진
  business_number text default '', -- 영업넘버
  name text not null,
  phone text default '',
  driver_id text default '', -- 아이디 (영문4+숫자4)
  vehicle_type text default '', -- 차종
  chassis_type text default '', -- 샤시종류
  additional_docs jsonb default '[]', -- [{ "name": "파일명", "url": "전체경로" }] (약 10개 첨부 지원)
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

comment on table public.driver_contacts is '운전원정보 (사진·영업넘버·차종·첨부파일)';

alter table public.driver_contacts enable row level security;

create policy "driver_contacts_select" on public.driver_contacts for select to authenticated using (true);
create policy "driver_contacts_insert" on public.driver_contacts for insert to authenticated with check (true);
create policy "driver_contacts_update" on public.driver_contacts for update to authenticated using (true) with check (true);
create policy "driver_contacts_delete" on public.driver_contacts for delete to authenticated using (true);

-- 3. updated_at 트리거 설정
drop trigger if exists partner_contacts_updated_at on public.partner_contacts;
create trigger partner_contacts_updated_at before update on public.partner_contacts
  for each row execute procedure public.set_updated_at();

drop trigger if exists driver_contacts_updated_at on public.driver_contacts;
create trigger driver_contacts_updated_at before update on public.driver_contacts
  for each row execute procedure public.set_updated_at();
