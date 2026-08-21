-- Isolate every Datafordeler run from the public baseline until the complete
-- dataset has passed quality gates. Successful publications are snapshotted so
-- an owner with aal2 can restore a previous known-good dataset atomically.

alter table app_v2.import_runs
add column if not exists publication_status text not null default 'legacy'
  check (publication_status in ('legacy', 'staging', 'published', 'rejected', 'not_published')),
add column if not exists publication_id uuid,
add column if not exists quality_gate_passed boolean,
add column if not exists quality_gate_reasons text[] not null default '{}'::text[],
add column if not exists quality_metrics jsonb not null default '{}'::jsonb;

create table if not exists app_v2.dataset_publications (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  import_run_id uuid unique references app_v2.import_runs(id) on delete set null,
  previous_publication_id uuid references app_v2.dataset_publications(id) on delete set null,
  rollback_of_publication_id uuid references app_v2.dataset_publications(id) on delete set null,
  is_current boolean not null default false,
  snapshot_available boolean not null default true,
  record_count integer not null check (record_count >= 0),
  total_capacity bigint not null check (total_capacity >= 0),
  coordinate_count integer not null check (coordinate_count >= 0),
  municipality_count integer not null check (municipality_count >= 0),
  quality_metrics jsonb not null default '{}'::jsonb,
  published_by_type text not null check (published_by_type in ('migration', 'importer', 'moderator_rollback')),
  published_by_identifier text,
  published_at timestamptz not null default timezone('utc', now()),
  superseded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists app_v2_dataset_publications_one_current_idx
on app_v2.dataset_publications (source_name)
where is_current = true;

create index if not exists app_v2_dataset_publications_source_published_idx
on app_v2.dataset_publications (source_name, published_at desc);

create table if not exists app_v2.import_shelter_candidates (
  import_run_id uuid not null references app_v2.import_runs(id) on delete cascade,
  source_name text not null,
  canonical_source_reference text not null,
  municipality_code text not null check (municipality_code ~ '^[0-9]{4}$'),
  municipality_slug text not null,
  municipality_name text not null,
  municipality_region_name text,
  slug text not null,
  name text not null,
  address_line1 text not null,
  postal_code text not null check (postal_code ~ '^[0-9]{4}$'),
  city text not null,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  capacity integer not null check (capacity >= 0),
  source_application_code text,
  status text not null check (status in ('active', 'temporarily_closed', 'under_review')),
  staged_at timestamptz not null default timezone('utc', now()),
  primary key (import_run_id, canonical_source_reference),
  constraint app_v2_import_candidates_coordinates_check check (
    (latitude is null and longitude is null)
    or (
      latitude between -90 and 90
      and longitude between -180 and 180
    )
  )
);

create unique index if not exists app_v2_import_candidates_run_slug_idx
on app_v2.import_shelter_candidates (import_run_id, slug);

create index if not exists app_v2_import_candidates_run_municipality_idx
on app_v2.import_shelter_candidates (import_run_id, municipality_code);

create table if not exists app_v2.dataset_publication_shelters (
  publication_id uuid not null references app_v2.dataset_publications(id) on delete cascade,
  shelter_id uuid not null,
  source_name text not null,
  canonical_source_reference text not null,
  municipality_code text not null,
  municipality_slug text not null,
  municipality_name text not null,
  municipality_region_name text,
  slug text not null,
  name text not null,
  address_line1 text not null,
  postal_code text not null,
  city text not null,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  capacity integer not null,
  source_application_code text,
  status text not null,
  accessibility_notes text,
  summary text not null,
  import_state text not null,
  last_seen_at timestamptz,
  last_imported_at timestamptz,
  primary key (publication_id, shelter_id),
  unique (publication_id, canonical_source_reference)
);

create index if not exists app_v2_publication_shelters_source_ref_idx
on app_v2.dataset_publication_shelters (source_name, canonical_source_reference);

alter table app_v2.dataset_publications enable row level security;
alter table app_v2.import_shelter_candidates enable row level security;
alter table app_v2.dataset_publication_shelters enable row level security;

revoke all on table app_v2.dataset_publications from public, anon, authenticated;
revoke all on table app_v2.import_shelter_candidates from public, anon, authenticated;
revoke all on table app_v2.dataset_publication_shelters from public, anon, authenticated;
grant all on table app_v2.dataset_publications to service_role;
grant all on table app_v2.import_shelter_candidates to service_role;
grant all on table app_v2.dataset_publication_shelters to service_role;

-- Municipality codes are the stable importer identity. Repoint any historical
-- duplicates before making that identity unique.
with ranked_municipalities as (
  select
    municipality.id,
    first_value(municipality.id) over (
      partition by municipality.code
      order by municipality.created_at, municipality.id
    ) as keeper_id,
    row_number() over (
      partition by municipality.code
      order by municipality.created_at, municipality.id
    ) as duplicate_rank
  from app_v2.municipalities municipality
  where municipality.code is not null
), duplicate_municipalities as (
  select id, keeper_id
  from ranked_municipalities
  where duplicate_rank > 1
)
update app_v2.shelters shelter
set municipality_id = duplicate.keeper_id
from duplicate_municipalities duplicate
where shelter.municipality_id = duplicate.id;

with ranked_municipalities as (
  select
    municipality.id,
    row_number() over (
      partition by municipality.code
      order by municipality.created_at, municipality.id
    ) as duplicate_rank
  from app_v2.municipalities municipality
  where municipality.code is not null
)
delete from app_v2.municipalities municipality
using ranked_municipalities ranked
where municipality.id = ranked.id
  and ranked.duplicate_rank > 1;

drop index if exists app_v2.app_v2_municipalities_code_idx;
create unique index if not exists app_v2_municipalities_code_unique_idx
on app_v2.municipalities (code);

do $$
begin
  if exists (
    select 1
    from app_v2.shelters shelter
    join app_v2.municipalities municipality on municipality.id = shelter.municipality_id
    where shelter.canonical_source_name = 'datafordeler-bbr-dar'
      and shelter.canonical_source_reference is not null
      and municipality.code is null
  ) then
    raise exception 'Datafordeler municipality codes must be reconciled before versioned publication';
  end if;
end;
$$;

-- Capture the currently published baseline once so rollback is available from
-- the moment this migration is applied.
do $$
declare
  baseline_publication_id uuid;
  latest_successful_run_id uuid;
  baseline_record_count integer;
  baseline_total_capacity bigint;
  baseline_coordinate_count integer;
  baseline_municipality_count integer;
begin
  if not exists (
    select 1
    from app_v2.dataset_publications publication
    where publication.source_name = 'datafordeler-bbr-dar'
      and publication.is_current = true
  ) then
    select run.id
    into latest_successful_run_id
    from app_v2.import_runs run
    where run.source_name = 'datafordeler-bbr-dar'
      and run.status = 'succeeded'
    order by run.finished_at desc nulls last, run.started_at desc
    limit 1;

    select
      count(*)::integer,
      coalesce(sum(shelter.capacity), 0)::bigint,
      count(*) filter (
        where shelter.latitude is not null and shelter.longitude is not null
      )::integer,
      count(distinct shelter.municipality_id)::integer
    into
      baseline_record_count,
      baseline_total_capacity,
      baseline_coordinate_count,
      baseline_municipality_count
    from app_v2.shelters shelter
    where shelter.canonical_source_name = 'datafordeler-bbr-dar'
      and shelter.import_state = 'active';

    insert into app_v2.dataset_publications (
      source_name,
      import_run_id,
      is_current,
      record_count,
      total_capacity,
      coordinate_count,
      municipality_count,
      quality_metrics,
      published_by_type,
      published_by_identifier
    ) values (
      'datafordeler-bbr-dar',
      latest_successful_run_id,
      true,
      baseline_record_count,
      baseline_total_capacity,
      baseline_coordinate_count,
      baseline_municipality_count,
      jsonb_build_object(
        'recordCount', baseline_record_count,
        'totalCapacity', baseline_total_capacity,
        'coordinateCount', baseline_coordinate_count,
        'coordinateCoverage', case
          when baseline_record_count = 0 then 0
          else round(baseline_coordinate_count::numeric / baseline_record_count, 4)
        end,
        'municipalityCount', baseline_municipality_count,
        'baseline', true
      ),
      'migration',
      'versioned_import_publishing'
    )
    returning id into baseline_publication_id;

    insert into app_v2.dataset_publication_shelters (
      publication_id,
      shelter_id,
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
      accessibility_notes,
      summary,
      import_state,
      last_seen_at,
      last_imported_at
    )
    select
      baseline_publication_id,
      shelter.id,
      shelter.canonical_source_name,
      shelter.canonical_source_reference,
      municipality.code,
      municipality.slug,
      municipality.name,
      municipality.region_name,
      shelter.slug,
      shelter.name,
      shelter.address_line1,
      shelter.postal_code,
      shelter.city,
      shelter.latitude,
      shelter.longitude,
      shelter.capacity,
      shelter.source_application_code,
      shelter.status,
      shelter.accessibility_notes,
      shelter.summary,
      shelter.import_state,
      shelter.last_seen_at,
      shelter.last_imported_at
    from app_v2.shelters shelter
    join app_v2.municipalities municipality on municipality.id = shelter.municipality_id
    where shelter.canonical_source_name = 'datafordeler-bbr-dar'
      and shelter.canonical_source_reference is not null;
  end if;
end;
$$;

alter table app_v2.import_runs
drop constraint if exists import_runs_publication_id_fkey;
alter table app_v2.import_runs
add constraint import_runs_publication_id_fkey
foreign key (publication_id) references app_v2.dataset_publications(id) on delete set null;

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
      and parent.status = 'failed'
  ) then
    raise exception 'Import resume relationship is invalid';
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
  return copied_count;
end;
$$;

revoke all on function app_v2.copy_datafordeler_import_candidates_v1(uuid, uuid)
from public, anon, authenticated;
grant execute on function app_v2.copy_datafordeler_import_candidates_v1(uuid, uuid)
to service_role;

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
declare
  current_publication app_v2.dataset_publications%rowtype;
  new_publication_id uuid;
  candidate_count integer;
  candidate_capacity bigint;
  candidate_coordinate_count integer;
  candidate_municipality_count integer;
  coordinate_coverage numeric;
  previous_coordinate_coverage numeric;
  required_record_count integer;
  required_capacity bigint;
  quality_reasons text[] := '{}'::text[];
  v_quality_metrics jsonb;
  missing_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('app_v2:datafordeler-publication', 0));

  if p_source_name <> 'datafordeler-bbr-dar'
    or p_records_seen < 1
    or p_records_staged <> p_records_seen
    or p_pages_fetched < 1
    or p_finished_at is null then
    raise exception 'Import publication counters or timestamp are invalid';
  end if;

  perform 1
  from app_v2.import_runs run
  where run.id = p_import_run_id
    and run.source_name = p_source_name
    and run.status = 'running'
  for update;

  if not found then
    raise exception 'Import run is not eligible for publication';
  end if;

  select publication.*
  into current_publication
  from app_v2.dataset_publications publication
  where publication.source_name = p_source_name
    and publication.is_current = true
  for update;

  select
    count(*)::integer,
    coalesce(sum(candidate.capacity), 0)::bigint,
    count(*) filter (
      where candidate.latitude is not null and candidate.longitude is not null
    )::integer,
    count(distinct candidate.municipality_code)::integer
  into
    candidate_count,
    candidate_capacity,
    candidate_coordinate_count,
    candidate_municipality_count
  from app_v2.import_shelter_candidates candidate
  where candidate.import_run_id = p_import_run_id
    and candidate.source_name = p_source_name;

  coordinate_coverage := case
    when candidate_count = 0 then 0
    else round(candidate_coordinate_count::numeric / candidate_count, 4)
  end;
  previous_coordinate_coverage := case
    when current_publication.record_count = 0 then 0
    else current_publication.coordinate_count::numeric / current_publication.record_count
  end;
  required_record_count := case
    when current_publication.id is null or current_publication.record_count = 0 then 500
    else greatest(500, ceil(current_publication.record_count * 0.80)::integer)
  end;
  required_capacity := case
    when current_publication.id is null or current_publication.total_capacity = 0 then 1
    else ceil(current_publication.total_capacity * 0.80)::bigint
  end;

  if candidate_count <> p_records_seen then
    quality_reasons := array_append(quality_reasons, 'Antallet af unikke stagingposter matcher ikke kildetælleren.');
  end if;
  if candidate_count < required_record_count then
    quality_reasons := array_append(
      quality_reasons,
      format('Kun %s poster mod minimum %s.', candidate_count, required_record_count)
    );
  end if;
  if candidate_capacity < required_capacity then
    quality_reasons := array_append(
      quality_reasons,
      format('Samlet kapacitet %s er under minimum %s.', candidate_capacity, required_capacity)
    );
  end if;
  if coordinate_coverage < 0.35 then
    quality_reasons := array_append(
      quality_reasons,
      format('Koordinatdækning %s er under 35 procent.', round(coordinate_coverage * 100, 1))
    );
  end if;
  if current_publication.id is not null
    and previous_coordinate_coverage > 0
    and coordinate_coverage < previous_coordinate_coverage - 0.05 then
    quality_reasons := array_append(
      quality_reasons,
      'Koordinatdækningen er faldet mere end 5 procentpoint.'
    );
  end if;
  if current_publication.id is not null
    and current_publication.municipality_count > 0
    and candidate_municipality_count < ceil(current_publication.municipality_count * 0.80)::integer then
    quality_reasons := array_append(
      quality_reasons,
      'Kommunedækningen er faldet mere end 20 procent.'
    );
  end if;

  v_quality_metrics := jsonb_build_object(
    'recordCount', candidate_count,
    'previousRecordCount', coalesce(current_publication.record_count, 0),
    'minimumRecordCount', required_record_count,
    'totalCapacity', candidate_capacity,
    'previousTotalCapacity', coalesce(current_publication.total_capacity, 0),
    'minimumTotalCapacity', required_capacity,
    'coordinateCount', candidate_coordinate_count,
    'coordinateCoverage', coordinate_coverage,
    'previousCoordinateCoverage', coalesce(round(previous_coordinate_coverage, 4), 0),
    'municipalityCount', candidate_municipality_count,
    'previousMunicipalityCount', coalesce(current_publication.municipality_count, 0)
  );

  if cardinality(quality_reasons) > 0 then
    update app_v2.import_runs run
    set
      status = 'failed',
      publication_status = 'rejected',
      finished_at = p_finished_at,
      error_summary = 'Quality gates rejected publication',
      records_seen = p_records_seen,
      records_upserted = p_records_staged,
      pages_fetched = p_pages_fetched,
      last_successful_page = p_pages_fetched,
      last_successful_cursor = p_last_successful_cursor,
      missing_transitions_applied = false,
      missing_transitions_skipped_reason = 'publication rejected by quality gates',
      quality_gate_passed = false,
      quality_gate_reasons = quality_reasons,
      quality_metrics = v_quality_metrics
    where run.id = p_import_run_id;

    delete from app_v2.import_shelter_candidates candidate
    where candidate.import_run_id = p_import_run_id;

    return jsonb_build_object(
      'status', 'rejected',
      'qualityGatePassed', false,
      'qualityGateReasons', to_jsonb(quality_reasons),
      'qualityMetrics', v_quality_metrics
    );
  end if;

  insert into app_v2.municipalities (code, slug, name, region_name)
  select
    candidate.municipality_code,
    min(candidate.municipality_slug),
    min(candidate.municipality_name),
    min(candidate.municipality_region_name)
  from app_v2.import_shelter_candidates candidate
  where candidate.import_run_id = p_import_run_id
  group by candidate.municipality_code
  on conflict (code) do update
  set
    name = excluded.name,
    region_name = excluded.region_name;

  insert into app_v2.shelters (
    municipality_id,
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
    accessibility_notes,
    summary,
    import_state,
    last_seen_at,
    last_imported_at,
    canonical_source_name,
    canonical_source_reference
  )
  select
    municipality.id,
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
    null,
    'Importeret fra Datafordeler BBR og DAR. Fysisk og operationel tilgængelighed er ikke dokumenteret af kilden.',
    'active',
    p_finished_at,
    p_finished_at,
    p_source_name,
    candidate.canonical_source_reference
  from app_v2.import_shelter_candidates candidate
  join app_v2.municipalities municipality on municipality.code = candidate.municipality_code
  where candidate.import_run_id = p_import_run_id
  on conflict (canonical_source_name, canonical_source_reference)
    where canonical_source_name is not null and canonical_source_reference is not null
  do update set
    municipality_id = excluded.municipality_id,
    slug = excluded.slug,
    name = excluded.name,
    address_line1 = excluded.address_line1,
    postal_code = excluded.postal_code,
    city = excluded.city,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    capacity = excluded.capacity,
    source_application_code = excluded.source_application_code,
    status = excluded.status,
    accessibility_notes = excluded.accessibility_notes,
    summary = excluded.summary,
    import_state = 'active',
    last_seen_at = excluded.last_seen_at,
    last_imported_at = excluded.last_imported_at;

  update app_v2.shelters shelter
  set
    import_state = 'missing_from_source',
    last_imported_at = p_finished_at
  where shelter.canonical_source_name = p_source_name
    and shelter.canonical_source_reference is not null
    and shelter.import_state = 'active'
    and not exists (
      select 1
      from app_v2.import_shelter_candidates candidate
      where candidate.import_run_id = p_import_run_id
        and candidate.canonical_source_reference = shelter.canonical_source_reference
    );

  get diagnostics missing_count = row_count;

  insert into app_v2.shelter_sources (
    shelter_id,
    import_run_id,
    source_name,
    source_url,
    source_type,
    source_reference,
    last_verified_at,
    imported_at,
    notes
  )
  select
    shelter.id,
    p_import_run_id,
    'Datafordeler BBR + DAR',
    'https://datafordeler.dk/dataoversigt/bygnings-og-boligregistret-bbr/bbr-graphql/',
    'official',
    candidate.canonical_source_reference,
    p_finished_at,
    p_finished_at,
    'BBR building enriched through DAR v3'
  from app_v2.import_shelter_candidates candidate
  join app_v2.shelters shelter
    on shelter.canonical_source_name = p_source_name
   and shelter.canonical_source_reference = candidate.canonical_source_reference
  where candidate.import_run_id = p_import_run_id
  on conflict (shelter_id, source_name, source_reference) do update
  set
    import_run_id = excluded.import_run_id,
    source_url = excluded.source_url,
    last_verified_at = excluded.last_verified_at,
    imported_at = excluded.imported_at,
    notes = excluded.notes;

  update app_v2.dataset_publications publication
  set
    is_current = false,
    superseded_at = p_finished_at
  where publication.source_name = p_source_name
    and publication.is_current = true;

  insert into app_v2.dataset_publications (
    source_name,
    import_run_id,
    previous_publication_id,
    is_current,
    record_count,
    total_capacity,
    coordinate_count,
    municipality_count,
    quality_metrics,
    published_by_type,
    published_by_identifier,
    published_at
  ) values (
    p_source_name,
    p_import_run_id,
    current_publication.id,
    true,
    candidate_count,
    candidate_capacity,
    candidate_coordinate_count,
    candidate_municipality_count,
    v_quality_metrics || jsonb_build_object('missingTransitions', missing_count),
    'importer',
    p_import_run_id::text,
    p_finished_at
  )
  returning id into new_publication_id;

  insert into app_v2.dataset_publication_shelters (
    publication_id,
    shelter_id,
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
    accessibility_notes,
    summary,
    import_state,
    last_seen_at,
    last_imported_at
  )
  select
    new_publication_id,
    shelter.id,
    shelter.canonical_source_name,
    shelter.canonical_source_reference,
    municipality.code,
    municipality.slug,
    municipality.name,
    municipality.region_name,
    shelter.slug,
    shelter.name,
    shelter.address_line1,
    shelter.postal_code,
    shelter.city,
    shelter.latitude,
    shelter.longitude,
    shelter.capacity,
    shelter.source_application_code,
    shelter.status,
    shelter.accessibility_notes,
    shelter.summary,
    shelter.import_state,
    shelter.last_seen_at,
    shelter.last_imported_at
  from app_v2.shelters shelter
  join app_v2.municipalities municipality on municipality.id = shelter.municipality_id
  where shelter.canonical_source_name = p_source_name
    and shelter.canonical_source_reference is not null;

  update app_v2.import_runs run
  set
    status = 'succeeded',
    publication_status = 'published',
    publication_id = new_publication_id,
    finished_at = p_finished_at,
    error_summary = null,
    records_seen = p_records_seen,
    records_upserted = p_records_staged,
    pages_fetched = p_pages_fetched,
    last_successful_page = p_pages_fetched,
    last_successful_cursor = p_last_successful_cursor,
    missing_transitions_applied = true,
    missing_transitions_skipped_reason = null,
    quality_gate_passed = true,
    quality_gate_reasons = '{}'::text[],
    quality_metrics = v_quality_metrics
  where run.id = p_import_run_id;

  delete from app_v2.import_shelter_candidates candidate
  where candidate.import_run_id = p_import_run_id;

  with retained as (
    select
      publication.id,
      row_number() over (
        partition by publication.source_name
        order by publication.published_at desc, publication.created_at desc
      ) as recency_rank
    from app_v2.dataset_publications publication
    where publication.snapshot_available = true
  ), expired as (
    select retained.id
    from retained
    where retained.recency_rank > 3
  ), removed as (
    delete from app_v2.dataset_publication_shelters snapshot
    using expired
    where snapshot.publication_id = expired.id
    returning snapshot.publication_id
  )
  update app_v2.dataset_publications publication
  set snapshot_available = false
  where publication.id in (select distinct removed.publication_id from removed);

  return jsonb_build_object(
    'status', 'published',
    'publicationId', new_publication_id,
    'qualityGatePassed', true,
    'qualityGateReasons', '[]'::jsonb,
    'qualityMetrics', v_quality_metrics,
    'missingTransitions', missing_count
  );
end;
$$;

revoke all on function app_v2.publish_datafordeler_import_v2(
  uuid, text, integer, integer, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function app_v2.publish_datafordeler_import_v2(
  uuid, text, integer, integer, integer, text, timestamptz
) to service_role;

create or replace function app_v2.get_import_operations_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_account_id uuid;
  v_current_role text;
begin
  current_account_id := app_v2.current_moderator_account_id_v1(true);
  if current_account_id is null then
    raise exception 'moderator access denied' using errcode = '42501';
  end if;

  select account.role
  into v_current_role
  from app_v2.moderator_accounts account
  where account.id = current_account_id;

  return jsonb_build_object(
    'moderatorRole', v_current_role,
    'currentPublication', (
      select jsonb_build_object(
        'id', publication.id,
        'recordCount', publication.record_count,
        'totalCapacity', publication.total_capacity,
        'coordinateCount', publication.coordinate_count,
        'municipalityCount', publication.municipality_count,
        'publishedAt', publication.published_at,
        'publishedByType', publication.published_by_type,
        'qualityMetrics', publication.quality_metrics
      )
      from app_v2.dataset_publications publication
      where publication.source_name = 'datafordeler-bbr-dar'
        and publication.is_current = true
    ),
    'publications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', publication.id,
        'isCurrent', publication.is_current,
        'snapshotAvailable', publication.snapshot_available,
        'recordCount', publication.record_count,
        'totalCapacity', publication.total_capacity,
        'coordinateCount', publication.coordinate_count,
        'municipalityCount', publication.municipality_count,
        'publishedAt', publication.published_at,
        'publishedByType', publication.published_by_type,
        'rollbackOfPublicationId', publication.rollback_of_publication_id,
        'qualityMetrics', publication.quality_metrics
      ) order by publication.published_at desc, publication.created_at desc)
      from (
        select publication.*
        from app_v2.dataset_publications publication
        where publication.source_name = 'datafordeler-bbr-dar'
        order by publication.published_at desc, publication.created_at desc
        limit 10
      ) publication
    ), '[]'::jsonb),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', run.id,
        'status', run.status,
        'publicationStatus', run.publication_status,
        'recordsSeen', run.records_seen,
        'recordsStaged', run.records_upserted,
        'pagesFetched', run.pages_fetched,
        'startedAt', run.started_at,
        'finishedAt', run.finished_at,
        'qualityGatePassed', run.quality_gate_passed,
        'qualityGateReasons', run.quality_gate_reasons,
        'qualityMetrics', run.quality_metrics,
        'errorSummary', run.error_summary
      ) order by run.started_at desc)
      from (
        select run.*
        from app_v2.import_runs run
        where run.source_name = 'datafordeler-bbr-dar'
        order by run.started_at desc
        limit 20
      ) run
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function app_v2.get_import_operations_v1()
from public, anon;
grant execute on function app_v2.get_import_operations_v1()
to authenticated;

create or replace function app_v2.rollback_dataset_publication_v1(
  p_publication_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_account_id uuid;
  current_publication app_v2.dataset_publications%rowtype;
  target_publication app_v2.dataset_publications%rowtype;
  rollback_publication_id uuid;
begin
  current_account_id := app_v2.current_moderator_account_id_v1(true);
  if current_account_id is null or not exists (
    select 1
    from app_v2.moderator_accounts account
    where account.id = current_account_id
      and account.role = 'owner'
  ) then
    raise exception 'owner access denied' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('app_v2:datafordeler-publication', 0));

  select publication.*
  into current_publication
  from app_v2.dataset_publications publication
  where publication.source_name = 'datafordeler-bbr-dar'
    and publication.is_current = true
  for update;

  select publication.*
  into target_publication
  from app_v2.dataset_publications publication
  where publication.id = p_publication_id
    and publication.source_name = 'datafordeler-bbr-dar'
    and publication.snapshot_available = true;

  if target_publication.id is null
    or current_publication.id is null
    or target_publication.id = current_publication.id
    or not exists (
      select 1
      from app_v2.dataset_publication_shelters snapshot
      where snapshot.publication_id = target_publication.id
    ) then
    raise exception 'Rollback target is not available';
  end if;

  insert into app_v2.municipalities (code, slug, name, region_name)
  select
    snapshot.municipality_code,
    min(snapshot.municipality_slug),
    min(snapshot.municipality_name),
    min(snapshot.municipality_region_name)
  from app_v2.dataset_publication_shelters snapshot
  where snapshot.publication_id = target_publication.id
  group by snapshot.municipality_code
  on conflict (code) do update
  set
    name = excluded.name,
    region_name = excluded.region_name;

  update app_v2.shelters shelter
  set
    import_state = 'missing_from_source',
    last_imported_at = timezone('utc', now())
  where shelter.canonical_source_name = 'datafordeler-bbr-dar'
    and shelter.canonical_source_reference is not null;

  insert into app_v2.shelters (
    municipality_id,
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
    accessibility_notes,
    summary,
    import_state,
    last_seen_at,
    last_imported_at,
    canonical_source_name,
    canonical_source_reference
  )
  select
    municipality.id,
    snapshot.slug,
    snapshot.name,
    snapshot.address_line1,
    snapshot.postal_code,
    snapshot.city,
    snapshot.latitude,
    snapshot.longitude,
    snapshot.capacity,
    snapshot.source_application_code,
    snapshot.status,
    snapshot.accessibility_notes,
    snapshot.summary,
    snapshot.import_state,
    snapshot.last_seen_at,
    snapshot.last_imported_at,
    snapshot.source_name,
    snapshot.canonical_source_reference
  from app_v2.dataset_publication_shelters snapshot
  join app_v2.municipalities municipality on municipality.code = snapshot.municipality_code
  where snapshot.publication_id = target_publication.id
  on conflict (canonical_source_name, canonical_source_reference)
    where canonical_source_name is not null and canonical_source_reference is not null
  do update set
    municipality_id = excluded.municipality_id,
    slug = excluded.slug,
    name = excluded.name,
    address_line1 = excluded.address_line1,
    postal_code = excluded.postal_code,
    city = excluded.city,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    capacity = excluded.capacity,
    source_application_code = excluded.source_application_code,
    status = excluded.status,
    accessibility_notes = excluded.accessibility_notes,
    summary = excluded.summary,
    import_state = excluded.import_state,
    last_seen_at = excluded.last_seen_at,
    last_imported_at = excluded.last_imported_at;

  update app_v2.dataset_publications publication
  set
    is_current = false,
    superseded_at = timezone('utc', now())
  where publication.id = current_publication.id;

  insert into app_v2.dataset_publications (
    source_name,
    previous_publication_id,
    rollback_of_publication_id,
    is_current,
    record_count,
    total_capacity,
    coordinate_count,
    municipality_count,
    quality_metrics,
    published_by_type,
    published_by_identifier
  ) values (
    target_publication.source_name,
    current_publication.id,
    target_publication.id,
    true,
    target_publication.record_count,
    target_publication.total_capacity,
    target_publication.coordinate_count,
    target_publication.municipality_count,
    target_publication.quality_metrics || jsonb_build_object('rollback', true),
    'moderator_rollback',
    current_account_id::text
  )
  returning id into rollback_publication_id;

  insert into app_v2.dataset_publication_shelters
  select
    rollback_publication_id,
    snapshot.shelter_id,
    snapshot.source_name,
    snapshot.canonical_source_reference,
    snapshot.municipality_code,
    snapshot.municipality_slug,
    snapshot.municipality_name,
    snapshot.municipality_region_name,
    snapshot.slug,
    snapshot.name,
    snapshot.address_line1,
    snapshot.postal_code,
    snapshot.city,
    snapshot.latitude,
    snapshot.longitude,
    snapshot.capacity,
    snapshot.source_application_code,
    snapshot.status,
    snapshot.accessibility_notes,
    snapshot.summary,
    snapshot.import_state,
    snapshot.last_seen_at,
    snapshot.last_imported_at
  from app_v2.dataset_publication_shelters snapshot
  where snapshot.publication_id = target_publication.id;

  with retained as (
    select
      publication.id,
      row_number() over (
        partition by publication.source_name
        order by publication.published_at desc, publication.created_at desc
      ) as recency_rank
    from app_v2.dataset_publications publication
    where publication.snapshot_available = true
  ), expired as (
    select retained.id
    from retained
    where retained.recency_rank > 3
  ), removed as (
    delete from app_v2.dataset_publication_shelters snapshot
    using expired
    where snapshot.publication_id = expired.id
    returning snapshot.publication_id
  )
  update app_v2.dataset_publications publication
  set snapshot_available = false
  where publication.id in (select distinct removed.publication_id from removed);

  insert into app_v2.audit_events (
    actor_type,
    actor_identifier,
    entity_type,
    entity_id,
    event_type,
    payload
  ) values (
    'moderator',
    current_account_id::text,
    'dataset_publication',
    rollback_publication_id,
    'dataset_publication_rolled_back',
    jsonb_build_object(
      'from_publication_id', current_publication.id,
      'target_publication_id', target_publication.id
    )
  );

  return rollback_publication_id;
end;
$$;

revoke all on function app_v2.rollback_dataset_publication_v1(uuid)
from public, anon;
grant execute on function app_v2.rollback_dataset_publication_v1(uuid)
to authenticated;

comment on table app_v2.import_shelter_candidates is
'Private per-run staging. Candidate rows never participate in public reads.';
comment on table app_v2.dataset_publications is
'Publication ledger for atomically promoted and owner-restored Datafordeler datasets.';
comment on table app_v2.dataset_publication_shelters is
'Private retained snapshots of importer-owned shelter baseline fields for rollback.';
comment on function app_v2.publish_datafordeler_import_v2(
  uuid, text, integer, integer, integer, text, timestamptz
) is
'Service-role-only quality gate and atomic publication for a complete staged Datafordeler run.';
comment on function app_v2.get_import_operations_v1() is
'Minimal private import/publication overview for an allowlisted aal2 moderator.';
comment on function app_v2.rollback_dataset_publication_v1(uuid) is
'Atomically restores a retained publication snapshot. Requires an allowlisted aal2 owner.';

-- Prevent older importer builds from bypassing staging after this migration.
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
volatile
security invoker
set search_path = ''
as $$
begin
  raise exception 'Legacy direct-write finalizer is retired; use staged publication v2';
end;
$$;

revoke all on function app_v2.finalize_datafordeler_import(
  uuid, text, text[], integer, integer, integer, text, timestamptz
) from public, anon, authenticated;
grant execute on function app_v2.finalize_datafordeler_import(
  uuid, text, text[], integer, integer, integer, text, timestamptz
) to service_role;
