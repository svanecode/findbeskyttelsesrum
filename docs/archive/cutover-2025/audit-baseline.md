# Reverse Engineering Audit Baseline

## 1. Overview

Dette dokument er en ren kortlaegning af repoet `svanecode/findbeskyttelsesrum` pr. denne audit. Der er ikke lavet refactoring, runtime-aendringer, styling-aendringer eller feature-aendringer som del af auditten.

Applikationen er en Next.js App Router app, der hjaelper brugere med at finde beskyttelsesrum i Danmark. Den primaere brugerrejse starter paa forsiden, hvor brugeren enten bruger browserens geolocation eller vaelger en adresse via DAWA autocomplete. Begge flows leder til et client-heavy kort- og resultatview under `/shelters/nearby`. Der findes ogsaa kommune-baserede routes under `/kommune/[slug]`, genereret ind i sitemap, men de er ikke eksponeret som hovedflow fra forsiden i den inspicerede kode.

Dataadgang er overvejende Supabase-baseret. Koden bruger baade direkte Supabase queries, RPC-kald, en lokal in-memory cache helper og en Supabase Edge Function (`cached-queries`) som generisk cache/query-proxy. Datamodellen i aktiv app-kode peger primært paa nyere tabeller/funktioner som `sheltersv2`, `kommunekoder`, `anvendelseskoder`, `get_nearby_shelters_v3` og `get_total_shelter_capacity`, men der findes stadig helpers, fallback-kald og scripts der refererer til legacy-strukturer som `shelters` og `get_nearby_shelters_v2`.

Repoet indeholder mange cache-busting mekanismer: HTTP headers i `next.config.js`, headers i `vercel.json`, en `proxy.ts` med aggressive no-cache headers, meta no-cache tags i root layout, `HardCacheBuster`, service worker cleanup og flere cache-busting utility-filer/scripts. Disse er vigtige at kortlaegge foer modernisering, da de kan interagere og give uforudsigelig cache-adfaerd.

## 2. Route inventory

### App routes

| Route | File | Type | Notes |
| --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | Client-heavy page | Primaert entrypoint. Fetcher `/api/shelter-count`, viser `AddressSearchDAWA`, geolocation og link til `/tell-me-more`. |
| `/tell-me-more` | `src/app/tell-me-more/page.tsx` | Client page | Informationsside med `framer-motion`. Statisk indhold, men markeret client component. |
| `/shelters/nearby` | `src/app/shelters/nearby/page.tsx` | Client-heavy flow | Primaert resultatflow. Bruger `Suspense`, `NearbyWrapper`, dynamic map import og query params `lat`/`lng`. |
| `/kommune/[slug]` | `src/app/kommune/[slug]/page.tsx` | Dynamic server page with client-heavy map | Henter kommune via `getCachedKommune(slug)` og renderer `KommuneMap`. Ingen `generateStaticParams` fundet. |
| `/api/shelter-count` | `src/app/api/shelter-count/route.ts` | API route | Returnerer samlet kapacitet via Supabase RPC `get_total_shelter_capacity`; har route `revalidate = 3600` og Cache-Control response header. |
| `/api/errors` | `src/app/api/errors/route.ts` | API route | Logger client error reports server-side. Placeholder/TODO for rigtig error tracking. |
| `/robots.txt` | `src/app/robots.ts` | Metadata route | Disallow bl.a. `/api/`, `/_next/`, `/static/`, `/private/`. |
| `/sitemap.xml` | `src/app/sitemap.ts` | Dynamic metadata route | Henter kommuneslugs fra Supabase og inkluderer `/kommune/[slug]` routes. |

### Route-supporting components

| Component/file | Used by | Type | Notes |
| --- | --- | --- | --- |
| `src/app/shelters/nearby/nearby-wrapper.tsx` | `/shelters/nearby` | Client | Laeser `lat`/`lng` via `useSearchParams`, validerer koordinater og sender videre til map wrapper. |
| `src/app/shelters/nearby/map-wrapper.tsx` | `/shelters/nearby` | Client/dynamic | Dynamic import af `client.tsx` med `ssr: false`. |
| `src/app/shelters/nearby/client.tsx` | `/shelters/nearby` | Client-heavy | Leaflet map, Supabase RPC, kortmarkoerer, afstande og resultatliste. |
| `src/app/kommune/[slug]/map.tsx` | `/kommune/[slug]` | Client-heavy | Leaflet map, direkte Supabase reads og client-side grouping. |
| `src/app/kommune/[slug]/map-wrapper.tsx` | Not imported by current page | Client/dynamic | Wrapper findes, men `page.tsx` importerer `./map` direkte. Ser ud som ubrugt/efterladt wrapper. |
| `src/app/kommune/[slug]/metadata.ts` | Not automatically wired in App Router | Server helper | Indeholder `generateMetadata`, men ligger i separat `metadata.ts`; Next bruger typisk export fra `page.tsx` eller `layout.tsx`. Ser ikke aktiv ud uden eksplicit re-export. |

### Primary user flows

1. Forside -> browser geolocation -> `/shelters/nearby?lat=...&lng=...` -> nearest shelters via RPC.
2. Forside -> DAWA address autocomplete -> `/shelters/nearby?lat=...&lng=...` -> nearest shelters via RPC.
3. Sitemap/SEO -> `/kommune/[slug]` -> kommune map via `kommunekoder.slug` and direct `sheltersv2` query.
4. Forside -> `/tell-me-more` -> informational content.

## 3. Data access inventory

### Supabase client setup

`src/lib/supabase.ts` creates a shared Supabase client using:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The client disables auth session persistence and sets `x-application-name: findbeskyttelsesrum`. In development, missing env vars throw an error; in non-development, the client is still created with empty strings if vars are absent.

### Direct app queries and RPC calls

| Location | Access | Tables/functions touched | Legacy/newer | Notes |
| --- | --- | --- | --- | --- |
| `src/lib/supabase.ts:getAllKommuneSlugs` | Direct `.from('kommunekoder')` | `kommunekoder.slug` | Newer/current | Wrapped in local in-memory `cachedQuery` from `src/lib/cache.ts`. Used by sitemap. |
| `src/lib/supabase.ts:getShelterCount` | `.rpc('get_total_shelter_capacity')` | Function `get_total_shelter_capacity`, table `sheltersv2` in SQL | Newer/current | Used by `/api/shelter-count`. Has retry wrapper. |
| `src/lib/supabase.ts:getTotalShelterCapacity` | Direct `.from('sheltersv2')` | `sheltersv2.shelter_capacity`, `deleted` | Newer/current | Appears not used by active routes. Local in-memory cache. |
| `src/lib/kommunekoder.ts:getKommunekoder` | Direct `.from('kommunekoder')` | `kommunekoder` | Newer/current | Module-level cache, cleared in development. Used in maps. |
| `src/lib/anvendelseskoder.ts:getAnvendelseskoder` | Direct `.from('anvendelseskoder')` | `anvendelseskoder` | Newer/current | Module-level cache. Used in maps. |
| `src/lib/cached-queries.ts:cachedQuery` | `supabase.functions.invoke('cached-queries')` | Supabase Edge Function | Mixed | Generic abstraction. Active via `getCachedKommune`; other helpers reference legacy `shelters`. |
| `src/lib/cached-queries.ts:getCachedKommune` | Edge function query | `kommunekoder` | Newer/current | Used by `/kommune/[slug]`. |
| `src/lib/cached-queries.ts:getCachedShelterCount` | Edge function query | `shelters` | Legacy | No active import found. |
| `src/lib/cached-queries.ts:getCachedSheltersByKommune` | Edge function query | `shelters` | Legacy | No active import found. |
| `src/lib/cached-queries.ts:getCachedTotalShelterCapacity` | Edge function query | `shelters` | Legacy | No active import found. |
| `src/app/shelters/nearby/client.tsx:getNearbyShelters` | RPC | `get_nearby_shelters_v3`, fallback `get_nearby_shelters_v2` | v3 newer, v2 legacy/fallback | v3 is controlled by `NEXT_PUBLIC_USE_SHELTERS_V3 !== 'false'`; v2 is referenced but no migration defining v2 exists in repo. |
| `src/app/kommune/[slug]/map.tsx` | Direct `.from(...)` reads | `kommunekoder`, `anvendelseskoder`, `sheltersv2` | Newer/current | Duplicates helper reads and performs filtering/grouping client-side. |
| `src/app/api/shelter-count/route.ts` | Helper -> RPC | `get_total_shelter_capacity` | Newer/current | Returns 500 if count is missing or non-positive. |
| `src/app/sitemap.ts` | Helper -> direct query | `kommunekoder` | Newer/current | Sitemap depends on live Supabase access. |
| `scripts/apply-migrations-with-api.js` | Direct `.from('sheltersv2')` | `sheltersv2` | Newer/current | Only tests connection/count-like read; script text says migrations should be applied manually/CLI. |

### Supabase Edge Function: `cached-queries`

`supabase/functions/cached-queries/index.ts` is a generic query proxy:

- Accepts arbitrary `table`, `query`, `filters`, and `params` from request body.
- Uses `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- For count: `from(table).select('*', { count: 'exact', head: true })`.
- For reads: `from(table).select(query)` plus dynamic filter operators.
- Returns `Cache-Control: public, max-age=2592000` (30 days).

This abstraction is powerful but broad: the client decides table/query/filter shape. Security depends heavily on Supabase RLS and function deployment/JWT settings, not on local whitelisting in this function.

### Database functions and migrations

Observed migrations/scripts define:

- `excluded_shelters` table with indexes on `address` and `bygning_id`.
- PostGIS extension and `idx_sheltersv2_location_gist` GIST index on `sheltersv2.location`.
- `get_nearby_shelters_v3(p_lat, p_lng, p_radius_meters default 50000)`: reads `sheltersv2`, joins `anvendelseskoder`, filters `shelter_capacity >= 40`, `a.skal_med = TRUE`, non-null location, radius via `ST_DWithin`, excludes `excluded_shelters`, groups by address/location, returns nearest 10.
- `get_total_shelter_capacity()`: `SECURITY DEFINER STABLE`, sums `shelter_capacity` from active `sheltersv2` rows where `deleted IS NULL`.
- Helper functions: `add_excluded_shelter`, `remove_excluded_shelter`, `list_excluded_shelters`.

`get_nearby_shelters_v2` is referenced from active client code as fallback but no SQL definition was found in the repo.

### Prisma

`package.json` includes `prisma` and `@prisma/client`, and `prisma/schema.prisma` only defines generator/datasource with `DATABASE_URL`; it has no models. A generated Prisma client exists under `generated/prisma/` and appears to contain an older inline `Shelter` model with `DIRECT_URL`, but no app imports of `PrismaClient` or `@prisma/client` were found. This looks stale or unused in current runtime.

## 4. Search and DAWA

### Search components

| Component | Used? | Notes |
| --- | --- | --- |
| `src/components/AddressSearchDAWA.tsx` | Yes, on `/` | Active search component. Loads local `/dawa-autocomplete2.min.js` with query-string cache busting, initializes `window.dawaAutocomplete.dawaAutocomplete`, pushes selected coordinates to `/shelters/nearby`. Also supports geolocation. |
| `src/components/search.tsx` | No active import found | Older/alternate search component. Uses `next/script`, external Core.js/fetch polyfills from CDN, then local DAWA script without query string. Similar UI and DAWA CSS duplicated. |

### DAWA integration

The active integration uses the vendored script `public/dawa-autocomplete2.min.js` and a global `window.dawaAutocomplete`. When an address is selected, DAWA result coordinates are read from `selected.data.x` and `selected.data.y`; those become `lng` and `lat` query params for `/shelters/nearby`.

The app does not directly call DAWA REST endpoints from TypeScript. DAWA network access is performed by the vendored autocomplete script. CSP allows `https://dawa.aws.dk`, `https://api.dataforsyningen.dk`, `https://*.aws.dk`, and `https://*.dataforsyningen.dk` in config/proxy.

### Duplicated search logic

Duplicated or overlapping search code exists in:

- `AddressSearchDAWA.tsx`: active geolocation + DAWA address flow.
- `search.tsx`: old geolocation + DAWA address flow.
- `src/app/globals.css`: global DAWA suggestion styles.
- Both search components also include nearly identical `style jsx global` rules for `.dawa-autocomplete-suggestions`.

The active search component also has `searchLoading` state that is initialized but not meaningfully toggled around address search.

## 5. Caching and invalidation

### HTTP headers and route-level caching

| Location | Mechanism | Notes |
| --- | --- | --- |
| `next.config.js` | `headers()` | Long-lived immutable cache for `/_next/static`, favicons, SVG, DAWA script; shorter caches for manifest/robots/leaflet; CSP for all routes. |
| `vercel.json` | Headers | `/sw.js` gets `public, max-age=0, must-revalidate`; `/api/(.*)` gets `no-store`. This can conflict/overlap with route-specific API headers. |
| `src/proxy.ts` | Runtime headers | Applies rate limiting and security headers to non-API/non-static routes. Sets immutable cache for `/_next/static`, no-store headers for all other matched pages, and `Pragma`, `Expires`, `Surrogate-Control`, `CDN-Cache-Control`, `Vercel-CDN-Cache-Control`. |
| `src/app/layout.tsx` | Meta tags | Adds `Cache-Control`, `Pragma`, `Expires` meta tags to every page head. |
| `src/app/api/shelter-count/route.ts` | API route headers | `revalidate = 3600` plus response `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`. Vercel config says `/api/(.*)` should be `no-store`, so effective behavior depends on platform/header precedence. |
| `supabase/functions/cached-queries/index.ts` | Edge function response headers | `Cache-Control: public, max-age=2592000` for query responses. |

### Client/runtime cache busters

| Location | Mechanism | Notes |
| --- | --- | --- |
| `src/components/HardCacheBuster.tsx` | Production-only version check | Compares `localStorage.app-version` to `APP_VERSION`, unregisters service workers, deletes Cache Storage, updates localStorage and reloads page. Mounted globally in `layout.tsx`. |
| `src/lib/constants.ts` | `APP_VERSION` | Uses `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.slice(0,8)` or `dev`/`unknown`. |
| `src/app/page.tsx` | localStorage version seed | Writes `app-version` on first visit; comment says aggressive busting is handled by `HardCacheBuster`. |
| `src/utils/cacheBuster.ts` | Query param generation | Provides aggressive, critical, DAWA and nuclear cache-busting strategies with timestamp, performance timestamp, randoms, session id and custom params. No active import found except via `scriptLoader`. |
| `src/utils/scriptLoader.ts` | Script loader + nuclear cache buster | Uses `require('./cacheBuster')` inside client file and applies `nuclearCacheBuster` to scripts. No active app import found. |
| `src/utils/registerServiceWorker.ts` | Service worker URL busting | Registers `/sw.js?v=...&t=...` in production. Only used by `ServiceWorkerRegistration`. |
| `src/components/ServiceWorkerRegistration.tsx` | Production service worker registration | Component exists but is not mounted in `layout.tsx`; current layout mounts `HardCacheBuster`, not this component. |
| `public/sw.js` | Disabled/pass-through service worker | Deletes all caches on activation and does not intercept fetches. |
| `scripts/cache-busting-helper.js` | Diagnostic/helper script | Prints guidance around prior Mapbox/cache persistence and DAWA script cache changes. |
| `scripts/test-caching-headers.js` and `scripts/verify-hashed-assets.js` | Static checks | Check config text for cache headers and asset practices. |

### Notable cache oddities

- There are multiple, overlapping cache policies for the same app: `next.config.js`, `vercel.json`, `proxy.ts`, meta tags, service worker cleanup and client reload logic.
- `HardCacheBuster` can trigger a production reload after clearing caches. If `APP_VERSION` resolves to `unknown`, version behavior may be less predictable across deployments.
- `AddressSearchDAWA` requests `/dawa-autocomplete2.min.js?v=...&t=...`, while `next.config.js` marks the same asset as immutable for one year.
- `src/lib/cache.ts` caches server/client helper results in process memory for 30 days. This is independent of HTTP/CDN cache and has no explicit invalidation beyond process restart.
- Supabase Edge Function `cached-queries` returns 30-day public cache headers for generic database results.

## 6. Dependencies and scripts

### Significant dependencies

| Dependency | Apparent use |
| --- | --- |
| `next`, `react`, `react-dom` | App framework/runtime. |
| `@supabase/supabase-js` | Main data access client and Supabase function invocation. |
| `@supabase/ssr` | Installed, but no active import found. |
| `leaflet`, `react-leaflet`, `leaflet.markercluster` | Map stack for nearby and kommune maps. |
| `@types/leaflet`, `@types/leaflet.markercluster` | Type support for map stack. |
| `framer-motion` | Used by `/tell-me-more`. |
| `@vercel/analytics`, `@vercel/speed-insights` | Production-only analytics/speed insights in root layout. |
| `dawa-autocomplete2` | Installed package, but runtime uses vendored `public/dawa-autocomplete2.min.js`; no module import found. |
| `@heroicons/react` | Installed, no active import found. |
| `geolib` | Installed, no active import found. Distance handling uses RPC distance and simple math. |
| `prisma`, `@prisma/client` | Installed/generated, no active app runtime import found. |
| `dotenv`, `@types/dotenv` | Scripts/env support. |
| `sharp` | Likely favicon/image generation support; `scripts/generate-favicons.js` exists. |
| `tailwindcss`, `postcss`, `autoprefixer` | Styling pipeline. |
| `eslint`, `eslint-config-next`, TypeScript packages | Lint/type tooling. |

### Potentially unused or stale dependencies

No removal was performed. Based on import search only, these are candidates for later verification:

- `@heroicons/react`
- `@supabase/ssr`
- `dawa-autocomplete2` package, because runtime uses `public/dawa-autocomplete2.min.js`
- `geolib`
- `prisma` and `@prisma/client`
- `@types/dotenv`

### `package.json` scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `next dev` | Local dev server. |
| `build` | `next build` | Production build. |
| `start` | `next start` | Run production build. |
| `lint` | `eslint .` | Lint entire repo. |
| `verify-assets` | `node scripts/verify-hashed-assets.js` | Checks asset/cache assumptions. |
| `test-caching` | `node scripts/test-caching-headers.js` | Checks caching headers in config files. |
| `check-mapbox` | `node scripts/cache-busting-helper.js` | Prints cache-busting diagnostic guidance; name still references Mapbox even though active map stack is Leaflet/OSM. |

## 7. Env vars and workflows

### Env vars used by app/runtime

| Env var | Used in | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase.ts`, `next.config.js`, scripts | Required for Supabase client. Present as key in `.env` in this checkout. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase.ts`, `next.config.js`, scripts | Required for Supabase client. Present as key in `.env` in this checkout. |
| `NEXT_PUBLIC_USE_SHELTERS_V3` | `src/app/shelters/nearby/client.tsx` | Optional feature flag. Defaults to v3 unless exactly `'false'`. |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | `src/lib/constants.ts`, `src/utils/cacheBuster.ts` | Used for app version/cache busting. |
| `NEXT_PUBLIC_APP_VERSION` | `src/utils/cacheBuster.ts` | Fallback version for utility cache busters. |
| `NODE_ENV` | Many files | Development logging/errors and production-only analytics/cache/service-worker behavior. |
| `DATABASE_URL` | `prisma/schema.prisma`, `scripts/run-migrations.js` | Used by Prisma datasource and migration runner. Not present as key in inspected `.env`. |
| `SUPABASE_DB_URL` | `scripts/run-migrations.js` | Alternative DB URL for migration runner. |
| `DIRECT_URL` | `scripts/run-migrations.js`, generated Prisma schema | Alternative/direct DB URL. |
| `SUPABASE_URL` | `supabase/functions/cached-queries/index.ts` | Edge Function runtime env. |
| `SUPABASE_ANON_KEY` | `supabase/functions/cached-queries/index.ts` | Edge Function runtime env. |
| `VERCEL_URL` | Commented in `next.config.js` | Only in commented `assetPrefix` example. |

`.env` exists locally and contains keys for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Values were not copied into this audit.

### Workflows

No `.github` directory or GitHub Actions workflow files were found in this checkout.

Other workflow/config files:

- `vercel.json`: headers for `/sw.js` and `/api/(.*)`.
- `supabase/migrations/*.sql`: database migration history/scripts.
- `supabase/functions/cached-queries/*`: Supabase Edge Function.
- `scripts/apply-migrations.sh`: applies selected migrations via Supabase CLI.
- `scripts/run-migrations.js`: applies migrations via direct Postgres connection and verifies functions.
- `scripts/apply-migrations-with-api.js`: checks Supabase API connection and points operator to CLI/SQL editor.
- `scripts/manage-excluded-shelters.sql`: manual SQL helper examples for exclusions.
- `scripts/test-nearby-shelters-v3.sql`: manual SQL tests for v3 nearby function.
- `scripts/test-caching-headers.js`, `scripts/verify-hashed-assets.js`, `scripts/cache-busting-helper.js`: cache/header diagnostics.

## 8. Notable technical debt

- Multiple overlapping cache strategies exist across config, proxy, layout meta tags, service worker, `HardCacheBuster`, utility cache busters and scripts. This makes effective cache behavior hard to reason about.
- `AddressSearchDAWA.tsx` and `search.tsx` duplicate geolocation, DAWA initialization and suggestion styling. Only `AddressSearchDAWA` appears active.
- `src/app/globals.css` and both search components define DAWA suggestion styles, creating three places to maintain similar CSS.
- `src/lib/cached-queries.ts` mixes active `kommunekoder` usage with legacy `shelters` helpers.
- Active nearby search falls back to `get_nearby_shelters_v2`, but no v2 function definition exists in repo migrations. This may hide deployment drift.
- `src/app/kommune/[slug]/map.tsx` directly queries `kommunekoder` and `anvendelseskoder` even though helper abstractions exist; it also queries `anvendelseskoder` twice.
- Kommune route imports `./map` directly while `map-wrapper.tsx` exists separately. The wrapper appears unused.
- `src/app/kommune/[slug]/metadata.ts` likely does not participate in Next metadata generation unless re-exported from a route segment file.
- Prisma artifacts are present in repo, but current `prisma/schema.prisma` has no models and app code does not import Prisma. Generated Prisma output appears stale relative to the schema.
- The Supabase Edge Function `cached-queries` accepts caller-selected table/query/filter definitions. Without explicit whitelisting, this is a broad trust boundary and relies on RLS/deployment auth.
- Error tracking endpoint is a placeholder that logs reports server-side and includes TODO comments for real tracking.
- Root metadata contains placeholder verification values: `your-google-site-verification`, `your-yandex-verification`, `your-yahoo-verification`.
- `check-mapbox` script name and script copy refer to Mapbox cache persistence, while active map stack is Leaflet/OpenStreetMap.
- `HardCacheBuster` can force reloads in production. Combined with version fallback `unknown`, this should be handled carefully during deployment modernization.
- Text in nearby empty state says no shelters found within 5 km, while v3 RPC default radius is 50 km.
- Several potentially unused dependencies remain installed (`@heroicons/react`, `@supabase/ssr`, `geolib`, Prisma packages, package version of `dawa-autocomplete2`).

## 9. Recommended cleanup candidates before larger modernization

These are cleanup candidates only; no cleanup was performed in this audit.

1. Establish a single cache strategy before changing routing/data fetching.
   - Decide source of truth among `proxy.ts`, `next.config.js`, `vercel.json`, route headers, service worker behavior and `HardCacheBuster`.
   - Verify `/api/shelter-count` effective headers because route-level SWR and `vercel.json` no-store conflict conceptually.

2. Consolidate search implementation.
   - Confirm `src/components/search.tsx` is unused.
   - Move DAWA suggestion styling to one place.
   - Keep only one DAWA script-loading strategy.

3. Clarify Supabase data abstraction boundaries.
   - Decide whether reads should use direct Supabase client helpers, route handlers, or the `cached-queries` Edge Function.
   - Remove or quarantine legacy `shelters` helpers after confirming no production dependency.
   - Consider whitelisting allowed tables/columns/operators in `cached-queries` if it remains.

4. Resolve RPC version drift.
   - Either include `get_nearby_shelters_v2` in migrations if fallback is required, or remove the fallback after production confirms v3 everywhere.
   - Document `NEXT_PUBLIC_USE_SHELTERS_V3` and expected deployment behavior.

5. Normalize kommune route implementation.
   - Decide whether `map-wrapper.tsx` and `metadata.ts` are intended to be active.
   - Avoid duplicate client-side lookups for `kommunekoder` and `anvendelseskoder`.

6. Audit dependencies after behavior is locked.
   - Verify import/runtime usage for Prisma, `@supabase/ssr`, `geolib`, `@heroicons/react` and package `dawa-autocomplete2`.
   - Do not remove until build/deploy expectations are clear.

7. Replace placeholders and stale script names.
   - Update metadata verification placeholders if SEO verification matters.
   - Rename or document `check-mapbox` if it remains useful for current Leaflet/DAWA cache diagnostics.

8. Align user-facing distance copy with actual query radius.
   - Nearby empty state says 5 km; v3 query uses 50 km. Confirm intended product behavior before changing copy or SQL.
