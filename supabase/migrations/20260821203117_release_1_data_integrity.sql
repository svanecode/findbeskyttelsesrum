-- Release 1 closes the remaining fail-open publication and import-quality
-- paths. Every new source row starts withheld, address overrides are limited
-- to capacity until geocoding can update address/coordinates/municipality as
-- one unit, and publication v3 validates BBR-to-DAR mapping coverage.

alter table app_v2.shelters
alter column publication_state set default 'withheld';

alter table app_v2.import_runs
add column if not exists bbr_fetched_count integer not null default 0,
add column if not exists bbr_eligible_count integer not null default 0,
add column if not exists dar_linked_count integer not null default 0,
add column if not exists dar_missing_count integer not null default 0,
add column if not exists mapping_failure_count integer not null default 0,
add column if not exists warning_count integer not null default 0,
add column if not exists mapping_ratio numeric(7, 6)
  generated always as (
    case
      when bbr_eligible_count = 0 then 0::numeric
      else round(dar_linked_count::numeric / bbr_eligible_count, 6)
    end
  ) stored;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_v2_import_runs_source_counters_check'
      and conrelid = 'app_v2.import_runs'::regclass
  ) then
    alter table app_v2.import_runs
    add constraint app_v2_import_runs_source_counters_check check (
      bbr_fetched_count >= 0
      and bbr_eligible_count >= 0
      and dar_linked_count >= 0
      and dar_missing_count >= 0
      and mapping_failure_count >= 0
      and warning_count >= 0
      and bbr_fetched_count >= bbr_eligible_count
      and bbr_eligible_count >= dar_linked_count + dar_missing_count + mapping_failure_count
      and warning_count >= dar_missing_count + mapping_failure_count
    );
  end if;
end;
$$;

-- Until DAWA validation can update the whole location tuple atomically,
-- active editorial overrides may only change non-location fields.
do $$
begin
  if exists (
    select 1
    from app_v2.shelter_overrides
    where is_active = true
      and (address_line1 is not null or postal_code is not null or city is not null)
  ) then
    raise exception 'Active address overrides must be resolved before enabling capacity-only moderation';
  end if;
end;
$$;

create or replace function app_v2.enforce_capacity_only_shelter_override_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if new.is_active then
    new.address_line1 := null;
    new.postal_code := null;
    new.city := null;
  end if;
  return new;
end;
$$;

revoke all on function app_v2.enforce_capacity_only_shelter_override_v1()
from public, anon, authenticated;
grant execute on function app_v2.enforce_capacity_only_shelter_override_v1()
to service_role;

drop trigger if exists app_v2_enforce_capacity_only_shelter_override
on app_v2.shelter_overrides;
create trigger app_v2_enforce_capacity_only_shelter_override
before insert or update on app_v2.shelter_overrides
for each row execute function app_v2.enforce_capacity_only_shelter_override_v1();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_v2_shelter_overrides_active_location_check'
      and conrelid = 'app_v2.shelter_overrides'::regclass
  ) then
    alter table app_v2.shelter_overrides
    add constraint app_v2_shelter_overrides_active_location_check check (
      not is_active
      or (address_line1 is null and postal_code is null and city is null)
    );
  end if;
end;
$$;

-- A passed v3 quality gate sets a transaction-local flag. Only inserts made
-- by that publisher are promoted from the fail-closed default. Conflict
-- updates deliberately leave an existing withheld decision unchanged.
create or replace function app_v2.set_import_publication_state_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if new.publication_state = 'withheld'
    and new.canonical_source_name = 'datafordeler-bbr-dar'
    and current_setting('app_v2.quality_gate_passed', true) = 'true' then
    new.publication_state := 'published';
  end if;
  return new;
end;
$$;

revoke all on function app_v2.set_import_publication_state_v1()
from public, anon, authenticated;
grant execute on function app_v2.set_import_publication_state_v1()
to service_role;

drop trigger if exists app_v2_set_import_publication_state
on app_v2.shelters;
create trigger app_v2_set_import_publication_state
before insert on app_v2.shelters
for each row execute function app_v2.set_import_publication_state_v1();

-- Keep the proven atomic publisher as a private implementation. Direct v2
-- calls are rejected so an older importer cannot bypass the mapping gate.
do $$
begin
  if to_regprocedure(
    'app_v2.publish_datafordeler_import_internal_v2(uuid,text,integer,integer,integer,text,timestamptz)'
  ) is null then
    alter function app_v2.publish_datafordeler_import_v2(
      uuid, text, integer, integer, integer, text, timestamptz
    ) rename to publish_datafordeler_import_internal_v2;
  end if;
end;
$$;

revoke all on function app_v2.publish_datafordeler_import_internal_v2(
  uuid, text, integer, integer, integer, text, timestamptz
) from public, anon, authenticated, service_role;

create or replace function app_v2.publish_datafordeler_import_v2(
  p_import_run_id uuid,
  p_source_name text,
  p_records_seen integer,
  p_records_staged integer,
  p_pages_fetched integer,
  p_last_successful_cursor text,
  p_finished_at timestamptz
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  raise exception 'Importer publication v2 is retired; use mapping-gated publication v3';
end;
$$;

revoke all on function app_v2.publish_datafordeler_import_v2(
  uuid, text, integer, integer, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function app_v2.publish_datafordeler_import_v2(
  uuid, text, integer, integer, integer, text, timestamptz
) to service_role;

create or replace function app_v2.publish_datafordeler_import_v3(
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
as $$
declare
  current_publication app_v2.dataset_publications%rowtype;
  mapping_ratio numeric;
  previous_mapping_ratio numeric;
  minimum_mapping_ratio numeric := 0.98;
  mapping_reasons text[] := '{}'::text[];
  mapping_metrics jsonb;
  base_result jsonb;
  merged_metrics jsonb;
  published_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('app_v2:datafordeler-publication', 0));

  if p_source_name <> 'datafordeler-bbr-dar'
    or p_records_seen < 1
    or p_records_staged <> p_records_seen
    or p_pages_fetched < 1
    or p_finished_at is null
    or p_bbr_fetched_count < 1
    or p_bbr_eligible_count < 1
    or p_dar_linked_count < 1
    or p_dar_missing_count < 0
    or p_mapping_failure_count < 0
    or p_warning_count < 0
    or p_bbr_fetched_count < p_bbr_eligible_count
    or p_dar_linked_count <> p_records_seen
    or p_bbr_eligible_count <> p_dar_linked_count + p_dar_missing_count + p_mapping_failure_count
    or p_warning_count <> p_dar_missing_count + p_mapping_failure_count then
    raise exception 'BBR/DAR publication counters are invalid';
  end if;

  perform 1
  from app_v2.import_runs run
  where run.id = p_import_run_id
    and run.source_name = p_source_name
    and run.status = 'running'
    and run.publication_status = 'staging'
  for update;

  if not found then
    raise exception 'Import run is not eligible for mapping-gated publication';
  end if;

  select publication.*
  into current_publication
  from app_v2.dataset_publications publication
  where publication.source_name = p_source_name
    and publication.is_current = true
  for update;

  mapping_ratio := round(p_dar_linked_count::numeric / p_bbr_eligible_count, 6);
  if coalesce(current_publication.quality_metrics->>'mappingRatio', '')
      ~ '^[0-9]+([.][0-9]+)?$' then
    previous_mapping_ratio := (current_publication.quality_metrics->>'mappingRatio')::numeric;
    minimum_mapping_ratio := greatest(0.98, previous_mapping_ratio - 0.01);
  end if;

  if mapping_ratio < minimum_mapping_ratio then
    mapping_reasons := array_append(
      mapping_reasons,
      format(
        'Kun %s procent af relevante BBR-poster blev koblet til DAR; minimum er %s procent.',
        round(mapping_ratio * 100, 2),
        round(minimum_mapping_ratio * 100, 2)
      )
    );
  end if;

  mapping_metrics := jsonb_build_object(
    'bbrFetchedCount', p_bbr_fetched_count,
    'bbrEligibleCount', p_bbr_eligible_count,
    'darLinkedCount', p_dar_linked_count,
    'darMissingCount', p_dar_missing_count,
    'mappingFailureCount', p_mapping_failure_count,
    'warningCount', p_warning_count,
    'mappingRatio', mapping_ratio,
    'previousMappingRatio', previous_mapping_ratio,
    'minimumMappingRatio', minimum_mapping_ratio
  );

  if cardinality(mapping_reasons) > 0 then
    update app_v2.import_runs run
    set
      status = 'failed',
      publication_status = 'rejected',
      finished_at = p_finished_at,
      error_summary = 'BBR/DAR mapping quality gate rejected publication',
      records_seen = p_records_seen,
      records_upserted = p_records_staged,
      pages_fetched = p_pages_fetched,
      last_successful_page = p_pages_fetched,
      last_successful_cursor = p_last_successful_cursor,
      missing_transitions_applied = false,
      missing_transitions_skipped_reason = 'publication rejected by BBR/DAR mapping gate',
      quality_gate_passed = false,
      quality_gate_reasons = mapping_reasons,
      quality_metrics = mapping_metrics,
      bbr_fetched_count = p_bbr_fetched_count,
      bbr_eligible_count = p_bbr_eligible_count,
      dar_linked_count = p_dar_linked_count,
      dar_missing_count = p_dar_missing_count,
      mapping_failure_count = p_mapping_failure_count,
      warning_count = p_warning_count
    where run.id = p_import_run_id;

    delete from app_v2.import_shelter_candidates candidate
    where candidate.import_run_id = p_import_run_id;

    return jsonb_build_object(
      'status', 'rejected',
      'qualityGatePassed', false,
      'qualityGateReasons', to_jsonb(mapping_reasons),
      'qualityMetrics', mapping_metrics
    );
  end if;

  perform set_config('app_v2.quality_gate_passed', 'true', true);
  base_result := app_v2.publish_datafordeler_import_internal_v2(
    p_import_run_id,
    p_source_name,
    p_records_seen,
    p_records_staged,
    p_pages_fetched,
    p_last_successful_cursor,
    p_finished_at
  );
  perform set_config('app_v2.quality_gate_passed', 'false', true);

  merged_metrics := coalesce(base_result->'qualityMetrics', '{}'::jsonb) || mapping_metrics;

  update app_v2.import_runs run
  set
    quality_metrics = merged_metrics,
    bbr_fetched_count = p_bbr_fetched_count,
    bbr_eligible_count = p_bbr_eligible_count,
    dar_linked_count = p_dar_linked_count,
    dar_missing_count = p_dar_missing_count,
    mapping_failure_count = p_mapping_failure_count,
    warning_count = p_warning_count
  where run.id = p_import_run_id;

  if base_result->>'status' = 'published' then
    published_id := (base_result->>'publicationId')::uuid;
    update app_v2.dataset_publications publication
    set quality_metrics = publication.quality_metrics || mapping_metrics
    where publication.id = published_id;
  end if;

  return jsonb_set(base_result, '{qualityMetrics}', merged_metrics, true);
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

-- Resume can only copy a real technical staging checkpoint. A quality-rejected
-- run has no candidate rows and is never a valid parent.
create or replace function app_v2.copy_datafordeler_import_candidates_v1(
  p_from_import_run_id uuid,
  p_to_import_run_id uuid
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  copied_count integer;
begin
  if not exists (
    select 1
    from app_v2.import_runs child
    join app_v2.import_runs parent on parent.id = p_from_import_run_id
    where child.id = p_to_import_run_id
      and child.resumed_from_import_run_id = parent.id
      and child.source_name = parent.source_name
      and child.status = 'running'
      and child.publication_status = 'staging'
      and parent.status = 'failed'
      and parent.publication_status = 'staging'
      and parent.quality_gate_passed is null
      and exists (
        select 1
        from app_v2.import_shelter_candidates candidate
        where candidate.import_run_id = parent.id
      )
  ) then
    raise exception 'Import resume relationship is not a resumable technical staging run';
  end if;

  insert into app_v2.import_shelter_candidates (
    import_run_id,
    source_name,
    canonical_source_reference,
    municipality_code,
    municipality_slug,
    municipality_name,
    municipality_region_name,
    slug,
    name,
    address_line1,
    postal_code,
    city,
    latitude,
    longitude,
    capacity,
    source_application_code,
    status,
    staged_at
  )
  select
    p_to_import_run_id,
    candidate.source_name,
    candidate.canonical_source_reference,
    candidate.municipality_code,
    candidate.municipality_slug,
    candidate.municipality_name,
    candidate.municipality_region_name,
    candidate.slug,
    candidate.name,
    candidate.address_line1,
    candidate.postal_code,
    candidate.city,
    candidate.latitude,
    candidate.longitude,
    candidate.capacity,
    candidate.source_application_code,
    candidate.status,
    candidate.staged_at
  from app_v2.import_shelter_candidates candidate
  where candidate.import_run_id = p_from_import_run_id
  on conflict (import_run_id, canonical_source_reference) do nothing;

  get diagnostics copied_count = row_count;
  if copied_count < 1 then
    raise exception 'Import resume copied no staging candidates';
  end if;
  return copied_count;
end;
$$;

revoke all on function app_v2.copy_datafordeler_import_candidates_v1(uuid, uuid)
from public, anon, authenticated;
grant execute on function app_v2.copy_datafordeler_import_candidates_v1(uuid, uuid)
to service_role;

comment on column app_v2.shelters.publication_state is
'Fail-closed public release state. New rows default withheld; only a passed atomic publisher may release new source rows.';
comment on column app_v2.import_runs.mapping_ratio is
'Derived DAR-linked share of BBR rows eligible for address enrichment.';
comment on function app_v2.publish_datafordeler_import_v3(
  uuid, text, integer, integer, integer, text, timestamptz,
  integer, integer, integer, integer, integer, integer
) is
'Service-role-only mapping quality gate and atomic publication for a complete staged Datafordeler run.';
