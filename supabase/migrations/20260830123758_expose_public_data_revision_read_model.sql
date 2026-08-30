-- The map cache key is already returned to every map client. Expose only that
-- non-sensitive revision tuple so public rendering and map reads never need a
-- service-role credential. The underlying ledger remains service-role only.
create or replace function app_v2.get_public_data_revision_v1()
returns table (
  revision bigint,
  publication_id uuid,
  changed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ledger.revision,
    ledger.publication_id,
    ledger.changed_at
  from app_v2.public_data_revisions ledger
  where ledger.scope = 'public'
  limit 1;
$$;

revoke all on function app_v2.get_public_data_revision_v1()
from public, anon, authenticated;
grant execute on function app_v2.get_public_data_revision_v1()
to anon, authenticated, service_role;

comment on function app_v2.get_public_data_revision_v1() is
'Returns only the public map/cache revision tuple. The mutable revision ledger and publication records remain private.';

-- Resolve one already-public historical URL without granting list access to
-- the private alias ledger. A target is returned only while the registration
-- remains present in the explicit public shelter view.
create or replace function app_v2.resolve_public_shelter_slug_alias_v1(
  p_alias_slug text
)
returns table (
  canonical_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select public_shelter.slug
  from app_v2.shelter_slug_aliases slug_alias
  inner join app_v2.shelter_public_v2 public_shelter
    on public_shelter.id = slug_alias.shelter_id
  where length(trim(p_alias_slug)) between 1 and 240
    and slug_alias.alias_slug = p_alias_slug
  limit 1;
$$;

revoke all on function app_v2.resolve_public_shelter_slug_alias_v1(text)
from public, anon, authenticated;
grant execute on function app_v2.resolve_public_shelter_slug_alias_v1(text)
to anon, authenticated, service_role;

comment on function app_v2.resolve_public_shelter_slug_alias_v1(text) is
'Resolves one historical public shelter URL only when its target remains in shelter_public_v2. Does not expose or enumerate the private alias ledger.';
