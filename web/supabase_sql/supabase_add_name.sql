-- Add 'name' column to user_roles table
alter table public.user_roles 
  add column if not exists name text;

-- Update existing users to have a default name based on email (optional, for existing data)
-- This is a bit complex in pure SQL without procedural code if we want to split email, 
-- so we'll leave it null or handle display logic to fallback to email.

-- View for joining user info easily (optional, but good for admin)
create or replace view public.users_view as
select 
  au.id,
  au.email,
  ur.role,
  ur.name,
  au.created_at,
  au.last_sign_in_at
from auth.users au
left join public.user_roles ur on au.id = ur.id;
