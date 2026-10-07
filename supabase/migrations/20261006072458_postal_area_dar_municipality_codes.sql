-- Postcodes without public registrations get their municipality codes from
-- DAR addresses and their BBR buildings (the importer looks them up). Before,
-- only registrations set municipality_codes, so about half of all postcodes
-- had none and a search such as "Vestergade 1, Byrum" could not be limited to
-- the municipality. Registrations still win: a postcode with registrations
-- keeps the codes they give. Codes from DAR accumulate across imports.

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
        municipality_codes = case
          when area.has_registrations then area.municipality_codes
          else coalesce(
            (
              select array_agg(distinct code order by code)
              from unnest(area.municipality_codes || excluded.municipality_codes) as code
            ),
            '{}'
          )
        end,
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
