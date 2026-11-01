-- A function-scoped statement_timeout does not extend a session limit that is
-- already running, so the owner's rollback through the signed-in PostgREST
-- session was still cancelled after the authenticated role's 8 seconds.
-- The server action now checks owner and aal2 itself and calls this function
-- with the service role, whose session has no such limit. The function still
-- requires the named actor to be an owner and records that account as actor.
--
-- rollback_dataset_publication_v1(uuid) stays as a thin wrapper for signed-in
-- aal2 owners, so existing callers keep working.

create or replace function app_v2.rollback_dataset_publication_as_owner_v1(
  p_publication_id uuid,
  p_actor_account_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  current_account_id uuid;
  current_publication app_v2.dataset_publications%rowtype;
  target_publication app_v2.dataset_publications%rowtype;
  rollback_publication_id uuid;
begin
  current_account_id := p_actor_account_id;
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

  -- Restore the snapshot without recomputing public aggregates after every
  -- statement, exactly as the importer's publication window does.
  perform set_config('app_v2.quality_gate_passed', 'true', true);

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

  -- Clear the deferral before the last publication-ledger statement so its
  -- trigger refreshes the municipality summary and public revision once.
  perform set_config('app_v2.quality_gate_passed', 'false', true);

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

revoke all on function app_v2.rollback_dataset_publication_as_owner_v1(uuid, uuid)
from public, anon, authenticated;
grant execute on function app_v2.rollback_dataset_publication_as_owner_v1(uuid, uuid)
to service_role;

comment on function app_v2.rollback_dataset_publication_as_owner_v1(uuid, uuid) is
'Atomically restores a retained publication snapshot on behalf of an owner account. Service role only; the caller must already have verified the owner and aal2. Has a function-scoped 60-second statement timeout and refreshes public caches once.';

create or replace function app_v2.rollback_dataset_publication_v1(
  p_publication_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '60s'
as $$
begin
  return app_v2.rollback_dataset_publication_as_owner_v1(
    p_publication_id,
    app_v2.current_moderator_account_id_v1(true)
  );
end;
$$;

revoke all on function app_v2.rollback_dataset_publication_v1(uuid)
from public, anon;
grant execute on function app_v2.rollback_dataset_publication_v1(uuid)
to authenticated;

comment on function app_v2.rollback_dataset_publication_v1(uuid) is
'Restores a retained publication snapshot for the signed-in aal2 owner by delegating to rollback_dataset_publication_as_owner_v1. Subject to the caller session''s own statement timeout.';
