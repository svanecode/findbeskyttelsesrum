begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select ok(not has_function_privilege('service_role',
  'app_v2.publish_datafordeler_import_internal_v3(uuid,text,integer,integer,integer,text,timestamptz,integer,integer,integer,integer,integer,integer)',
  'EXECUTE'), 'the importer cannot bypass retry and chronology guards');
select ok(not has_function_privilege('service_role',
  'app_v2.retry_latest_completed_datafordeler_publication_v1()', 'EXECUTE'),
  'the unsafe selector-and-mutator recovery API is retired');
select ok(not has_function_privilege('anon',
  'app_v2.retry_completed_datafordeler_publication_v1(uuid)', 'EXECUTE'),
  'anonymous callers cannot recover an import');
select ok(not has_function_privilege('authenticated',
  'app_v2.get_latest_completed_datafordeler_import_v1()', 'EXECUTE'),
  'signed-in callers cannot inspect recovery candidates');

insert into app_v2.import_runs (
  id, source_name, status, publication_status, snapshot_at, source_scan_complete,
  records_seen, records_upserted, pages_fetched, last_successful_page, last_successful_cursor,
  bbr_fetched_count, bbr_eligible_count, dar_linked_count
) values
  ('47000000-0000-0000-0000-000000000001', 'datafordeler-bbr-dar', 'failed', 'staging',
   now() - interval '2 hours', true, 500, 500, 1, 1, 'done', 500, 500, 500),
  ('47000000-0000-0000-0000-000000000002', 'datafordeler-bbr-dar', 'failed', 'staging',
   now(), true, 500, 500, 1, 1, 'done', 500, 500, 500);

insert into app_v2.import_shelter_candidates (
  import_run_id, source_name, canonical_source_reference,
  municipality_code, municipality_slug, municipality_name,
  slug, name, address_line1, postal_code, city, latitude, longitude,
  capacity, source_application_code, status
)
select run.id, 'datafordeler-bbr-dar', 'retry-ref-' || number,
  '9983', 'retry-test', 'Retry Test', 'retry-' || number,
  'Retry ' || number, 'Retryvej ' || number, '9983', 'Test', 55.6761, 12.5683,
  40, '210', 'active'
from app_v2.import_runs run cross join generate_series(1, 500) number
where run.id in ('47000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000002');

select throws_ok($sql$
  update app_v2.import_runs set snapshot_at = now()
  where id = '47000000-0000-0000-0000-000000000001'
$sql$, 'P0001', 'An import source snapshot cannot change',
  'an existing snapshot cannot be advanced to bypass the chronology gate');

set local role service_role;
select is(app_v2.get_latest_completed_datafordeler_import_v1(),
  '47000000-0000-0000-0000-000000000002'::uuid,
  'selection identifies the newest completed source snapshot without publishing');
select is(app_v2.retry_completed_datafordeler_publication_v1(
  '47000000-0000-0000-0000-000000000002')->>'status', 'published',
  'the explicitly selected complete import publishes successfully');
select is((select count(*)::integer from app_v2.dataset_publications
  where import_run_id = '47000000-0000-0000-0000-000000000002'), 1,
  'the import creates exactly one publication');

select is(app_v2.publish_datafordeler_import_v3(
  '47000000-0000-0000-0000-000000000002', 'datafordeler-bbr-dar',
  500, 500, 1, 'done', now(), 500, 500, 500, 0, 0, 0)->>'publicationId',
  (select publication_id::text from app_v2.import_runs
   where id = '47000000-0000-0000-0000-000000000002'),
  'replaying the publisher returns the original committed publication');
select is(app_v2.retry_completed_datafordeler_publication_v1(
  '47000000-0000-0000-0000-000000000002')->>'publicationId',
  (select publication_id::text from app_v2.import_runs
   where id = '47000000-0000-0000-0000-000000000002'),
  'replaying recovery remains bound to the original import');
select is((select count(*)::integer from app_v2.import_shelter_candidates
  where import_run_id = '47000000-0000-0000-0000-000000000001'), 500,
  'replaying recovery does not consume the next older candidate set');

-- A newly started continuation still represents its parent's older source
-- snapshot. Starting a new run must not bypass the chronology guard.
insert into app_v2.import_runs (
  id, source_name, status, publication_status, resumed_from_import_run_id
) values ('47000000-0000-0000-0000-000000000003', 'datafordeler-bbr-dar',
  'running', 'staging', '47000000-0000-0000-0000-000000000001');
select is((select snapshot_at from app_v2.import_runs
  where id = '47000000-0000-0000-0000-000000000003'), now() - interval '2 hours',
  'a continuation inherits its original source snapshot');
select is(app_v2.publish_datafordeler_import_v3(
  '47000000-0000-0000-0000-000000000003', 'datafordeler-bbr-dar',
  500, 500, 1, 'done', now(), 500, 500, 500, 0, 0, 0)->>'status', 'rejected',
  'a newly started continuation cannot replace a newer source snapshot');

select is(app_v2.retry_completed_datafordeler_publication_v1(
  '47000000-0000-0000-0000-000000000001')->>'status', 'rejected',
  'explicit recovery rejects an older source snapshot despite valid coverage');
select is((select import_run_id from app_v2.dataset_publications where is_current),
  '47000000-0000-0000-0000-000000000002'::uuid,
  'rejected old recovery preserves the current publication');
select is((select count(*)::integer from app_v2.import_shelter_candidates
  where import_run_id = '47000000-0000-0000-0000-000000000001'), 0,
  'chronology rejection removes the non-resumable stale staging rows');
select is(app_v2.retry_completed_datafordeler_publication_v1(
  '47000000-0000-0000-0000-000000000001')->>'status', 'rejected',
  'replaying a rejected recovery returns its original result');

reset role;
select * from finish();
rollback;
