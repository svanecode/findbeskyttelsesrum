begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

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

select * from finish();

rollback;
