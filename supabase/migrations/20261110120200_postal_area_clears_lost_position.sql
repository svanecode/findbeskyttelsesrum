-- A postcode that lost all its public registrations must not keep their
-- position.
--
-- refresh_postal_areas_from_registrations_v1 only set has_registrations to
-- false and kept latitude, longitude and position_source. When the only public
-- registration in a postcode was excluded by its owner, its coordinate stayed
-- readable through postal_area_public_v1 and /api/app-v2/postal-areas, and the
-- importer counted the postcode as complete, so DAR never filled it in again
-- (review of 10 November 2026, M5).
--
-- Now a postcode with position_source = 'registrations' and no public
-- registrations has latitude, longitude and position_source cleared. The
-- importer's complete_postal_codes() asks for latitude is not null, so such a
-- postcode is incomplete again and the next import looks it up in DAR
-- (upsert_dar_postal_areas_v1 writes the DAR position once has_registrations
-- is false). A position that came from DAR is left alone.
--
-- Also: the check for "lost its registrations" read the public view once per
-- postcode (a full scan each time). It now reads the postcodes with public
-- registrations once.

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
      coalesce(
        array_agg(distinct m.code order by m.code) filter (where m.code is not null),
        '{}'
      ) as municipality_codes,
      avg(s.latitude)::double precision as latitude,
      avg(s.longitude)::double precision as longitude
    from app_v2.shelter_public_v2 s
    left join app_v2.municipalities m on m.id = s.municipality_id
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
    -- Added to the known codes, never replacing them: the registrations can
    -- all lie on one side of a municipal border that crosses the postcode.
    set municipality_codes = coalesce(
          (
            select array_agg(distinct code order by code)
            from unnest(area.municipality_codes || excluded.municipality_codes) as code
          ),
          '{}'
        ),
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        position_source = 'registrations',
        has_registrations = true,
        updated_at = excluded.updated_at;
  get diagnostics v_rows = row_count;

  -- A postcode that lost its registrations: forget their position, so the
  -- importer asks DAR for one again. A DAR position stays.
  update app_v2.postal_areas area
  set has_registrations = false,
      latitude = case when area.position_source = 'registrations' then null else area.latitude end,
      longitude = case when area.position_source = 'registrations' then null else area.longitude end,
      position_source = case when area.position_source = 'registrations' then null else area.position_source end,
      updated_at = timezone('utc', now())
  where (area.has_registrations or area.position_source = 'registrations')
    and area.postnr not in (
      select s.postal_code from app_v2.shelter_public_v2 s where s.postal_code is not null
    );

  return v_rows;
end;
$$;

revoke all on function app_v2.refresh_postal_areas_from_registrations_v1() from public, anon, authenticated;
grant execute on function app_v2.refresh_postal_areas_from_registrations_v1() to service_role;
