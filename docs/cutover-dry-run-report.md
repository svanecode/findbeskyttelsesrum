# Cutover dry run report (Sprint 9b)

Date/time (UTC): 2026-04-24T08:47:13Z

## Scope and safety
- This is a **pre-cutover dry run**.
- No production promotion was performed.
- Python updater and `public.sheltersv2` were not touched.
- No schema changes were made.

## Branch / commit tested
- Branch: `main`
- Commit: `c49bfdc4ef9fd6978b7941646bf83d4ebd3c824c`

## Preview URL used
- Preview (protected): `https://findbeskyttelsesrum-noorbomyv-andreas-svanes-projects.vercel.app`
- Vercel inspector: `https://vercel.com/andreas-svanes-projects/findbeskyttelsesrum/DkxJMJxiGXCPHDACcCaBnHy6bUH5`

### Preview access status
- The preview deployment is protected and returns **401** to unauthenticated HTTP requests.
- Using Vercel's deployment protection bypass (operator access), the pages and APIs were reachable for smoke checks.
- Result: **interactive manual QA still requires a human browser session**, but automated smoke checks were completed.

## Automated checks

### Local repo checks
- `npx tsc --noEmit`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS

### app_v2 sanity (read-only)
Command:

```bash
npm run read:app-v2-sanity
```

Observed values:
- Active shelters: **23,694**
- Total capacity: **3,417,430**
- Municipalities: **98**
- Active municipalities: **97**
- Shelters with coordinates: **23,694**
- Country marker count: **23,694**
- Latest import: **running**
- Shelter exclusions (active): **1**
- Application code eligibility rows: **n/a**
- Result: **PASS**

Notes:
- `Latest import: running` is recorded as a **watch item**. It is not an automatic failure, but a cutover should verify a recent finished successful import on the target environment before go/no-go.
- `application_code_eligibility rows: n/a` is recorded; it did not block this dry run.

### /kort first-load audit against preview
Command:

```bash
AUDIT_BASE_URL=https://findbeskyttelsesrum-noorbomyv-andreas-svanes-projects.vercel.app node scripts/first-load-audit.mjs
```

Result:
- Direct unauthenticated fetch returned `status 401`.
- Using operator access (deployment protection bypass), `/kort` HTML was fetched and confirmed:
  - marker payload is **not** embedded in initial HTML
  - `/api/country-shelters` returns marker payload separately

Supplemental preview checks (operator access):
- Core routes (HTTP 200):
  - `/`, `/land`, `/kommune`, `/om-data`, `/kort`
  - `/kommune/aabenraa`
  - `/beskyttelsesrum/aabenraa-aabenraavej-13-1034c5dec57b`
  - `/shelters/nearby` for three locations:
    - København (`lat=55.6761&lng=12.5683`)
    - Aarhus (`lat=56.1629&lng=10.2039`)
    - Aalborg (`lat=57.0488&lng=9.9217`)
- Jargon leakage scan (HTML):
  - No matches found for: `app_v2`, `cutover`, `datalag`, `appV2NearbyEligibility`, `source=legacy`, `appV2NearbyExperiment`
- `/api/country-shelters`:
  - `count`: **23694**
  - `shelters.length`: **23694**
- `/api/app-v2/nearby/grouped?lat=55.6761&lng=12.5683&limit=10&eligibility=source-application-code`:
  - `results.length`: **10**
  - contract: `app_v2_nearby_grouped_v1`

## Manual QA checklist (preview)
Status: **NOT COMPLETED (needs human browser)**
- Automation was able to reach routes via deployment protection bypass, but Sprint 9b still requires interactive checks:
  - nearby UX for 3 locations
  - `/kort` map interactivity (cluster/popup)
  - mobile viewport usability

## Supplemental local smoke (not a substitute for preview QA)
Because preview was not accessible, a basic HTTP/content smoke was run against `http://localhost:3000` to confirm:
- core routes returned 200 (`/`, `/land`, `/kommune`, `/kort`, `/om-data`, `/shelters/nearby`)
- `robots.txt` and `sitemap.xml` returned 200
- no visible internal jargon tokens were present in the tested HTML responses: `app_v2`, `cutover`, `datalag`, `appV2NearbyEligibility`

## Issues found
1. **Preview requires authorization (401)** for normal requests.
   - Automated smoke checks can use deployment protection bypass.
   - Interactive manual QA still needs a human session with access to the preview.
2. **Vercel Plugin installed (operator-confirmed).**
   - `npx plugins add vercel/vercel-plugin` cloned `https://github.com/vercel/vercel-plugin` and installed `vercel-plugin@vercel`.
   - Installer output notes: “Restart your agent tools to load the plugins.”
   - Note: `npx vercel-plugin doctor` still returned an NPM 404 in this environment, so the plugin’s standalone doctor command could not be run from the registry.

## Go/no-go recommendation
**GO WITH WATCH ITEMS** for readiness, but **do not schedule a cutover window** until interactive preview QA is completed by a human.

Watch items:
- Latest import reported as `running` at the time of the sanity run — confirm a recent finished successful import before any cutover decision.
- Interactive preview QA still pending (nearby UX, `/kort` interactivity, mobile viewport).

## Rollback readiness status
- Legacy production snapshot + Python updater + `public.sheltersv2` remain untouched and are still the rollback net.

