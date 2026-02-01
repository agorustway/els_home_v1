-- ETRANS(ELS) 사용자별 아이디·비밀번호 저장 (ID당 PC 허용 수량 제한 대응)
-- 각 사용자가 본인 ETRANS 계정을 저장해 두고, 컨테이너 조회 시 본인 계정으로 접속

create table if not exists public.user_els_credentials (
  user_id uuid references auth.users(id) on delete cascade primary key,
  els_user_id text not null default '',
  els_user_pw text not null default '',
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

comment on table public.user_els_credentials is 'ETRANS(ELS) 컨테이너 조회용 사용자별 아이디·비밀번호';
comment on column public.user_els_credentials.els_user_id is 'ETRANS 로그인 아이디';
comment on column public.user_els_credentials.els_user_pw is 'ETRANS 로그인 비밀번호';

alter table public.user_els_credentials enable row level security;

-- 본인 행만 조회
create policy "Users can select own els credentials"
  on public.user_els_credentials for select
  using (auth.uid() = user_id);

-- 본인 행만 삽입
create policy "Users can insert own els credentials"
  on public.user_els_credentials for insert
  with check (auth.uid() = user_id);

-- 본인 행만 수정
create policy "Users can update own els credentials"
  on public.user_els_credentials for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 본인 행만 삭제
create policy "Users can delete own els credentials"
  on public.user_els_credentials for delete
  using (auth.uid() = user_id);
