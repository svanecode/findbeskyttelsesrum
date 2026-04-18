create index if not exists app_v2_shelters_nearby_lat_lng_active_idx
on app_v2.shelters (latitude, longitude)
where import_state = 'active'
  and latitude is not null
  and longitude is not null;

create or replace function app_v2.get_nearby_shelters(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters integer default 50000,
  p_limit integer default 10,
  p_candidate_limit integer default 500,
  p_import_states text[] default array['active']
)
returns table (
  results jsonb,
  diagnostics jsonb
)
language plpgsql
stable
set search_path = app_v2, pg_temp
as $$
declare
  v_import_states text[];
begin
  if p_lat is null or p_lat < -90 or p_lat > 90 then
    raise exception 'app_v2.get_nearby_shelters requires p_lat between -90 and 90';
  end if;

  if p_lng is null or p_lng < -180 or p_lng > 180 then
    raise exception 'app_v2.get_nearby_shelters requires p_lng between -180 and 180';
  end if;

  if p_radius_meters is null or p_radius_meters <= 0 then
    raise exception 'app_v2.get_nearby_shelters requires a positive p_radius_meters';
  end if;

  if p_limit is null or p_limit <= 0 then
    raise exception 'app_v2.get_nearby_shelters requires a positive p_limit';
  end if;

  if p_candidate_limit is null or p_candidate_limit <= 0 then
    raise exception 'app_v2.get_nearby_shelters requires a positive p_candidate_limit';
  end if;

  if p_candidate_limit < p_limit then
    raise exception 'app_v2.get_nearby_shelters requires p_candidate_limit >= p_limit';
  end if;

  v_import_states := (
    select array_agg(distinct state)
    from unnest(coalesce(p_import_states, array['active'])) as states(state)
    where state is not null
  );

  if v_import_states is null or cardinality(v_import_states) = 0 then
    raise exception 'app_v2.get_nearby_shelters requires at least one import state';
  end if;

  if exists (
    select 1
    from unnest(v_import_states) as states(state)
    where state not in ('active', 'missing_from_source', 'suppressed')
  ) then
    raise exception 'app_v2.get_nearby_shelters received an unsupported import state';
  end if;

  return query
  with constants as (
    select
      6371000.0::double precision as earth_radius_meters,
      (p_radius_meters::double precision / 6371000.0::double precision) * (180.0::double precision / pi()) as latitude_delta,
      (
        p_radius_meters::double precision
        / (6371000.0::double precision * greatest(cos(radians(p_lat)), 0.01::double precision))
      ) * (180.0::double precision / pi()) as longitude_delta
  ),
  bounded_candidates as (
    select
      s.id,
      s.municipality_id,
      s.slug,
      s.name,
      s.address_line1,
      s.postal_code,
      s.city,
      s.latitude::double precision as latitude,
      s.longitude::double precision as longitude,
      s.capacity,
      s.status,
      s.import_state,
      s.canonical_source_name,
      s.canonical_source_reference,
      m.slug as municipality_slug,
      m.name as municipality_name,
      m.code as municipality_code,
      m.region_name as municipality_region_name
    from app_v2.shelters s
    join app_v2.municipalities m on m.id = s.municipality_id
    cross join constants c
    where s.import_state = any(v_import_states)
      and s.latitude is not null
      and s.longitude is not null
      and s.latitude::double precision between greatest(p_lat - c.latitude_delta, -90.0::double precision)
        and least(p_lat + c.latitude_delta, 90.0::double precision)
      and s.longitude::double precision between greatest(p_lng - c.longitude_delta, -180.0::double precision)
        and least(p_lng + c.longitude_delta, 180.0::double precision)
    order by
      power(s.latitude::double precision - p_lat, 2) + power(s.longitude::double precision - p_lng, 2),
      s.slug
    limit p_candidate_limit
  ),
  visible_candidates as (
    select bc.*
    from bounded_candidates bc
    where not exists (
      select 1
      from app_v2.shelter_exclusions se
      where se.is_active = true
        and (
          se.shelter_id = bc.id
          or (
            se.canonical_source_name is not null
            and se.canonical_source_reference is not null
            and se.canonical_source_name = bc.canonical_source_name
            and se.canonical_source_reference = bc.canonical_source_reference
          )
          or (
            se.address_line1 is not null
            and se.postal_code is not null
            and lower(se.address_line1) = lower(bc.address_line1)
            and se.postal_code = bc.postal_code
            and (
              se.city is null
              or lower(se.city) = lower(bc.city)
            )
          )
        )
    )
  ),
  distance_candidates as (
    select
      vc.*,
      (
        6371000.0::double precision * 2.0::double precision * atan2(
          sqrt(
            power(sin(radians(vc.latitude - p_lat) / 2.0::double precision), 2)
            + cos(radians(p_lat))
            * cos(radians(vc.latitude))
            * power(sin(radians(vc.longitude - p_lng) / 2.0::double precision), 2)
          ),
          sqrt(
            greatest(
              0.0::double precision,
              1.0::double precision - (
                power(sin(radians(vc.latitude - p_lat) / 2.0::double precision), 2)
                + cos(radians(p_lat))
                * cos(radians(vc.latitude))
                * power(sin(radians(vc.longitude - p_lng) / 2.0::double precision), 2)
              )
            )
          )
        )
      ) as distance_meters
    from visible_candidates vc
  ),
  within_radius as (
    select *
    from distance_candidates
    where distance_meters <= p_radius_meters
  ),
  limited_results as (
    select *
    from within_radius
    order by distance_meters asc, slug asc
    limit p_limit
  ),
  stats as (
    select
      (select count(*) from bounded_candidates) as candidate_rows_read,
      (select count(*) from bounded_candidates) - (select count(*) from visible_candidates) as excluded_by_app_v2_exclusions,
      (select count(*) from visible_candidates) as candidates_with_coordinates,
      (select count(*) from within_radius) as candidates_within_radius,
      (select count(*) from limited_results) as returned_rows
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', lr.id,
            'municipality_id', lr.municipality_id,
            'slug', lr.slug,
            'name', lr.name,
            'address_line1', lr.address_line1,
            'postal_code', lr.postal_code,
            'city', lr.city,
            'latitude', lr.latitude,
            'longitude', lr.longitude,
            'capacity', lr.capacity,
            'status', lr.status,
            'import_state', lr.import_state,
            'canonical_source_name', lr.canonical_source_name,
            'canonical_source_reference', lr.canonical_source_reference,
            'municipality_slug', lr.municipality_slug,
            'municipality_name', lr.municipality_name,
            'municipality_code', lr.municipality_code,
            'municipality_region_name', lr.municipality_region_name,
            'distance_meters', lr.distance_meters
          )
          order by lr.distance_meters asc, lr.slug asc
        )
        from limited_results lr
      ),
      '[]'::jsonb
    ) as results,
    jsonb_build_object(
      'readModel', 'app_v2_nearby_db_rpc_v1',
      'radiusMeters', p_radius_meters,
      'limit', p_limit,
      'candidateLimit', p_candidate_limit,
      'importStates', to_jsonb(v_import_states),
      'candidateRowsRead', stats.candidate_rows_read,
      'excludedByAppV2Exclusions', stats.excluded_by_app_v2_exclusions,
      'candidatesWithCoordinates', stats.candidates_with_coordinates,
      'candidatesWithinRadius', stats.candidates_within_radius,
      'returnedRows', stats.returned_rows,
      'distanceStrategy', 'database_haversine',
      'spatialIndex', false,
      'groupedLegacyShape', false
    ) as diagnostics
  from stats;
end;
$$;

grant execute on function app_v2.get_nearby_shelters(double precision, double precision, integer, integer, integer, text[]) to service_role;

comment on function app_v2.get_nearby_shelters(double precision, double precision, integer, integer, integer, text[]) is
'First app_v2 database-side nearby read foundation. Returns app_v2-native rows and diagnostics using bounding-box prefiltering plus database-side Haversine distance ordering. It is not legacy grouped output and does not mirror public.excluded_shelters.';
