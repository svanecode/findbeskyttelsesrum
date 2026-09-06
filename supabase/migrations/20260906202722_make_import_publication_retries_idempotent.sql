-- Persist the source snapshot once, including across resumed runs. Publication
-- chronology must use source time rather than the time a recovery was clicked.
alter table app_v2.import_runs add column snapshot_at timestamptz;

with recursive lineage as (
  select run.id, run.started_at, run.resumed_from_import_run_id, array[run.id] as visited
  from app_v2.import_runs run
  union all
  select lineage.id, parent.started_at, parent.resumed_from_import_run_id,
    lineage.visited || parent.id
  from lineage
  join app_v2.import_runs parent on parent.id = lineage.resumed_from_import_run_id
  where not parent.id = any(lineage.visited)
), snapshots as (
  select id, min(started_at) as snapshot_at from lineage group by id
)
update app_v2.import_runs run
set snapshot_at = snapshots.snapshot_at
from snapshots where snapshots.id = run.id;

alter table app_v2.import_runs
alter column snapshot_at set default now(),
alter column snapshot_at set not null;

create function app_v2.preserve_import_snapshot_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.snapshot_at is distinct from old.snapshot_at then
    raise exception 'An import source snapshot cannot change';
  end if;
  if tg_op = 'INSERT' and new.resumed_from_import_run_id is not null then
    select parent.snapshot_at into new.snapshot_at
    from app_v2.import_runs parent where parent.id = new.resumed_from_import_run_id;
    if not found then
      raise exception 'Import resume parent was not found';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_v2.preserve_import_snapshot_v1() from public, anon, authenticated;
grant execute on function app_v2.preserve_import_snapshot_v1() to service_role;

create trigger app_v2_preserve_import_snapshot
before insert or update of snapshot_at on app_v2.import_runs
for each row execute function app_v2.preserve_import_snapshot_v1();

-- Keep the validated publisher private and put retry reconciliation before
-- its running-state guard. A repeated run ID returns its original result;
-- it never republishes or changes the current dataset.
alter function app_v2.publish_datafordeler_import_v3(
  uuid, text, integer, integer, integer, text, timestamptz,
  integer, integer, integer, integer, integer, integer
) rename to publish_datafordeler_import_internal_v3;

revoke all on function app_v2.publish_datafordeler_import_internal_v3(
  uuid, text, integer, integer, integer, text, timestamptz,
  integer, integer, integer, integer, integer, integer
) from public, anon, authenticated, service_role;

create function app_v2.publish_datafordeler_import_v3(
  p_import_run_id uuid,
  p_source_name text,
  p_records_seen integer,
  p_records_staged integer,
  p_pages_fetched integer,
  p_last_successful_cursor text,
  p_finished_at timestamptz,
  p_bbr_fetched_count integer,
  p_bbr_eligible_count integer,
  p_dar_linked_count integer,
  p_dar_missing_count integer,
  p_mapping_failure_count integer,
  p_warning_count integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  selected_run app_v2.import_runs%rowtype;
  current_snapshot_at timestamptz;
  rejection_reason text := 'Kildens tidspunkt er ældre end det senest publicerede datasæt.';
  rejection_metrics jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('app_v2:datafordeler-publication', 0));

  select run.* into selected_run from app_v2.import_runs run
  where run.id = p_import_run_id and run.source_name = p_source_name
    and run.source_name = 'datafordeler-bbr-dar'
  for update;

  if not found then
    raise exception 'Import run is not eligible for publication';
  end if;

  if selected_run.status = 'succeeded' and selected_run.publication_status = 'published'
    and selected_run.publication_id is not null then
    return jsonb_build_object(
      'status', 'published',
      'publicationId', selected_run.publication_id,
      'qualityGatePassed', true,
      'qualityGateReasons', to_jsonb(selected_run.quality_gate_reasons),
      'qualityMetrics', selected_run.quality_metrics
    );
  end if;

  if selected_run.status = 'failed' and selected_run.publication_status = 'rejected' then
    return jsonb_build_object(
      'status', 'rejected',
      'qualityGatePassed', false,
      'qualityGateReasons', to_jsonb(selected_run.quality_gate_reasons),
      'qualityMetrics', selected_run.quality_metrics
    );
  end if;

  if selected_run.status <> 'running' or selected_run.publication_status <> 'staging' then
    raise exception 'Import run is not eligible for publication';
  end if;

  -- An owner rollback has no import_run_id: its publication time becomes the
  -- barrier so an already-running import cannot silently undo that decision.
  select coalesce(published_run.snapshot_at, publication.published_at)
  into current_snapshot_at
  from app_v2.dataset_publications publication
  left join app_v2.import_runs published_run on published_run.id = publication.import_run_id
  where publication.source_name = p_source_name and publication.is_current;

  if selected_run.snapshot_at < current_snapshot_at then
    rejection_metrics := jsonb_build_object(
      'snapshotAt', selected_run.snapshot_at, 'currentSnapshotAt', current_snapshot_at
    );
    update app_v2.import_runs run set
      status = 'failed', publication_status = 'rejected', finished_at = now(),
      error_summary = 'Publication rejected: source snapshot predates the current dataset',
      quality_gate_passed = false, quality_gate_reasons = array[rejection_reason],
      quality_metrics = rejection_metrics, missing_transitions_applied = false,
      missing_transitions_skipped_reason = 'publication rejected by snapshot chronology gate'
    where run.id = selected_run.id;
    delete from app_v2.import_shelter_candidates where import_run_id = selected_run.id;
    return jsonb_build_object(
      'status', 'rejected', 'qualityGatePassed', false,
      'qualityGateReasons', jsonb_build_array(rejection_reason),
      'qualityMetrics', rejection_metrics
    );
  end if;

  return app_v2.publish_datafordeler_import_internal_v3(
    p_import_run_id, p_source_name, p_records_seen, p_records_staged,
    p_pages_fetched, p_last_successful_cursor, p_finished_at,
    p_bbr_fetched_count, p_bbr_eligible_count, p_dar_linked_count,
    p_dar_missing_count, p_mapping_failure_count, p_warning_count
  );
end;
$$;

revoke all on function app_v2.publish_datafordeler_import_v3(
  uuid, text, integer, integer, integer, text, timestamptz,
  integer, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function app_v2.publish_datafordeler_import_v3(
  uuid, text, integer, integer, integer, text, timestamptz,
  integer, integer, integer, integer, integer, integer
) to service_role;

-- Selection is read-only and separate from recovery. The caller keeps this ID
-- for every retry, even if another eligible failed run remains in the queue.
create function app_v2.get_latest_completed_datafordeler_import_v1()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select run.id from app_v2.import_runs run
  where run.source_name = 'datafordeler-bbr-dar'
    and run.status = 'failed' and run.publication_status = 'staging'
    and run.quality_gate_passed is null and run.source_scan_complete
    and run.records_seen > 0 and run.records_upserted = run.records_seen
    and run.pages_fetched > 0 and run.last_successful_page = run.pages_fetched
    and (select count(*) from app_v2.import_shelter_candidates candidate
         where candidate.import_run_id = run.id) = run.records_seen
  order by run.snapshot_at desc, run.started_at desc, run.id
  limit 1;
$$;

create function app_v2.retry_completed_datafordeler_publication_v1(p_import_run_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  selected_run app_v2.import_runs%rowtype;
  publication_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('app_v2:datafordeler-publication', 0));
  select run.* into selected_run from app_v2.import_runs run
  where run.id = p_import_run_id and run.source_name = 'datafordeler-bbr-dar'
  for update;

  if not found then
    raise exception 'Completed import run was not found';
  end if;

  if selected_run.publication_status not in ('published', 'rejected') then
    if selected_run.status <> 'failed' or selected_run.publication_status <> 'staging'
      or selected_run.quality_gate_passed is not null or not selected_run.source_scan_complete
      or selected_run.records_seen < 1 or selected_run.records_upserted <> selected_run.records_seen
      or selected_run.pages_fetched < 1
      or selected_run.last_successful_page is distinct from selected_run.pages_fetched
      or (select count(*) from app_v2.import_shelter_candidates candidate
          where candidate.import_run_id = selected_run.id) <> selected_run.records_seen then
      raise exception 'Import run is not an eligible completed staging run';
    end if;
    update app_v2.import_runs set status = 'running', finished_at = null, error_summary = null
    where id = selected_run.id;
  end if;

  publication_result := app_v2.publish_datafordeler_import_v3(
    selected_run.id, selected_run.source_name,
    selected_run.records_seen, selected_run.records_upserted, selected_run.pages_fetched,
    selected_run.last_successful_cursor, now(),
    selected_run.bbr_fetched_count, selected_run.bbr_eligible_count, selected_run.dar_linked_count,
    selected_run.dar_missing_count, selected_run.mapping_failure_count, selected_run.warning_count
  );
  return publication_result || jsonb_build_object('recoveredImportRunId', selected_run.id);
end;
$$;

revoke all on function app_v2.get_latest_completed_datafordeler_import_v1()
from public, anon, authenticated;
grant execute on function app_v2.get_latest_completed_datafordeler_import_v1() to service_role;
revoke all on function app_v2.retry_completed_datafordeler_publication_v1(uuid)
from public, anon, authenticated;
grant execute on function app_v2.retry_completed_datafordeler_publication_v1(uuid) to service_role;

-- Retire the unsafe selector-and-mutator API. A lost response to this API
-- could cause the retry to publish a second, different source snapshot.
create or replace function app_v2.retry_latest_completed_datafordeler_publication_v1()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Recovery requires an explicit import run ID; use retry_completed_datafordeler_publication_v1';
end;
$$;
revoke all on function app_v2.retry_latest_completed_datafordeler_publication_v1()
from public, anon, authenticated, service_role;

comment on column app_v2.import_runs.snapshot_at is
'Immutable BBR/DAR source timestamp, inherited by resumed runs and checked against the current publication.';
comment on function app_v2.retry_completed_datafordeler_publication_v1(uuid) is
'Idempotent service-only recovery of one explicitly selected completed import run. Retries never select another run.';
