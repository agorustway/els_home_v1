begin;

-- Vehicle tracking data is served through Next.js API routes.
-- Direct Data API access should be service_role only.
drop policy if exists "Allow all for authenticated" on public.vehicle_trips;
drop policy if exists "Allow all for authenticated" on public.vehicle_locations;
drop policy if exists "Allow all for authenticated" on public.vehicle_trip_logs;

revoke all on table public.vehicle_trips from anon, authenticated;
revoke all on table public.vehicle_locations from anon, authenticated;
revoke all on table public.vehicle_trip_logs from anon, authenticated;

revoke all on sequence public.vehicle_locations_id_seq from anon, authenticated;
revoke all on sequence public.vehicle_trip_logs_id_seq from anon, authenticated;

grant all on table public.vehicle_trips to service_role;
grant all on table public.vehicle_locations to service_role;
grant all on table public.vehicle_trip_logs to service_role;
grant all on sequence public.vehicle_locations_id_seq to service_role;
grant all on sequence public.vehicle_trip_logs_id_seq to service_role;

create policy vehicle_trips_service_role_all
on public.vehicle_trips
for all
to service_role
using (true)
with check (true);

create policy vehicle_locations_service_role_all
on public.vehicle_locations
for all
to service_role
using (true)
with check (true);

create policy vehicle_trip_logs_service_role_all
on public.vehicle_trip_logs
for all
to service_role
using (true)
with check (true);

commit;
