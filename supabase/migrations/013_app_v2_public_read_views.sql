-- Public read model: views encode the same rules as former TS "Public*" filters
-- (active import, capacity >= 40, source-application-code eligibility, exclusions).
-- Base tables are revoked from anon/authenticated/PUBLIC; anon reads only these views.

create or replace view app_v2.shelter_public as
select s.*
from app_v2.shelters s
inner join app_v2.application_code_eligibility e
  on e.source_name = 'datafordeler-bbr-dar'
 and e.application_code = s.source_application_code
 and e.is_nearby_eligible = true
where s.import_state = 'active'
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

create or replace view app_v2.country_marker_public as
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
  source_application_code,
  canonical_source_name,
  canonical_source_reference
from app_v2.shelter_public
where latitude is not null
  and longitude is not null;

create or replace view app_v2.sitemap_shelter_public as
select
  slug,
  coalesce(last_imported_at, last_seen_at) as last_modified
from app_v2.shelter_public
where slug is not null
  and trim(slug) <> '';

create or replace view app_v2.municipality_public as
select m.*
from app_v2.municipalities m
where exists (
  select 1
  from app_v2.shelter_public sp
  where sp.municipality_id = m.id
);

create index if not exists app_v2_shelters_public_eligibility_idx
on app_v2.shelters (capacity, source_application_code, import_state)
where import_state = 'active'
  and source_application_code is not null;

-- Lock down base tables (views still work for anon via view owner privileges).
revoke all on table app_v2.municipalities from public;
revoke all on table app_v2.import_runs from public;
revoke all on table app_v2.shelters from public;
revoke all on table app_v2.shelter_sources from public;
revoke all on table app_v2.shelter_overrides from public;
revoke all on table app_v2.shelter_reports from public;
revoke all on table app_v2.audit_events from public;
revoke all on table app_v2.shelter_exclusions from public;
revoke all on table app_v2.application_code_eligibility from public;

revoke all on table app_v2.municipalities from anon, authenticated;
revoke all on table app_v2.import_runs from anon, authenticated;
revoke all on table app_v2.shelters from anon, authenticated;
revoke all on table app_v2.shelter_sources from anon, authenticated;
revoke all on table app_v2.shelter_overrides from anon, authenticated;
revoke all on table app_v2.shelter_reports from anon, authenticated;
revoke all on table app_v2.audit_events from anon, authenticated;
revoke all on table app_v2.shelter_exclusions from anon, authenticated;
revoke all on table app_v2.application_code_eligibility from anon, authenticated;

grant usage on schema app_v2 to anon, authenticated;

grant select on app_v2.shelter_public to anon, authenticated;
grant select on app_v2.country_marker_public to anon, authenticated;
grant select on app_v2.sitemap_shelter_public to anon, authenticated;
grant select on app_v2.municipality_public to anon, authenticated;

-- Service role retains full access for importers and server-side admin reads.
grant all privileges on all tables in schema app_v2 to service_role;
grant all privileges on all sequences in schema app_v2 to service_role;
