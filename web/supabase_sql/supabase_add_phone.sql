-- Add phone column to user_roles
alter table public.user_roles 
  add column if not exists phone text;
