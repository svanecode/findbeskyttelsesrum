-- Decisions of 2 October 2026 on search and URLs:
--
-- 1. Readable detail paths (/beskyttelsesrum/ryesgade-18-8000-aarhus-c) must
--    keep working when an address changes. Every path a registration has had
--    is kept with its validity period and redirects to the current path.
-- 2. A registration removed from BBR answers 410 with its last address, so a
--    shared link can still start a search near that address.
-- 3. All Danish postcodes are searchable, also those without registrations.
--    The importer fills the DAR postcodes; registrations supply positions and
--    municipality codes where they exist.
-- 4. Registrations that look like the same shelter on two addresses are
--    listed internally with the reason. They are not grouped publicly.

-- ---------------------------------------------------------------------------
-- 1. Readable paths
-- ---------------------------------------------------------------------------

-- Must match slugifyDanish/getReadableShelterBaseSlug in
-- src/lib/shelter-public-url.ts. Verified on 2026-10-02: the same MD5 digest
-- over all 10,104 public registrations from SQL and TypeScript.
create or replace function app_v2.readable_shelter_base_slug_v1(
  p_address_line1 text,
  p_postal_code text,
  p_city text
)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    regexp_replace(
      normalize(
        replace(replace(replace(
          lower(coalesce(p_address_line1, '') || ' ' || coalesce(p_postal_code, '') || ' ' || coalesce(p_city, '')),
          'æ', 'ae'), 'ø', 'oe'), 'å', 'aa'),
        NFKD
      ),
      '[\u0300-\u036f]', '', 'g'
    ),
    '[^a-z0-9]+', '-', 'g'
  ))
$$;

revoke all on function app_v2.readable_shelter_base_slug_v1(text, text, text) from public, anon, authenticated;
grant execute on function app_v2.readable_shelter_base_slug_v1(text, text, text) to service_role;

-- The current canonical path of every public registration. Where several
-- registrations share an address, the one with the most places (then the
-- lowest id) keeps the plain path; the others add six characters of the id.
create or replace view app_v2.shelter_readable_path_v1
with (security_barrier = true)
as
with base as (
  select
    id,
    capacity,
    app_v2.readable_shelter_base_slug_v1(address_line1, postal_code, city) as base_slug
  from app_v2.shelter_public_v2
)
select
  id as shelter_id,
  case
    when row_number() over (partition by base_slug order by capacity desc, id) = 1 then base_slug
    else base_slug || '-' || left(replace(id::text, '-', ''), 6)
  end as path_slug
from base;

revoke all on table app_v2.shelter_readable_path_v1 from public, anon, authenticated;
grant select on table app_v2.shelter_readable_path_v1 to service_role;

create table if not exists app_v2.shelter_path_aliases (
  path_slug text primary key,
  shelter_id uuid not null references app_v2.shelters(id) on delete cascade,
  valid_from timestamptz not null default timezone('utc', now()),
  valid_to timestamptz,
  check (length(path_slug) between 1 and 240),
  check (valid_to is null or valid_to >= valid_from)
);

create index if not exists app_v2_shelter_path_aliases_shelter_id_idx
on app_v2.shelter_path_aliases (shelter_id);

alter table app_v2.shelter_path_aliases enable row level security;

create policy private_by_default
on app_v2.shelter_path_aliases
for all
to anon, authenticated
using (false)
with check (false);

create policy app_v2_shelter_path_aliases_service_only
on app_v2.shelter_path_aliases
for all
to service_role
using (true)
with check (true);

revoke all on table app_v2.shelter_path_aliases from public, anon, authenticated;
grant select, insert, update, delete on table app_v2.shelter_path_aliases to service_role;

comment on table app_v2.shelter_path_aliases is
'Every readable detail path a registration has had. valid_to is null for the current path. Old paths redirect permanently to the current one; paths of registrations removed from BBR answer 410.';

-- Records today's paths and closes the ones that are no longer current. Run
-- after every publication (the importer does) and once below.
create or replace function app_v2.refresh_shelter_path_aliases_v1()
returns table (opened integer, closed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_opened integer;
  v_closed integer;
begin
  with current_paths as (
    select path_slug, shelter_id from app_v2.shelter_readable_path_v1
  ), upserted as (
    insert into app_v2.shelter_path_aliases as alias (path_slug, shelter_id, valid_from, valid_to)
    select path_slug, shelter_id, v_now, null from current_paths
    on conflict (path_slug) do update
      set shelter_id = excluded.shelter_id,
          valid_from = case
            when alias.shelter_id <> excluded.shelter_id or alias.valid_to is not null then v_now
            else alias.valid_from
          end,
          valid_to = null
      where alias.shelter_id <> excluded.shelter_id or alias.valid_to is not null
    returning 1
  )
  select count(*)::integer into v_opened from upserted;

  update app_v2.shelter_path_aliases alias
  set valid_to = v_now
  where alias.valid_to is null
    and not exists (
      select 1
      from app_v2.shelter_readable_path_v1 current_path
      where current_path.path_slug = alias.path_slug
        and current_path.shelter_id = alias.shelter_id
    );
  get diagnostics v_closed = row_count;

  return query select v_opened, v_closed;
end;
$$;

revoke all on function app_v2.refresh_shelter_path_aliases_v1() from public, anon, authenticated;
grant execute on function app_v2.refresh_shelter_path_aliases_v1() to service_role;

-- An earlier readable path of a registration that is still public. Returns
-- its stable slug; the app computes the current path and redirects.
create or replace function app_v2.resolve_shelter_path_alias_v1(p_path_slug text)
returns table (stable_slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select public_shelter.slug
  from app_v2.shelter_path_aliases alias
  inner join app_v2.shelter_public_v2 public_shelter
    on public_shelter.id = alias.shelter_id
  where length(trim(p_path_slug)) between 1 and 240
    and alias.path_slug = p_path_slug
  limit 1;
$$;

revoke all on function app_v2.resolve_shelter_path_alias_v1(text) from public;
grant execute on function app_v2.resolve_shelter_path_alias_v1(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Registrations removed from BBR
-- ---------------------------------------------------------------------------

-- The last public address of a registration the importer no longer finds in
-- BBR, looked up by any path it has had: the stable "registrering-<id>" slug,
-- an older importer slug or a readable path. Only registrations that met the
-- public rules when they disappeared are returned, so nothing is revealed that
-- was not public before.
create or replace function app_v2.resolve_retired_shelter_v1(p_slug text)
returns table (
  address_line1 text,
  postal_code text,
  city text,
  latitude numeric,
  longitude numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select s.id
    from app_v2.shelters s
    where s.slug = p_slug
    union
    select alias.shelter_id from app_v2.shelter_slug_aliases alias where alias.alias_slug = p_slug
    union
    select alias.shelter_id from app_v2.shelter_path_aliases alias where alias.path_slug = p_slug
  )
  select s.address_line1, s.postal_code, s.city, s.latitude, s.longitude
  from candidates c
  inner join app_v2.shelters s on s.id = c.id
  inner join app_v2.application_code_eligibility e
    on e.source_name = 'datafordeler-bbr-dar'
   and e.application_code = s.source_application_code
   and e.is_nearby_eligible = true
  where length(trim(p_slug)) between 1 and 240
    and s.import_state = 'missing_from_source'
    and s.publication_state = 'published'
    and s.capacity >= 40
  limit 1;
$$;

revoke all on function app_v2.resolve_retired_shelter_v1(text) from public;
grant execute on function app_v2.resolve_retired_shelter_v1(text) to anon, authenticated, service_role;

-- SHA-256 of every path that belongs to a removed registration. The request
-- proxy keeps this short list in memory, so it can answer 410 without a
-- database call per page view. Hashes keep the old paths from being listed.
create or replace function app_v2.retired_shelter_path_hashes_v1()
returns table (path_hash text)
language sql
stable
security definer
set search_path = ''
as $$
  with retired as (
    select s.id, s.slug
    from app_v2.shelters s
    inner join app_v2.application_code_eligibility e
      on e.source_name = 'datafordeler-bbr-dar'
     and e.application_code = s.source_application_code
     and e.is_nearby_eligible = true
    where s.import_state = 'missing_from_source'
      and s.publication_state = 'published'
      and s.capacity >= 40
  ), paths as (
    select slug as path from retired
    union
    select alias.alias_slug from app_v2.shelter_slug_aliases alias inner join retired on retired.id = alias.shelter_id
    union
    select alias.path_slug from app_v2.shelter_path_aliases alias inner join retired on retired.id = alias.shelter_id
  )
  select encode(sha256(convert_to(path, 'UTF8')), 'hex') from paths;
$$;

revoke all on function app_v2.retired_shelter_path_hashes_v1() from public;
grant execute on function app_v2.retired_shelter_path_hashes_v1() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Postcodes
-- ---------------------------------------------------------------------------

create table if not exists app_v2.postal_areas (
  postnr text primary key check (postnr ~ '^[0-9]{4}$'),
  name text not null check (length(trim(name)) between 1 and 80),
  municipality_codes text[] not null default '{}',
  latitude double precision check (latitude between 54 and 58),
  longitude double precision check (longitude between 7 and 16),
  -- 'registrations': mean position of the public registrations in the postcode.
  -- 'dar_address': the access point of one current DAR address in the postcode.
  position_source text check (position_source in ('registrations', 'dar_address')),
  has_registrations boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table app_v2.postal_areas enable row level security;

create policy private_by_default
on app_v2.postal_areas
for all
to anon, authenticated
using (false)
with check (false);

create policy app_v2_postal_areas_service_only
on app_v2.postal_areas
for all
to service_role
using (true)
with check (true);

revoke all on table app_v2.postal_areas from public, anon, authenticated;
grant select, insert, update, delete on table app_v2.postal_areas to service_role;

comment on table app_v2.postal_areas is
'All Danish postcodes for the address search. The importer adds DAR postcodes; refresh_postal_areas_from_registrations_v1 adds positions and municipality codes from public registrations.';

create or replace view app_v2.postal_area_public_v1
with (security_barrier = true)
as
select postnr, name, municipality_codes, latitude, longitude, has_registrations
from app_v2.postal_areas
where latitude is not null
  and longitude is not null;

grant select on table app_v2.postal_area_public_v1 to anon, authenticated, service_role;

create or replace function app_v2.refresh_postal_areas_from_registrations_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  with aggregated as (
    select
      s.postal_code as postnr,
      mode() within group (order by s.city) as name,
      array_agg(distinct m.code order by m.code) as municipality_codes,
      avg(s.latitude)::double precision as latitude,
      avg(s.longitude)::double precision as longitude
    from app_v2.shelter_public_v2 s
    inner join app_v2.municipalities m on m.id = s.municipality_id
    where s.postal_code ~ '^[0-9]{4}$'
      and s.latitude is not null
      and s.longitude is not null
    group by s.postal_code
  )
  insert into app_v2.postal_areas as area (
    postnr, name, municipality_codes, latitude, longitude, position_source, has_registrations, updated_at
  )
  select postnr, name, municipality_codes, latitude, longitude, 'registrations', true, timezone('utc', now())
  from aggregated
  on conflict (postnr) do update
    set municipality_codes = excluded.municipality_codes,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        position_source = 'registrations',
        has_registrations = true,
        updated_at = excluded.updated_at;
  get diagnostics v_rows = row_count;

  -- A postcode that lost its registrations keeps its last position.
  update app_v2.postal_areas area
  set has_registrations = false,
      updated_at = timezone('utc', now())
  where area.has_registrations
    and not exists (
      select 1 from app_v2.shelter_public_v2 s where s.postal_code = area.postnr
    );

  return v_rows;
end;
$$;

revoke all on function app_v2.refresh_postal_areas_from_registrations_v1() from public, anon, authenticated;
grant execute on function app_v2.refresh_postal_areas_from_registrations_v1() to service_role;

-- The importer sends every DAR postcode as
-- [{"postnr": "6857", "name": "Blåvand", "latitude": 55.56, "longitude": 8.08}, ...].
-- The DAR position is only used where no registration supplies one.
create or replace function app_v2.upsert_dar_postal_areas_v1(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'p_rows must be an array of at most 2000 postcodes';
  end if;

  with incoming as (
    select
      row->>'postnr' as postnr,
      trim(row->>'name') as name,
      nullif(row->>'latitude', '')::double precision as latitude,
      nullif(row->>'longitude', '')::double precision as longitude
    from jsonb_array_elements(p_rows) as row
    where row->>'postnr' ~ '^[0-9]{4}$'
      and length(trim(coalesce(row->>'name', ''))) between 1 and 80
  )
  insert into app_v2.postal_areas as area (postnr, name, latitude, longitude, position_source, updated_at)
  select
    postnr,
    name,
    latitude,
    longitude,
    case when latitude is not null and longitude is not null then 'dar_address' end,
    timezone('utc', now())
  from incoming
  on conflict (postnr) do update
    set name = excluded.name,
        latitude = case when area.has_registrations then area.latitude else coalesce(excluded.latitude, area.latitude) end,
        longitude = case when area.has_registrations then area.longitude else coalesce(excluded.longitude, area.longitude) end,
        position_source = case
          when area.has_registrations then area.position_source
          when excluded.latitude is not null then 'dar_address'
          else area.position_source
        end,
        updated_at = excluded.updated_at;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function app_v2.upsert_dar_postal_areas_v1(jsonb) from public, anon, authenticated;
grant execute on function app_v2.upsert_dar_postal_areas_v1(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Possible duplicates, for internal review only
-- ---------------------------------------------------------------------------

-- Two public registrations in different BBR buildings, in the same postcode,
-- with the same number of places and less than 35 m apart. They may be one
-- shelter registered on two buildings, but no shared key in app_v2 says so.
-- On different addresses they are shown as separate registrations; on the
-- same address they share the address row, as every address does. 62 pairs
-- on 2 October 2026 (25 on different addresses, 37 on the same address).
-- Corrections arrive through "Rapportér fejl".
create or replace view app_v2.registration_duplicate_review_v1
with (security_barrier = true)
as
select
  first_shelter.id as first_shelter_id,
  first_shelter.address_line1 as first_address,
  first_source.canonical_source_reference as first_bbr_building,
  second_shelter.id as second_shelter_id,
  second_shelter.address_line1 as second_address,
  second_source.canonical_source_reference as second_bbr_building,
  first_shelter.postal_code,
  first_shelter.city,
  first_shelter.capacity,
  round(distance.meters)::integer as distance_meters,
  same_address.value as same_address,
  case
    when same_address.value then format(
      'Samme adresse og samme antal pladser (%s) i to forskellige BBR-bygninger %s m fra hinanden. Ingen fælles nøgle; vises under adressen som to registreringer.',
      first_shelter.capacity, round(distance.meters)::integer
    )
    else format(
      'Samme antal pladser (%s) på to adresser %s m fra hinanden i forskellige BBR-bygninger. Ingen fælles nøgle; vises som to separate registreringer.',
      first_shelter.capacity, round(distance.meters)::integer
    )
  end as reason
from app_v2.shelter_public_v2 first_shelter
inner join app_v2.shelter_public_v2 second_shelter
  on first_shelter.id < second_shelter.id
 and first_shelter.postal_code = second_shelter.postal_code
 and first_shelter.capacity = second_shelter.capacity
inner join app_v2.shelters first_source on first_source.id = first_shelter.id
inner join app_v2.shelters second_source on second_source.id = second_shelter.id
cross join lateral (
  select lower(first_shelter.address_line1) = lower(second_shelter.address_line1) as value
) same_address
cross join lateral (
  select sqrt(
    power((second_shelter.latitude - first_shelter.latitude)::double precision * 111320, 2)
    + power(
      (second_shelter.longitude - first_shelter.longitude)::double precision
        * 111320 * cos(radians(first_shelter.latitude::double precision)),
      2
    )
  ) as meters
) distance
where first_source.canonical_source_reference is distinct from second_source.canonical_source_reference
  and distance.meters < 35;

revoke all on table app_v2.registration_duplicate_review_v1 from public, anon, authenticated;
grant select on table app_v2.registration_duplicate_review_v1 to service_role;

comment on view app_v2.registration_duplicate_review_v1 is
'Internal review list: registrations that may be one shelter on two addresses. Not used by public pages.';

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------

select app_v2.refresh_shelter_path_aliases_v1();
select app_v2.refresh_postal_areas_from_registrations_v1();
