-- refresh_shelter_path_aliases_v1 now takes the publication lock.
--
-- Publication, rollback and the retry functions serialize on this advisory
-- lock (hashtextextended('app_v2:datafordeler-publication', 0)). The path
-- alias refresh read the public view and wrote the alias history without it,
-- so a rollback or a repeated call running at the same time could leave
-- aliases closed until the next import (review of 10 November 2026, Low).
-- The lock is transaction-scoped, so it is released when the call ends.
-- Otherwise identical to 20261102120000_readable_path_owner_moves.sql.

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
  perform pg_advisory_xact_lock(hashtextextended('app_v2:datafordeler-publication', 0));

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
