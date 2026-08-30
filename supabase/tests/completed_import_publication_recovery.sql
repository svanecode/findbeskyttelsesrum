begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select has_column(
  'app_v2',
  'import_runs',
  'source_scan_complete',
  'source completion is recorded explicitly'
);

select col_default_is(
  'app_v2',
  'import_runs',
  'source_scan_complete',
  'false',
  'new and incomplete import runs fail closed'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_v2.retry_latest_completed_datafordeler_publication_v1()',
    'EXECUTE'
  ),
  'anonymous clients cannot retry a publication'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_v2.retry_latest_completed_datafordeler_publication_v1()',
    'EXECUTE'
  ),
  'signed-in clients cannot retry a publication'
);

select ok(
  has_function_privilege(
    'service_role',
    'app_v2.retry_latest_completed_datafordeler_publication_v1()',
    'EXECUTE'
  ),
  'the service role can run the recovery operation'
);

select is(
  app_v2.retry_latest_completed_datafordeler_publication_v1()->>'status',
  'no_candidate',
  'recovery is a no-op without a completed failed staging run'
);

insert into app_v2.import_runs (
  id,
  source_name,
  source_url,
  status,
  publication_status,
  quality_gate_passed,
  source_scan_complete,
  records_seen,
  records_upserted,
  pages_fetched,
  last_successful_page,
  last_successful_cursor,
  error_summary,
  bbr_fetched_count,
  bbr_eligible_count,
  dar_linked_count,
  dar_missing_count,
  mapping_failure_count,
  warning_count
) values (
  '44000000-0000-0000-0000-000000000001',
  'datafordeler-bbr-dar',
  'recovery-operator-test',
  'failed',
  'staging',
  null,
  true,
  500,
  500,
  1,
  1,
  'done',
  'Supabase validate and atomically publish full import returned HTTP 500',
  500,
  500,
  500,
  0,
  0,
  0
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
  '44000000-0000-0000-0000-000000000001',
  'datafordeler-bbr-dar',
  'recovery-reference-' || sequence_number,
  '9985',
  'recovery-operator-test-kommune',
  'Recovery Operator Test Kommune',
  'recovery-operator-test-' || sequence_number,
  'Recovery operator test ' || sequence_number,
  'Recoveryvej ' || sequence_number,
  '9985',
  'Testby',
  55.6761,
  12.5683,
  40,
  '210',
  'active'
from generate_series(1, 500) as sequence_number;

set local role service_role;

select is(
  app_v2.retry_latest_completed_datafordeler_publication_v1()->>'status',
  'published',
  'the service operator explicitly publishes a completely staged failed run'
);

reset role;

select is(
  (select status from app_v2.import_runs where id = '44000000-0000-0000-0000-000000000001'),
  'succeeded',
  'the explicit recovery marks the import run succeeded'
);

select is(
  (select publication_status from app_v2.import_runs where id = '44000000-0000-0000-0000-000000000001'),
  'published',
  'the explicit recovery records a published run'
);

select is(
  (
    select count(*)::integer
    from app_v2.import_shelter_candidates
    where import_run_id = '44000000-0000-0000-0000-000000000001'
  ),
  0,
  'the explicit recovery consumes the retained staging rows'
);

select is(
  (
    select count(*)::integer
    from app_v2.shelters
    where canonical_source_name = 'datafordeler-bbr-dar'
      and canonical_source_reference like 'recovery-reference-%'
      and publication_state = 'published'
  ),
  500,
  'the explicit recovery releases the complete candidate set'
);

select * from finish();

rollback;
