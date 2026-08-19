-- Pin trusted schemas for all remaining public functions reported by the
-- Supabase linter. Including extensions preserves PostGIS lookups used by the
-- legacy nearby functions.

alter function public.get_nearby_shelters_v3(double precision, double precision, integer)
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.create_job_status_table_if_not_exists()
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.update_updated_at_column()
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.add_excluded_shelter(text, text, text, text, text, text, text)
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.get_nearby_shelters(double precision, double precision)
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.find_nearby_shelters_v2(double precision, double precision)
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.find_nearest_shelters(double precision, double precision, integer)
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.list_excluded_shelters()
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.remove_excluded_shelter(text, text, text, text)
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.get_nearby_shelters_v2(double precision, double precision)
  set search_path = pg_catalog, public, extensions, pg_temp;

-- Administrative helpers must never inherit EXECUTE through the default
-- PUBLIC role. Keep only the service role access required by legacy tooling.
revoke all on function public.create_job_status_table_if_not_exists()
  from public, anon, authenticated;
grant execute on function public.create_job_status_table_if_not_exists()
  to service_role;

revoke all on function public.add_excluded_shelter(text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.add_excluded_shelter(text, text, text, text, text, text, text)
  to service_role;

revoke all on function public.remove_excluded_shelter(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.remove_excluded_shelter(text, text, text, text)
  to service_role;

revoke all on function public.list_excluded_shelters()
  from public, anon, authenticated;
grant execute on function public.list_excluded_shelters()
  to service_role;

-- No active trigger depends on this orphaned helper. Retain it for schema
-- compatibility without exposing it through an API role.
revoke all on function public.update_updated_at_column()
  from public, anon, authenticated, service_role;

-- Preserve the read-only legacy nearby API as a rollback path, but replace the
-- broad PUBLIC grant with an explicit allowlist of API roles.
revoke all on function public.get_nearby_shelters_v3(double precision, double precision, integer)
  from public, anon, authenticated;
grant execute on function public.get_nearby_shelters_v3(double precision, double precision, integer)
  to anon, authenticated, service_role;

revoke all on function public.get_nearby_shelters(double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.get_nearby_shelters(double precision, double precision)
  to anon, authenticated, service_role;

revoke all on function public.find_nearby_shelters_v2(double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.find_nearby_shelters_v2(double precision, double precision)
  to anon, authenticated, service_role;

revoke all on function public.find_nearest_shelters(double precision, double precision, integer)
  from public, anon, authenticated;
grant execute on function public.find_nearest_shelters(double precision, double precision, integer)
  to anon, authenticated, service_role;

revoke all on function public.get_nearby_shelters_v2(double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.get_nearby_shelters_v2(double precision, double precision)
  to anon, authenticated, service_role;
