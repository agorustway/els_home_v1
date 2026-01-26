-- Create weekly_menus table for storing lunch menu images
create table public.weekly_menus (
  id uuid default gen_random_uuid() primary key,
  branch_code text not null default 'asan',
  menu_type text not null default 'lunchbox', -- lunchbox, cafeteria, etc.
  week_start_date date not null, -- Monday of the week
  image_url text not null, -- S3 key or full URL
  file_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id)
);

-- Add RLS policies
alter table public.weekly_menus enable row level security;

-- Everyone can view
create policy "Everyone can view weekly menus"
  on public.weekly_menus for select
  using (true);

-- Only authenticated users can insert/update (or restricts to admin later)
create policy "Authenticated users can insert weekly menus"
  on public.weekly_menus for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update weekly menus"
  on public.weekly_menus for update
  using (auth.role() = 'authenticated');
