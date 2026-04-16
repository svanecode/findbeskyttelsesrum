create or replace function app_v2.set_updated_at()
returns trigger
language plpgsql
set search_path = app_v2, pg_temp
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
