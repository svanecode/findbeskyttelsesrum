-- A path that a public registration owns today must never answer 410.
--
-- The two lookups behind the 410 page took every path from the history of a
-- removed registration without asking whether the path is now the readable
-- path of a public registration. When registration A (plain path owner) left
-- BBR and the path history was not refreshed that day (the derived step can
-- fail without an alarm), the plain path stayed on the 410 list while the app
-- gave the same path to registration B at the address (review of 10 November
-- 2026, M4). Both functions now leave out any path that is currently in
-- app_v2.shelter_readable_path_v1.

-- Same signature and grants as 20261101120000_retired_shelters_respect_exclusions.sql.
-- plpgsql, so the readable-path view (a window over every public registration)
-- is only read once a removed registration has actually matched.
create or replace function app_v2.resolve_retired_shelter_v1(p_slug text)
returns table (
  address_line1 text,
  postal_code text,
  city text,
  latitude numeric,
  longitude numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row record;
begin
  if p_slug is null or length(trim(p_slug)) not between 1 and 240 then
    return;
  end if;

  select
    coalesce(override_row.address_line1, s.address_line1) as address_line1,
    coalesce(override_row.postal_code, s.postal_code) as postal_code,
    coalesce(override_row.city, s.city) as city,
    s.latitude,
    s.longitude
  into v_row
  from (
    select shelter.id
    from app_v2.shelters shelter
    where shelter.slug = p_slug
    union
    select alias.shelter_id from app_v2.shelter_slug_aliases alias where alias.alias_slug = p_slug
    union
    select alias.shelter_id from app_v2.shelter_path_aliases alias where alias.path_slug = p_slug
  ) c
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
  where s.import_state = 'missing_from_source'
    and s.publication_state = 'published'
    and coalesce(override_row.capacity, s.capacity) >= 40
    and not app_v2.is_shelter_excluded_v1(s.id)
  limit 1;

  if not found then
    return;
  end if;

  -- The path belongs to a public registration today: the page serves it.
  if exists (
    select 1 from app_v2.shelter_readable_path_v1 current_path where current_path.path_slug = p_slug
  ) then
    return;
  end if;

  return query select v_row.address_line1, v_row.postal_code, v_row.city, v_row.latitude, v_row.longitude;
end;
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
  select encode(sha256(convert_to(path, 'UTF8')), 'hex')
  from paths
  -- A path a public registration owns right now is served, not removed.
  -- NOT IN, so the readable-path view is read once, not once per path.
  where paths.path not in (
    select current_path.path_slug from app_v2.shelter_readable_path_v1 current_path
    where current_path.path_slug is not null
  );
$$;

revoke all on function app_v2.retired_shelter_path_hashes_v1() from public;
grant execute on function app_v2.retired_shelter_path_hashes_v1() to anon, authenticated, service_role;

comment on function app_v2.resolve_retired_shelter_v1(text) is
'The last address of a registration removed from BBR, found by any path it has had. Empty when the path is the readable path of a public registration today.';
comment on function app_v2.retired_shelter_path_hashes_v1() is
'SHA-256 hashes of every path of removed registrations that answers 410, leaving out paths a public registration owns today.';
