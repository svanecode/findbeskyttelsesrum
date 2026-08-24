begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select ok(
  coalesce(
    (
      select p.proconfig @> array['statement_timeout=60s']
      from pg_proc p
      join pg_namespace namespace on namespace.oid = p.pronamespace
      where namespace.nspname = 'app_v2'
        and p.proname = 'publish_datafordeler_import_v3'
    ),
    false
  ),
  'the trusted v3 publisher has a function-scoped 60-second timeout'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_v2.publish_datafordeler_import_v3(uuid,text,integer,integer,integer,text,timestamptz,integer,integer,integer,integer,integer,integer)',
    'EXECUTE'
  ),
  'anonymous clients cannot use the extended-timeout publisher'
);

create temp table runtime_initial_revision as
select revision
from app_v2.public_data_revisions
where scope = 'public';

select set_config('app_v2.quality_gate_passed', 'true', true);

insert into app_v2.municipalities (id, code, slug, name)
values (
  '41000000-0000-0000-0000-000000000001',
  '9987',
  'runtime-test-kommune',
  'Runtime Test Kommune'
);

select is(
  (
    select count(*)
    from app_v2.municipality_summary_public_v1
    where municipality_id = '41000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'intermediate importer mutations defer the municipality aggregate refresh'
);

select is(
  (select revision from app_v2.public_data_revisions where scope = 'public'),
  (select revision from runtime_initial_revision),
  'intermediate importer mutations do not create redundant revisions'
);

select set_config('app_v2.quality_gate_passed', 'false', true);

update app_v2.dataset_publications
set quality_metrics = quality_metrics
where source_name = 'datafordeler-bbr-dar'
  and is_current = true;

select is(
  (
    select count(*)
    from app_v2.municipality_summary_public_v1
    where municipality_id = '41000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'the final publication metadata update refreshes the municipality aggregate'
);

select ok(
  (select revision from app_v2.public_data_revisions where scope = 'public')
    > (select revision from runtime_initial_revision),
  'the final publication metadata update advances the public revision'
);

select is(
  (
    select count(*)
    from app_v2.municipality_summary_public_v1
    where municipality_id = '41000000-0000-0000-0000-000000000001'
  ),
  (
    select count(*)
    from app_v2.municipalities
    where id = '41000000-0000-0000-0000-000000000001'
  ),
  'the refreshed aggregate remains consistent with municipalities'
);

select ok(
  has_function_privilege(
    'service_role',
    'app_v2.publish_datafordeler_import_v3(uuid,text,integer,integer,integer,text,timestamptz,integer,integer,integer,integer,integer,integer)',
    'EXECUTE'
  ),
  'the service role retains publisher access'
);

select * from finish();

rollback;
