-- Public shelter URLs must remain stable when an address, postcode or
-- municipality changes in the source data. Keep every URL that was public at
-- the time of this migration as a private, server-resolved redirect alias and
-- make the canonical slug depend only on the shelter's immutable UUID.

create table app_v2.shelter_slug_aliases (
  alias_slug text primary key,
  shelter_id uuid not null
    references app_v2.shelters(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  check (length(trim(alias_slug)) between 1 and 240)
);

create index app_v2_shelter_slug_aliases_shelter_id_idx
on app_v2.shelter_slug_aliases (shelter_id);

alter table app_v2.shelter_slug_aliases enable row level security;

create policy private_by_default
on app_v2.shelter_slug_aliases
for all
to anon, authenticated
using (false)
with check (false);

create policy app_v2_shelter_slug_aliases_service_only
on app_v2.shelter_slug_aliases
for all
to service_role
using (true)
with check (true);

revoke all on table app_v2.shelter_slug_aliases
from public, anon, authenticated;
grant select, insert, update, delete on table app_v2.shelter_slug_aliases
to service_role;

comment on table app_v2.shelter_slug_aliases is
'Private redirect history for shelter URLs. The server resolves aliases and only redirects when the target is still public.';

create or replace function app_v2.stable_shelter_slug_v1(p_shelter_id uuid)
returns text
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $$
  select 'registrering-' || replace(p_shelter_id::text, '-', '')
$$;

revoke all on function app_v2.stable_shelter_slug_v1(uuid)
from public, anon, authenticated;
grant execute on function app_v2.stable_shelter_slug_v1(uuid)
to service_role;

-- Capture every URL that could already have been indexed or bookmarked before
-- replacing the canonical slugs. The alias table stays private so it cannot
-- widen the public data boundary.
insert into app_v2.shelter_slug_aliases (alias_slug, shelter_id)
select shelter.slug, shelter.id
from app_v2.shelters shelter
on conflict (alias_slug) do nothing;

update app_v2.shelters shelter
set slug = app_v2.stable_shelter_slug_v1(shelter.id)
where shelter.slug is distinct from app_v2.stable_shelter_slug_v1(shelter.id);

create or replace function app_v2.enforce_stable_shelter_slug_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  new.slug := app_v2.stable_shelter_slug_v1(new.id);
  return new;
end;
$$;

revoke all on function app_v2.enforce_stable_shelter_slug_v1()
from public, anon, authenticated;
grant execute on function app_v2.enforce_stable_shelter_slug_v1()
to service_role;

create trigger app_v2_enforce_stable_shelter_slug
before insert or update of slug, id on app_v2.shelters
for each row execute function app_v2.enforce_stable_shelter_slug_v1();

comment on function app_v2.enforce_stable_shelter_slug_v1() is
'Prevents importers, rollbacks and manual writes from changing a public shelter URL when address data changes.';
