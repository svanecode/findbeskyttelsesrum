# Framework Upgrade Audit

## 1. Overview

This audit maps the current framework and dependency state for `svanecode/findbeskyttelsesrum` with a focus on a safe Next 16 and React 19 baseline.

Important current-state finding: the repo is already on the target framework family in the inspected checkout:

- `next@16.1.1`
- `react@19.2.3`
- `react-dom@19.2.3`

That means the next upgrade work should not be treated as a blind version bump. The safer first upgrade PR should be a stabilization PR around the already-installed Next 16 / React 19 stack: verify runtime assumptions, remove or isolate config drift, and test the client-heavy map/search flows that are most likely to expose framework-level issues.

This document is documentation only. It does not change package versions, runtime behavior, styling, routes, data access, or Tailwind configuration.

Primary external references used for framework-specific risk checks:

- Next.js official version 16 upgrade guide: https://nextjs.org/docs/app/guides/upgrading/version-16
- React official React 19 upgrade guide: https://react.dev/blog/2024/04/25/react-19-upgrade-guide

## 2. Current version inventory

Versions below are from `package.json`, `package-lock.json`, and `npm ls --depth=0`. Where `package.json` has a caret range, the installed lockfile version is the practical current runtime version.

| Area | Package/config | `package.json` range | Installed version | Notes |
| --- | --- | --- | --- | --- |
| Framework | `next` | `^16.1.1` | `16.1.1` | Already on Next 16. `next build` currently runs with Turbopack. |
| React | `react` | `^19.2.3` | `19.2.3` | Already on React 19. |
| React DOM | `react-dom` | `^19.2.3` | `19.2.3` | Matches React. |
| React types | `@types/react` | `^19.2.7` | `19.2.7` | Already React 19 type family. |
| React DOM types | `@types/react-dom` | `^19.2.3` | `19.2.3` | Already React 19 type family. |
| TypeScript | `typescript` | `^5.3.3` | `5.8.3` | Meets Next 16 minimum. `tsconfig.json` uses `moduleResolution: "bundler"` and `jsx: "react-jsx"`. |
| ESLint | `eslint` | `^9.39.2` | `9.39.2` | Flat config via `eslint.config.mjs`. |
| Next ESLint config | `eslint-config-next` | `^16.1.1` | `16.1.1` | Version-aligned with Next. |
| Tailwind | `tailwindcss` | `^3.4.17` | `3.4.17` | Tailwind 3. Must be kept separate from the framework upgrade. |
| PostCSS | `postcss` | `^8.4.31` | `8.5.3` | Standard Tailwind 3 pipeline. |
| Autoprefixer | `autoprefixer` | `^10.4.21` | `10.4.21` | Standard Tailwind 3 pipeline. |
| Supabase client | `@supabase/supabase-js` | `^2.39.0` | `2.49.4` | Main runtime data client. |
| Supabase SSR | `@supabase/ssr` | `^0.6.1` | `0.6.1` | Installed but no active import found. |
| Map core | `leaflet` | `^1.9.4` | `1.9.4` | Browser-only map dependency. |
| React map bindings | `react-leaflet` | `^5.0.0` | `5.0.0` | React 19-compatible peer range in lockfile. |
| Marker clustering | `leaflet.markercluster` | `^1.5.3` | `1.5.3` | Imperative Leaflet plugin, loaded through a client component. |
| Vercel Analytics | `@vercel/analytics` | `^1.5.0` | `1.5.0` | Mounted in production root layout. |
| Vercel Speed Insights | `@vercel/speed-insights` | `^1.2.0` | `1.2.0` | Mounted in production root layout. |
| Prisma | `prisma`, `@prisma/client` | `^6.6.0` | `6.6.0` | Present but no active app import found in prior audit. |
| DAWA package | `dawa-autocomplete2` | `^1.1.0` | `1.1.0` | Runtime uses vendored `public/dawa-autocomplete2.min.js`, not package imports. |
| Utility candidates | `geolib`, `@heroicons/react` | `^3.3.4`, `^2.2.0` | `3.3.4`, `2.2.0` | No active app import found in prior audit. |

Relevant config state:

| File | Current state | Upgrade relevance |
| --- | --- | --- |
| `next.config.js` | `reactStrictMode: true`, `typedRoutes: true`, top-level `turbopack: {}`, custom `webpack` function, custom `generateBuildId`, headers/CSP. | Most framework-sensitive config file. Custom webpack is the largest Next 16/Turbopack concern. |
| `tsconfig.json` | `target: "es5"`, `module: "esnext"`, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, strict mode on, `skipLibCheck: true`. | New JSX transform is already in place. `target: "es5"` is conservative and worth reviewing later, but not required for first framework stabilization. |
| `eslint.config.mjs` | Flat ESLint config using `eslint-config-next`; ignores generated/build/public artifacts. | Already compatible with the Next 16 move away from `next lint`. |
| `tailwind.config.js` | Tailwind 3 content scanning over `src/pages`, `src/components`, `src/app`. | Keep untouched in first framework PR. |
| `postcss.config.mjs` | Tailwind 3 `tailwindcss` + `autoprefixer` plugins. | Keep untouched in first framework PR. |
| `vercel.json` | Headers for `/sw.js` and `/api/(.*)`. | Not a direct framework blocker, but can affect validation of API caching behavior. |

Workflow state:

- No `.github` workflow files were found in this checkout.
- `package.json` scripts are already Next 16-shaped: `dev: next dev`, `build: next build`, `lint: eslint .`, `start: next start`.
- There is no explicit `engines.node` field in `package.json`. Next 16 requires Node 20.9+ according to the official upgrade guide, so the runtime version should be pinned in project/deployment configuration before treating the upgrade as fully controlled.

## 3. Risk areas for Next 16

### Already on Next 16, so focus on stabilization

The repo is already using `next@16.1.1`. The main risk is not the act of installing Next 16; it is whether all Next 16 assumptions are intentionally supported and tested.

### Turbopack default plus custom webpack config

Next 16 uses Turbopack by default for `next dev` and `next build`. The repo still has a custom `webpack` function in `next.config.js` that sets browser fallbacks for `fs` and `path`.

Current `npm run build` succeeds with Turbopack, so this is not an immediate blocker. It is still a risk because:

- Turbopack does not use webpack fallback config in the same way.
- The fallback may be legacy noise from older client bundles.
- If a future dependency starts importing Node built-ins from client code, the old webpack fallback can give a false sense of coverage.

First upgrade PR should audit whether this webpack block is still needed. Removal should only happen if build and client-heavy flows remain clean.

### `proxy.ts` is already using the Next 16 convention

The repo uses `src/proxy.ts` with `export function proxy(request: NextRequest)`, which matches the Next 16 convention replacing `middleware.ts`/`middleware`.

Risk remains around behavior, not naming:

- It applies rate limiting to matched routes.
- It sets CSP and security headers.
- It excludes `api`, `_next/static`, `_next/image`, and `favicon.ico`.

Any framework PR should verify this still executes in the expected runtime and does not unexpectedly affect App Router navigation, static assets, sitemap, robots, or map tile/script connections.

### Async route params and App Router types

`src/app/kommune/[slug]/page.tsx` already models `params` as a `Promise` and awaits it. That aligns with the async request API direction in newer Next versions.

No `generateStaticParams` usage was found. `sitemap.ts` does not use `generateSitemaps`, so the Next 16 async sitemap `id` change does not appear relevant right now.

### `typedRoutes: true`

`next.config.js` enables `typedRoutes`. This is a useful guard, but it raises the value of running `next build` after any routing or Link changes. Current string routes include dynamic query strings such as `/shelters/nearby?lat=...&lng=...`, which currently build successfully.

### Client-heavy App Router pages

The app has several pages/components marked as client components:

- `src/app/page.tsx`
- `src/app/shelters/nearby/page.tsx`
- `src/app/shelters/nearby/nearby-wrapper.tsx`
- `src/app/shelters/nearby/map-wrapper.tsx`
- `src/app/shelters/nearby/client.tsx`
- `src/app/kommune/[slug]/map.tsx`
- multiple shared UI/error components

This is not automatically wrong, but it means a framework upgrade should be validated through browser behavior, not only build output.

### Suspense and `useSearchParams`

`/shelters/nearby` uses `useSearchParams` behind a Suspense boundary. That is the right broad shape for App Router client query-param access, but it is a high-value regression target because it is the primary result flow.

### Metadata and static generation

Root metadata is defined in `src/app/layout.tsx`. A separate `src/app/kommune/[slug]/metadata.ts` exists but is not automatically wired by the App Router unless imported/re-exported elsewhere. This is not a Next 16 blocker, but it is easy to misread during upgrade work.

### Node runtime version is not pinned

The repo does not declare an `engines.node` range. Next 16's official runtime floor is Node 20.9+. A direct framework PR should add or verify runtime pinning outside package upgrades if project policy allows it. Without a pin, local CI/deploy behavior can diverge even when package versions are correct.

## 4. Risk areas for React 19

### Already on React 19

The repo is already using `react@19.2.3`, `react-dom@19.2.3`, `@types/react@19.2.7`, and `@types/react-dom@19.2.3`.

### JSX transform is already modern

`tsconfig.json` uses `jsx: "react-jsx"`, so the React 19 new JSX transform requirement is satisfied.

### Error handling changed in React 19

React 19 changed how render errors are reported. The app has:

- `src/components/ErrorBoundary.tsx`
- `src/components/MapErrorBoundary.tsx`
- `src/lib/errorTracking.ts`
- `src/hooks/useErrorHandler.ts`

These should be smoke-tested in the browser after framework changes, especially map component failures and DAWA script load failures. No code change is recommended in the audit PR.

### Strict mode and effects

`reactStrictMode: true` is enabled. Client-heavy components depend on effects for:

- DAWA script injection and initialization.
- browser geolocation.
- Leaflet imports, icon setup, map bounds, and tile readiness.
- Supabase reads from client components.
- animated shelter counter state.

These flows should be tested for duplicate initialization, stale refs, repeated script insertion, and map sizing issues. Current code contains guards in several places, but these are the areas most likely to reveal React 19 or Strict Mode behavior differences.

### Imperative third-party code

React 19 itself is not the main risk for static server content. The risk is imperative browser libraries living inside React lifecycle boundaries:

- vendored DAWA autocomplete mutates an input through `window.dawaAutocomplete`.
- Leaflet mutates DOM and map state outside React.
- `leaflet.markercluster` integrates through `@react-leaflet/core`.

These are exactly the areas that need browser-level validation after any framework dependency adjustment.

## 5. Sensitive libraries and surfaces

### Map stack

Current map stack:

- `leaflet@1.9.4`
- `react-leaflet@5.0.0`
- `@react-leaflet/core@3.0.0`
- `leaflet.markercluster@1.5.3`
- local `MarkerClusterGroup`

Sensitive surfaces:

- `src/app/shelters/nearby/client.tsx`
- `src/app/shelters/nearby/map-wrapper.tsx`
- `src/app/kommune/[slug]/map.tsx`
- `src/components/MarkerClusterGroup.tsx`
- global Leaflet CSS in `src/app/globals.css`
- local marker assets under `/leaflet`

Upgrade risk:

- Leaflet must remain browser-only.
- `dynamic(..., { ssr: false })` boundaries must be preserved.
- Marker icon setup runs outside React render semantics and should be validated visually.
- `react-leaflet@5` is intended for React 19 peer compatibility, but plugin integration with `leaflet.markercluster` remains custom and should be tested.

### Search / DAWA

Sensitive surface:

- `src/components/AddressSearchDAWA.tsx`

Upgrade risk:

- The component injects `/dawa-autocomplete2.min.js` manually and relies on `window.dawaAutocomplete`.
- It uses `useRouter` to navigate to `/shelters/nearby`.
- It relies on geolocation APIs and DOM refs.
- It has cache-busting query params on the script URL.

Framework upgrade PR should not rewrite DAWA. It should only verify that script load, autocomplete selection, and geolocation navigation still work.

### Supabase and data access

Sensitive surfaces:

- `src/lib/supabase.ts`
- `src/app/shelters/nearby/client.tsx`
- `src/app/kommune/[slug]/map.tsx`
- `src/app/api/shelter-count/route.ts`
- `src/app/sitemap.ts`

Upgrade risk:

- Supabase client is used in both server and client code.
- Client code only uses `NEXT_PUBLIC_*` env vars, which is expected, but failures can surface differently during static generation, route handlers, and client navigation.
- `/shelters/nearby` relies on Supabase RPC calls from the browser.
- `/api/shelter-count` is statically listed with `revalidate = 3600` and custom response headers.

No Supabase upgrade or data-layer redesign should be bundled into the first framework PR.

### Vercel Analytics / Speed Insights

Sensitive surface:

- `src/app/layout.tsx`

Upgrade risk:

- Both packages are mounted only in production.
- They should be checked against production/preview builds because local dev may not exercise them the same way.

### Config and headers

Sensitive surfaces:

- `next.config.js`
- `src/proxy.ts`
- `vercel.json`

Upgrade risk:

- There are overlapping headers/CSP definitions in Next config and proxy.
- The map/search flows depend on external domains being allowed.
- Any Next config cleanup should be validated against DAWA, Supabase, OpenStreetMap tiles, and Vercel analytics endpoints.

### Potentially stale dependencies

Potential cleanup candidates from import inspection:

- `@supabase/ssr`
- `@heroicons/react`
- `dawa-autocomplete2` package
- `geolib`
- `prisma`
- `@prisma/client`
- `@types/dotenv`

Do not remove these in the first framework upgrade PR. They should be handled in separate dependency hygiene work after runtime validation.

## 6. Recommended upgrade sequence

Because Next 16 and React 19 are already installed, the recommended sequence is a controlled stabilization sequence:

1. Confirm runtime prerequisites.
   - Verify local and deployment Node versions are at least Node 20.9.
   - Decide whether to add `engines.node` or equivalent deployment documentation.
   - Do not change app behavior in the same step.

2. Run baseline checks on the current lockfile.
   - `npm ci`
   - `npm run lint`
   - `npm run build`
   - Start local production build with `npm run start` after build if a browser smoke test is planned.

3. Review `next.config.js`.
   - Keep `typedRoutes` and current scripts.
   - Inspect whether the custom `webpack` fallback is still needed.
   - If removing the webpack block, do that as a small isolated commit/PR with build and browser verification.
   - Do not enable React Compiler, Cache Components, or PPR in the first PR.

4. Validate App Router boundaries.
   - `/` loads and fetches `/api/shelter-count`.
   - `/tell-me-more` remains server-rendered static content.
   - `/shelters/nearby?lat=55.6761&lng=12.5683` loads the dynamic map client.
   - `/kommune/[slug]` resolves a real kommune and loads its map.
   - Invalid nearby coordinates show the existing error state.

5. Validate browser-only dependencies.
   - DAWA script loads and initializes.
   - Geolocation failure path does not break the page.
   - Leaflet tiles, markers, popups, and marker clusters render.
   - No hydration or console errors appear on initial load or navigation.

6. Only after framework stabilization, consider dependency hygiene.
   - Remove unused packages in separate PRs.
   - Consider Supabase client updates separately from framework work.
   - Consider Tailwind 4 separately and only after framework behavior is stable.

## 7. What to keep out of the first upgrade PR

Keep these out of the first framework PR:

- Tailwind 4 migration.
- React Compiler enablement.
- Next Cache Components or PPR enablement.
- Search/DAWA rewrite.
- Supabase query/RPC redesign.
- app_v2 data migration.
- Map stack rewrite.
- Dependency cleanup for potentially unused packages.
- CSP/header redesign beyond what is required for framework compatibility.
- Visual redesign or styling cleanup.
- Route restructuring or server/client component redesign beyond strictly necessary compatibility fixes.

Tailwind 4 should be a separate later project because it changes the styling pipeline and can create broad visual diffs. It should not be mixed with Next 16 / React 19 stabilization.

## 8. Recommended validation plan

Minimum non-browser checks:

1. `npm ci`
2. `npm run lint`
3. `npm run build`

Recommended browser smoke tests:

1. Home page `/`
   - Page renders.
   - Shelter counter handles loaded and missing API values.
   - DAWA search input appears.

2. DAWA address flow
   - DAWA script loads without console errors.
   - Selecting an address navigates to `/shelters/nearby?lat=...&lng=...`.

3. Geolocation flow
   - Permission denial shows existing error behavior.
   - Successful mocked geolocation navigates to `/shelters/nearby`.

4. Nearby map flow
   - `/shelters/nearby?lat=55.6761&lng=12.5683` renders a map.
   - OpenStreetMap tiles load.
   - Markers/list render from RPC data or the existing empty state appears gracefully.
   - Popup/navigation links do not throw browser errors.

5. Kommune route
   - A known `/kommune/[slug]` route resolves.
   - Kommune map renders with markers/clusters where data exists.

6. Metadata/API routes
   - `/api/shelter-count` returns expected JSON shape.
   - `/robots.txt` and `/sitemap.xml` respond.

7. Production-only checks where possible
   - Vercel Analytics and Speed Insights do not produce console/runtime errors.
   - Proxy/CSP does not block DAWA, Supabase, map tiles, or Vercel endpoints.

Optional diagnostic checks:

- `npx next typegen` if route prop typing is touched.
- `npm ls --depth=0` after any package operation to confirm versions.

## 9. Recommendation for the first actual upgrade PR

The first actual upgrade PR should be a Next 16 / React 19 stabilization PR, not a broad dependency modernization PR.

Recommended contents:

- Keep `next`, `react`, `react-dom`, React types, ESLint and Tailwind versions unchanged unless there is a specific patch/security reason to refresh the lockfile.
- Verify or document Node 20.9+ runtime requirements.
- Run and record `npm ci`, `npm run lint`, and `npm run build`.
- Browser-smoke the home, DAWA, nearby map, kommune map, API, robots, and sitemap flows.
- Review `next.config.js` for the custom webpack block and remove it only if it is proven unnecessary with build and browser validation.

Explicitly exclude:

- Tailwind 4.
- React Compiler.
- Cache Components/PPR.
- Supabase/data-layer changes.
- DAWA/search rewrite.
- Leaflet/react-leaflet replacement.
- Unused dependency removals.

If the team still wants a package-only PR, it should be limited to patch-level lockfile normalization for the already-installed framework family, with no feature or styling changes. The practical risk is in runtime validation, not in reaching the target version numbers, because the target versions are already present.
