# Municipality Parity Audit

## 1. Overview

This audit compares the current legacy municipality reads with the new `app_v2` municipality read surface after the first controlled cutovers:

- `/kommune/[slug]` now resolves the route municipality through `app_v2`.
- `/sitemap.xml` now reads municipality slugs through `app_v2`.
- shelter lists, municipality map data, nearby results, and client-side popup municipality names still read legacy/public data.

The main conclusion is that simple slug and route lookup parity is mostly in place, but larger municipality cutovers are still risky because active map/shelter flows depend on legacy `kommunekode`, `sheltersv2`, `anvendelseskoder`, and geometry-specific public table shapes.

## 2. Legacy municipality surfaces

Legacy municipality reads live in three main places.

`src/lib/supabase.ts` exposes:

- `getAllKommuneSlugs()`
  - reads `public.kommunekoder`
  - selects `slug`
  - orders by `slug`
  - wraps the read in `withInMemoryCache`
  - returns `[]` on Supabase errors
- `getKommuneBySlug(slug)`
  - reads `public.kommunekoder`
  - selects `slug, navn, kode`
  - does exact `.eq("slug", slug)`
  - returns `null` on Supabase errors

`src/lib/kommunekoder.ts` exposes:

- `getKommunekoder()`
  - reads all rows from `public.kommunekoder`
  - selects `*`
  - orders by `navn`
  - uses a module-level memory cache outside development
  - returns `[]` on Supabase errors
- `getKommunenavn(kode, kommunekoder)`
  - maps a legacy `kode` to `navn`
  - falls back to returning the raw code

Active runtime users of the legacy surface:

- `src/app/kommune/[slug]/map.tsx`
  - fetches all `kommunekoder` directly in the client
  - fetches `sheltersv2` by `kommunekode`
  - uses `getKommunenavn()` for popup display names
- `src/app/shelters/nearby/client.tsx`
  - calls `getKommunekoder()`
  - uses `getKommunenavn()` for nearby result display names

These legacy flows are not simple slug or summary reads. They are coupled to shelter list/map behavior and should not be cut over as part of a narrow municipality parity cleanup.

## 3. app_v2 municipality surfaces

`src/lib/supabase/app-v2-queries.ts` exposes these municipality-oriented helpers:

- `getAppV2MunicipalityBySlug(slug)`
  - reads `app_v2.municipalities`
  - accepts canonical slugs and fallback `kommune-XXXX` slugs through `getMunicipalitySlugCandidates()`
  - normalizes returned slug/name through `normalizeMunicipalityDisplay()`
  - counts active shelters in `app_v2.shelters`
  - returns `null` when no municipality is found
- `getAppV2MunicipalitySlugs()`
  - reads `app_v2.municipalities`
  - normalizes each row through `normalizeMunicipalityDisplay()`
  - returns normalized public slugs only
  - does not read shelters
- `getAppV2MunicipalitySummaries()`
  - reads `app_v2.municipalities`
  - adds `activeShelterCount` by counting active `app_v2.shelters` per municipality

`src/lib/municipalities/metadata.ts` is the bridge between fallback importer data and public display data:

- contains 98 municipality metadata entries keyed by four-digit municipality code
- maps code to canonical public slug and Danish display name
- supports fallback slugs shaped like `kommune-0101`
- supports fallback names shaped like `Municipality 0101`
- normalizes known fallback rows to public display rows, for example `kommune-0101` / `Municipality 0101` becomes `kobenhavn` / `København`

The importer write path also uses this metadata:

- Datafordeler adapter emits canonical municipality metadata when a code is known.
- Unknown codes fall back to `kommune-<code>` and `Municipality <code>` with a warning.
- The importer service canonicalizes municipality rows by `code`, canonical slug, fallback slug, and duplicate row reassignment.

## 4. Slug/name/code parity

Slug parity is partially normalized.

Legacy stores public slugs directly in `public.kommunekoder.slug`. app_v2 may contain either canonical public slugs or fallback importer slugs. The app_v2 query layer normalizes known rows before exposing them to routes and sitemap. This means route-facing reads can remain stable even if imported rows briefly exist as `kommune-0101`.

Name parity is also partially normalized.

Legacy exposes `navn`. app_v2 stores `name`, but `normalizeMunicipalityDisplay()` replaces known fallback names like `Municipality 0101` with Danish display names from metadata. For known codes this should match the intended public display name better than raw importer fallback data.

Code parity is the most important safety boundary.

The kommune page still passes a `kode` into `KommuneMap`, and the map still queries legacy `sheltersv2` by `kommunekode`. Therefore `getAppV2MunicipalityBySlug()` must return a non-null `code` before the page can safely render. The page currently treats a missing app_v2 code as `notFound()`.

Known parity constraints:

- `app_v2.municipalities.code` was added after the foundation migration.
- older app_v2 rows may only have code backfilled if their slug or name matched fallback patterns.
- rows with canonical slugs but missing `code` are not safe for the current kommune page.
- unknown municipality codes normalize only to fallback slug/name, not to a polished public display.
- metadata currently covers the 98 known Danish municipality codes, but `regionName` is `null` in the bundled metadata.

## 5. Current runtime risks

The main runtime risks are data coverage and mixed-source behavior.

- `/kommune/[slug]` now depends on `app_v2.municipalities` for the route lookup, but its map still depends on legacy `sheltersv2` and legacy `kommunekoder`.
- `/sitemap.xml` now depends on `app_v2.municipalities`; if app_v2 is empty or unavailable, the existing catch path returns no kommune routes.
- app_v2 slug/name normalization can hide fallback importer values for known codes, but it cannot invent a missing `code`.
- `getAppV2MunicipalitySummaries()` performs one active shelter count query per municipality, so it is not yet a good high-traffic summary primitive without either batching, denormalized counts, or a dedicated read view/RPC.
- client-heavy map and nearby flows still expect the legacy shelter shape, geometry field, application code join, and `kommunekode` naming.
- kommune metadata generation in `src/app/kommune/[slug]/metadata.ts` still derives a display name from the raw slug instead of either legacy or app_v2 data. That is a metadata/copy parity issue, not a route data cutover issue.

I attempted a read-only live parity check between `public.kommunekoder` and `app_v2.municipalities`, but local shell env did not expose the required Supabase variables. The static/code audit therefore confirms query behavior and normalization logic, but not current database row-by-row parity.

## 6. What is safe to cut over next

The safest next municipality cutovers are still server-side, slug/code/name-only reads.

Good candidates:

- replace any remaining unused call sites of `getKommuneBySlug()` if a real runtime call appears later
- introduce a lightweight app_v2 helper for municipality code/name by slug if another server-only route needs exactly that contract
- update kommune route metadata generation to use `getAppV2MunicipalityBySlug()` for canonical display names, if the performance/runtime tradeoff is acceptable
- add a non-runtime parity script that compares legacy `kommunekoder` with app_v2 `municipalities` by `code`, `slug`, and normalized name

The current sitemap and route lookup cutovers are the right shape: they depend only on municipality identity data and leave shelter/map behavior alone.

## 7. What should stay on legacy for now

These surfaces should stay on legacy until app_v2 has a proven read model for the same shape:

- `src/app/kommune/[slug]/map.tsx`
  - shelter list by `kommunekode`
  - grouped shelter popup data
  - `location` geometry handling
  - application code filtering through `anvendelseskoder`
  - popup kommune names through `kommunekoder`
- `src/app/shelters/nearby/client.tsx`
  - nearby result display names
  - any nearby shelter result shape derived from legacy RPC/public tables
- legacy `getKommunekoder()` while map and nearby still need full legacy code/name rows
- shelter-count-per-municipality summary reads in high-traffic paths until app_v2 has batched counts or a stable read view

Do not cut over map or nearby by swapping only the municipality lookup. Those flows need a shelter/read-model cutover, not just a municipality helper replacement.

## 8. Recommendation for the next municipality cutover

The next safe municipality step should be a non-runtime or low-runtime parity hardening step, not a shelter-list cutover.

Recommended next PR:

1. Add a small read-only parity script for municipality identity data.
2. Compare:
   - legacy `public.kommunekoder.kode`
   - legacy `public.kommunekoder.slug`
   - legacy `public.kommunekoder.navn`
   - app_v2 `municipalities.code`
   - app_v2 raw `municipalities.slug/name`
   - app_v2 normalized slug/name
3. Fail or warn clearly on:
   - missing app_v2 code
   - missing legacy code
   - slug mismatch after normalization
   - name mismatch after normalization
4. Keep the script out of live runtime.

After that parity script is available and green against the intended environment, the next small runtime cutover can be kommune metadata generation, because it affects only route metadata/canonical display text and not the map, shelter list, nearby flow, or data source for shelter results.

The following should explicitly stay out of the next municipality cutover:

- app_v2 shelter list reads for kommune pages
- app_v2 map data
- nearby flow changes
- Datafordeler write enablement
- broad removal of legacy `kommunekoder` helpers
