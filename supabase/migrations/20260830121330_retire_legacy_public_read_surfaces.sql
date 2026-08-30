-- The application has moved to the explicit V2 allowlist. Retire the
-- unversioned read surfaces instead of keeping a second anonymous contract
-- that exposes internal lifecycle and source identity columns and predates
-- the fail-closed publication_state filter.
revoke all on table app_v2.shelter_public
from public, anon, authenticated;

revoke all on table app_v2.country_marker_public
from public, anon, authenticated;

revoke all on table app_v2.sitemap_shelter_public
from public, anon, authenticated;

revoke all on table app_v2.municipality_public
from public, anon, authenticated;

revoke all on function app_v2.get_nearby_shelters_public(
  double precision,
  double precision,
  integer,
  integer,
  integer
) from public, anon, authenticated;

comment on view app_v2.shelter_public is
'Retired unversioned read model. Public clients must use shelter_public_v2, whose explicit allowlist excludes internal fields and withheld registrations.';

comment on function app_v2.get_nearby_shelters_public(
  double precision,
  double precision,
  integer,
  integer,
  integer
) is
'Retired unversioned nearby RPC. Public clients must use get_nearby_shelters_public_v2.';
