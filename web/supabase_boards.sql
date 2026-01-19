-- Tables for Bulletin Boards (Free Board & Work Reports)

-- Create a table for posts
create table if not exists public.posts (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  title text not null,
  content text,
  author_id uuid references auth.users(id) on delete cascade not null,
  board_type text not null check (board_type in ('free', 'report')),
  branch_tag text, -- e.g., 'asan', 'jungbu', etc.
  attachments jsonb default '[]', -- List of file paths/names in NAS
  view_count integer default 0
);

-- Enable RLS
alter table public.posts enable row level security;

-- Policies for posts

-- 1. All authenticated users can read free board posts
create policy "Anyone can view free board posts"
  on public.posts for select
  using ( board_type = 'free' );

-- 2. Users can read report board posts if they are admin, headquarters, or if it relates to their branch
-- We'll assume role-based logic here. For simplicity in RLS:
create policy "Authorized users can view report posts"
  on public.posts for select
  using (
    board_type = 'report' AND (
      exists (select 1 from public.user_roles where id = auth.uid() and role in ('admin', 'headquarters'))
      OR 
      exists (select 1 from public.user_roles where id = auth.uid() and role = branch_tag)
    )
  );

-- 3. Users can create posts
create policy "Users can create their own posts"
  on public.posts for insert
  with check ( auth.uid() = author_id );

-- 4. Users can update their own posts
create policy "Users can update their own posts"
  on public.posts for update
  using ( auth.uid() = author_id );

-- 5. Users can delete their own posts (or admins)
create policy "Users or admins can delete posts"
  on public.posts for delete
  using ( 
    auth.uid() = author_id 
    OR 
    exists (select 1 from public.user_roles where id = auth.uid() and role = 'admin')
  );

-- Function to update view count (optional but good)
create or replace function increment_view_count(post_id uuid)
returns void as $$
begin
  update public.posts
  set view_count = view_count + 1
  where id = post_id;
end;
$$ language plpgsql security definer;
