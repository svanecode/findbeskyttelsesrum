-- Registrations removed from BBR are shown on the public 410 page with their
-- last address. The two lookups behind that page read app_v2.shelters
-- directly, so an address the owner had excluded reappeared once BBR dropped
-- the record, and an owner's correction was not shown. Both now apply the same
-- exclusion and override rules as app_v2.shelter_public_v2.

-- The exclusion predicate of app_v2.shelter_public_v2
-- (20260820105609_moderator_workflow.sql), unchanged: by shelter id, by
-- canonical source pair, or by normalized address on the shelter's own
-- (not overridden) address.
create or replace function app_v2.is_shelter_excluded_v1(p_shelter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app_v2.shelters shelter
    inner join app_v2.shelter_exclusions exclusion
      on exclusion.is_active = true
     and (
       exclusion.shelter_id = shelter.id
       or (
         exclusion.canonical_source_name is not null
         and exclusion.canonical_source_reference is not null
         and exclusion.canonical_source_name = shelter.canonical_source_name
         and exclusion.canonical_source_reference = shelter.canonical_source_reference
       )
       or (
         exclusion.address_line1 is not null
         and exclusion.postal_code is not null
         and regexp_replace(lower(trim(both from replace(exclusion.address_line1, ',', ' '))), '[[:space:]]+', ' ', 'g')
           = regexp_replace(lower(trim(both from replace(shelter.address_line1, ',', ' '))), '[[:space:]]+', ' ', 'g')
         and trim(both from exclusion.postal_code) = trim(both from shelter.postal_code)
         and (
           exclusion.city is null
           or regexp_replace(lower(trim(both from replace(exclusion.city, ',', ' '))), '[[:space:]]+', ' ', 'g')
            = regexp_replace(lower(trim(both from replace(shelter.city, ',', ' '))), '[[:space:]]+', ' ', 'g')
         )
       )
     )
    where shelter.id = p_shelter_id
  );
$$;

revoke all on function app_v2.is_shelter_excluded_v1(uuid) from public, anon, authenticated;
grant execute on function app_v2.is_shelter_excluded_v1(uuid) to service_role;

comment on function app_v2.is_shelter_excluded_v1(uuid) is
'True when an active shelter_exclusions row hides the shelter, by the same rules as app_v2.shelter_public_v2.';

-- Same signature and grants as 20261002085614_postal_areas_path_aliases_and_review.sql.
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
  select
    coalesce(override_row.address_line1, s.address_line1),
    coalesce(override_row.postal_code, s.postal_code),
    coalesce(override_row.city, s.city),
    s.latitude,
    s.longitude
  from candidates c
  inner join app_v2.shelters s on s.id = c.id
  inner join app_v2.application_code_eligibility e
    on e.source_name = 'datafordeler-bbr-dar'
   and e.application_code = s.source_application_code
   and e.is_nearby_eligible = true
  left join lateral (
    select active_override.*
    from app_v2.shelter_overrides active_override
    where active_override.shelter_id = s.id
      and active_override.is_active = true
      and active_override.effective_from <= timezone('utc', now())
      and (
        active_override.effective_until is null
        or active_override.effective_until > timezone('utc', now())
      )
    order by active_override.effective_from desc, active_override.created_at desc
    limit 1
  ) override_row on true
  where length(trim(p_slug)) between 1 and 240
    and s.import_state = 'missing_from_source'
    and s.publication_state = 'published'
    and coalesce(override_row.capacity, s.capacity) >= 40
    and not app_v2.is_shelter_excluded_v1(s.id)
  limit 1;
$$;

revoke all on function app_v2.resolve_retired_shelter_v1(text) from public;
grant execute on function app_v2.resolve_retired_shelter_v1(text) to anon, authenticated, service_role;

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
    left join lateral (
      select active_override.capacity
      from app_v2.shelter_overrides active_override
      where active_override.shelter_id = s.id
        and active_override.is_active = true
        and active_override.effective_from <= timezone('utc', now())
        and (
          active_override.effective_until is null
          or active_override.effective_until > timezone('utc', now())
        )
      order by active_override.effective_from desc, active_override.created_at desc
      limit 1
    ) override_row on true
    where s.import_state = 'missing_from_source'
      and s.publication_state = 'published'
      and coalesce(override_row.capacity, s.capacity) >= 40
      and not app_v2.is_shelter_excluded_v1(s.id)
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
