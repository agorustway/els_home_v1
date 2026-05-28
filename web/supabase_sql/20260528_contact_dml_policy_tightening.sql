-- 2026-05-28 contact/intranet DML policy tightening
-- Server APIs verify the user and use service_role for writes, so client roles only need SELECT.

revoke insert, update, delete on table
  public.internal_contacts,
  public.external_contacts,
  public.work_docs,
  public.form_templates,
  public.work_sites,
  public.work_site_managers,
  public.partner_contacts,
  public.driver_contacts
from anon, authenticated;

revoke all on table
  public.partner_contacts,
  public.driver_contacts
from anon, authenticated;

revoke all on table
  public.internal_contacts,
  public.external_contacts,
  public.work_docs,
  public.form_templates,
  public.work_sites,
  public.work_site_managers,
  public.partner_contacts,
  public.driver_contacts
from anon;

grant select on table
  public.internal_contacts,
  public.external_contacts,
  public.work_docs,
  public.form_templates,
  public.work_sites,
  public.work_site_managers,
  public.partner_contacts,
  public.driver_contacts
to authenticated;

drop policy if exists internal_contacts_insert on public.internal_contacts;
drop policy if exists internal_contacts_update on public.internal_contacts;
drop policy if exists internal_contacts_delete on public.internal_contacts;
drop policy if exists external_contacts_insert on public.external_contacts;
drop policy if exists external_contacts_update on public.external_contacts;
drop policy if exists external_contacts_delete on public.external_contacts;
drop policy if exists work_docs_insert on public.work_docs;
drop policy if exists work_docs_update on public.work_docs;
drop policy if exists work_docs_delete on public.work_docs;
drop policy if exists form_templates_insert on public.form_templates;
drop policy if exists form_templates_update on public.form_templates;
drop policy if exists form_templates_delete on public.form_templates;
drop policy if exists work_sites_insert on public.work_sites;
drop policy if exists work_sites_update on public.work_sites;
drop policy if exists work_sites_delete on public.work_sites;
drop policy if exists work_site_managers_insert on public.work_site_managers;
drop policy if exists work_site_managers_update on public.work_site_managers;
drop policy if exists work_site_managers_delete on public.work_site_managers;
drop policy if exists partner_contacts_insert on public.partner_contacts;
drop policy if exists partner_contacts_update on public.partner_contacts;
drop policy if exists partner_contacts_delete on public.partner_contacts;
drop policy if exists driver_contacts_insert on public.driver_contacts;
drop policy if exists driver_contacts_update on public.driver_contacts;
drop policy if exists driver_contacts_delete on public.driver_contacts;

drop policy if exists posts_update_admin on public.posts;
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
  with check (
    exists (
      select 1
      from public.user_roles r
      where (r.id = auth.uid() or r.email = (auth.jwt() ->> 'email'))
        and r.role = 'admin'
    )
  );
