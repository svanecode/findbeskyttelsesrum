begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

select has_table(
  'app_v2',
  'municipality_summary_public_v1',
  'the bounded municipality summary exists'
);

select has_table(
  'app_v2',
  'public_data_revisions',
  'the private public-data revision ledger exists'
);

select is(
  (select relrowsecurity from pg_class where oid = 'app_v2.municipality_summary_public_v1'::regclass),
  true,
  'the public summary table has RLS enabled'
);

select is(
  (select relrowsecurity from pg_class where oid = 'app_v2.public_data_revisions'::regclass),
  true,
  'the private revision table has RLS enabled'
);

select ok(
  has_table_privilege('anon', 'app_v2.municipality_summary_public_v1', 'SELECT'),
  'anonymous clients can read the explicit municipality aggregate'
);

select ok(
  not has_table_privilege('anon', 'app_v2.public_data_revisions', 'SELECT'),
  'anonymous clients cannot read the private revision ledger directly'
);

select ok(
  has_table_privilege('service_role', 'app_v2.public_data_revisions', 'SELECT'),
  'the server role can read the private revision ledger'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'app_v2'
      and tablename = 'public_data_revisions'
      and policyname = 'app_v2_public_data_revisions_service_only'
  ),
  'the private revision ledger has an explicit service-only RLS policy'
);

select has_index(
  'app_v2',
  'public_data_revisions',
  'app_v2_public_data_revisions_publication_id_idx',
  'the revision publication foreign key has a covering index'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_v2.refresh_municipality_summary_public_v1()',
    'EXECUTE'
  ),
  'anonymous clients cannot refresh aggregates'
);

select is(
  (select coalesce(sum(public_registration_count), 0)::bigint from app_v2.municipality_summary_public_v1),
  (select count(*) from app_v2.shelter_public_v2),
  'the initial summary count matches the public read model'
);

select is(
  (select coalesce(sum(public_capacity), 0)::bigint from app_v2.municipality_summary_public_v1),
  (select coalesce(sum(capacity), 0) from app_v2.shelter_public_v2),
  'the initial summary capacity matches the public read model'
);

create temp table release2_initial_revision as
select revision
from app_v2.public_data_revisions
where scope = 'public';

insert into app_v2.municipalities (id, code, slug, name)
values (
  '40000000-0000-0000-0000-000000000001',
  '9988',
  'release-2-test-kommune',
  'Release 2 Test Kommune'
);

insert into app_v2.application_code_eligibility (
  source_name,
  application_code,
  label,
  is_nearby_eligible,
  rule_source
) values (
  'datafordeler-bbr-dar',
  '998',
  'Release 2 testkode',
  true,
  'release_2_test'
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
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'release-2-test-shelter',
  'Release 2 test',
  'Cachevej 1',
  '9988',
  'Testby',
  55.6761,
  12.5683,
  90,
  'active',
  'Release 2 test',
  '998',
  'published',
  'release-2-test',
  'release-2-test-shelter'
);

select is(
  (select public_registration_count from app_v2.municipality_summary_public_v1 where municipality_id = '40000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a public shelter appears in the municipality summary immediately'
);

select is(
  (select public_capacity from app_v2.municipality_summary_public_v1 where municipality_id = '40000000-0000-0000-0000-000000000001'),
  90::bigint,
  'the municipality summary records public capacity'
);

select is(
  (select mapped_registration_count from app_v2.municipality_summary_public_v1 where municipality_id = '40000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the municipality summary records mapped registrations'
);

select ok(
  (select revision from app_v2.public_data_revisions where scope = 'public')
    > (select revision from release2_initial_revision),
  'a public-data mutation advances the cache revision'
);

insert into app_v2.shelter_overrides (
  shelter_id,
  capacity,
  reason
) values (
  '50000000-0000-0000-0000-000000000001',
  120,
  'Release 2 aggregate test'
);

select is(
  (select public_capacity from app_v2.municipality_summary_public_v1 where municipality_id = '40000000-0000-0000-0000-000000000001'),
  120::bigint,
  'an active capacity correction refreshes the public aggregate'
);

insert into app_v2.shelter_exclusions (
  id,
  shelter_id,
  reason,
  source
) values (
  '60000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'Release 2 aggregate test',
  'manual'
);

select is(
  (select public_registration_count from app_v2.municipality_summary_public_v1 where municipality_id = '40000000-0000-0000-0000-000000000001'),
  0::bigint,
  'an exclusion removes the registration from the aggregate in the same transaction'
);

delete from app_v2.shelter_exclusions
where id = '60000000-0000-0000-0000-000000000001';

select is(
  (select public_registration_count from app_v2.municipality_summary_public_v1 where municipality_id = '40000000-0000-0000-0000-000000000001'),
  1::bigint,
  'removing an exclusion restores the registration in the aggregate'
);

select is(
  (select public_registrations from app_v2.public_data_stats_v1),
  (select coalesce(sum(public_registration_count), 0)::bigint from app_v2.municipality_summary_public_v1),
  'global public stats read only the bounded municipality summary'
);

select is(
  (select mapped_capacity from app_v2.public_data_stats_v1),
  (select coalesce(sum(mapped_capacity), 0)::bigint from app_v2.municipality_summary_public_v1),
  'global mapped stats read only the bounded municipality summary'
);

select ok(
  coalesce(
    (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'app_v2.public_data_stats_v1'::regclass),
    false
  ),
  'the global stats view remains security-invoker'
);

select * from finish();

rollback;
