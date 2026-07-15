-- Keep exclusion administration outside the anonymous/authenticated Data API.
revoke all on function public.list_excluded_shelters() from public, anon, authenticated;
grant execute on function public.list_excluded_shelters() to service_role;

-- Public catalog data contains no exclusions, importer diagnostics or write surfaces.
create or replace view app_v2.municipality_public as
select m.*
from app_v2.municipalities m;

create or replace view app_v2.application_code_public as
select application_code, label
from app_v2.application_code_eligibility
where source_name = 'datafordeler-bbr-dar'
  and is_nearby_eligible = true;

revoke all on table app_v2.application_code_public from public;
grant select on app_v2.application_code_public to anon, authenticated;
grant select on app_v2.municipality_public to anon, authenticated;

-- Anonymous nearby reads operate only on the already-filtered public views.
-- The function is SECURITY INVOKER, validates all expensive inputs and applies
-- the candidate cap after public eligibility filtering.
create or replace function app_v2.get_nearby_shelters_public(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters integer default 50000,
  p_limit integer default 10,
  p_candidate_limit integer default 500
)
returns table (
  results jsonb,
  diagnostics jsonb
)
language plpgsql
stable
security invoker
set search_path = app_v2, pg_temp
as $$
begin
  if p_lat is null or p_lat < -90 or p_lat > 90 then
    raise exception 'latitude must be between -90 and 90';
  end if;
  if p_lng is null or p_lng < -180 or p_lng > 180 then
    raise exception 'longitude must be between -180 and 180';
  end if;
  if p_radius_meters is null or p_radius_meters < 1 or p_radius_meters > 100000 then
    raise exception 'radius must be between 1 and 100000 meters';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'limit must be between 1 and 500';
  end if;
  if p_candidate_limit is null or p_candidate_limit < p_limit or p_candidate_limit > 500 then
    raise exception 'candidate limit must be between limit and 500';
  end if;

  return query
  with constants as (
    select
      6371000.0::double precision as earth_radius_meters,
      (p_radius_meters::double precision / 6371000.0) * (180.0 / pi()) as latitude_delta,
      (p_radius_meters::double precision / (6371000.0 * greatest(cos(radians(p_lat)), 0.01)))
        * (180.0 / pi()) as longitude_delta
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
      s.source_application_code,
      m.slug as municipality_slug,
      m.name as municipality_name,
      m.code as municipality_code,
      m.region_name as municipality_region_name
    from app_v2.shelter_public s
    join app_v2.municipality_public m on m.id = s.municipality_id
    cross join constants c
    where s.latitude is not null
      and s.longitude is not null
      and s.latitude::double precision between greatest(p_lat - c.latitude_delta, -90.0)
        and least(p_lat + c.latitude_delta, 90.0)
      and s.longitude::double precision between greatest(p_lng - c.longitude_delta, -180.0)
        and least(p_lng + c.longitude_delta, 180.0)
    order by
      power(s.latitude::double precision - p_lat, 2) + power(s.longitude::double precision - p_lng, 2),
      s.slug
    limit p_candidate_limit
  ),
  distance_candidates as (
    select
      bc.*,
      constants.earth_radius_meters * 2.0 * atan2(
        sqrt(
          power(sin(radians(bc.latitude - p_lat) / 2.0), 2)
          + cos(radians(p_lat)) * cos(radians(bc.latitude))
          * power(sin(radians(bc.longitude - p_lng) / 2.0), 2)
        ),
        sqrt(greatest(
          0.0,
          1.0 - (
            power(sin(radians(bc.latitude - p_lat) / 2.0), 2)
            + cos(radians(p_lat)) * cos(radians(bc.latitude))
            * power(sin(radians(bc.longitude - p_lng) / 2.0), 2)
          )
        ))
      ) as distance_meters
    from bounded_candidates bc
    cross join constants
  ),
  limited_results as (
    select *
    from distance_candidates
    where distance_meters <= p_radius_meters
    order by distance_meters, slug
    limit p_limit
  ),
  stats as (
    select
      (select count(*) from bounded_candidates) as candidate_rows_read,
      (select count(*) from distance_candidates where distance_meters <= p_radius_meters) as candidates_within_radius,
      (select count(*) from limited_results) as returned_rows
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
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
        'source_application_code', lr.source_application_code,
        'source_application_code_nearby_eligible', true,
        'municipality_slug', lr.municipality_slug,
        'municipality_name', lr.municipality_name,
        'municipality_code', lr.municipality_code,
        'municipality_region_name', lr.municipality_region_name,
        'distance_meters', lr.distance_meters
      ) order by lr.distance_meters, lr.slug)
      from limited_results lr
    ), '[]'::jsonb),
    jsonb_build_object(
      'readModel', 'app_v2_public_nearby_rpc_v2',
      'radiusMeters', p_radius_meters,
      'limit', p_limit,
      'candidateLimit', p_candidate_limit,
      'importStates', jsonb_build_array('active'),
      'candidateRowsRead', stats.candidate_rows_read,
      'excludedByAppV2Exclusions', 0,
      'candidatesWithCoordinates', stats.candidate_rows_read,
      'candidatesWithinRadius', stats.candidates_within_radius,
      'returnedRows', stats.returned_rows,
      'distanceStrategy', 'public_view_database_haversine',
      'spatialIndex', false,
      'groupedLegacyShape', false
    )
  from stats;
end;
$$;

revoke all on function app_v2.get_nearby_shelters_public(double precision, double precision, integer, integer, integer)
from public;
grant execute on function app_v2.get_nearby_shelters_public(double precision, double precision, integer, integer, integer)
to anon, authenticated, service_role;

comment on function app_v2.get_nearby_shelters_public(double precision, double precision, integer, integer, integer) is
'Bounded anonymous nearby lookup over app_v2 public views. Eligibility and exclusions are applied before candidate limiting.';
