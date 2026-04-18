# Nearby Cutover Readiness

## 1. Overview

The current `/shelters/nearby` flow is not ready for a direct runtime cutover from legacy `public` data to `app_v2`.

Small, low-risk reads have already moved to `app_v2`:

- frontpage shelter capacity count
- municipality lookup by slug for `/kommune/[slug]`
- municipality slugs for `/sitemap.xml`
- read-only shelter detail diagnostics through `getAppV2ShelterBySlug()`

The nearby flow is a different class of cutover. It is the primary result flow and depends on a legacy RPC result shape, distance calculation, address grouping, application-code filtering, municipality name lookup, map marker coordinates, and existing sparse-data UX. app_v2 currently has the base shelter table and simple read helpers, but it does not yet expose a nearby read model that matches the active UI contract.

The first app_v2 database-side nearby foundation now exists as `app_v2.get_nearby_shelters(...)`. It improves the app_v2 read path by moving bounding-box filtering, Haversine distance ordering, and the currently supported app_v2 exclusion checks into the database. It is still not a legacy-compatible nearby model.

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
- first explicit nearby eligibility filtering through `legacy_capacity_v1`, currently `capacity >= 40`
- first suppression/exclusion filtering by keeping nearby reads scoped to `import_state = 'active'` by default
- active app_v2 shelter exclusion filtering by exact `shelter_id`, canonical source identity, or exact app_v2 address/postal identity
- point-like location data through `latitude` and `longitude`
- first server-only nearby candidate reads through `getAppV2NearbyShelters()`
- read diagnostics through `getAppV2NearbySheltersWithDiagnostics()`
- a first server-side native app_v2 API at `/api/app-v2/nearby`
- a first grouped app_v2 nearby helper through `getAppV2GroupedNearbySheltersWithDiagnostics()`
- a first grouped app_v2 API at `/api/app-v2/nearby/grouped`
- a first database-side app_v2 nearby RPC through `app_v2.get_nearby_shelters(...)`
- basic capacity display through `capacity`
- basic address display through `address_line1`, `postal_code`, and `city`
- municipality relation through `municipality_id`

What app_v2 does not currently expose:

- a shape-compatible nearby helper for the active `/shelters/nearby` UI
- PostGIS-backed nearest-neighbor/radius ordering
- full grouping equivalent to the legacy RPC
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

app_v2 currently stores latitude/longitude as numeric columns. `app_v2.get_nearby_shelters(...)` now provides a first database-side read foundation that:

- accepts user coordinates
- validates coordinate/radius/limit inputs
- filters active shelters with non-null coordinates
- excludes `missing_from_source` and `suppressed` rows by default through its `importStates` contract
- excludes rows matched by active `app_v2.shelter_exclusions` records through `shelter_id`, exact canonical source identity, or exact app_v2 address/postal identity
- applies a database-side bounding-box prefilter
- computes Haversine distance in SQL
- returns app_v2-native results ordered by `distanceMeters`
- can return diagnostics for candidate rows read, exclusion effect, coordinate-bearing candidates, radius matches, and returned rows

It is not yet equivalent to the legacy RPC because it does not:

- use PostGIS or a spatial nearest-neighbor index
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

app_v2 now has a first grouped read shape. It groups app_v2 rows by deterministic normalized `address_line1 + postal_code + city`, chooses the nearest row as representative, returns `shelterCount`, and sums `totalCapacity`.

This is closer to the product's real shape needs, but it is still not a drop-in replacement for `get_nearby_shelters_v3` because:

- the grouping key does not include exact legacy geometry
- app_v2 still does not carry legacy `anvendelse` semantics
- app_v2 grouped output still does not apply the legacy `anvendelseskoder.skal_med` inclusion rule
- top-10 membership still differs in sampled real-environment runs

`getAppV2NearbyShelters()` remains the row-level contract foundation. `getAppV2GroupedNearbySheltersWithDiagnostics()` is the first grouped app_v2 shape for evaluation and future cutover planning.

### Application-code/type semantics

Legacy filtering and display depend on `anvendelseskoder`:

- RPC includes only `a.skal_med = TRUE`
- UI maps `anvendelse` to a Danish description

app_v2 has `status`, `summary`, `accessibility_notes`, and source fields, but it does not currently carry the same `anvendelse` code or a replacement public type taxonomy. A cutover must decide whether the app_v2 result cards still show "Type", and if so which field owns that display.

The app_v2 nearby read layer now has an explicit first eligibility mode:

- `legacy_capacity_v1`
- filters app_v2 rows with `capacity < 40`
- applies before grouping
- reports `minimumCapacity=40`, `filteredByEligibility`, `eligibleRows`, and `legacyAnvendelseSemantics=unresolved` in diagnostics

This intentionally solves only the capacity part of legacy eligibility. It does not model `anvendelseskoder.skal_med`.

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

The first Next route handler boundaries now exist at `/api/app-v2/nearby` and `/api/app-v2/nearby/grouped`.

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
  - capabilities that explicitly mark database-side distance ordering as supported, while legacy grouping, legacy `anvendelse` semantics, full legacy exclusions parity, and PostGIS spatial indexing remain unsupported
  - eligibility meta describing `legacy_capacity_v1`
  - exclusion mode summary: `import_state = active`, active app_v2 exclusion filtering, and no reads from `public.excluded_shelters`
  - app_v2 diagnostics
  - explicit limitations

The API deliberately reads only `import_state = 'active'`. It does not expose suppressed rows and does not try to emulate the legacy grouped RPC shape. The read layer applies `capacity >= 40` through `legacy_capacity_v1` by default.

The grouped API deliberately exposes a grouped app_v2 shape, not a full legacy grouped shape. It returns groups with deterministic group keys, representative shelter, shelter ids/slugs, `shelterCount`, and `totalCapacity`. Its metadata marks `groupedAppV2Shape = true` and `groupedLegacyShape = false`.

The server-side helper behind the API now calls `app_v2.get_nearby_shelters(...)`. That means distance ordering and the currently supported app_v2 exclusion checks happen inside the database, while the API still exposes only the same app_v2-native row shape.

Focused ranking diagnostics now compare shared normalized address keys by rank. In the sampled grouped + eligibility runs, shared-address ordering differences are small: Copenhagen has max rank delta `1`, and Aarhus/Lemvig have max rank delta `2`. Increasing `candidateLimit` from `500` to `2000` did not change the sampled top-10 results. That reduces concern that the current top-10 mismatch is primarily caused by candidateLimit behavior or broken distance ordering.

The first shadow compare route now exists at `/api/app-v2/nearby/shadow`. It is opt-in only and requires `shadow=1`. It reads the legacy nearby RPC and grouped app_v2 nearby in the same route handler and returns comparison JSON. It does not feed the visible `/shelters/nearby` UI and does not write telemetry or database state.

A gated internal review mode is also available on `/shelters/nearby` with `appV2NearbyExperiment=grouped`. Without that explicit query flag, the page remains legacy-only and does not fetch the shadow route. With the flag, a grouped app_v2 review panel is shown above the normal legacy list; the map and the normal result cards still use legacy data. The panel shows overlap, legacy-only cases, app_v2-only cases, shared rank deltas, grouped top results, and a note that the map remains legacy.

Semantic mismatch analysis now indicates that the sampled app_v2-only top-10 cases are dominated by unresolved legacy application-code inclusion semantics. The read-only `read:nearby-semantic-cases` script found that all `15/15` app_v2-only grouped cases across Copenhagen, Aarhus, Lemvig, Aalborg, Odense, and Esbjerg had exact normalized legacy address matches and were likely filtered by legacy `anvendelseskoder.skal_med` / eligibility semantics. The detailed analysis lives in `docs/app-v2-nearby-semantic-gap-analysis.md`.

The first source-backed app_v2 application-code model now exists:

- `app_v2.shelters.source_application_code`
- `app_v2.application_code_eligibility`
- read-layer eligibility mode `source_application_code_v1`

It is not yet usable as the default nearby eligibility mode in the target data because existing app_v2 shelters currently have `0` populated `source_application_code` values. Strict source-code mode therefore returns no app_v2 nearby results until the importer/data-population layer fills that field.

Read-only API probe:

```bash
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --lat 55.6761 --lng 12.5683
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --lat 55.6761 --lng 12.5683 --shape grouped
```

This script calls `/api/app-v2/nearby` by default and `/api/app-v2/nearby/grouped` when `--shape grouped` is passed. It does not read Supabase directly and does not write data. It is intended for local or preview evaluation once the app is running with the required server-side app_v2 environment.

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

1. Populate `app_v2.shelters.source_application_code` through a controlled importer/data-population follow-up.
   - The source-backed model exists, but current target rows predate it.
   - The Datafordeler adapter now carries BBR `byg021BygningensAnvendelse`.
   - Do not backfill this through fuzzy address inference.
   - After population, rerun grouped parity with `--eligibility source-application-code`.
2. Keep the gated internal mode for grouped app_v2 nearby available, with no default cutover.
   - Copenhagen currently has `9/10` grouped normalized address overlap.
   - Aarhus currently has `7/10`.
   - Lemvig currently has `8/10`.
   - Include-suppressed mode did not change those three top-level grouped overlaps.
   - Shared-address rank deltas are small, and larger `candidateLimit` did not change sampled top-10 output.
   - The debug API route is `/api/app-v2/nearby/shadow?shadow=1&lat=...&lng=...`.
   - The internal review URL is `/shelters/nearby?lat=...&lng=...&appV2NearbyExperiment=grouped`.
   - The goal is to inspect app_v2-only, legacy-only, and rank-delta cases in nearby context while keeping the normal legacy UI response unchanged.
3. Keep `anvendelseskoder.skal_med` explicit and unresolved until the source-backed eligibility model exists.
   - `capacity >= 40` is now represented by `legacy_capacity_v1`.
   - legacy `anvendelseskoder.skal_med` still should not be faked through status, summary, or source text.
4. Keep exclusions separate.
   - The one known legacy exclusion is represented in app_v2 now.
   - Broad legacy exclusion migration is still not part of the nearby read-shape work.

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
