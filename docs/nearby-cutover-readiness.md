# Nearby Cutover Readiness

## 1. Overview

The current `/shelters/nearby` flow is not ready for a direct runtime cutover from legacy `public` data to `app_v2`.

Small, low-risk reads have already moved to `app_v2`:

- frontpage shelter capacity count
- municipality lookup by slug for `/kommune/[slug]`
- municipality slugs for `/sitemap.xml`
- read-only shelter detail diagnostics through `getAppV2ShelterBySlug()`

The nearby flow is a different class of cutover. It is the primary result flow and depends on a legacy RPC result shape, distance calculation, address grouping, application-code filtering, municipality name lookup, map marker coordinates, and existing sparse-data UX. app_v2 currently has the base shelter table and simple read helpers, but it does not yet expose a nearby read model that matches the active UI contract.

## 2. Current legacy nearby flow

The active route chain is:

- `src/app/shelters/nearby/page.tsx`
  - client component
  - wraps the flow in `MapErrorBoundary` and `Suspense`
- `src/app/shelters/nearby/nearby-wrapper.tsx`
  - reads `lat` and `lng` from `useSearchParams()`
  - validates coordinate ranges
  - passes string coordinates to `MapWrapper`
- `src/app/shelters/nearby/map-wrapper.tsx`
  - parses coordinates again
  - handles missing/invalid coordinates
  - dynamically imports `client.tsx` with `ssr: false`
- `src/app/shelters/nearby/client.tsx`
  - owns the actual data load, map state, result cards, marker hover/selection, and route-back UX

The data load in `client.tsx` is client-side and runs these reads in parallel:

- `getNearbyShelters(lat, lng)`
  - calls Supabase RPC `get_nearby_shelters_v3`
  - falls back to `get_nearby_shelters_v2` if v3 is disabled or errors
- `getAnvendelseskoder()`
  - reads `public.anvendelseskoder`
  - used to display application/type descriptions
- `getKommunekoder()`
  - reads `public.kommunekoder`
  - used to display municipality names from `kommunekode`

`get_nearby_shelters_v3` is defined in `supabase/migrations/003_create_get_nearby_shelters_v3.sql`.

Important v3 behavior:

- input: `p_lat`, `p_lng`, optional `p_radius_meters`
- current client passes `p_radius_meters: 50000`
- reads `public.sheltersv2`
- joins `public.anvendelseskoder`
- filters `s.shelter_capacity >= 40`
- filters `a.skal_med = TRUE`
- requires non-null `s.location`
- uses `ST_DWithin` and `ST_Distance`
- excludes rows matching `public.excluded_shelters`
- groups shelters by `vejnavn`, `husnummer`, `postnummer`, `kommunekode`, and `location`
- returns the nearest 10 grouped results ordered by distance

The v2 fallback is still referenced by the client, but no SQL definition for `get_nearby_shelters_v2` was found in repo migrations.

## 3. Data and shape dependencies

The UI expects nearby results shaped like `Shelter & { distance: number }`.

Fields used directly by the current nearby UI:

- `id`
  - React key
  - selected/hovered shelter identity
  - scroll refs
- `location.coordinates`
  - map markers
  - fit bounds
  - external map links
  - expected order is `[lng, lat]`
- `vejnavn`
  - result title
- `husnummer`
  - result title
- `postnummer`
  - address line
- `kommunekode`
  - municipality display lookup through `getKommunenavn()`
- `distance`
  - RPC returns meters
  - client converts to kilometers
  - used for distance label and travel-time estimates
- `shelter_count`
  - grouped count label
- `total_capacity`
  - capacity card
- `anvendelse`
  - type description lookup through `getAnvendelseskodeBeskrivelse()`

Fields present in the `Shelter` TypeScript type and relevant to compatibility:

- `created_at`
- `bygning_id`
- `shelter_capacity`
- `address`
- `deleted`
- `last_checked`
- optional embedded `anvendelseskoder`

The current RPC result is already pre-grouped. The UI does not group nearby results itself. That means app_v2 cannot be swapped in by returning raw shelter rows unless the UI is also changed or a compatible app_v2 RPC/helper performs equivalent grouping.

Nearby also depends on auxiliary legacy tables:

- `public.anvendelseskoder`
  - filters in the RPC
  - display lookup in the client
- `public.kommunekoder`
  - display lookup in the client
- `public.excluded_shelters`
  - owner-request exclusion logic in the RPC

## 4. Existing app_v2 capabilities

The current app_v2 foundation can support some building blocks:

- `app_v2.shelters`
  - has `municipality_id`
  - has `slug`
  - has address fields: `address_line1`, `postal_code`, `city`
  - has coordinates as numeric `latitude` and `longitude`
  - has `capacity`
  - has `status`
  - has `import_state`
  - has source identity fields
- `app_v2.municipalities`
  - has canonical municipality records
  - has `code` after migration `009_app_v2_municipality_code_anchor.sql`
- current query helpers
  - `getAppV2ShelterCount()`
  - `getAppV2TotalShelterCapacity()`
  - `getAppV2NearbyShelters()`
  - `getAppV2ShelterBySlug()`
  - `getAppV2MunicipalityBySlug()`
  - `getAppV2MunicipalitySlugs()`
  - `getAppV2MunicipalitySummaries()`

These are useful primitives, but they are not a nearby read model.

What app_v2 can already express:

- active shelter filtering via `import_state = 'active'`
- first suppression/exclusion filtering by keeping nearby reads scoped to `import_state = 'active'` by default
- active app_v2 shelter exclusion filtering by exact `shelter_id`, canonical source identity, or exact app_v2 address/postal identity
- point-like location data through `latitude` and `longitude`
- first server-only nearby candidate reads through `getAppV2NearbyShelters()`
- read diagnostics through `getAppV2NearbySheltersWithDiagnostics()`
- a first server-side native app_v2 API at `/api/app-v2/nearby`
- basic capacity display through `capacity`
- basic address display through `address_line1`, `postal_code`, and `city`
- municipality relation through `municipality_id`

What app_v2 does not currently expose:

- a nearby RPC
- a shape-compatible nearby helper for the active `/shelters/nearby` UI
- production-grade distance calculation in SQL
- grouping equivalent to the legacy RPC
- legacy-compatible `location: { type, coordinates }`
- `vejnavn` / `husnummer` split fields
- `kommunekode` on the shelter row
- `anvendelse` / application-code display semantics
- full `public.excluded_shelters` address/building-id equivalent
- app_v2 exclusion matching by legacy `bygning_id` or legacy split-address fields
- known indexes optimized for nearest-neighbor/radius queries over app_v2 coordinates

## 5. Gaps blocking cutover

### Distance and radius query

Legacy nearby uses PostGIS `ST_DWithin` and `ST_Distance` inside `get_nearby_shelters_v3`.

app_v2 currently stores latitude/longitude as numeric columns. `getAppV2NearbyShelters()` now provides a first server-only contract that:

- accepts user coordinates
- validates coordinate/radius/limit inputs
- filters active shelters with non-null coordinates
- excludes `missing_from_source` and `suppressed` rows by default through its `importStates` contract
- excludes rows matched by active `app_v2.shelter_exclusions` records through `shelter_id`, exact canonical source identity, or exact app_v2 address/postal identity
- applies a bounding-box prefilter
- computes Haversine distance in application code
- returns app_v2-native results ordered by `distanceMeters`
- can return diagnostics for candidate rows read, exclusion effect, coordinate-bearing candidates, radius matches, and returned rows

It is not yet equivalent to the legacy RPC because it does not:

- use PostGIS or a spatial index
- perform database-side ordering by distance
- provide address grouping
- fully mirror legacy owner-request exclusions from `public.excluded_shelters`, especially `bygning_id` and split-address matches not yet represented on app_v2 shelters
- match the current client result shape

### Result shape compatibility

The current UI expects legacy field names and geometry shape:

- `location.coordinates[1]` for latitude
- `location.coordinates[0]` for longitude
- `vejnavn` and `husnummer`
- `postnummer`
- `kommunekode`
- `anvendelse`
- `total_capacity`
- `shelter_count`

app_v2 uses:

- `latitude`
- `longitude`
- `address_line1`
- `postal_code`
- `city`
- `municipality_id`
- `capacity`
- `status`
- `import_state`

A cutover therefore needs an adapter/read model, not a direct table read.

### Grouping logic

Legacy nearby groups multiple shelter rows at the same address/location and returns:

- one representative `id`
- `shelter_count`
- summed `total_capacity`
- a representative `anvendelse`

app_v2 currently has no equivalent grouping helper. Returning one row per app_v2 shelter would change visible result counts, labels, capacity, markers, and probably marker density.

`getAppV2NearbyShelters()` intentionally returns one app_v2 shelter row per result. It is a contract foundation, not a drop-in replacement for `get_nearby_shelters_v3`.

### Application-code/type semantics

Legacy filtering and display depend on `anvendelseskoder`:

- RPC includes only `a.skal_med = TRUE`
- UI maps `anvendelse` to a Danish description

app_v2 has `status`, `summary`, `accessibility_notes`, and source fields, but it does not currently carry the same `anvendelse` code or a replacement public type taxonomy. A cutover must decide whether the app_v2 result cards still show "Type", and if so which field owns that display.

### Exclusions and suppression

Legacy excludes owner-requested rows through `public.excluded_shelters`.

app_v2 has `import_state` with `active`, `missing_from_source`, and `suppressed`, plus a dedicated `app_v2.shelter_exclusions` table. `getAppV2NearbyShelters()` now defaults to `importStates: ['active']`, so app_v2 rows marked `missing_from_source` or `suppressed` are excluded from the first nearby read contract. The parity script can opt into `--include-suppressed` for diagnostics.

The nearby helper also filters active app_v2 exclusions by `shelter_id`, exact `(canonical_source_name, canonical_source_reference)` pairs, and exact app_v2 address/postal fields. This is still only partial exclusions support. There is still no migrated legacy exclusion data and no read helper that mirrors current `public.excluded_shelters` semantics by `bygning_id` or legacy split road/house/postal fields. A cutover without that mapping would still risk re-showing legacy-excluded addresses.

### Client/server boundary

The active nearby client currently calls Supabase RPC directly from the browser with anon credentials.

Current app_v2 read helpers use `createAppV2AdminClient()` and `SUPABASE_SECRET_KEY`, which is server-only. That is fine for route handlers/server actions/scripts, but not for direct browser calls. A nearby cutover needs a deliberate boundary:

- app_v2 RPC exposed safely to anon/authenticated with RLS/policies, or
- a Next route handler that calls server-side app_v2 helpers, or
- a server-rendered data path with client map rendering

The first Next route handler boundary now exists at `/api/app-v2/nearby`.

Current request contract:

- `lat` required, number between `-90` and `90`
- `lng` required, number between `-180` and `180`
- `radius` optional, integer meters, max `100000`
- `limit` optional, integer, max `50`
- `candidateLimit` optional, integer, max `2000`, must be greater than or equal to `limit`

Current response contract:

- `results`
  - native app_v2 shelter rows with id, slug, name, address, coordinates, distance, capacity, status, import state, and municipality summary
- `meta`
  - contract name `app_v2_nearby_native_v1`
  - request id for correlating API probes and server logs
  - normalized query values
  - effective defaults and max bounds
  - result count
  - capabilities that explicitly mark legacy grouping, legacy `anvendelse` semantics, full legacy exclusions parity, and database-side spatial ordering as unsupported
  - exclusion mode summary: `import_state = active`, active app_v2 exclusion filtering, and no reads from `public.excluded_shelters`
  - app_v2 diagnostics
  - explicit limitations

The API deliberately reads only `import_state = 'active'`. It does not expose suppressed rows and does not try to emulate the legacy grouped RPC shape.

Read-only API probe:

```bash
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --lat 55.6761 --lng 12.5683
```

This script calls only `/api/app-v2/nearby`. It does not read Supabase directly and does not write data. It is intended for local or preview evaluation once the app is running with the required server-side app_v2 environment.

### Data parity and coverage

The importer foundation exists, but docs still describe app_v2 as not the active public read model. Datafordeler writes are intentionally blocked, and fixture writes are guarded. Before nearby cutover, app_v2 needs proven coverage for production-like shelter data, not just schema readiness.

## 6. Risks of premature cutover

Prematurely switching `/shelters/nearby` to app_v2 can break the primary user flow in several ways:

- no results or sparse results if app_v2 is incomplete
- incorrect distances if distance calculation is implemented differently from PostGIS
- changed result count if grouping is not equivalent
- changed map marker placement if latitude/longitude are missing or transformed incorrectly
- missing municipality names because app_v2 returns municipality relation instead of `kommunekode`
- missing or incorrect type labels because app_v2 lacks `anvendelse` semantics
- reappearance of legacy-excluded addresses if `public.excluded_shelters` behavior is not carried over
- server secret leakage risk if existing app_v2 admin helpers are imported into client components instead of going through a server route
- degraded performance if nearby is implemented as a broad client-side table scan instead of a spatial/radius query
- UX copy mismatch remains: empty state says 5 km while current v3 query uses 50 km

Mixing legacy and app_v2 in one nearby result also has risk. For example, using app_v2 shelters but legacy `anvendelseskoder`/`kommunekoder` would require reliable mapping back to old codes. That mapping is not currently proven for all result fields.

## 7. Recommended next nearby-related task

The first app_v2 nearby read contract now exists as `getAppV2NearbyShelters()` in `src/lib/supabase/app-v2-queries.ts`, and the first server-side API boundary exists at `/api/app-v2/nearby`. Neither is connected to `/shelters/nearby`.

Recommended next PR:

1. Run the read-only nearby parity script and the `/api/app-v2/nearby` route against real Supabase data for fixed coordinates.
   - Copenhagen sample
   - Aarhus sample
   - one sparse/rural sample
   - invalid-input API probe, for example missing `lat` or an out-of-range `radius`, to confirm `invalid_nearby_query`
   - valid-input API probe in an environment without server-side app_v2 env to confirm `app_v2_unavailable`
2. Compare `import_state = active` output with the diagnostic `--include-suppressed` mode.
   - Confirm whether app_v2 suppression is populated in the target environment.
   - Review app_v2 diagnostics for candidate count, exclusion effect, and within-radius count.
   - Separately compare known `public.excluded_shelters` rows, because legacy `bygning_id` and split-address matching are not mirrored yet.
3. Review the API response meta during evaluation.
   - Confirm the effective query values, result count, diagnostics, and limitations are clear enough for cutover planning.
   - Treat `capabilities.groupedLegacyShape = false` and `capabilities.databaseSideSpatialOrdering = false` as active blockers, not just documentation notes.
4. Decide whether the next implementation should harden the server-side API shape further or move distance/grouping into a database-side app_v2 nearby RPC proposal.
   - Prefer a database-side function if using radius/distance ordering at production scale.
   - Include input lat/lng/radius and output distance in meters.
5. Include grouping rules explicitly.
   - Decide whether grouping is by exact `address_line1 + postal_code + city + coordinates`, by source identity, or no grouping.
   - If no grouping, document the expected UX change before runtime cutover.
6. Decide how legacy exclusions should enter app_v2.
   - Either migrate current `public.excluded_shelters` into an app_v2 suppression/override model.
   - Or create an app_v2 read-side exclusion table/function that can preserve the address and `bygning_id` matching behavior.

The first runtime cutover should not happen until the isolated app_v2 nearby read returns a stable result shape and a clear parity story against legacy.

## 8. What should stay on legacy for now

Keep these on legacy for now:

- `/shelters/nearby`
- `src/app/shelters/nearby/client.tsx`
- browser Supabase RPC calls to `get_nearby_shelters_v3`
- fallback behavior to `get_nearby_shelters_v2` until intentionally removed
- `public.sheltersv2` nearby reads
- `public.anvendelseskoder` filtering/display lookup
- `public.kommunekoder` display lookup
- `public.excluded_shelters` exclusion behavior
- kommune map/list flows under `/kommune/[slug]`
- DAWA/search behavior on the frontpage

Do not cut over nearby by swapping only the table or helper. Nearby needs a dedicated app_v2 read model with distance, grouping, exclusion, shape compatibility, and safe client/server boundary solved first.
