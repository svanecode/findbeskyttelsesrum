-- Owner exclusion requests are private, including the historical ledger.
-- Lock the table itself; restricting only its helper RPC leaves PostgREST's
-- table endpoint readable through the old unconditional SELECT policies.
revoke all on table public.excluded_shelters from public, anon, authenticated;
grant select, insert, update, delete on table public.excluded_shelters to service_role;

drop policy if exists "Authenticated users can read excluded shelters"
on public.excluded_shelters;
drop policy if exists "Anon users can read excluded shelters"
on public.excluded_shelters;

-- These retired invoker APIs depend on the now-private legacy tables. Public
-- clients already use the explicit app_v2 read model and must not regain an
-- alternative path around its publication and moderation decisions.
do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.get_nearby_shelters_v3(double precision,double precision,integer)',
    'public.get_nearby_shelters(double precision,double precision)',
    'public.find_nearby_shelters_v2(double precision,double precision)',
    'public.get_nearby_shelters_v2(double precision,double precision)'
  ] loop
    if to_regprocedure(function_signature) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', function_signature);
      execute format('grant execute on function %s to service_role', function_signature);
    end if;
  end loop;
end;
$$;

comment on table public.excluded_shelters is
'Private historical owner-exclusion requests. Only service-role parity and maintenance tooling may read this ledger.';
