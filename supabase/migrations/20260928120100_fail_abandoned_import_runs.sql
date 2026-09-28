-- An importer killed without a chance to clean up (runner loss, or the
-- workflow's 360-minute timeout escalating to SIGKILL) left its run
-- 'running' forever. Such a run blocked resume and showed as running in
-- /admin/drift indefinitely. The workflow's concurrency group allows only one
-- import at a time and caps it at six hours, so a run still 'running' after
-- seven hours has been abandoned. Mark it failed before the next run starts.
-- finished_at records when the workflow would have stopped it (started_at plus
-- six hours), not now: resume only considers runs that finished in the last
-- 14 days, so a recently lost run becomes resumable while months-old ones do
-- not, and their staging rows are pruned below.
create or replace function app_v2.prune_datafordeler_import_candidates_v1()
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  removed_count integer;
begin
  update app_v2.import_runs run
  set
    status = 'failed',
    finished_at = least(timezone('utc', now()), run.started_at + interval '6 hours'),
    error_summary = 'Import run abandoned without finishing (runner lost or timed out)'
  where run.source_name = 'datafordeler-bbr-dar'
    and run.status = 'running'
    and run.started_at < timezone('utc', now()) - interval '7 hours';

  delete from app_v2.import_shelter_candidates candidate
  using app_v2.import_runs run
  where run.id = candidate.import_run_id
    and run.status = 'failed'
    and run.finished_at < timezone('utc', now()) - interval '14 days';

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

revoke all on function app_v2.prune_datafordeler_import_candidates_v1()
from public, anon, authenticated;
grant execute on function app_v2.prune_datafordeler_import_candidates_v1()
to service_role;

comment on function app_v2.prune_datafordeler_import_candidates_v1() is
'Marks import runs abandoned for more than seven hours as failed, then deletes staging rows of failed runs older than 14 days.';
