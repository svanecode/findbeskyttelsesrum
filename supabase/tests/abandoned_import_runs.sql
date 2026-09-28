begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into app_v2.import_runs (id, source_name, status, publication_status, started_at) values
  ('49000000-0000-0000-0000-000000000001', 'datafordeler-bbr-dar', 'running', 'staging', now() - interval '8 hours'),
  ('49000000-0000-0000-0000-000000000002', 'datafordeler-bbr-dar', 'running', 'staging', now() - interval '1 hour'),
  ('49000000-0000-0000-0000-000000000003', 'datafordeler-bbr-dar', 'running', 'staging', now() - interval '60 days');

set local role service_role;
select lives_ok('select app_v2.prune_datafordeler_import_candidates_v1()',
  'the importer can still run the pre-run cleanup');
reset role;

select is((select status from app_v2.import_runs where id = '49000000-0000-0000-0000-000000000001'),
  'failed', 'a run left running past the workflow timeout is marked failed');
select ok((select finished_at is not null and error_summary like 'Import run abandoned%'
  from app_v2.import_runs where id = '49000000-0000-0000-0000-000000000001'),
  'the abandoned run records when and why it was closed');
select is((select finished_at from app_v2.import_runs where id = '49000000-0000-0000-0000-000000000001'),
  (select started_at + interval '6 hours' from app_v2.import_runs where id = '49000000-0000-0000-0000-000000000001'),
  'the run is recorded as stopped when the workflow timeout would have ended it');
select ok((select finished_at < now() - interval '14 days' from app_v2.import_runs
  where id = '49000000-0000-0000-0000-000000000003'),
  'a months-old abandoned run stays outside the 14-day resume window');
select is((select status from app_v2.import_runs where id = '49000000-0000-0000-0000-000000000002'),
  'running', 'a run that may still be in progress is left alone');

select * from finish();
rollback;
