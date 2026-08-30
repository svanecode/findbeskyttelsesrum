begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

select ok(
  to_regprocedure('public.find_nearest_shelters(double precision,double precision,integer)') is null,
  'the broken legacy nearest-shelter RPC no longer exists'
);

select ok(
  not has_table_privilege('anon', 'app_v2.shelter_public', 'SELECT'),
  'anonymous clients cannot read the retired shelter view'
);

select ok(
  not has_table_privilege('authenticated', 'app_v2.shelter_public', 'SELECT'),
  'signed-in clients cannot read the retired shelter view'
);

select ok(
  not exists (
    select 1
    from pg_class relation
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) privilege
    where relation.oid = 'app_v2.shelter_public'::regclass
      and privilege.grantee = 0
      and privilege.privilege_type = 'SELECT'
  ),
  'PUBLIC has no direct SELECT grant on the retired shelter view'
);

select ok(
  not has_table_privilege('anon', 'app_v2.country_marker_public', 'SELECT'),
  'anonymous clients cannot read retired country markers'
);

select ok(
  not has_table_privilege('authenticated', 'app_v2.country_marker_public', 'SELECT'),
  'signed-in clients cannot read retired country markers'
);

select ok(
  not has_table_privilege('anon', 'app_v2.sitemap_shelter_public', 'SELECT'),
  'anonymous clients cannot read the retired sitemap model'
);

select ok(
  not has_table_privilege('authenticated', 'app_v2.sitemap_shelter_public', 'SELECT'),
  'signed-in clients cannot read the retired sitemap model'
);

select ok(
  not has_table_privilege('anon', 'app_v2.municipality_public', 'SELECT'),
  'anonymous clients cannot read the retired municipality model'
);

select ok(
  not has_table_privilege('authenticated', 'app_v2.municipality_public', 'SELECT'),
  'signed-in clients cannot read the retired municipality model'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_v2.get_nearby_shelters_public(double precision,double precision,integer,integer,integer)',
    'EXECUTE'
  ),
  'anonymous clients cannot execute the retired nearby RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_v2.get_nearby_shelters_public(double precision,double precision,integer,integer,integer)',
    'EXECUTE'
  ),
  'signed-in clients cannot execute the retired nearby RPC'
);

select ok(
  not exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    where procedure.oid = 'app_v2.get_nearby_shelters_public(double precision,double precision,integer,integer,integer)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no EXECUTE grant on the retired nearby RPC'
);

select ok(
  has_table_privilege('anon', 'app_v2.shelter_public_v2', 'SELECT'),
  'anonymous clients retain the explicit V2 public read model'
);

select ok(
  has_table_privilege('authenticated', 'app_v2.shelter_public_v2', 'SELECT'),
  'signed-in clients retain the explicit V2 public read model'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'app_v2'
      and table_name = 'shelter_public_v2'
      and column_name = any(array[
        'status',
        'import_state',
        'publication_state',
        'canonical_source_name',
        'canonical_source_reference',
        'is_featured',
        'featured_rank'
      ])
  ),
  0,
  'the V2 allowlist contains no internal lifecycle or source identity columns'
);

insert into app_v2.municipalities (id, code, slug, name)
values (
  '42000000-0000-0000-0000-000000000001',
  '9986',
  'legacy-surface-test-kommune',
  'Legacy Surface Test Kommune'
);

insert into app_v2.application_code_eligibility (
  source_name,
  application_code,
  label,
  is_nearby_eligible,
  rule_source
) values (
  'datafordeler-bbr-dar',
  '997',
  'Legacy surface regression',
  true,
  'legacy_surface_regression'
) on conflict (source_name, application_code) do update
set is_nearby_eligible = true;

insert into app_v2.shelters (
  id,
  municipality_id,
  slug,
  name,
  address_line1,
  postal_code,
  city,
  latitude,
  longitude,
  capacity,
  status,
  summary,
  source_application_code,
  publication_state,
  canonical_source_name,
  canonical_source_reference
) values (
  '43000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  'legacy-surface-test-shelter',
  'Legacy surface test',
  'Sikkerhedsvej 1',
  '9986',
  'Testby',
  -45.000000,
  -120.000000,
  80,
  'active',
  'Legacy surface regression',
  '997',
  'withheld',
  'legacy-surface-regression',
  'internal-reference-must-not-leak'
);

select is(
  (
    select count(*)::integer
    from app_v2.shelter_public_v2
    where id = '43000000-0000-0000-0000-000000000001'
  ),
  0,
  'a withheld registration is absent from the public V2 model'
);

update app_v2.shelters
set publication_state = 'published'
where id = '43000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)::integer
    from app_v2.shelter_public_v2
    where id = '43000000-0000-0000-0000-000000000001'
  ),
  1,
  'an explicitly published registration is visible in the public V2 model'
);

with rpc_response as (
  select results
  from app_v2.get_nearby_shelters_public_v2(-45, -120, 1000, 10, 10)
), result_items as (
  select item
  from rpc_response
  cross join lateral jsonb_array_elements(results) item
  where item->>'id' = '43000000-0000-0000-0000-000000000001'
)
select ok(
  (
    select count(*) = 1
      and coalesce(bool_and(not (item ?| array[
        'status',
        'import_state',
        'publication_state',
        'canonical_source_name',
        'canonical_source_reference'
      ])), false)
    from result_items
  ),
  'the active nearby RPC returns the published row without internal fields'
);

select * from finish();

rollback;
