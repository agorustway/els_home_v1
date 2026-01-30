-- Add requested_role column to user_roles
alter table public.user_roles 
  add column if not exists requested_role text;
