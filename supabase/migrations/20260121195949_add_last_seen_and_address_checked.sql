-- The legacy table is not part of a fresh app_v2-only database. Preserve the
-- historical upgrade when it exists without making clean migration replay
-- depend on an out-of-band legacy table.
do $$
begin
  if to_regclass('public.sheltersv2') is not null then
    alter table public.sheltersv2
      add column if not exists last_seen_at timestamp with time zone,
      add column if not exists last_address_checked timestamp with time zone;
  end if;
end;
$$;
