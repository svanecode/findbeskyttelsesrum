-- Split public visibility from the legacy `status` field. The Datafordeler
-- importer currently marks source-backed rows as `under_review`, so that field
-- cannot safely be used as a public availability or publication signal.
alter table app_v2.shelters
add column if not exists publication_state text not null default 'published'
check (publication_state in ('published', 'withheld'));

comment on column app_v2.shelters.publication_state is
'Internal publication control. This is deliberately separate from source/import lifecycle and review status.';

create index if not exists app_v2_shelters_publication_state_idx
on app_v2.shelters (publication_state)
where publication_state = 'published';

-- Versioned public views keep the previous deployment working while the app
-- switches read models. Base tables remain revoked from anonymous roles; these
-- security-barrier views are the explicit public API allowlist.
create or replace view app_v2.shelter_public_v2
with (security_barrier = true)
as
select
  s.id,
  s.municipality_id,
  s.slug,
  s.name,
  s.address_line1,
  s.postal_code,
  s.city,
  s.latitude,
  s.longitude,
  s.capacity,
  s.accessibility_notes,
  s.summary,
  s.source_summary,
  s.last_seen_at,
  s.last_imported_at,
  s.source_application_code
from app_v2.shelters s
inner join app_v2.application_code_eligibility e
  on e.source_name = 'datafordeler-bbr-dar'
 and e.application_code = s.source_application_code
 and e.is_nearby_eligible = true
where s.import_state = 'active'
  and s.publication_state = 'published'
  and s.capacity >= 40
  and s.source_application_code is not null
  and not exists (
    select 1
    from app_v2.shelter_exclusions ex
    where ex.is_active = true
      and (
        ex.shelter_id = s.id
        or (
          ex.canonical_source_name is not null
          and ex.canonical_source_reference is not null
          and ex.canonical_source_name = s.canonical_source_name
          and ex.canonical_source_reference = s.canonical_source_reference
        )
        or (
          ex.address_line1 is not null
          and ex.postal_code is not null
          and regexp_replace(lower(trim(both from replace(ex.address_line1, ',', ' '))), '[[:space:]]+', ' ', 'g')
            = regexp_replace(lower(trim(both from replace(s.address_line1, ',', ' '))), '[[:space:]]+', ' ', 'g')
          and trim(both from ex.postal_code) = trim(both from s.postal_code)
          and (
            ex.city is null
            or regexp_replace(lower(trim(both from replace(ex.city, ',', ' '))), '[[:space:]]+', ' ', 'g')
             = regexp_replace(lower(trim(both from replace(s.city, ',', ' '))), '[[:space:]]+', ' ', 'g')
          )
        )
      )
  );

create or replace view app_v2.country_marker_public_v2
with (security_barrier = true)
as
select
  id,
  slug,
  name,
  address_line1,
  postal_code,
  city,
  latitude,
  longitude,
  capacity,
  source_application_code
from app_v2.shelter_public_v2
where latitude is not null
  and longitude is not null;

create or replace view app_v2.sitemap_shelter_public_v2
with (security_barrier = true)
as
select
  slug,
  coalesce(last_imported_at, last_seen_at) as last_modified
from app_v2.shelter_public_v2
where slug is not null
  and trim(slug) <> '';

create or replace view app_v2.municipality_public_v2
with (security_barrier = true)
as
select
  m.id,
  m.code,
  m.slug,
  m.name,
  m.description,
  m.region_name
from app_v2.municipalities m
where exists (
  select 1
  from app_v2.shelter_public_v2 sp
  where sp.municipality_id = m.id
);

create or replace function app_v2.get_nearby_shelters_public_v2(
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
      s.source_application_code,
      m.slug as municipality_slug,
      m.name as municipality_name,
      m.code as municipality_code,
      m.region_name as municipality_region_name
    from app_v2.shelter_public_v2 s
    join app_v2.municipality_public_v2 m on m.id = s.municipality_id
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
      'readModel', 'app_v2_public_registration_rpc_v3',
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

revoke all on table app_v2.shelter_public_v2 from public;
revoke all on table app_v2.country_marker_public_v2 from public;
revoke all on table app_v2.sitemap_shelter_public_v2 from public;
revoke all on table app_v2.municipality_public_v2 from public;

grant select on app_v2.shelter_public_v2 to anon, authenticated, service_role;
grant select on app_v2.country_marker_public_v2 to anon, authenticated, service_role;
grant select on app_v2.sitemap_shelter_public_v2 to anon, authenticated, service_role;
grant select on app_v2.municipality_public_v2 to anon, authenticated, service_role;

revoke all on function app_v2.get_nearby_shelters_public_v2(double precision, double precision, integer, integer, integer)
from public;
grant execute on function app_v2.get_nearby_shelters_public_v2(double precision, double precision, integer, integer, integer)
to anon, authenticated, service_role;

comment on view app_v2.shelter_public_v2 is
'Public registration read model. Internal status, import state, canonical references and publication control are intentionally omitted.';

comment on function app_v2.get_nearby_shelters_public_v2(double precision, double precision, integer, integer, integer) is
'Bounded public nearby lookup over published BBR registrations. Internal review and publication fields are not returned.';
