-- Replaces the cleanup from 20260928120100 without editing that migration, so
-- environments that already recorded its version still receive the change.
--
-- Production had nine import runs stuck as 'running' since March. Setting
-- their finished_at to now would put them inside the importer's 14-day resume
-- window, so a manual --resume-latest could pick a months-old checkpoint whose
-- publication is then rejected as older than the current dataset. Record when
-- the workflow timeout would have stopped the run (started_at plus six hours)
-- instead: a recently lost run stays resumable, old ones do not, and their
-- staging rows are pruned in the same call.
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
