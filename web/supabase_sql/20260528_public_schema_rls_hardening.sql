-- 2026-05-28 public schema RLS/Data API hardening
-- Supabase Data API auto-exposure change 대응 + Advisor ERROR/WARN 일부 해소

-- 1) Future objects: do not auto-grant public Data API access.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

do $$
begin
  begin
    execute 'alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated';
    execute 'alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated';
    execute 'alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated';
  exception when insufficient_privilege then
    null;
  end;

  begin
    execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon, authenticated';
    execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from anon, authenticated';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- 2) Tables previously open in public schema.
revoke all on table
  public.internal_contacts,
  public.external_contacts,
  public.work_docs,
  public.form_templates,
  public.work_sites,
  public.work_site_managers,
  public.posts,
  public.weekly_menus,
  public.emergency_notices
from anon, authenticated;

grant select, insert, update, delete on table
  public.internal_contacts,
  public.external_contacts,
  public.work_docs,
  public.form_templates,
  public.work_sites,
  public.work_site_managers
to authenticated;

grant select on table public.posts to anon, authenticated;
grant insert, update, delete on table public.posts to authenticated;
grant select on table public.weekly_menus to anon, authenticated;
grant insert, update on table public.weekly_menus to authenticated;
grant select on table public.emergency_notices to anon, authenticated;

do $$
begin
  if to_regclass('public.emergency_notices_id_seq') is not null then
    revoke all on sequence public.emergency_notices_id_seq from anon, authenticated;
  end if;
end $$;

alter table public.internal_contacts enable row level security;
alter table public.external_contacts enable row level security;
alter table public.work_docs enable row level security;
alter table public.form_templates enable row level security;
alter table public.work_sites enable row level security;
alter table public.work_site_managers enable row level security;
alter table public.posts enable row level security;
alter table public.weekly_menus enable row level security;
alter table public.emergency_notices enable row level security;

drop policy if exists internal_contacts_select on public.internal_contacts;
drop policy if exists internal_contacts_insert on public.internal_contacts;
drop policy if exists internal_contacts_update on public.internal_contacts;
drop policy if exists internal_contacts_delete on public.internal_contacts;
create policy internal_contacts_select on public.internal_contacts for select to authenticated using (true);
create policy internal_contacts_insert on public.internal_contacts for insert to authenticated with check (true);
create policy internal_contacts_update on public.internal_contacts for update to authenticated using (true) with check (true);
create policy internal_contacts_delete on public.internal_contacts for delete to authenticated using (true);

drop policy if exists external_contacts_select on public.external_contacts;
drop policy if exists external_contacts_insert on public.external_contacts;
drop policy if exists external_contacts_update on public.external_contacts;
drop policy if exists external_contacts_delete on public.external_contacts;
create policy external_contacts_select on public.external_contacts for select to authenticated using (true);
create policy external_contacts_insert on public.external_contacts for insert to authenticated with check (true);
create policy external_contacts_update on public.external_contacts for update to authenticated using (true) with check (true);
create policy external_contacts_delete on public.external_contacts for delete to authenticated using (true);

drop policy if exists work_docs_select on public.work_docs;
drop policy if exists work_docs_insert on public.work_docs;
drop policy if exists work_docs_update on public.work_docs;
drop policy if exists work_docs_delete on public.work_docs;
create policy work_docs_select on public.work_docs for select to authenticated using (true);
create policy work_docs_insert on public.work_docs for insert to authenticated with check (true);
create policy work_docs_update on public.work_docs for update to authenticated using (true) with check (true);
create policy work_docs_delete on public.work_docs for delete to authenticated using (true);

drop policy if exists form_templates_select on public.form_templates;
drop policy if exists form_templates_insert on public.form_templates;
drop policy if exists form_templates_update on public.form_templates;
drop policy if exists form_templates_delete on public.form_templates;
create policy form_templates_select on public.form_templates for select to authenticated using (true);
create policy form_templates_insert on public.form_templates for insert to authenticated with check (true);
create policy form_templates_update on public.form_templates for update to authenticated using (true) with check (true);
create policy form_templates_delete on public.form_templates for delete to authenticated using (true);

drop policy if exists work_sites_select on public.work_sites;
drop policy if exists work_sites_insert on public.work_sites;
drop policy if exists work_sites_update on public.work_sites;
drop policy if exists work_sites_delete on public.work_sites;
create policy work_sites_select on public.work_sites for select to authenticated using (true);
create policy work_sites_insert on public.work_sites for insert to authenticated with check (true);
create policy work_sites_update on public.work_sites for update to authenticated using (true) with check (true);
create policy work_sites_delete on public.work_sites for delete to authenticated using (true);

drop policy if exists work_site_managers_select on public.work_site_managers;
drop policy if exists work_site_managers_insert on public.work_site_managers;
drop policy if exists work_site_managers_update on public.work_site_managers;
drop policy if exists work_site_managers_delete on public.work_site_managers;
create policy work_site_managers_select on public.work_site_managers for select to authenticated using (true);
create policy work_site_managers_insert on public.work_site_managers for insert to authenticated with check (true);
create policy work_site_managers_update on public.work_site_managers for update to authenticated using (true) with check (true);
create policy work_site_managers_delete on public.work_site_managers for delete to authenticated using (true);

drop policy if exists posts_select_public_webzine on public.posts;
drop policy if exists posts_select_authenticated on public.posts;
drop policy if exists posts_insert_authenticated on public.posts;
drop policy if exists posts_update_own on public.posts;
drop policy if exists posts_update_admin on public.posts;
drop policy if exists posts_delete_own_non_webzine on public.posts;
drop policy if exists posts_delete_admin on public.posts;
drop policy if exists "Anyone can view free board posts" on public.posts;
drop policy if exists "Authorized users can view report posts" on public.posts;
drop policy if exists "Users can create their own posts" on public.posts;
drop policy if exists "Users can update their own posts" on public.posts;
drop policy if exists "Users or admins can delete posts" on public.posts;
drop policy if exists "Users can delete own non-webzine posts" on public.posts;
drop policy if exists "Admins can delete any post" on public.posts;
drop policy if exists "Admins can update any post" on public.posts;
drop policy if exists "Anyone can view webzine posts" on public.posts;
create policy posts_select_public_webzine on public.posts
  for select to anon using (board_type = 'webzine');
create policy posts_select_authenticated on public.posts
  for select to authenticated using (true);
create policy posts_insert_authenticated on public.posts
  for insert to authenticated with check (auth.uid() = author_id);
create policy posts_update_own on public.posts
  for update to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy posts_update_admin on public.posts
  for update to authenticated
  using (
    exists (
      select 1
      from public.user_roles r
      where (r.id = auth.uid() or r.email = (auth.jwt() ->> 'email'))
        and r.role = 'admin'
    )
  )
  with check (true);
create policy posts_delete_own_non_webzine on public.posts
  for delete to authenticated using (auth.uid() = author_id and board_type <> 'webzine');
create policy posts_delete_admin on public.posts
  for delete to authenticated
  using (
    exists (
      select 1
      from public.user_roles r
      where (r.id = auth.uid() or r.email = (auth.jwt() ->> 'email'))
        and r.role = 'admin'
    )
  );

drop policy if exists weekly_menus_select_public on public.weekly_menus;
drop policy if exists weekly_menus_insert_authenticated on public.weekly_menus;
drop policy if exists weekly_menus_update_authenticated on public.weekly_menus;
drop policy if exists "Everyone can view weekly menus" on public.weekly_menus;
drop policy if exists "Authenticated users can insert weekly menus" on public.weekly_menus;
drop policy if exists "Authenticated users can update weekly menus" on public.weekly_menus;
create policy weekly_menus_select_public on public.weekly_menus for select to anon, authenticated using (true);
create policy weekly_menus_insert_authenticated on public.weekly_menus for insert to authenticated with check (auth.role() = 'authenticated');
create policy weekly_menus_update_authenticated on public.weekly_menus for update to authenticated using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists emergency_notices_select_public on public.emergency_notices;
create policy emergency_notices_select_public on public.emergency_notices
  for select to anon, authenticated using (expires_at is null or expires_at > now());

-- 3) Service-role-only branch tables had policies accidentally created for public.
revoke all on table
  public.branch_dispatch,
  public.branch_dispatch_settings,
  public.branch_performance_files,
  public.branch_performance_rows,
  public.branch_shipping_files,
  public.branch_shipping_rows
from anon, authenticated;

grant all on table
  public.branch_dispatch,
  public.branch_dispatch_settings,
  public.branch_performance_files,
  public.branch_performance_rows,
  public.branch_shipping_files,
  public.branch_shipping_rows
to service_role;

drop policy if exists service_role_dispatch on public.branch_dispatch;
drop policy if exists service_role_dispatch_settings on public.branch_dispatch_settings;
drop policy if exists service_role_branch_performance_files on public.branch_performance_files;
drop policy if exists service_role_branch_performance_rows on public.branch_performance_rows;
drop policy if exists service_role_shipping_files on public.branch_shipping_files;
drop policy if exists service_role_shipping_rows on public.branch_shipping_rows;

create policy service_role_dispatch on public.branch_dispatch for all to service_role using (true) with check (true);
create policy service_role_dispatch_settings on public.branch_dispatch_settings for all to service_role using (true) with check (true);
create policy service_role_branch_performance_files on public.branch_performance_files for all to service_role using (true) with check (true);
create policy service_role_branch_performance_rows on public.branch_performance_rows for all to service_role using (true) with check (true);
create policy service_role_shipping_files on public.branch_shipping_files for all to service_role using (true) with check (true);
create policy service_role_shipping_rows on public.branch_shipping_rows for all to service_role using (true) with check (true);

-- 4) SECURITY DEFINER RPC must not be executable from public clients.
revoke all on function public.asan_performance_route_unit_price_rows(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.asan_performance_route_unit_price_rows(text, integer, integer, integer) to service_role;

-- 5) Fix mutable search_path warnings.
do $$
declare
  func regprocedure;
begin
  for func in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'asan_performance_amount_to_numeric',
        'touch_branch_dispatch_web_cells_updated_at',
        'touch_branch_dispatch_confirmation_updated_at',
        'touch_glaps_master_updated_at',
        'set_updated_at',
        'match_documents'
      )
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', func);
  end loop;
end $$;

-- 6) Extension schema hardening. Keep public in function search_path for existing objects.
create schema if not exists extensions;
do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'vector'
      and n.nspname = 'public'
  ) then
    execute 'alter extension vector set schema extensions';
  end if;
end $$;
