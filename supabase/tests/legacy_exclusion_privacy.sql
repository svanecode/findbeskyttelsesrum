begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(not has_table_privilege('anon', 'public.excluded_shelters', 'SELECT'),
  'anonymous clients cannot enumerate legacy owner exclusions');
select ok(not has_table_privilege('authenticated', 'public.excluded_shelters', 'SELECT'),
  'signed-in clients cannot enumerate legacy owner exclusions');
select ok(has_table_privilege('service_role', 'public.excluded_shelters', 'SELECT'),
  'trusted parity tooling can still read historical exclusions');
select is((select count(*)::integer from pg_policies
  where schemaname = 'public' and tablename = 'excluded_shelters'
    and roles && array['anon', 'authenticated', 'public']::name[]), 0,
  'legacy exclusions have no public RLS policies');
select ok(not has_function_privilege('anon',
  'public.get_nearby_shelters_v3(double precision,double precision,integer)', 'EXECUTE'),
  'the dependent retired nearby RPC has no anonymous access');
select ok(not has_function_privilege('authenticated',
  'public.get_nearby_shelters_v3(double precision,double precision,integer)', 'EXECUTE'),
  'the dependent retired nearby RPC has no signed-in access');

set local role anon;
select throws_ok('select address, reason, created_by from public.excluded_shelters',
  '42501', 'permission denied for table excluded_shelters',
  'an actual anonymous read of private exclusion columns is denied');
reset role;
set local role authenticated;
select throws_ok('select address, reason, created_by from public.excluded_shelters',
  '42501', 'permission denied for table excluded_shelters',
  'an actual signed-in read of private exclusion columns is denied');
reset role;

select * from finish();
rollback;
