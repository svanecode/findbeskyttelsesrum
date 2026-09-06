# Repository audit — 6 September 2026

Audited commit: `f35354f9fed1f2c943ae7f537f64212ddb51102a` on `main`.

This document records the original findings and baseline checks. See [the remediation record](2026-09-06-audit-remediation.md) for the subsequent fixes and release verification.

**11 confirmed findings: 2 high priority (P1), 7 medium priority (P2), and 2 low priority (P3).** The highest priorities are anonymous access to legacy exclusion information and readiness monitoring that can conceal a database outage. Passing build and browser checks do not cover these failures.

This audit covers application behavior, security and privacy boundaries, database migrations, importing and publication, public maps/search, accessibility and SEO, dependencies, CI, operational scripts, and documentation. Application code and production state were not changed. The pre-existing untracked `.playwright-mcp/` directory was preserved; this report is the only new repository source file.

## Findings

### 1. P1 — Legacy exclusions remain anonymously readable

**Location:** [exclusion read policies](/Users/andreasjensen/Projekter/findbeskyttelsesrum/supabase/migrations/20260110213556_enable_rls_excluded_shelters.sql:20).

The effective migration history still permits unconditional `SELECT` by `anon` and `authenticated` on `public.excluded_shelters`. This table includes `address`, `reason`, and `created_by`. Later migrations lock down the listing helper RPC and retire several legacy `app_v2` views, but do not revoke access to this table. Anyone using the public project key can request the legacy exclusion records directly.

**Evidence:** a bounded anonymous `HEAD /rest/v1/excluded_shelters?select=id,address,reason,created_by&limit=1` against the configured project returned HTTP 200 and `Content-Range: 0-0/1`. No record contents were retrieved. This confirms deployed access, rather than relying on assumed default grants.

**Fix:** add a migration revoking table privileges from `PUBLIC`, `anon`, and `authenticated`, remove the unconditional read policies, and retire or adjust any legacy invoker functions that depend on them. Add an actual role-based database test for this table. RLS policies and table grants must both be reviewed; Supabase documents these as separate access-control layers. [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).

### 2. P1 — Readiness can report healthy throughout a database outage

**Location:** [health dependency cache](/Users/andreasjensen/Projekter/findbeskyttelsesrum/src/app/api/health/route.ts:18).

The readiness handler wraps its database reads in `unstable_cache` with a 30-second revalidation interval. When a previously successful entry becomes stale, Next returns it and revalidates in the background. If that refresh throws, Next retains the successful old value; the route's outer `catch` does not receive the failure.

The response consequently gets a new `checkedAt` while still claiming `database.reachable: true`. Heartbeat `isFresh` and `ageMinutes` are also frozen inside the cached value. A warmed, healthy deployment can continue returning HTTP 200 during a database outage until the separately computed source-data age reaches the 48-hour limit. The intended 90-minute heartbeat alarm does not provide its expected protection in this case.

**Evidence:** a local reproduction used the installed Next cache implementation and its real request async context, with a stale healthy entry and a refresh callback that threw a simulated database outage. The call returned the old healthy entry. The installed implementation catches the background rejection in `node_modules/next/dist/server/web/spec-extension/unstable-cache.js`.

**Fix:** use uncached dependency checks behind the existing short response cache, or a snapshot with a hard maximum observation age. Recompute heartbeat freshness from its timestamp. Test a warmed healthy cache followed by dependency failure, asserting non-200 readiness within the defined freshness limit.

### 3. P2 — Moderation and rollback leave public pages serving superseded data

**Locations:** [moderation invalidation](/Users/andreasjensen/Projekter/findbeskyttelsesrum/src/app/admin/actions.ts:38), [rollback invalidation](/Users/andreasjensen/Projekter/findbeskyttelsesrum/src/app/admin/drift/actions.ts:33).

After excluding or correcting a registration, moderation invalidates only `/admin`, `/kort`, and `/om-data`. Rollback additionally invalidates the municipality index. Neither clears cached shelter details, municipality detail pages, or their pagination routes. Those pages declare `revalidate = 3600`; the homepage totals have a 600-second interval.

Visitors can therefore continue seeing excluded registrations or old capacities for up to an hour, plus revalidation delay, after a successful moderation or rollback. The revision ledger protects country-map requests but cannot update already-cached HTML. Invalidating the literal `/kommune` page does not invalidate its descendants.

**Evidence:** traced successful mutation paths against public route cache declarations and bundled Next revalidation documentation. No live moderation or rollback was executed.

**Fix:** invalidate affected detail and municipality route patterns, including paginated pages and totals, or introduce shared data tags that invalidate their route output. Test exclusion and rollback after warming the affected public pages.

### 4. P2 — Publication retries can misreport success or publish another snapshot

**Locations:** [unconditional network retries](/Users/andreasjensen/Projekter/findbeskyttelsesrum/tools/datafordeler-importer/shelter_importer/supabase.py:88), [recovery candidate selection](/Users/andreasjensen/Projekter/findbeskyttelsesrum/supabase/migrations/20260824071755_recover_completed_import_publication.sql:40).

The importer automatically retries mutation requests after timeouts, connection failures, and selected HTTP errors. If publication commits but its response is lost, retrying the same publisher fails its `running`/`staging` guard. The importer reports failure even though the dataset was published, and the scheduled post-publication checks are skipped. The default 45-second client timeout is also shorter than the publisher's 60-second database budget.

Recovery has a stronger consequence: its RPC selects the latest eligible failed run without accepting a run ID. After a successful commit with a lost response, a retry can select and publish another, older retained run. The current publication functions have no snapshot chronology guard preventing that replacement, provided the older candidate passes the other quality gates.

**Evidence:** an offline reproduction called the real `AppV2Store.publish_full_import` with a fake session that committed state and then raised a timeout. The second call returned the SQL eligibility rejection: database publication succeeded, two client calls occurred, and the client reported failure. The older-recovery scenario was established from the current selection and publisher SQL; it was not executed against production.

**Fix:** bind every logical publication/recovery operation to an exact import-run ID; return the existing publication on retry. Reconcile the run after uncertain outcomes before repeating mutations. Set the publication timeout above its server budget, and reject unintended publication of older snapshots.

### 5. P2 — Candidate truncation can remove the nearest registration

**Location:** [nearby candidate ordering](/Users/andreasjensen/Projekter/findbeskyttelsesrum/supabase/migrations/20260816194738_public_registration_read_model.sql:186).

The current nearby RPC first orders by unweighted squared latitude/longitude degrees and limits the candidate set. It calculates and sorts by Haversine distance only afterward. At Danish latitudes, longitude degrees cover substantially less distance than latitude degrees, so a closer registration can be discarded before the correct sort.

**Evidence:** reproducing the SQL arithmetic at `(55.6761, 12.5683)`, 500 northward candidates offset by 0.01° are 1,111.95 m away. An eastward candidate offset by 0.015° is only 940.49 m away, but the degree-based ordering discards it at the default 500-candidate limit. Smaller caller-provided candidate limits reproduce the same issue with fewer records. This is a synthetic counterexample, not a claim that the current Copenhagen dataset has this distribution.

**Fix:** order by physical distance before truncating, or use a conservative spatial selection that cannot exclude nearer results. Add a database test using different axes at Danish latitude and a tight candidate limit.

### 6. P2 — Nearby map state changes undo the user's zoom

**Locations:** [bounds effect dependencies](/Users/andreasjensen/Projekter/findbeskyttelsesrum/src/app/shelters/nearby/nearby-fit-bounds.tsx:48), [location tuple caller](/Users/andreasjensen/Projekter/findbeskyttelsesrum/src/app/shelters/nearby/client.tsx:483).

The parent creates a new `[lat, lng]` array on each render, while the bounds effect depends on its identity. Marker selection, announcement changes, and tile loading/ready updates can therefore call `fitBounds` again even when the origin and results are unchanged. This replaces the visitor's chosen viewport.

**Evidence:** browser reproduction with two synthetic results initially fitted at zoom 13. With tiles delayed by 500 ms, clicking zoom-in briefly reached 14 and then returned to 13 after tile completion. With fast tiles, selecting a marker after zooming to 14 also reset the map to 13.

**Fix:** memoize the coordinate tuple or depend on scalar coordinates, and fit only when origin/results change. Cover zoom persistence through tile completion and marker selection in browser tests.

### 7. P2 — Municipality maps miss initialization and first mobile selection

**Location:** [map-ready callback](/Users/andreasjensen/Projekter/findbeskyttelsesrum/src/app/kommune/[slug]/kommune-map.tsx:91), with the selection effect at line 80.

React Leaflet invokes `whenReady` before its forwarded ref is populated. The callback reads a null `mapRef.current`, returns, and is never retried. The map stays at hard-coded zoom 10 around the first address instead of fitting the displayed groups. On mobile, the first “Vis på kort” click also selects an address before the lazy map has mounted; the selection effect misses it and does not depend on later map readiness.

**Evidence:** `/kommune/kobenhavn` began at zoom 10 while the intended fit for its 30 displayed groups was zoom 13. Subsequent selection on the mounted map correctly reached 14. On a fresh 390×844 mobile page, the first “Vis på kort” action created the map but left it at zoom 10. The bundled React Leaflet implementation confirms the callback/ref ordering.

**Fix:** use the ready event's map target or a `useMap()` child effect. Apply any pending selection when the map becomes ready. Test both initial bounds and the first mobile map activation.

### 8. P2 — Administrative status tabs hide records beyond the first 250

**Locations:** [report queue](/Users/andreasjensen/Projekter/findbeskyttelsesrum/src/app/admin/page.tsx:211), [contact queue](/Users/andreasjensen/Projekter/findbeskyttelsesrum/src/app/admin/kontakt/page.tsx:172).

Both pages request an unfiltered result capped at 250 rows, then apply status filters and calculate counts from that slice. Their RPCs prioritize open records. With 250 open items, reviewing, answered, or closed items can disappear entirely from the corresponding tabs. There is no pagination or lookup to reach the omitted records, including closed contact cases that operators may need to reopen or delete.

**Evidence:** the DAL already supports a status parameter, but the callers omit it. Current SQL orders by status priority before applying `LIMIT p_limit`. No artificial cases were created.

**Fix:** pass the selected status into the query, obtain counts separately, and add pagination or case lookup so every retained item remains reachable.

### 9. P2 — Standard environment configuration silently skips parity validation

**Locations:** [municipality parity configuration](/Users/andreasjensen/Projekter/findbeskyttelsesrum/scripts/parity/municipalities.ts:39), [public sanity configuration](/Users/andreasjensen/Projekter/findbeskyttelsesrum/scripts/read/app-v2-sanity.ts:55).

The application and `.env.example` use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, but these operational scripts require only the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`. In the supported publishable-key setup, municipality parity skips all reads and exits successfully. `test:release` treats that successful exit as a passed gate. The sanity script similarly skips its anonymous access checks. The importer workflow explicitly creates the legacy alias, which masks this discrepancy in that workflow.

**Evidence:** `NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run parity:municipalities` printed “skipped: missing env vars” and “no database reads were attempted,” then exited 0. With the legacy key present, the real read-only municipality check passed for all 98 municipality codes and names.

**Fix:** reuse the application's public environment resolver. Missing required configuration should fail release validation; offer an explicit optional/offline mode if skipping is useful interactively.

### 10. P3 — JSON null produces an unhandled reporting error

**Location:** [report payload access](/Users/andreasjensen/Projekter/findbeskyttelsesrum/src/app/api/app-v2/shelter-reports/route.ts:69).

`JSON.parse('null')` succeeds, but the result is only type-asserted as `IncomingReport`. Accessing `body.website` throws outside the database error handler. Invalid client input therefore becomes an uncaught 500 with an empty response rather than validation JSON and HTTP 400.

**Evidence:** posting `null` with `Content-Type: application/json` to the local production server returned HTTP 500. This occurs before any database call.

**Fix:** parse as `unknown` and reject null, arrays, and non-object payloads before field access, matching the other validated API handlers.

### 11. P3 — The shipped nearby API probe uses the retired GET contract

**Location:** [probe request](/Users/andreasjensen/Projekter/findbeskyttelsesrum/scripts/read/app-v2-nearby-api.ts:193).

The `read:app-v2-nearby-api` command puts coordinates in query parameters and sends GET. The endpoint now intentionally requires POST to keep coordinates out of URLs. The probe consequently always fails against the current application and cannot validate nearby results.

**Evidence:** running it against the local production build returned HTTP 405 with `nearby_post_required` and exit code 1. A separate POST using the supported JSON contract returned HTTP 200 and three results.

**Fix:** send the supported JSON POST body and update the help/output so it does not print coordinate-bearing URLs.

## Validation results

Validation used Node **24.14.0**, matching the project's `24.x` requirement. The default shell had Node 20, so commands explicitly selected the installed Node 24 runtime.

| Check | Result |
| --- | --- |
| ESLint | Passed |
| TypeScript | Passed |
| TypeScript/Node tests | 84 passed |
| Production Next build | Passed; Next 16.3.1 |
| Full Playwright suite | 116 passed, 69 intentional skips, 0 failed across five configured profiles |
| Python importer tests | 26 passed |
| Python Ruff | Passed |
| Python mypy | Passed for 8 source files |
| Importer packaging | Source distribution and wheel built successfully |
| Local database tests | Could not run: connection refused at 127.0.0.1:54322; Docker unavailable |
| Municipality parity with legacy key available | Passed for 98 municipalities; no missing codes or name/slug mismatches |
| Public nearby API, real read path | HTTP 200, expected contract, 3 results |
| Country-map API, real read path | Expected revision conflict followed by HTTP 200; 118 features, 111 clusters, 10,108 available registrations |
| Tracked-file secret-pattern inspection | No matching private-key/token patterns found; `.env` is not tracked |
| Production-only npm audit | 0 reported advisories |
| Complete npm audit | 3 affected development dependencies, detailed below |

Browser tests used a local production build with `PLAYWRIGHT_HTTP_ORIGIN=1` and server write credentials disabled. Valid report/contact submissions in the suite were mocked. Admin tests covered anonymous redirection, not a complete authenticated OAuth/MFA session. Browser accessibility checks passed on their tested states; this does not establish every interactive state or assistive-technology combination.

Database grants/migrations and authenticated writes were reviewed statically, with the bounded anonymous HEAD check used to establish the deployed exclusion-table exposure. No production reports, contact messages, imports, rollbacks, or settings were written. The failed local database-test connection means migration replay and pgTAP assertions remain unverified in this audit.

## Dependency maintenance

The complete npm audit reports the following transitive development dependencies. They should be updated, but their registry severity is not evidence of remotely exploitable application behavior: no public-input path to their affected APIs was identified, and `npm audit --omit=dev` reports zero advisories.

| Dependency in lockfile | Advisory severity | Patched version | Source |
| --- | --- | --- | --- |
| `browserslist` 4.24.4 | High | 4.28.7 | [Unbounded cache growth](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [untrusted stats handling](https://github.com/advisories/GHSA-73wf-gq98-2v4g) |
| `@humanfs/node` 0.16.7 | Moderate | 0.16.8 | [Symlink traversal during recursive copy](https://github.com/advisories/GHSA-p498-v437-472g) |
| `postcss-selector-parser` 6.1.2 | Low | 6.1.3 | [Uncontrolled AST recursion](https://github.com/advisories/GHSA-w9m9-85wc-3x92) |

No dependency updates were applied as part of the audit. Python lint/tests/build passed; a Python vulnerability database scan was not performed.

## Coverage and remediation order

Manual review covered all API/admin/auth routes; Supabase clients, grants/RLS and effective public RPC definitions; rate limiting, bounded bodies, privacy credentials, retention and error/metric sanitation; importer traversal, mapping, staging, resume, publication and rollback; public search/maps, pagination, links and metadata; workflows, deployment configuration and maintenance scripts. Earlier migrations were checked against later replacements to avoid reporting retired definitions as current bugs.

Existing controls include authenticated admin DAL checks and MFA-gated mutations, server-only write clients, cryptographically generated contact credentials stored as digests, bounded submission bodies, fail-closed write rate limits, fixed metric payload allowlists, no-store private API responses, and public registration disclaimers. These controls are useful, but do not address the findings above.

Address findings 1–2 first, then public-data invalidation and publication retry semantics (3–4). Correct nearby ordering and map interactions (5–7), queue reachability and release checks (8–9), and the two small input/probe defects (10–11). Re-run database tests in a local Supabase environment and add behavioral regressions for the specific failures: many existing security/unit checks inspect source strings, which cannot establish runtime access control, stale-cache behavior, or browser lifecycle ordering.
