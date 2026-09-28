begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into app_v2.import_runs (id, source_name, status, publication_status, started_at) values
  ('49000000-0000-0000-0000-000000000001', 'datafordeler-bbr-dar', 'running', 'staging', now() - interval '8 hours'),
  ('49000000-0000-0000-0000-000000000002', 'datafordeler-bbr-dar', 'running', 'staging', now() - interval '1 hour');

set local role service_role;
select lives_ok('select app_v2.prune_datafordeler_import_candidates_v1()',
  'the importer can still run the pre-run cleanup');
reset role;

select is((select status from app_v2.import_runs where id = '49000000-0000-0000-0000-000000000001'),
  'failed', 'a run left running past the workflow timeout is marked failed');
select ok((select finished_at is not null and error_summary like 'Import run abandoned%'
  from app_v2.import_runs where id = '49000000-0000-0000-0000-000000000001'),
  'the abandoned run records when and why it was closed');
select is((select status from app_v2.import_runs where id = '49000000-0000-0000-0000-000000000002'),
  'running', 'a run that may still be in progress is left alone');

select * from finish();
rollback;
