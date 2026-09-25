# Improvement plan

Status: active · Last researched: 2026-09-25 · Architect: Claude (design owner for every task below)

This is the ranked backlog from the full review of logic, UI, security, operations and complexity. It is written so that any AI agent (or person) can pick one task, implement it in isolation and prove it works. The architect owns the design decisions recorded here; implementers own the code.

## How to use this plan

### Rules for implementing agents

1. **One task per branch and pull request.** Name the branch after the task ID, e.g. `addr-01-adressevaelger`. Do not bundle tasks.
2. **Follow the recorded decision.** Each task has a *Decision* section. If the code contradicts it, or a better option appears, stop and write the question in the PR description instead of improvising. Architect approval is required to deviate.
3. **Stay inside the listed files** unless the task says otherwise. A task that grows beyond its scope must be split.
4. **Read `AGENTS.md` first.** This is Next.js 16 with breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before touching routing, caching or config.
5. **Prove it before pushing.** Run `npm run lint`, `npm run typecheck` and `npm test`. Add or update tests named in *Verification*. See [Running browser tests without secrets](#running-browser-tests-without-secrets).
6. **Keep the product rules** in [`qa/emergency-copy-standard.md`](qa/emergency-copy-standard.md): never imply that a registration is open, prepared or verified; all public copy is Danish.
7. **Update the status table** below in the same PR (`todo` → `in review`), and add the PR link.
8. **Never** commit secrets, add a paid map/address provider, put coordinates or addresses in URLs, or weaken RLS/grants.

### Running browser tests without secrets

```bash
npm run test:e2e:ui
# If the pinned Playwright browsers are not installed:
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:e2e:ui
```

`playwright.ui.config.ts` starts `next dev` with placeholder Supabase values and runs every spec that mocks its data, in desktop and mobile Chromium. Tests tagged `@full-stack` need live data or a production build (metrics, CSP, prerendered pages) and run only in CI through `playwright.config.ts`. Tag any new test that needs them.

## Status

| Rank | ID | Task | Effort | Status | Depends on |
| --- | --- | --- | --- | --- | --- |
| P0-1 | ADDR-01 | Replace DAWA with Adressevælger before 2026-10-01 10:00 | M | done (#39), live 2026-09-25 | – |
| P0-2 | SEC-01 | Patch critical Next.js and sharp advisories | S | done (#39), live 2026-09-25 | – |
| P0-3 | OPS-01 | Stop `/api/health` reporting 503 because GitHub delays cron | S | done (#39), live 2026-09-25 | – |
| P1-1 | PERF-01 | Nearby rate limit must survive shared mobile IPs (CGNAT) | S | done, in review | – |
| P1-2 | UX-01 | First result above the fold; map tab fills the screen | M | done, in review | – |
| P1-3 | CONTENT-01 | Link to official shelter and warning information | S | done, in review | – |
| P1-4 | PERF-02 | CDN-cache the revision-keyed country map API | M | steps 1–2 done, in review; step 3 (grid snapping) todo | – |
| P1-5 | ARCH-01 | Revision-keyed nearby tiles with on-device ranking | L | todo | PERF-01 |
| P1-6 | PERF-03 | Cut database writes per visitor action | S | done (revised: kill switch only), in review | – |
| P2-1 | DX-01 | Automated dependency updates | S | done, in review | SEC-01 |
| P2-2 | TEST-01 | Secret-free e2e path for contributors and agents | M | done, in review | – |
| P2-3 | PRIV-01 | Click-to-load map on detail pages | S | done, in review | – |
| P2-4 | SEC-02 | One helper for client IP and same-origin checks | S | done, in review | – |
| P2-5 | UX-02 | Clear actions on the detail page (no walking route) | S | done (revised), in review | – |
| P2-6 | UX-03 | Fix wrapping of secondary links on the home page | XS | done, in review | – |
| P2-7 | CODE-01 | Remove dead diagnostics from the nearby API | S | done, in review | ARCH-01 (optional) |
| P2-8 | CODE-02 | Shared helper for user-facing fetch errors | XS | done, in review | – |
| P3-1 | CODE-03 | Split `app-v2-queries.ts` by domain | M | todo | ARCH-01, CODE-01 |
| P3-2 | OFFLINE-01 | Offline fallback for the last search | M | todo | ARCH-01 |
| P3-3 | DATA-01 | Explain the "≥ 40 places" filter next to results | XS | done, in review | – |
| P3-4 | OPS-02 | External dependency register and change watch | XS | done, in review | ADDR-01 |
| P3-5 | DEPS-01 | Major upgrades (Tailwind 4, ESLint 10, TypeScript 7) | L | deferred | DX-01 |

Effort: XS < 1 h, S ≤ ½ day, M ≤ 2 days, L > 2 days.

### Already done (review round 1, commit `8ee6a45`)

- Address search no longer locks after one failed lookup; in-place retry.
- Geolocation falls back from GPS to network position on timeout/unavailable.
- Nearby list explains HTTP 429 instead of a generic error.
- Report and contact forms never show raw parser/network error text.
- OSM embed no longer sends the full page URL as referrer.
- E2E tests for DAWA recovery and the GPS fallback.

---

## P0 — do now

### P0-1 · ADDR-01 · Replace DAWA with Adressevælger

**Why (evidence).** DAWA closes on **1 October 2026 at 10:00**. Klimadatastyrelsen is already running planned outage periods in September to warn remaining users. After that the address search on the home page stops working, and only "Brug min placering" remains. Sources: [Dataforsyningen news](https://dataforsyningen.dk/news/5117), [DAWA page](https://dataforsyningen.dk/data/4924), [Lovguiden](https://www.lovguiden.dk/det-offentlige/klimadatastyrelsen/2026-07-02-dawa-applikationen-lukker-1-oktober-2026-datafordeler-og-adressevaelger-overtager).

**Verified facts about the replacement** (probed live 2026-09-25):

- Official successor: **Adressevælger**, `https://adressevaelger.dk` ([repo](https://github.com/Klimadatastyrelsen/adressevaelger), [docs](https://confluence.kds.dk/display/ADV)).
- Token is required (HTTP 400 without). Until user management launches ("end of 2026 or early 2027"), the documentation tells **all users to use the shared token `adressevaelger123`** ([Brugerstyring](https://confluence.kds.dk/display/ADV/Brugerstyring)). It is public by design.
- CORS: `access-control-allow-origin: *`. Browser calls work.
- Search: `GET /husnumre/soeg?tekst=<q>&maksimum=<n>&token=<t>` →
  `{"status":"ok","fund":[{"type":"vejnavn","titel":"Rådhus Allé","vejNavn":"…"}, {"type":"husnummer","id":"<uuid>","titel":"Rådhuspladsen 1, 1550 København V","vejnavn":"…","husnummer":"1"}]}`.
  Search results carry **no coordinates**. `status:"fejl"` + `beskrivelse` signals an error with HTTP 200.
- Detail: `GET /husnumre/<id>?token=<t>` → `husnummer.adgangspunkt.koordinater {x,y}` in **EPSG:25832** (UTM 32N / ETRS89), plus `adgangsadressebetegnelse`, `postnummer.postnr`, `navngivenvejkommunedel.kommune`.
- Conversion check: `proj4("+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs", "EPSG:4326", [724434.93, 6175755.61])` = `[12.5695777, 55.6756275]`, identical to DAWA's WGS84 for the same address. `proj4` is already a dependency.

**Decision.**

- Keep our own accessible combobox (`AddressSearchDAWA`), and **do not** embed Klimadatastyrelsen's widget. Ours has tested keyboard/ARIA behaviour; theirs is unversioned and not on npm.
- Search endpoint `husnumre` (entrance addresses). Floor/door addresses add nothing for distance ranking.
- Street suggestions refine the search (verified against the live API): a `vejnavn` sets the input to `titel + " "`; a `navngivenvejpostnummer` sets it to `"<vejnavn> , <postnr> <postdistrikt>"` with the caret after the street name, so typing the number yields `"Nørrebrogade 120, 2200 København N"`, an exact match. The API's `postnummer` parameter does not filter, so it is not used. Selecting a `husnummer` fetches the detail **once** and converts the coordinates. Never fetch details per keystroke.
- Token from `NEXT_PUBLIC_ADRESSEVAELGER_TOKEN`, defaulting to `adressevaelger123` so the site works with no configuration.
- Converted coordinates must fall inside the Denmark bounds in `src/lib/maps/denmark-bounds.ts`, or the selection is rejected with the existing error UI.

**Implementation steps.**

1. New module `src/lib/address/adressevaelger.ts` (no React), replacing `src/lib/dawa/autocomplete.ts`:
   - `searchAddresses(query, {signal, limit})` → `AddressSuggestion[]` (`{kind:'street'|'address', id?, label}`); treat `status:"fejl"` as an error; URL-encode `tekst`; clamp `maksimum` to 1–20.
   - `resolveAddress(id, {signal})` → `{label, latitude, longitude, municipalityCode}`, using a module-level `proj4` converter for EPSG:25832 → WGS84.
   - Keep the existing dedupe behaviour (by `id`, else by lower-cased label).
2. Rename `src/components/AddressSearchDAWA.tsx` → `AddressSearch.tsx` and switch it to the new module. Keep the retry/`hasFailed` behaviour from commit `8ee6a45`. Show a loading state while resolving a selected address, and keep the submit button disabled until coordinates exist.
3. `next.config.js` CSP `connect-src`: replace `https://api.dataforsyningen.dk` with `https://adressevaelger.dk`. Update `tests/seo-browser-hardening.test.ts` / `tests/public-ui.test.ts` assertions accordingly.
4. `.env.example`: add `NEXT_PUBLIC_ADRESSEVAELGER_TOKEN=adressevaelger123` with a comment that it is public.
5. Copy: `src/app/privatliv/page.tsx` (processor list and search text: "Adressevælger fra Klimadatastyrelsen" instead of DAWA/Dataforsyningen), `src/app/om-data/page.tsx` if it mentions DAWA, `README.md`, `docs/qa/*` references.
6. `scripts/monitor/production-smoke.mjs`: replace the DAWA check with search + detail against Adressevælger, asserting non-empty `fund` and that the coordinates convert into Denmark.
7. E2E: `e2e/support.ts` `mockDawa` → `mockAddressSearch`, mocking both `**/husnumre/soeg**` and `**/husnumre/*?token=**`; update `search-flow`, `failure-states` and `accessibility` specs.
8. Leave `supabase/migrations` and `docs/data/field-ownership.md` historical DAWA mentions untouched. They describe past decisions, not runtime calls.

**Verification.**

- Unit: conversion of the Rådhuspladsen 1 fixture above to within 1e-6°; `status:"fejl"` → throws; street suggestion → no resolve call.
- E2E: type → street suggestion → refine → address → submit lands on `/shelters/nearby` with the stored context; failure of the detail call shows the retry banner.
- `rg -i "dataforsyningen|dawa" src scripts e2e next.config.js` returns nothing except historical comments.
- Manual: on the preview deployment, search "Rådhuspladsen 1" and see Rådhuspladsen 14 as the first result.

**Owner actions (human).** Subscribe to the [Notifikationsservice](https://confluence.kds.dk/display/ADV/Notifikationsservice) to hear when personal tokens arrive; then set the env var in Vercel.

---

### P0-2 · SEC-01 · Patch critical Next.js and sharp advisories

**Why.** `npm audit --omit=dev` (2026-09-25): `next` 16.0.0–16.3.2 is **critical** (GHSA-2xp9-vwfh-vxw4 RCE in the image optimizer with AVIF; GHSA-p293-qw3h-jr36 affects Windows hosts only). `sharp` < 0.35.4 is **high** (libheif). The site doesn't use `next/image`, but `/_next/image` exists by default.

**Decision.** Patch-level bumps only: `next` and `eslint-config-next` → 16.3.6, `sharp` → 0.35.4. Additionally set `images: { unoptimized: true }` in `next.config.js`, because the site serves no optimised images; this removes the optimizer attack surface for future advisories. Confirm first with `rg "from ['\"]next/image" src` (currently no imports; `mfa-panel.tsx` only mentions it in a comment).

**Files.** `package.json`, `package-lock.json`, `next.config.js`.

**Outcome.** Shipped in #39. On Vercel, `/_next/image` is served by Vercel's platform image service, so `unoptimized: true` does not remove the endpoint there (it does locally and when self-hosted). The Next.js upgrade is the actual fix.

**Verification.** `npm audit --omit=dev` reports 0 high/critical; lint, typecheck, tests and CI Playwright are green; `curl -I https://<preview>/_next/image?url=/favicons/favicon-32x32.png&w=32&q=75` no longer returns an optimised image.

---

### P0-3 · OPS-01 · Stop `/api/health` reporting 503 because GitHub delays cron

**Why (evidence).** `production-smoke.yml` is scheduled `17,47 * * * *` (every 30 min), but GitHub runs it every **3–6 hours** (runs on 2026-09-24/25 at 06:12, 11:55, 17:16, 20:33, 23:31, 01:57, all successful). The heartbeat limit is 90 min, so `/api/health` returns **503 `degraded`** most of the time (observed: `trusted_operational_heartbeat_is_stale`, age 352 min). The UptimeRobot monitor in `docs/operations/external-monitoring.md` therefore alarms constantly or has been ignored. Either way, a real outage would go unnoticed. GitHub documents scheduled workflows as best-effort and subject to delays under load.

**Decision.** Keep the dead-man design, but make the threshold match reality and separate "the site is broken" from "the monitor is late":

1. Default `HEALTH_MAX_OPERATION_AGE_MINUTES` → **480**.
2. Stale heartbeat alone no longer gives 503. Return **200** with `status: "ok"` and a new `warnings: ["trusted_operational_heartbeat_is_stale"]` array. A **missing** heartbeat or `status !== "ok"` stays a 503 degradation. Data, publication and deployment checks are unchanged.
3. Heartbeat older than **24 h** counts as a degradation again (503), so a permanently dead workflow is still caught.
4. Reduce the cron to hourly (`7 * * * *`). More frequent schedules don't help when GitHub throttles.

**Files.** `src/app/api/health/route.ts`, `src/lib/operations/operational-health.ts` (if the age logic lives there), `scripts/monitor/production-smoke.mjs` (tolerate `warnings`), `.github/workflows/production-smoke.yml`, `docs/operations/external-monitoring.md`, related tests in `tests/`.

**Verification.** Unit tests for the three heartbeat states (fresh → ok; 8–24 h → ok + warning; > 24 h or missing → 503). After deploy, `/api/health` returns 200 between cron runs.

---

## P1 — resilience and the emergency experience

### P1-1 · PERF-01 · Nearby rate limit must survive shared mobile IPs

**Why.** `/api/app-v2/nearby/grouped` allows **30 requests/min per IP** (in-memory and distributed). Danish mobile carriers put many subscribers behind shared IPv4 addresses (CGNAT). During a nationwide alert, thousands of legitimate users can share one IP and all receive 429 at the exact moment the tool matters. Contact/report limits are fine as they are; only the search is critical.

**Decision.**

- Nearby: raise both limits to **600/min per IP**. This still stops a single abusive script, while a CGNAT pool keeps working.
- The distributed limiter stays fail-open (current behaviour).
- On 429 the client retries **once** automatically after `Retry-After` (capped at 10 s), showing "Mange søger lige nu – prøver igen …", before falling back to the error panel.
- Long-term relief comes from ARCH-01, which removes this endpoint from the hot path.

**Files.** `src/app/api/app-v2/nearby/grouped/route.ts`, `src/app/shelters/nearby/client.tsx`, `e2e/failure-states.spec.ts`.

**Verification.** Unit/route test: request 31 succeeds. E2E: a mocked 429 with `Retry-After: 1` followed by 200 renders results without user action. A permanent 429 still shows the 429 message from commit `8ee6a45`.

---

### P1-2 · UX-01 · First result above the fold; map tab fills the screen

**Why (evidence: iPhone 13 screenshots of production, 2026-09-25).** On `/shelters/nearby` the title, the explanation, "Søgeområde", the full `RegistrationNotice` and the tab bar push the **first result below the fold**. After tapping **Kort**, the map starts at the bottom edge of the screen and is almost invisible until the user scrolls. In an emergency, the nearest address must be visible without scrolling.

**Decision.**

- Use `<RegistrationNotice compact />` on the nearby page. Move the full notice text **below the result list**; the one-line status labels on each card already carry the caveat.
- Shorten the header block on mobile: title + "Søgeområde: … · Skift adresse" on one line; drop the explanatory sentence to a smaller `text-sm` line under the tabs.
- When the map tab is selected on mobile, `scrollIntoView({block:'start'})` the map panel, accounting for the sticky header, and size the map to `calc(100dvh - header - tabs)`.
- Desktop layout is unchanged.

**Files.** `src/app/shelters/nearby/client.tsx`, `src/components/RegistrationNotice.tsx` (only if the compact variant needs tweaking).

**Verification.** New Playwright check in `mobile-chromium` and `mobile-webkit`: with mocked results, the first `article` heading's bounding box is fully within the initial 390×844 viewport; after clicking "Kort", ≥ 60 % of the viewport height is map. The accessibility spec stays green.

---

### P1-3 · CONTENT-01 · Link to official shelter and warning information

**Why.** "Ved varsling … følg information fra myndighederne" names no authority and has no link. The site says it is not official, so it should point to the official sources in one tap. Verified reachable 2026-09-25:

- borger.dk: <https://www.borger.dk/politi-retsvaesen-forsvar/Forsvar-og-beredskab/beskyttelsesrum-og-sikringsrum>
- Styrelsen for Samfundssikkerhed: <https://samsik.dk/beskyttelsesrum/> and <https://samsik.dk/beskyttelsesrum/faq-beskyttelsesrum/>

**Decision.** Add a small "Officiel information" list (the two pages above) to the home page's "Ved varsling" aside, to `RegistrationNotice` (non-compact) and to `/om-data`. Plain links with `rel="noopener"`, no tracking. Copy follows `qa/emergency-copy-standard.md`. Don't paraphrase official instructions beyond "gå indenfor og følg myndighedernes information".

**Files.** `src/app/page.tsx`, `src/components/RegistrationNotice.tsx`, `src/app/om-data/page.tsx`, possibly a new constant in `src/lib/public-labels.ts`.

**Verification.** Unit test that the URLs appear. `scripts/monitor/production-smoke.mjs` gets a weekly-tolerant link check (HEAD 200) or a manual check in the QA checklist.

---

### P1-4 · PERF-02 · CDN-cache the revision-keyed country map API

**Why.** `/api/country-shelters` responses are fully determined by `revision` + quantized viewport, both of which are in the URL. Yet every response is `private, no-store`, so every pan runs a function, a rate-limit **write** and a revision read. During a surge, `/kort` becomes a database load generator.

**Decision.**

1. For 200 responses where `requestedRevision === currentRevision`, send `Cache-Control: public, max-age=60, s-maxage=86400, stale-while-revalidate=600`. 400/409/429/502 stay `no-store`.
2. Move the distributed rate limit **after** the revision check, so a cache hit never reaches it. The in-memory limiter stays first.
3. Snap client requests to a **fixed grid per zoom level** (tile-aligned bounds, e.g. 256-px tile boundaries expanded to the viewport), rather than a viewport-derived buffer, so different users produce identical URLs. Keep `quantizeCountryMapViewport` as the server-side guard.

**Files.** `src/app/api/country-shelters/route.ts`, `src/lib/maps/country-map-viewport.ts`, `src/app/kort/country-map.tsx`, `docs/data/country-map.md`, tests for viewport snapping.

**Verification.** Unit: two different viewports inside the same grid cell produce the same request URL. Preview deploy: a second identical request shows `x-vercel-cache: HIT`. Existing `e2e/country-map.spec.ts` is green.

---

### P1-5 · ARCH-01 · Revision-keyed nearby tiles with on-device ranking

**Why.** Every search today is a POST with exact coordinates. That means one rate-limit write, one Haversine scan over a 50 km bounding box (≈ 20k rows around Copenhagen, no spatial index), and a label query. POSTs cannot be cached. The whole public dataset is only **~10,100 registrations**, which is small enough to serve as static, CDN-cached tiles and rank on the device. That brings:

- **Scalability:** zero database work per search on a cache hit.
- **Privacy:** only a coarse tile ID leaves the device, never the exact position.
- **Resilience:** it keeps working if Supabase is slow, and it is the foundation for OFFLINE-01.

**Decision.**

- Tile grid: 0.25° latitude × 0.40° longitude (≈ 28 × 26 km). Tile key = `floor(lat/0.25)_floor(lng/0.40)`.
- Endpoint `GET /api/app-v2/nearby/tiles/<revision>/<tileKey>` returns a compact columnar JSON: `{revision, rows: {slug[], addressLine1[], postalCode[], city[], lat[], lng[], capacity[], applicationCodeLabel[]}}`, built from the same public view as `get_nearby_shelters_public_v2` (identical eligibility). Cache: `public, s-maxage=31536000, immutable`. A mismatched revision → 409 with `currentRevision` (same contract as the country map).
- Client loads the user's tile + 8 neighbours (guaranteed coverage ≥ 26 km radius), ranks with Haversine, groups by the **same key** (`address_line1 + postal_code + city`, representative = nearest) and takes 10.
- If fewer than 10 groups fall inside the guaranteed radius, or any tile fails, fall back to the existing POST endpoint. The POST endpoint stays as the fallback and as the contract for `scripts/read/app-v2-nearby-api.ts`.
- Current revision comes from the existing public revision read (as the country map does).

**Spike first (½ day, report in PR).** Measure gzip size of the 9 Copenhagen tiles. Target ≤ 150 KB total. If it's larger, halve the tile size and load 5×5 around the centre, or drop `applicationCodeLabel` into a code → label dictionary.

**Files.** New `src/app/api/app-v2/nearby/tiles/[revision]/[tile]/route.ts`, new `src/lib/nearby/tiles.ts` (grid math + ranking + grouping, pure functions), query in `src/lib/supabase/app-v2-queries.ts` (or its split module after CODE-03), `src/app/shelters/nearby/client.tsx`, docs in `docs/data/`.

**Verification.**

- **Parity test** (script in `scripts/parity/nearby-tiles.ts`): for 200 random points inside Denmark, on-device results (slugs, order, group counts, capacities) equal the POST API results. Wire into `test:release`.
- Unit tests for tile keys at tile boundaries and at negative/edge coordinates.
- E2E: nearby page renders from mocked tiles without calling the POST endpoint; with a tile 500 it falls back to POST.

---

### P1-6 · PERF-03 · Cut database writes per visitor action

**Why.** Each product-metric event performs **two writes** (distributed rate-limit bucket + metric counter). A single search emits 3–4 events, so a visit costs roughly 8 writes, on top of the nearby rate-limit write. Under surge, analytics competes with the actual search for database capacity.

**Decision (revised during implementation).** An earlier audit deliberately put the shared rate limit on `/api/metrics` as abuse protection, and the existing `keepalive` fetch already survives navigation, so neither change is worth it. Only the kill switch is implemented:

- Add a kill switch: `PRODUCT_METRICS_DISABLED=1` makes `/api/metrics` return 202 without writing, so the owner can shed load in an emergency by changing an environment variable and redeploying, with no code change.

**Files.** `src/app/api/metrics/route.ts`, `src/lib/analytics/product-metrics.ts`, `docs/qa/free-observability.md`, tests.

**Verification.** Unit test for the kill switch and payload validation; `scripts/monitor/product-metrics-health.mjs` still passes.

---

## P2 — hygiene, privacy and polish

### P2-1 · DX-01 · Automated dependency updates

**Why.** No Dependabot/Renovate config. The critical Next.js advisory (SEC-01) was found by a manual audit.

**Decision.** Add `.github/dependabot.yml`: `npm` (weekly, group minor+patch into one PR, separate PRs for majors), `github-actions` (monthly; actions are SHA-pinned, keep that), `pip`/`uv` for `tools/datafordeler-importer` (monthly). Security updates enabled in repo settings (owner action).

**Verification.** Dependabot shows the config as valid in the repository Insights tab.

### P2-2 · TEST-01 · Secret-free e2e path

**Why.** Agents and fork contributors cannot run a production build: `/kommune` prerender throws without Supabase. That blocks meaningful browser verification (seen in this review).

**Decision.** Add `playwright.dev.config.ts` that starts `next dev` with placeholder env and runs only specs tagged `@ui` (those that mock all network). Tag qualifying tests. Add `npm run test:e2e:ui`. Respect `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for preinstalled browsers. Skip metric assertions when `process.env.PLAYWRIGHT_DEV === '1'`. Don't change prerender behaviour of production pages.

**Verification.** `npm run test:e2e:ui` passes in a clean clone with no `.env`.

### P2-3 · PRIV-01 · Click-to-load map on detail pages

**Why.** `/privatliv` says OpenStreetMap receives requests "når et kort aktiveres", but the detail page iframe loads automatically (lazy, on scroll). In the production screenshot the iframe area also rendered **blank**; verify whether the OSM embed loads reliably under our CSP (`frame-src https://www.openstreetmap.org`) and sandbox.

**Decision.** Replace the auto-loading iframe with a static placeholder and a "Vis kort" button that mounts the iframe. This matches the nearby page and the privacy text. Keep the external OSM link. If the blank rendering is a real bug (not screenshot timing), fix it in the same PR and add an e2e check that the iframe `src` is set after the click.

**Files.** `src/components/ShelterOsmEmbedMap.tsx`, detail page, e2e.

### P2-4 · SEC-02 · One helper for client IP and same-origin checks

**Why.** `src/lib/rate-limit.ts` prefers `x-forwarded-for`, while `src/lib/distributed-rate-limit.ts` prefers `x-vercel-forwarded-for`. `isSameOrigin` is copy-pasted in four route files plus `privacy-contact-api.ts`. Inconsistency here becomes a bypass later.

**Decision.** New `src/lib/http/request-context.ts` exporting `getClientAddress(request)` (order: `x-vercel-forwarded-for`, `x-real-ip`, first `x-forwarded-for`) and `isSameOriginRequest(request)`. Replace all copies. No behaviour change except the header order in the in-memory limiter.

**Verification.** Unit tests for header precedence and origin parsing; `rg "function isSameOrigin" src` returns one match.

### P2-5 · UX-02 · Clear actions on the detail page, incl. walking route

**Why.** The detail page has "Vis på kort" (orange, Google Maps) and "Se adressen i kort" (in-page map), which are nearly identical labels for different things. There is no route option, although the most likely next action is "how do I get there".

**Decision (revised during implementation).** No route link. `qa/emergency-copy-standard.md` forbids presenting results as an instruction to move toward an address, and a route button does exactly that. Implemented instead: the external link is labelled "Åbn i Google Maps" and the in-page "Vis på kort" now also loads the map (PRIV-01). The original proposal is kept below for the record.

- ~~Primary: **"Rutevejledning (gå)"** → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=walking` (destination only, no origin sent by us).~~
- Secondary: "Åbn i Google Maps" (existing place link).
- The in-page map anchor is renamed "Kort på siden".
- Add the same route link as a secondary action on nearby result cards.
- Keep the caveat labels adjacent. Architect note: a route does not imply access; the status labels must stay visible next to the button.

**Files.** `src/app/beskyttelsesrum/[slug]/page.tsx`, `src/app/shelters/nearby/client.tsx`, `tests/public-ui.test.ts`.

### P2-6 · UX-03 · Fix wrapping of secondary links on the home page

**Why.** On a 390 px screen, "Kender du ikke adressen? **Kommuner**" wraps and "**Landskort**" lands alone on the next line with an odd indent (screenshot 2026-09-25).

**Decision.** Stack the lead text above a two-button row (`grid grid-cols-2 gap-2`) on mobile; keep the inline layout from `sm:` up.

**Files.** `src/app/page.tsx`.

### P2-7 · CODE-01 · Remove dead diagnostics from the nearby API

**Why.** `handleNearbyRequest(…, debugMeta = false)` is never called with `true`, so `capabilities`, `grouping`, `exclusionMode`, `limitations`, `parameterDefaults`, `parameterBounds` and `getAppV2NearbyEligibilitySummary()` are dead weight (≈ 60 lines). The last one is also executed on every request.

**Decision.** Delete the unused constants and branch; keep the slim `meta`. Check `scripts/read/app-v2-nearby-api.ts` and `tests/` for consumers first and adjust them.

### P2-8 · CODE-02 · Shared helper for user-facing fetch errors

**Why.** Commit `8ee6a45` added the same "never show TypeError/SyntaxError text" logic in two places (`privacy-contact-portal.tsx`, `ReportShelterIssue.tsx`).

**Decision.** `src/lib/http/client-errors.ts` with `readJsonSafely(response)` and `visibleErrorMessage(error, fallback)`; use it in both files.

---

## P3 — later

### P3-1 · CODE-03 · Split `app-v2-queries.ts` by domain

`src/lib/supabase/app-v2-queries.ts` is 1,847 lines. Split into `src/lib/supabase/queries/{shelters,nearby,municipalities,country-map,stats,publication}.ts` with a temporary barrel re-export so imports don't churn. Pure move, no logic changes, one PR. Do it **after** ARCH-01 and CODE-01 to avoid merge pain.

### P3-2 · OFFLINE-01 · Offline fallback for the last search

When networks are congested, a returning visitor should still see their last result list. After ARCH-01: a minimal service worker (no library) that caches the app shell, the last-used nearby tiles (by revision) and the static info pages. It must show a clear "offline – data fra <dato>" banner. No background sync, no push. Needs its own privacy note (tiles are coarse and contain no user data).

### P3-3 · DATA-01 · Explain the "≥ 40 places" filter next to results

Production shows 10,106 public registrations out of 23,654 source rows; the ≥ 40 places + eligible building-use filter is explained only on `/om-data`. Add one line under the nearby list and on municipality pages linking to the explanation.

### P3-4 · OPS-02 · External dependency register and change watch

Add `docs/operations/external-dependencies.md` listing each third party (Adressevælger/Klimadatastyrelsen, Datafordeler, OpenStreetMap tiles/embed, Vercel, Supabase, GitHub, UptimeRobot), what breaks without it, the fallback, the owner action to monitor it (newsletter/status page), and known deadlines (Adressevælger personal tokens expected end 2026 / early 2027). The DAWA shutdown was nearly missed; this makes the next one visible.

### P3-5 · DEPS-01 · Major upgrades (deferred)

Tailwind 3 → 4, ESLint 9 → 10, TypeScript 5 → 7, `@vercel/analytics` 1 → 2, `dotenv` 16 → 18. None fixes a known vulnerability. Do them one per PR after DX-01, never opportunistically inside feature tasks.

---

## Reviewed and found sound (no action)

Recorded so future reviews don't redo the work:

- Admin: GitHub OAuth + allowlist + MFA, enforced again in the database (`aal2` checked in every moderation RPC); rollback is owner-only and requires typed confirmation.
- Contact portal: 160-bit access keys, only hashes stored, no email.
- Public API input validation, bounded body reads, same-origin checks and honeypots.
- CSP without `unsafe-eval` in production, `script-src-attr 'none'`, `frame-ancestors 'none'`; HSTS preload.
- Nearby query ranks by true distance before applying the candidate budget; RPC arguments are bounded in SQL.
- Functions run in `dub1` (Dublin), close to the EU database; live latency 0.7–1.3 s TTFB from outside the EU.
- Leaflet popup HTML is escaped; JSON-LD is serialized safely.
- Import pipeline with staging, quality gates, atomic publication and rollback; data was 20 h old at review time.
