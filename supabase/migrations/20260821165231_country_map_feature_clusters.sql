-- The national map previously paginated every marker in the viewport through
-- PostgREST and sampled the result in the Next.js route. This bounded RPC
-- keeps the complete public read model in Postgres and returns grid clusters
-- at low zoom levels, so public map requests use one connection and a small,
-- deterministic payload without dropping registrations at random.

create index if not exists app_v2_shelters_country_map_bounds_idx
on app_v2.shelters (longitude, latitude)
include (id, capacity, source_application_code)
where import_state = 'active'
  and publication_state = 'published'
  and capacity >= 40
  and source_application_code is not null
  and latitude is not null
  and longitude is not null;

create or replace function app_v2.get_country_map_features_public_v1(
  p_north double precision,
  p_south double precision,
  p_east double precision,
  p_west double precision,
  p_zoom integer,
  p_limit integer default 5000
)
returns table (
  features jsonb,
  diagnostics jsonb
)
language plpgsql
stable
security invoker
set search_path = app_v2, pg_temp
as $$
declare
  v_grid_latitude double precision;
  v_grid_longitude double precision;
  v_mode text;
begin
  if p_north is null or p_south is null
    or p_north < -90 or p_north > 90
    or p_south < -90 or p_south > 90
    or p_north <= p_south then
    raise exception 'north and south must be ordered coordinates between -90 and 90';
  end if;

  if p_east is null or p_west is null
    or p_east < -180 or p_east > 180
    or p_west < -180 or p_west > 180
    or p_east <= p_west then
    raise exception 'east and west must be ordered coordinates between -180 and 180';
  end if;

  if p_zoom is null or p_zoom < 5 or p_zoom > 18 then
    raise exception 'zoom must be between 5 and 18';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'limit must be between 1 and 5000';
  end if;

  if p_zoom <= 6 then
    v_grid_latitude := 0.4;
    v_grid_longitude := 0.8;
  elsif p_zoom = 7 then
    v_grid_latitude := 0.2;
    v_grid_longitude := 0.4;
  elsif p_zoom = 8 then
    v_grid_latitude := 0.1;
    v_grid_longitude := 0.2;
  elsif p_zoom = 9 then
    v_grid_latitude := 0.05;
    v_grid_longitude := 0.1;
  else
    v_grid_latitude := null;
    v_grid_longitude := null;
  end if;

  v_mode := case when v_grid_latitude is null then 'markers' else 'clusters' end;

  if v_mode = 'clusters' then
    return query
    with bounded as materialized (
      select
        marker.id,
        marker.slug,
        marker.name,
        marker.address_line1,
        marker.postal_code,
        marker.city,
        marker.latitude::double precision as latitude,
        marker.longitude::double precision as longitude,
        marker.capacity,
        marker.source_application_code,
        floor((marker.latitude::double precision + 90.0) / v_grid_latitude)::integer as grid_y,
        floor((marker.longitude::double precision + 180.0) / v_grid_longitude)::integer as grid_x
      from app_v2.country_marker_public_v2 marker
      where marker.latitude between p_south::numeric and p_north::numeric
        and marker.longitude between p_west::numeric and p_east::numeric
    ),
    grouped as (
      select
        grid_y,
        grid_x,
        count(*)::integer as registration_count,
        sum(capacity)::bigint as total_capacity,
        avg(latitude) as latitude,
        avg(longitude) as longitude,
        min(latitude) as south,
        max(latitude) as north,
        min(longitude) as west,
        max(longitude) as east,
        min(slug) as slug,
        min(name) as name,
        min(address_line1) as address_line1,
        min(postal_code) as postal_code,
        min(city) as city,
        min(capacity) as capacity,
        min(source_application_code) as source_application_code
      from bounded
      group by grid_y, grid_x
    ),
    feature_rows as (
      select
        grid_y,
        grid_x,
        registration_count,
        case
          when registration_count = 1 then jsonb_build_object(
            'kind', 'marker',
            'slug', slug,
            'name', name,
            'addressLine1', address_line1,
            'postalCode', postal_code,
            'city', city,
            'capacity', capacity,
            'sourceApplicationCode', source_application_code,
            'latitude', latitude,
            'longitude', longitude
          )
          else jsonb_build_object(
            'kind', 'cluster',
            'id', concat(p_zoom, ':', grid_y, ':', grid_x),
            'latitude', latitude,
            'longitude', longitude,
            'north', north,
            'south', south,
            'east', east,
            'west', west,
            'count', registration_count,
            'capacity', total_capacity
          )
        end as feature
      from grouped
    ),
    limited as materialized (
      select *
      from feature_rows
      order by grid_y, grid_x
      limit p_limit
    ),
    stats as (
      select
        (select count(*) from bounded)::bigint as available_count,
        (select count(*) from feature_rows)::bigint as total_feature_count,
        count(*)::bigint as feature_count,
        count(*) filter (where registration_count = 1)::bigint as marker_count,
        count(*) filter (where registration_count > 1)::bigint as cluster_count,
        coalesce(sum(registration_count) filter (where registration_count > 1), 0)::bigint
          as clustered_registration_count
      from limited
    )
    select
      coalesce(
        (select jsonb_agg(limited.feature order by limited.grid_y, limited.grid_x) from limited),
        '[]'::jsonb
      ),
      jsonb_build_object(
        'contract', 'country_map_features_v1',
        'mode', v_mode,
        'zoom', p_zoom,
        'availableCount', stats.available_count,
        'featureCount', stats.feature_count,
        'markerCount', stats.marker_count,
        'clusterCount', stats.cluster_count,
        'clusteredRegistrationCount', stats.clustered_registration_count,
        'truncated', stats.total_feature_count > stats.feature_count,
        'limit', p_limit,
        'gridLatitude', v_grid_latitude,
        'gridLongitude', v_grid_longitude
      )
    from stats;
  else
    return query
    with bounded as materialized (
      select
        marker.slug,
        marker.name,
        marker.address_line1,
        marker.postal_code,
        marker.city,
        marker.latitude::double precision as latitude,
        marker.longitude::double precision as longitude,
        marker.capacity,
        marker.source_application_code
      from app_v2.country_marker_public_v2 marker
      where marker.latitude between p_south::numeric and p_north::numeric
        and marker.longitude between p_west::numeric and p_east::numeric
    ),
    limited as materialized (
      select *
      from bounded
      order by latitude, longitude, slug
      limit p_limit
    ),
    stats as (
      select
        (select count(*) from bounded)::bigint as available_count,
        count(*)::bigint as feature_count
      from limited
    )
    select
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'kind', 'marker',
              'slug', limited.slug,
              'name', limited.name,
              'addressLine1', limited.address_line1,
              'postalCode', limited.postal_code,
              'city', limited.city,
              'capacity', limited.capacity,
              'sourceApplicationCode', limited.source_application_code,
              'latitude', limited.latitude,
              'longitude', limited.longitude
            )
            order by limited.latitude, limited.longitude, limited.slug
          )
          from limited
        ),
        '[]'::jsonb
      ),
      jsonb_build_object(
        'contract', 'country_map_features_v1',
        'mode', v_mode,
        'zoom', p_zoom,
        'availableCount', stats.available_count,
        'featureCount', stats.feature_count,
        'markerCount', stats.feature_count,
        'clusterCount', 0,
        'clusteredRegistrationCount', 0,
        'truncated', stats.available_count > stats.feature_count,
        'limit', p_limit,
        'gridLatitude', null,
        'gridLongitude', null
      )
    from stats;
  end if;
end;
$$;

revoke all on function app_v2.get_country_map_features_public_v1(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  integer
) from public;

grant execute on function app_v2.get_country_map_features_public_v1(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  integer
) to anon, authenticated, service_role;

comment on function app_v2.get_country_map_features_public_v1(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  integer
) is
'Returns bounded public country-map markers or deterministic grid clusters. It exposes only the public registration read model and caps every response.';
