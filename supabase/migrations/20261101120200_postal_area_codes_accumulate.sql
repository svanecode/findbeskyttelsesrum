-- Postcodes across a municipal border keep the codes from both sides.
--
-- refresh_postal_areas_from_registrations_v1 replaced municipality_codes with
-- the codes of the registrations, so a postcode whose registrations are all on
-- one side lost the other side that DAR had found. Codes now accumulate here
-- too, the same way upsert_dar_postal_areas_v1 adds the codes DAR finds.
-- Registrations whose municipality is unknown still count in the position.
--
-- upsert_dar_postal_areas_v1 now adds DAR codes to postcodes with
-- registrations as well; the registrations' position still wins over DAR.
-- Accepted: codes only grow (a wrong code is never removed), and a failed page
-- of a postcode's DAR addresses drops the pages already read for it.
--
-- upsert_dar_postal_areas_v1 also refuses a missing list instead of saving nothing
-- without a word, and skips a postcode with a position outside Denmark instead
-- of letting the table's check constraint stop the whole batch.

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

create or replace function app_v2.upsert_dar_postal_areas_v1(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_rows is null then
    raise exception 'p_rows is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'p_rows must be an array of at most 2000 postcodes';
  end if;

  with parsed as (
    select
      row->>'postnr' as postnr,
      trim(row->>'name') as name,
      nullif(row->>'latitude', '')::double precision as latitude,
      nullif(row->>'longitude', '')::double precision as longitude,
      coalesce(
        (
          select array_agg(distinct code order by code)
          from jsonb_array_elements_text(
            case when jsonb_typeof(row->'municipality_codes') = 'array' then row->'municipality_codes' else '[]'::jsonb end
          ) as code
          where code ~ '^[0-9]{4}$'
        ),
        '{}'
      ) as municipality_codes
    from jsonb_array_elements(p_rows) as row
    where row->>'postnr' ~ '^[0-9]{4}$'
      and length(trim(coalesce(row->>'name', ''))) between 1 and 80
  ),
  incoming as (
    -- Same bounds as the check constraints on app_v2.postal_areas.
    select *
    from parsed
    where (latitude is null or latitude between 54 and 58)
      and (longitude is null or longitude between 7 and 16)
  )
  insert into app_v2.postal_areas as area (postnr, name, municipality_codes, latitude, longitude, position_source, updated_at)
  select
    postnr,
    name,
    municipality_codes,
    latitude,
    longitude,
    case when latitude is not null and longitude is not null then 'dar_address' end,
    timezone('utc', now())
  from incoming
  on conflict (postnr) do update
    set name = excluded.name,
        -- Codes found in DAR are added to the known ones, never replace them:
        -- a sample of addresses can miss one side of a municipal border.
        -- Also for a postcode with registrations: they can all lie on one
        -- side of a municipal border. Their position still wins below.
        municipality_codes = coalesce(
          (
            select array_agg(distinct code order by code)
            from unnest(area.municipality_codes || excluded.municipality_codes) as code
          ),
          '{}'
        ),
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
