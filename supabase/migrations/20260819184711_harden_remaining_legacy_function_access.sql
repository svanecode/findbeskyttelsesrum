-- Pin trusted schemas for all remaining public functions reported by the
-- Supabase linter. Including extensions preserves PostGIS lookups used by the
-- legacy nearby functions.

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.get_nearby_shelters_v3(double precision,double precision,integer)',
    'public.create_job_status_table_if_not_exists()',
    'public.update_updated_at_column()',
    'public.add_excluded_shelter(text,text,text,text,text,text,text)',
    'public.get_nearby_shelters(double precision,double precision)',
    'public.find_nearby_shelters_v2(double precision,double precision)',
    'public.find_nearest_shelters(double precision,double precision,integer)',
    'public.list_excluded_shelters()',
    'public.remove_excluded_shelter(text,text,text,text)',
    'public.get_nearby_shelters_v2(double precision,double precision)'
  ] loop
    if to_regprocedure(function_signature) is not null then
      execute format(
        'alter function %s set search_path = pg_catalog, public, extensions, pg_temp',
        function_signature
      );
    end if;
  end loop;
end;
$$;

-- Administrative helpers must never inherit EXECUTE through the default
-- PUBLIC role. Keep only the service role access required by legacy tooling.
do $$
begin
  if to_regprocedure('public.create_job_status_table_if_not_exists()') is not null then
    execute 'revoke all on function public.create_job_status_table_if_not_exists() from public, anon, authenticated';
    execute 'grant execute on function public.create_job_status_table_if_not_exists() to service_role';
  end if;

  if to_regprocedure('public.update_updated_at_column()') is not null then
    execute 'revoke all on function public.update_updated_at_column() from public, anon, authenticated, service_role';
  end if;
end;
$$;

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

-- Preserve the read-only legacy nearby API as a rollback path, but replace the
-- broad PUBLIC grant with an explicit allowlist of API roles.
revoke all on function public.get_nearby_shelters_v3(double precision, double precision, integer)
  from public, anon, authenticated;
grant execute on function public.get_nearby_shelters_v3(double precision, double precision, integer)
  to anon, authenticated, service_role;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.get_nearby_shelters(double precision,double precision)',
    'public.find_nearby_shelters_v2(double precision,double precision)',
    'public.find_nearest_shelters(double precision,double precision,integer)',
    'public.get_nearby_shelters_v2(double precision,double precision)'
  ] loop
    if to_regprocedure(function_signature) is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        function_signature
      );
      execute format(
        'grant execute on function %s to anon, authenticated, service_role',
        function_signature
      );
    end if;
  end loop;
end;
$$;
