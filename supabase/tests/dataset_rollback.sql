begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(not has_function_privilege('anon',
  'app_v2.rollback_dataset_publication_v1(uuid)', 'EXECUTE'),
  'anonymous callers cannot roll back a publication');
select ok((select proconfig @> array['statement_timeout=60s'] from pg_proc
  where oid = 'app_v2.rollback_dataset_publication_v1(uuid)'::regprocedure),
  'rollback has the same function-scoped timeout as the publisher');

-- Two complete imports of the same registrations; the newer one changes capacity.
-- Their snapshots are newer than any publication already in the database.
insert into app_v2.import_runs (
  id, source_name, status, publication_status, snapshot_at, source_scan_complete,
  records_seen, records_upserted, pages_fetched, last_successful_page, last_successful_cursor,
  bbr_fetched_count, bbr_eligible_count, dar_linked_count
) values
  ('48000000-0000-0000-0000-000000000001', 'datafordeler-bbr-dar', 'failed', 'staging',
   now() + interval '1 minute', true, 500, 500, 1, 1, 'done', 500, 500, 500),
  ('48000000-0000-0000-0000-000000000002', 'datafordeler-bbr-dar', 'failed', 'staging',
   now() + interval '2 minutes', true, 500, 500, 1, 1, 'done', 500, 500, 500);

insert into app_v2.import_shelter_candidates (
  import_run_id, source_name, canonical_source_reference,
  municipality_code, municipality_slug, municipality_name,
  slug, name, address_line1, postal_code, city, latitude, longitude,
  capacity, source_application_code, status
)
select run.id, 'datafordeler-bbr-dar', 'rollback-ref-' || number,
  '9982', 'rollback-test', 'Rollback Test', 'rollback-' || number,
  'Rollback ' || number, 'Rollbackvej ' || number, '9982', 'Test', 55.6761, 12.5683,
  case when run.id = '48000000-0000-0000-0000-000000000001' then 40 else 60 end,
  '210', 'active'
from app_v2.import_runs run cross join generate_series(1, 500) number
where run.id in ('48000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000002');

set local role service_role;
select is(app_v2.retry_completed_datafordeler_publication_v1(
  '48000000-0000-0000-0000-000000000001')->>'status', 'published',
  'the older import publishes');
select is(app_v2.retry_completed_datafordeler_publication_v1(
  '48000000-0000-0000-0000-000000000002')->>'status', 'published',
  'the newer import replaces it');
reset role;

create temp table rollback_fixture as
select
  (select id from app_v2.dataset_publications
   where import_run_id = '48000000-0000-0000-0000-000000000001') as target_id,
  (select id from app_v2.dataset_publications where is_current) as newer_id,
  (select revision from app_v2.public_data_revisions where scope = 'public') as revision_before;
grant select on rollback_fixture to authenticated;

select is((select sum(capacity)::integer from app_v2.shelters
  where canonical_source_reference like 'rollback-ref-%'), 30000,
  'the newer import is live before rollback');

insert into auth.users (id, aud, role, email) values
  ('95000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rollback-owner@example.invalid'),
  ('95000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rollback-moderator@example.invalid');
insert into app_v2.moderator_accounts (auth_user_id, provider, provider_subject, provider_login, role) values
  ('95000000-0000-4000-8000-000000000001', 'github', 'rollback-owner', 'rollback-owner', 'owner'),
  ('95000000-0000-4000-8000-000000000002', 'github', 'rollback-moderator', 'rollback-moderator', 'moderator');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  format('select app_v2.rollback_dataset_publication_v1(%L)', (select target_id from rollback_fixture)),
  '42501', 'owner access denied', 'a non-owner moderator cannot roll back');

select set_config('request.jwt.claims',
  '{"sub":"95000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
create temp table rollback_result as
select app_v2.rollback_dataset_publication_v1(target_id) as publication_id from rollback_fixture;
reset role;

select is((select sum(capacity)::integer from app_v2.shelters
  where canonical_source_reference like 'rollback-ref-%'), 20000,
  'rollback restores the older snapshot');
select is((select id from app_v2.dataset_publications where is_current),
  (select publication_id from rollback_result),
  'the rollback publication becomes current');
select is((select rollback_of_publication_id from app_v2.dataset_publications
  where id = (select publication_id from rollback_result)),
  (select target_id from rollback_fixture),
  'the ledger records which publication was restored');
select is((select count(*)::integer from app_v2.dataset_publication_shelters
  where publication_id = (select publication_id from rollback_result)), 500,
  'the rollback publication keeps its own snapshot');
select is((select revision from app_v2.public_data_revisions where scope = 'public'),
  (select revision_before + 1 from rollback_fixture),
  'public caches are refreshed exactly once for the whole rollback');
select is(current_setting('app_v2.quality_gate_passed', true), 'false',
  'rollback clears the importer deferral flag before returning');

select * from finish();
rollback;
