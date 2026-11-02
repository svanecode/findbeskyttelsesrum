-- The plain readable path also passes on when its owner stays public but moves
-- to another address. Until now the upsert only moved a path whose owner had
-- left shelter_public_v2, so the close step closed the owner's alias and the
-- path was left without an owner until a later import, where a larger
-- registration at the address could take it.

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
      -- A path only changes registration when its current owner no longer has
      -- it: the owner has left the public view or moved to another address
      -- (or the alias was already closed).
      where alias.valid_to is not null
        or (
          alias.shelter_id <> excluded.shelter_id
          and not exists (
            select 1 from app_v2.shelter_readable_path_v1 owner_path
            where owner_path.path_slug = alias.path_slug
              and owner_path.shelter_id = alias.shelter_id
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
