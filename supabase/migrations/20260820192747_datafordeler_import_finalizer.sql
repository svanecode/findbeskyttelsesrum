-- Keep the final source reconciliation and import-run completion in one
-- transaction. The importer may only call this for a fresh, uncapped scan.
create or replace function app_v2.finalize_datafordeler_import(
  p_import_run_id uuid,
  p_source_name text,
  p_seen_references text[],
  p_records_seen integer,
  p_records_upserted integer,
  p_pages_fetched integer,
  p_last_successful_cursor text,
  p_finished_at timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = app_v2, pg_temp
as $$
declare
  transitioned_count integer;
  current_active_count integer;
  required_seen_count integer;
begin
  if p_seen_references is null
    or p_records_seen < 1
    or p_records_upserted <> p_records_seen
    or cardinality(p_seen_references) <> p_records_seen
    or p_pages_fetched < 1
    or p_finished_at is null then
    raise exception 'Import completion references, counters or timestamp are invalid';
  end if;

  -- Lock the lifecycle row so two callers cannot finalize the same run.
  perform 1
  from app_v2.import_runs
  where id = p_import_run_id
    and source_name = p_source_name
    and status = 'running'
    and resumed_from_import_run_id is null
  for update;

  if not found then
    raise exception 'Import run is not an eligible fresh running import';
  end if;

  select count(*)::integer
  into current_active_count
  from app_v2.shelters
  where canonical_source_name = p_source_name
    and import_state = 'active';

  if current_active_count > 0 then
    required_seen_count := greatest(500, ceil(current_active_count * 0.80)::integer);
    if p_records_seen < required_seen_count then
      raise exception 'Full import coverage guard rejected % records; at least % required',
        p_records_seen, required_seen_count;
    end if;
  end if;

  update app_v2.shelters
  set
    import_state = 'missing_from_source',
    last_imported_at = p_finished_at
  where canonical_source_name = p_source_name
    and canonical_source_reference is not null
    and import_state = 'active'
    and not (canonical_source_reference = any(p_seen_references));

  get diagnostics transitioned_count = row_count;

  update app_v2.import_runs
  set
    status = 'succeeded',
    finished_at = p_finished_at,
    error_summary = null,
    records_seen = p_records_seen,
    records_upserted = p_records_upserted,
    pages_fetched = p_pages_fetched,
    last_successful_page = p_pages_fetched,
    last_successful_cursor = p_last_successful_cursor,
    missing_transitions_applied = true,
    missing_transitions_skipped_reason = null
  where id = p_import_run_id
    and status = 'running';

  if not found then
    raise exception 'Import run could not be completed';
  end if;

  return transitioned_count;
end;
$$;

revoke all on function app_v2.finalize_datafordeler_import(
  uuid, text, text[], integer, integer, integer, text, timestamptz
) from public, anon, authenticated;

grant execute on function app_v2.finalize_datafordeler_import(
  uuid, text, text[], integer, integer, integer, text, timestamptz
) to service_role;

comment on function app_v2.finalize_datafordeler_import(
  uuid, text, text[], integer, integer, integer, text, timestamptz
) is
'Atomically reconciles missing Datafordeler rows and completes an eligible full import. Service role only.';
