begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

select ok(
  not has_function_privilege(
    'service_role',
    'app_v2.publish_datafordeler_import_internal_v2(uuid,text,integer,integer,integer,text,timestamptz)',
    'EXECUTE'
  ),
  'service role cannot bypass the mapping gate'
);

select ok(
  has_function_privilege(
    'service_role',
    'app_v2.publish_datafordeler_import_v3(uuid,text,integer,integer,integer,text,timestamptz,integer,integer,integer,integer,integer,integer)',
    'EXECUTE'
  ),
  'service role can use the mapping-gated publisher'
);

insert into app_v2.municipalities (id, code, slug, name)
values (
  '10000000-0000-0000-0000-000000000001',
  '9999',
  'release-test-kommune',
  'Release Test Kommune'
);

insert into app_v2.shelters (
  id,
  municipality_id,
  slug,
  name,
  address_line1,
  postal_code,
  city,
  capacity,
  status,
  summary,
  canonical_source_name,
  canonical_source_reference
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'manual-release-test',
  'Manual release test',
  'Gammel adresse 1',
  '9999',
  'Testby',
  40,
  'active',
  'Test',
  'manual-test',
  'manual-release-test'
);

select is(
  (
    select publication_state
    from app_v2.shelters
    where id = '20000000-0000-0000-0000-000000000001'
  ),
  'withheld',
  'a direct new shelter starts withheld'
);

insert into app_v2.shelter_overrides (
  shelter_id,
  address_line1,
  postal_code,
  city,
  capacity,
  reason
) values (
  '20000000-0000-0000-0000-000000000001',
  'Ny adresse 2',
  '1000',
  'Nyby',
  45,
  'Release test'
);

select is(address_line1, null, 'active override cannot change address')
from app_v2.shelter_overrides
where shelter_id = '20000000-0000-0000-0000-000000000001';

select is(postal_code, null, 'active override cannot change postal code')
from app_v2.shelter_overrides
where shelter_id = '20000000-0000-0000-0000-000000000001';

select is(city, null, 'active override cannot change city')
from app_v2.shelter_overrides
where shelter_id = '20000000-0000-0000-0000-000000000001';

select is(capacity, 45, 'active override can change capacity')
from app_v2.shelter_overrides
where shelter_id = '20000000-0000-0000-0000-000000000001';

insert into app_v2.import_runs (
  id,
  source_name,
  source_url,
  status,
  publication_status
) values (
  '30000000-0000-0000-0000-000000000001',
  'datafordeler-bbr-dar',
  'release-test-first',
  'running',
  'staging'
);

insert into app_v2.import_shelter_candidates (
  import_run_id,
  source_name,
  canonical_source_reference,
  municipality_code,
  municipality_slug,
  municipality_name,
  slug,
  name,
  address_line1,
  postal_code,
  city,
  latitude,
  longitude,
  capacity,
  source_application_code,
  status
)
select
  '30000000-0000-0000-0000-000000000001',
  'datafordeler-bbr-dar',
  'release-ref-' || sequence_number,
  '9999',
  'release-test-kommune',
  'Release Test Kommune',
  'release-test-' || sequence_number,
  'Release test ' || sequence_number,
  'Testvej ' || sequence_number,
  '9999',
  'Testby',
  55.6761,
  12.5683,
  40,
  '210',
  'active'
from generate_series(1, 500) as sequence_number;

set local role service_role;

select is(
  app_v2.publish_datafordeler_import_v3(
    '30000000-0000-0000-0000-000000000001',
    'datafordeler-bbr-dar',
    500,
    500,
    1,
    'done',
    timezone('utc', now()),
    500,
    500,
    500,
    0,
    0,
    0
  )->>'status',
  'published',
  'a complete mapping-gated import is published'
);

reset role;

select is(
  count(*) filter (where publication_state = 'published')::integer,
  500,
  'the publisher explicitly releases all new source rows'
)
from app_v2.shelters
where canonical_source_name = 'datafordeler-bbr-dar';

select is(mapping_ratio, 1::numeric, 'the import run records full mapping coverage')
from app_v2.import_runs
where id = '30000000-0000-0000-0000-000000000001';

update app_v2.shelters
set publication_state = 'withheld'
where canonical_source_name = 'datafordeler-bbr-dar'
  and canonical_source_reference = 'release-ref-1';

insert into app_v2.import_runs (
  id,
  source_name,
  source_url,
  status,
  publication_status
) values (
  '30000000-0000-0000-0000-000000000002',
  'datafordeler-bbr-dar',
  'release-test-second',
  'running',
  'staging'
);

insert into app_v2.import_shelter_candidates (
  import_run_id,
  source_name,
  canonical_source_reference,
  municipality_code,
  municipality_slug,
  municipality_name,
  slug,
  name,
  address_line1,
  postal_code,
  city,
  latitude,
  longitude,
  capacity,
  source_application_code,
  status
)
select
  '30000000-0000-0000-0000-000000000002',
  'datafordeler-bbr-dar',
  'release-ref-' || sequence_number,
  '9999',
  'release-test-kommune',
  'Release Test Kommune',
  'release-test-' || sequence_number,
  'Release test ' || sequence_number,
  'Testvej ' || sequence_number,
  '9999',
  'Testby',
  55.6761,
  12.5683,
  41,
  '210',
  'active'
from generate_series(1, 500) as sequence_number;

select is(
  app_v2.publish_datafordeler_import_v3(
    '30000000-0000-0000-0000-000000000002',
    'datafordeler-bbr-dar',
    500,
    500,
    1,
    'done',
    timezone('utc', now()),
    500,
    500,
    500,
    0,
    0,
    0
  )->>'status',
  'published',
  'a later complete import is published'
);

select is(
  count(*) filter (where publication_state = 'withheld')::integer,
  1,
  'a later import preserves an existing withheld decision'
)
from app_v2.shelters
where canonical_source_name = 'datafordeler-bbr-dar';

insert into app_v2.import_runs (
  id,
  source_name,
  source_url,
  status,
  publication_status
) values (
  '30000000-0000-0000-0000-000000000003',
  'datafordeler-bbr-dar',
  'release-test-rejected',
  'running',
  'staging'
);

insert into app_v2.import_shelter_candidates (
  import_run_id,
  source_name,
  canonical_source_reference,
  municipality_code,
  municipality_slug,
  municipality_name,
  slug,
  name,
  address_line1,
  postal_code,
  city,
  latitude,
  longitude,
  capacity,
  source_application_code,
  status
) values (
  '30000000-0000-0000-0000-000000000003',
  'datafordeler-bbr-dar',
  'rejected-ref',
  '9999',
  'release-test-kommune',
  'Release Test Kommune',
  'rejected-slug',
  'Rejected test',
  'Testvej 1',
  '9999',
  'Testby',
  55.6761,
  12.5683,
  40,
  '210',
  'active'
);

select is(
  app_v2.publish_datafordeler_import_v3(
    '30000000-0000-0000-0000-000000000003',
    'datafordeler-bbr-dar',
    1,
    1,
    1,
    'done',
    timezone('utc', now()),
    2,
    2,
    1,
    1,
    0,
    1
  )->>'status',
  'rejected',
  'a low BBR-to-DAR mapping ratio is rejected'
);

select is(status, 'failed', 'a mapping-rejected run is marked failed')
from app_v2.import_runs
where id = '30000000-0000-0000-0000-000000000003';

select is(publication_status, 'rejected', 'a mapping-rejected run is not resumable staging')
from app_v2.import_runs
where id = '30000000-0000-0000-0000-000000000003';

select is(quality_gate_passed, false, 'a mapping-rejected run records a failed gate')
from app_v2.import_runs
where id = '30000000-0000-0000-0000-000000000003';

select is(mapping_ratio, 0.5::numeric, 'a mapping-rejected run records its mapping ratio')
from app_v2.import_runs
where id = '30000000-0000-0000-0000-000000000003';

select is(
  count(*)::integer,
  0,
  'a mapping-rejected run has no remaining staging candidates'
)
from app_v2.import_shelter_candidates
where import_run_id = '30000000-0000-0000-0000-000000000003';

insert into app_v2.import_runs (
  id,
  source_name,
  source_url,
  status,
  publication_status,
  resumed_from_import_run_id
) values (
  '30000000-0000-0000-0000-000000000004',
  'datafordeler-bbr-dar',
  'release-test-rejected-child',
  'running',
  'staging',
  '30000000-0000-0000-0000-000000000003'
);

select throws_ok(
  $$
    select app_v2.copy_datafordeler_import_candidates_v1(
      '30000000-0000-0000-0000-000000000003',
      '30000000-0000-0000-0000-000000000004'
    )
  $$,
  'Import resume relationship is not a resumable technical staging run',
  'a mapping-rejected run cannot be resumed'
);

insert into app_v2.import_runs (
  id,
  source_name,
  source_url,
  status,
  publication_status
) values (
  '30000000-0000-0000-0000-000000000005',
  'datafordeler-bbr-dar',
  'release-test-technical',
  'failed',
  'staging'
);

insert into app_v2.import_shelter_candidates (
  import_run_id,
  source_name,
  canonical_source_reference,
  municipality_code,
  municipality_slug,
  municipality_name,
  slug,
  name,
  address_line1,
  postal_code,
  city,
  latitude,
  longitude,
  capacity,
  source_application_code,
  status
) values (
  '30000000-0000-0000-0000-000000000005',
  'datafordeler-bbr-dar',
  'technical-ref',
  '9999',
  'release-test-kommune',
  'Release Test Kommune',
  'technical-slug',
  'Technical test',
  'Testvej 2',
  '9999',
  'Testby',
  55.6761,
  12.5683,
  40,
  '210',
  'active'
);

insert into app_v2.import_runs (
  id,
  source_name,
  source_url,
  status,
  publication_status,
  resumed_from_import_run_id
) values (
  '30000000-0000-0000-0000-000000000006',
  'datafordeler-bbr-dar',
  'release-test-technical-child',
  'running',
  'staging',
  '30000000-0000-0000-0000-000000000005'
);

select is(
  app_v2.copy_datafordeler_import_candidates_v1(
    '30000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000006'
  ),
  1,
  'a technical staging failure can be resumed'
);

select is(
  count(*)::integer,
  1,
  'a technical resume copies its staging candidate'
)
from app_v2.import_shelter_candidates
where import_run_id = '30000000-0000-0000-0000-000000000006';

select * from finish();

rollback;
