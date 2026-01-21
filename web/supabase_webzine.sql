-- Add 'webzine' to board_type check constraint
-- PostgreSQL doesn't support altering a check constraint directly. We have to drop and recreate it.
alter table public.posts drop constraint if exists posts_board_type_check;

alter table public.posts 
  add constraint posts_board_type_check 
  check (board_type in ('free', 'report', 'webzine'));

-- Add thumbnail_url column for webzine card view
alter table public.posts 
  add column if not exists thumbnail_url text;

-- Policy for Webzine
-- 1. All authenticated users can read webzine posts
create policy "Anyone can view webzine posts"
  on public.posts for select
  using ( board_type = 'webzine' );

-- 2. Admins and specific roles can create/update/delete webzine posts
-- For now, let's allow all authenticated users to write (like free board), 
-- or restrict to admin? Usually webzine is company news, so maybe restricted?
-- User requested "Employee menu... blog page...". 
-- Let's allow all employees to post for now, consistent with the Intranet concept.

-- Reuse existing insert/update/delete policies since they check auth.uid() = author_id.
-- If we need to restrict webzine writing to admins only later, we can add a specific policy.
