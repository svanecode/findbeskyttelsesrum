# Full review: findbeskyttelsesrum (main @ 00aa23e, 2026-09-26)

Read-only review. No files in the repository were changed. Method: the project's own checks were run locally, the live site was probed, the last scheduled import's CI log was read, and four independent deep reviews (nearby search, security, data pipeline, UI/ops) were run and their key findings re-verified by hand.

## Verdict

The project does what the README says it does, and the important claims hold up in production: the address search runs on Adressevælger, on-device tile ranking matches the server search at every sampled position, the CDN caching and revision-409 flow work, the import pipeline is genuinely staged, gated, atomic and idempotent, the authorization model is enforced in the database, and retention jobs exist. Code quality, test discipline and documentation are far above what a small volunteer project usually has.

What it does not yet achieve is the second half of its own promise: several safety-net and privacy claims are overstated or contradicted by the shipped code. Three findings deserve immediate attention (the owner-excluded address printed to public CI logs, the probably non-functional rollback, and the privacy notice contradicting the offline feature). The rest is documentation drift and hardening.

## What was verified as working

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck` | clean |
| `npm test` | 131/131 pass |
| Importer `ruff`, `mypy --strict`, `pytest` | clean, 37/37 pass |
| `npm audit --omit=dev` | 0 vulnerabilities (1 high in dev-only `js-yaml`) |
| `npm run test:e2e:ui` (secret-free, Chromium desktop + mobile) | 53 pass, 11 skipped, as claimed by TEST-01 |
| Live `/api/health` | 200 ok, 10 105 registrations, data 7.9 h old, deployed SHA = main HEAD |
| Live Adressevælger search | works with the shared token |
| Live tile endpoint | `x-vercel-cache: HIT` on second request; no query strings accepted |
| Live country map API | CDN HIT on repeat; stale revision → 409 |
| `scripts/parity/nearby-tiles.ts` against production | 17/17 identical, 0 fallbacks |
| Last scheduled import (run 36232220765) | published; all 11 smoke checks passed |

Verified true by code reading (see the four sub-reports for file:line): GitHub OAuth + allowlist + MFA enforced in every admin page, server action and RPC (`aal2` re-checked in SQL); all 21 `app_v2` tables have RLS; anon/authenticated have SELECT only on explicit `*_v2` views and three bounded RPCs, no write grants; contact portal uses 160-bit keys with only hashes stored; body reads are bounded on every POST route; metrics accept only an allowlisted event name and a duration; retention function matches `docs/privacy/retention.md` and is scheduled in pg_cron; import publication is one transaction behind an advisory lock with real quality gates, no force flag, and idempotent retry; stable slugs are trigger-enforced; municipality aggregate and revision bump happen inside the publication transaction.

## High

### H1. An owner-excluded shelter address is printed to public GitHub Actions logs every day
`.github/workflows/datafordeler-import.yml` runs `npm run parity:exclusions` after every scheduled import. `scripts/parity/exclusions.ts` prints each legacy exclusion with its full address, the matching `registrering-…` slug and the Datafordeler source reference. The repository is public (unauthenticated `GET github.com/svanecode/findbeskyttelsesrum` → 200), so the logs are public. Verified in the log of the 2026-09-26 run: the single active exclusion is printed with address, slug and source reference. The exclusion feature exists precisely to keep that registration out of public view. Fix: print counts only, or move the mapping report to an artifact with restricted retention, or drop the legacy parity step now that the legacy table has one row.

### H2. Dataset rollback from `/admin/drift` will most likely time out and has no test
`app_v2.rollback_dataset_publication_v1` (migration 20260821160328:964-1204) has no `SET statement_timeout`, unlike the publisher which was given 60 s because "eight seconds is too close to the normal publication runtime" (20260824070202:1-9). It is called through the signed-in user's PostgREST session (`src/app/admin/drift/actions.ts:25`), so it inherits the platform's default budget. It does not set the `quality_gate_passed` deferral flag, so the municipality-summary refresh and revision bump fire six times inside the transaction. There is no pgTAP test of rollback. It fails safe (transaction aborts), but the README's documented recovery path for a bad import is probably dead. Fix: `alter function … set statement_timeout = '60s'`, set the deferral flag, add a pgTAP test that rolls back a real snapshot.

### H3. The privacy notice contradicts the shipped offline feature and carries a stale date
`src/app/privatliv/page.tsx:214-215` says the service "tilbyder ikke en offlinekopi af registreringerne eller kortet". `public/offline-sw.js` caches up to 45 nearby tiles, 20 pages and 200 static files, and `client.tsx` serves results from them. The same page (lines 74-77) describes the offline cache, so it now contradicts itself. "Senest opdateret 30. august 2026" (line 31) predates three changes to what is processed (#39, #42, #49). `tests/public-ui.test.ts:232-233` asserts the false sentence, so CI protects the defect. OFFLINE-01's own note ("needs its own privacy note") was never done.

## Medium

- **M1. BBR usage-code allowlist is not in git.** `20260418193902_app_v2_application_code_eligibility.sql:45-71` seeds `application_code_eligibility` only when the legacy `public.anvendelseskoder` table exists. Production has 105 rows (visible in the import log); a fresh database has zero, so every public view returns no rows. The eligibility rule the docs call "explicit" cannot be reviewed or reproduced from the repo. pgTAP passes only because tests insert their own codes.
- **M2. Missing `RATE_LIMIT_HASH_SECRET` fails silently.** `src/lib/distributed-rate-limit.ts:34-45` throws in production, but the throw is inside the `try` at 62-102 and is swallowed. Read routes then silently lose the shared limiter; the contact and report routes return 503 permanently. Nothing in `/api/health` or the smoke monitor checks the secret.
- **M3. `/api/health` is unthrottled and its CDN cache is bypassed by any query string.** Every other route rejects unknown parameters; health does not. Verified live: `/api/health?x=…` → `x-vercel-cache: MISS`. Each probe costs four database reads including an aggregate over the public view. 503 responses are `no-store`, so during an incident every probe hits the database.
- **M4. Service worker can make the online site worse.** `public/offline-sw.js:106-112`: a rejected `cache.put` (quota, private mode) rejects the network promise, and with nothing cached the navigation fails even though the server answered 200. Same coupling in `cacheFirst`. The unit test's in-memory cache never rejects. Also, the 6 s navigation timeout serves cached HTML from a previous deploy on a slow (not dead) network; that HTML references chunks of a build that may no longer be served.
- **M5. "Only a coarse tile ID leaves the device" is overstated.** `client.tsx:282-283` posts the exact position whenever any tile fails, revisions are mixed, or fewer than 10 groups lie inside the block's guaranteed radius. In sparse areas (rural Jutland, small islands) the last condition is permanent. Nothing in the UI distinguishes the two paths.
- **M6. Every publication pushes all searches back to the POST endpoint for up to about six minutes.** Tiles are CDN-cached per URL for 300 s + 60 s stale and carry the revision; nothing purges them on publish. Until all nine tiles of a block have expired they report mixed revisions and the client falls back to POST. Correctness is preserved; the "zero database work" and resilience claims have a hole at exactly the moment an import coincides with an alert.
- **M7. Production builds require Supabase at build time.** `/kommune`, `/kort` and `sitemap.ts` fetch at prerender without a fallback. A hotfix or rollback deploy fails if the database is down or slow. The plan acknowledges this and chose not to change it; it is still the operational risk most likely to bite during an incident.
- **M8. Exclusion matching gaps.** The public view matches exclusions by shelter id, canonical source pair, or normalized address (20260820105609:577-646). Rows whose only identity is a legacy field are never applied though the CHECK constraint allows them, and address-only exclusions lapse when the importer rewrites the address after a DAR change. Moderator-created exclusions carry all three identities and are safe; manual or legacy rows may not be.
- **M9. Import runs killed without SIGINT stay `running` forever.** No SIGTERM handler in the importer; `prune_datafordeler_import_candidates_v1` only prunes `failed` runs. A runner loss or the 360-minute timeout leaves a zombie that blocks resume and shows "Kører i karantæne" indefinitely. Public data is unaffected.
- **M10. Tie-break ordering differs between server and device.** `nearby.ts:274,306` and `tiles.ts:176,189` sort with `localeCompare()` without a locale. Verified: `"æ".localeCompare("z")` is -1 in en-US (server) and +1 in da-DK (Danish browser). Equal-distance groups with æ/ø/å in the key can therefore appear in different order on the two paths, contradicting "guaranteed identical". Pass `"da-DK"` in both.
- **M11. PERF-02 step 3 claim is overstated.** "Visitors looking at the same area send identical URLs" is only true when all four padded edges snap to the same cells. Measured on the real module: 19–29 % identical URLs for random centres inside one cell at equal viewport size, 0 % between a desktop and a phone. The unit test shifts the viewport by 0.001–0.003°, far less than a cell. What is true: cells are whole multiples of the server step, and the URL space per zoom is finite.
- **M12. Documentation contradicts itself on deployment mode.** README says every merge to main deploys automatically; `docs/operations/external-dependencies.md:13` says production is deployed manually. The hourly smoke check fails whenever production's SHA differs from main's HEAD, so the semantics of that check depend on which document is right.
- **M13. Colour contrast.** `text-gray-500` (#6b7280) on the page background (#0b0c0e) is about 4.0:1, below WCAG AA 4.5:1, on `/privatliv`, `error.tsx`, the kommune page and the contact portal. None of those states is axe-checked.
- **M14. CSP gives no script-injection protection.** `script-src 'self' 'unsafe-inline'` with no nonces. The reason (static output) is documented in `next.config.js`, but the improvement plan's "found sound" entry lists only the strong directives. Actual sinks (JSON-LD, Leaflet popups) are escaped correctly, so this is defense in depth, not a vulnerability.

## Low and nits (selected)

- README says the production check runs "to gange i timen"; the cron is hourly (OPS-01). README says browser tests run in "Chromium og WebKit"; Firefox runs too.
- `docs/data/import-flow.md:66` and `schema.md:42` say `--finalize-latest` calls `retry_latest_completed_datafordeler_publication_v1()`; that function now raises and is revoked. The real path is `get_latest_completed_datafordeler_import_v1` + `retry_completed_datafordeler_publication_v1(uuid)`.
- `docs/improvement-plan.md` still lists PERF-02 step 3 and CODE-03 as "in review" though #50 is merged. SEC-02 specifies a header order (`x-vercel-forwarded-for, x-real-ip, x-forwarded-for`) that differs from the implementation and its test.
- PERF-01's "request 31 succeeds" test does not exist. The 429 retry is "skip if Retry-After > 10 s", not "cap at 10 s"; the in-memory limiter always sends 60 s, so only the distributed limiter ever triggers the automatic retry.
- `region_name` is never supplied by the importer and is nulled on every import by `on conflict … set region_name = excluded.region_name`; `field-ownership.md:183` says it comes from the bundled map. `import_state = 'suppressed'` is documented but reset to `active` by every import.
- `20260824071755:111` executes a publication inside a migration; `supabase db push` can change the public dataset.
- Partial indexes predicate on base `capacity >= 40` while the view uses the override-coalesced capacity, so the planner cannot use them for view queries; several redundant indexes on `shelters` add write cost to the daily upsert.
- The post-import check `parity:municipalities` reads legacy `public.kommunekoder`, which no migration creates; dropping legacy tables will make the scheduled job fail after a successful publication.
- `production-smoke.mjs` posts a real `data_explanation_opened` metric every hour, inflating the counter in `/admin/drift`. Monitor scripts have no tests.
- `tests/public-ui.test.ts` (447 lines) and the importer's `test_sql_contract.py` / `test_import_runtime_contract.py` are source-text greps; they break on refactors and pass on regressions. pgTAP has no rollback test and none of the v2 rejection gates.
- Unused dependencies: `geolib`, `@heroicons/react` (runtime), `ts-node`, `@types/dotenv` (dev). `overrides.ws` targets nothing. `scripts/generate-favicons.js` uses `require()` in an ESM package and asks sharp for `.ico`; `scripts/test-caching-headers.js` treats a 10 s dev-server timeout as success. README calls `scripts` "aktive".
- `alt` on Leaflet `divIcon` markers is a no-op (Leaflet sets `alt` only on `<img>` icons); numbered pins in #52 are consistent with the list (no off-by-one).
- The "≥ 40 pladser" explanation (DATA-01) is on the nearby page but not on kommune pages. Kommune pagination renders every page link unwindowed.
- `AddressSearch.tsx:157-186` "search on Enter" branch is unreachable because the only submit button is disabled until coordinates exist.
- The tile route runs an unused COUNT query per cache miss. `guaranteedCoverageMeters` minimum is about 24 km, not the 26 km the plan states (harmless, computed exactly at runtime).
- The health endpoints expose the GitHub run id and internal publication/import UUIDs; the smoke monitor needs only the SHA and deployment id.
- Leaflet popup styles are duplicated between `ensure-popup-styles.ts` and `leaflet-overrides.css` with divergent values; the injected sheet wins.
- JS map animations (`flyTo`, `fitBounds`, smooth `scrollIntoView`) ignore `prefers-reduced-motion`; CSS handles it.
- Non-ASCII contact messages near the 4 000-character limit are rejected by the 8 192-byte cap and reported as 400 instead of 413.

## Unverifiable from the repo

Production Supabase auth settings (public signups, redirect allowlist), presence of `RATE_LIMIT_HASH_SECRET` in Vercel, whether the live database matches the migration chain, and Vercel's retention of superseded static chunks.
