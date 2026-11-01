-- A shared link to a readable path must stay with the registration that has it.
-- Until now the registration with the most places at an address got the plain
-- path, so when a neighbour at the same address grew, the plain path moved.
-- Now the current owner of the plain path keeps it as long as it is public.

create or replace view app_v2.shelter_readable_path_v1
with (security_barrier = true)
as
with base as (
  select
    id,
    capacity,
    app_v2.readable_shelter_base_slug_v1(address_line1, postal_code, city) as base_slug
  from app_v2.shelter_public_v2
)
select
  id as shelter_id,
  case
    when row_number() over (
      partition by base_slug
      order by
        exists (
          select 1
          from app_v2.shelter_path_aliases owner_alias
          where owner_alias.path_slug = base.base_slug
            and owner_alias.shelter_id = base.id
            and owner_alias.valid_to is null
        ) desc,
        capacity desc,
        id
    ) = 1 then base_slug
    else base_slug || '-' || left(replace(id::text, '-', ''), 6)
  end as path_slug
from base;

revoke all on table app_v2.shelter_readable_path_v1 from public, anon, authenticated;
grant select on table app_v2.shelter_readable_path_v1 to service_role;

create or replace function app_v2.refresh_shelter_path_aliases_v1()
returns table (opened integer, closed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_opened integer;
  v_closed integer;
begin
  with current_paths as (
    select path_slug, shelter_id from app_v2.shelter_readable_path_v1
  ), upserted as (
    insert into app_v2.shelter_path_aliases as alias (path_slug, shelter_id, valid_from, valid_to)
    select path_slug, shelter_id, v_now, null from current_paths
    on conflict (path_slug) do update
      set shelter_id = excluded.shelter_id,
          valid_from = case
            when alias.shelter_id <> excluded.shelter_id or alias.valid_to is not null then v_now
            else alias.valid_from
          end,
          valid_to = null
      -- A path only changes registration when its current owner has left the
      -- public view (or the alias was already closed).
      where alias.valid_to is not null
        or (
          alias.shelter_id <> excluded.shelter_id
          and not exists (
            select 1 from app_v2.shelter_public_v2 owner_shelter
            where owner_shelter.id = alias.shelter_id
          )
        )
    returning 1
  )
  select count(*)::integer into v_opened from upserted;

  update app_v2.shelter_path_aliases alias
  set valid_to = v_now
  where alias.valid_to is null
    and not exists (
      select 1
      from app_v2.shelter_readable_path_v1 current_path
      where current_path.path_slug = alias.path_slug
        and current_path.shelter_id = alias.shelter_id
    );
  get diagnostics v_closed = row_count;

  return query select v_opened, v_closed;
end;
$$;

revoke all on function app_v2.refresh_shelter_path_aliases_v1() from public, anon, authenticated;
grant execute on function app_v2.refresh_shelter_path_aliases_v1() to service_role;

-- The registrations that own the plain readable path of their address right
-- now. The page and the sitemap use this to pick the same canonical path as
-- the database, instead of re-deriving it from the number of places.
create or replace function app_v2.public_plain_path_owner_ids_v1(p_postal_code text default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select public_shelter.id
  from app_v2.shelter_public_v2 public_shelter
  inner join app_v2.shelter_path_aliases alias
    on alias.shelter_id = public_shelter.id
   and alias.valid_to is null
   and alias.path_slug = app_v2.readable_shelter_base_slug_v1(
     public_shelter.address_line1, public_shelter.postal_code, public_shelter.city)
  where p_postal_code is null or public_shelter.postal_code = p_postal_code
  order by public_shelter.id;
$$;

revoke all on function app_v2.public_plain_path_owner_ids_v1(text) from public, anon, authenticated;
grant execute on function app_v2.public_plain_path_owner_ids_v1(text) to anon, authenticated, service_role;
