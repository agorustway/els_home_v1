-- User Activity Logs Table
create table user_activity_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  user_email text,
  action_type text not null, -- 'PAGE_VIEW', 'CLICK', 'DOWNLOAD', 'LOGIN'
  path text,
  metadata jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for faster auditing/querying
create index idx_user_logs_user_id on user_activity_logs(user_id);
create index idx_user_logs_action_type on user_activity_logs(action_type);
create index idx_user_logs_created_at on user_activity_logs(created_at);

-- Enable RLS
alter table user_activity_logs enable row level security;

-- Policies
create policy "Admins can view all logs" on user_activity_logs
  for select using (
    exists (
      select 1 from user_roles
      where user_roles.id = auth.uid() and role = 'admin'
    )
  );

create policy "Users can insert their own logs" on user_activity_logs
  for insert with check (auth.uid() = user_id);

-- Note: Retention policy of 3 years is implemented via scheduled cleanup in Supabase Dashboard
-- Logic: delete from user_activity_logs where created_at < now() - interval '3 years';
