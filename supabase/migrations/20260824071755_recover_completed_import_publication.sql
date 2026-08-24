-- A source traversal can finish successfully and then fail while the atomic
-- publisher is running. Record that boundary explicitly so operations can
-- retry publication without re-reading BBR/DAR or guessing from a cursor.
alter table app_v2.import_runs
add column if not exists source_scan_complete boolean not null default false;

-- The pre-column incident can be classified safely: the importer only emits
-- this error after an uncapped traversal reported hasNextPage=false, and the
-- retained candidate count must match both persisted counters.
update app_v2.import_runs run
set source_scan_complete = true
where run.source_name = 'datafordeler-bbr-dar'
  and run.status = 'failed'
  and run.publication_status = 'staging'
  and run.quality_gate_passed is null
  and run.error_summary like
    'Supabase validate and atomically publish full import returned HTTP %'
  and run.records_seen > 0
  and run.records_upserted = run.records_seen
  and run.pages_fetched > 0
  and run.last_successful_page = run.pages_fetched
  and (
    select count(*)
    from app_v2.import_shelter_candidates candidate
    where candidate.import_run_id = run.id
  ) = run.records_seen;

create or replace function app_v2.retry_latest_completed_datafordeler_publication_v1()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  failed_run app_v2.import_runs%rowtype;
  publication_result jsonb;
begin
  select run.*
  into failed_run
  from app_v2.import_runs run
  where run.source_name = 'datafordeler-bbr-dar'
    and run.status = 'failed'
    and run.publication_status = 'staging'
    and run.quality_gate_passed is null
    and run.source_scan_complete = true
    and run.records_seen > 0
    and run.records_upserted = run.records_seen
    and run.pages_fetched > 0
    and run.last_successful_page = run.pages_fetched
    and exists (
      select 1
      from app_v2.import_shelter_candidates candidate
      where candidate.import_run_id = run.id
    )
    and (
      select count(*)
      from app_v2.import_shelter_candidates candidate
      where candidate.import_run_id = run.id
    ) = run.records_seen
  order by run.started_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('status', 'no_candidate');
  end if;

  update app_v2.import_runs run
  set
    status = 'running',
    finished_at = null,
    error_summary = null
  where run.id = failed_run.id;

  publication_result := app_v2.publish_datafordeler_import_v3(
    failed_run.id,
    failed_run.source_name,
    failed_run.records_seen,
    failed_run.records_upserted,
    failed_run.pages_fetched,
    failed_run.last_successful_cursor,
    timezone('utc', now()),
    failed_run.bbr_fetched_count,
    failed_run.bbr_eligible_count,
    failed_run.dar_linked_count,
    failed_run.dar_missing_count,
    failed_run.mapping_failure_count,
    failed_run.warning_count
  );

  return publication_result || jsonb_build_object(
    'recoveredImportRunId', failed_run.id
  );
end;
$$;

revoke all on function app_v2.retry_latest_completed_datafordeler_publication_v1()
from public, anon, authenticated;
grant execute on function app_v2.retry_latest_completed_datafordeler_publication_v1()
to service_role;

comment on column app_v2.import_runs.source_scan_complete is
'True only after an uncapped source traversal has durably checkpointed the final BBR page.';
comment on function app_v2.retry_latest_completed_datafordeler_publication_v1() is
'Service-only recovery for a fully staged import that failed after source traversal and before atomic publication committed.';

-- Recover an eligible retained incident as part of this migration. Fresh
-- databases and installations without such an incident return no_candidate.
select app_v2.retry_latest_completed_datafordeler_publication_v1();
