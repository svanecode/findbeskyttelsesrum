-- These legacy SECURITY DEFINER functions are not part of the public app API.
-- Keep the two operational helpers available to service_role for import and
-- rollback tooling, while removing direct browser access.

alter function public.get_total_shelter_capacity()
  set search_path = pg_catalog, public, extensions, pg_temp;

revoke all on function public.get_total_shelter_capacity()
  from public, anon, authenticated;
grant execute on function public.get_total_shelter_capacity()
  to service_role;

comment on function public.get_total_shelter_capacity() is
  'Legacy capacity helper. Restricted to service_role; the public app uses app_v2 read models.';

-- This orphaned trigger function has no trigger dependencies. Retain the
-- definition for migration compatibility, but expose it to no API role.
do $$
begin
  if to_regprocedure('public.set_user_columns()') is not null then
    execute 'alter function public.set_user_columns() set search_path = pg_catalog, public, pg_temp';
    execute 'revoke all on function public.set_user_columns() from public, anon, authenticated, service_role';
    execute $sql$comment on function public.set_user_columns() is
      'Legacy trigger helper with no active trigger dependencies. Not exposed through the API.'$sql$;
  end if;

  if to_regprocedure(
    'public.update_shelter_location(text,text,text,text,text,double precision,double precision)'
  ) is not null then
    execute 'alter function public.update_shelter_location(text,text,text,text,text,double precision,double precision) set search_path = pg_catalog, public, extensions, pg_temp';
    execute 'revoke all on function public.update_shelter_location(text,text,text,text,text,double precision,double precision) from public, anon, authenticated';
    execute 'grant execute on function public.update_shelter_location(text,text,text,text,text,double precision,double precision) to service_role';
    execute $sql$comment on function public.update_shelter_location(text,text,text,text,text,double precision,double precision) is
      'Legacy sheltersv2 update helper. Restricted to service_role for import and rollback tooling.'$sql$;
  end if;
end;
$$;
