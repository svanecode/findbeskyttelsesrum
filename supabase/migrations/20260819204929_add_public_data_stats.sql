-- One-row aggregate read model for the public data overview and national map.
-- The view deliberately exposes counts, capacity totals and freshness only;
-- addresses, coordinates and internal identifiers never leave the existing
-- public registration model through this endpoint.
create or replace view app_v2.public_data_stats_v1
with (security_barrier = true)
as
with
active as (
  select s.*
  from app_v2.shelters s
  where s.import_state = 'active'
),
capacity_eligible as (
  select s.*
  from active s
  where s.capacity >= 40
    and s.source_application_code is not null
),
application_eligible as (
  select s.*
  from capacity_eligible s
  inner join app_v2.application_code_eligibility e
    on e.source_name = 'datafordeler-bbr-dar'
   and e.application_code = s.source_application_code
   and e.is_nearby_eligible = true
),
published as (
  select s.*
  from application_eligible s
  where s.publication_state = 'published'
),
visible as (
  select s.*
  from published s
  where not exists (
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
  )
),
mapped as (
  select s.*
  from visible s
  where s.latitude is not null
    and s.longitude is not null
)
select
  (select count(*) from active)::bigint as active_source_registrations,
  (select coalesce(sum(capacity), 0) from active)::bigint as active_source_capacity,
  (select count(*) from capacity_eligible)::bigint as capacity_threshold_registrations,
  (select coalesce(sum(capacity), 0) from capacity_eligible)::bigint as capacity_threshold_capacity,
  (select count(*) from application_eligible)::bigint as application_eligible_registrations,
  (select coalesce(sum(capacity), 0) from application_eligible)::bigint as application_eligible_capacity,
  (select count(*) from published)::bigint as published_registrations,
  (select coalesce(sum(capacity), 0) from published)::bigint as published_capacity,
  (select count(*) from visible)::bigint as public_registrations,
  (select coalesce(sum(capacity), 0) from visible)::bigint as public_capacity,
  (select count(*) from mapped)::bigint as mapped_registrations,
  (select coalesce(sum(capacity), 0) from mapped)::bigint as mapped_capacity,
  (select max(last_imported_at) from visible) as latest_public_import_at;

revoke all on table app_v2.public_data_stats_v1 from public;
grant select on table app_v2.public_data_stats_v1 to anon, authenticated, service_role;

comment on view app_v2.public_data_stats_v1 is
'Safe aggregate read model for the public selection funnel, national map totals and latest public import time.';
