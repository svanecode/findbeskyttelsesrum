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
- Preview: `https://findbeskyttelsesrum-noorbomyv-andreas-svanes-projects.vercel.app`
- Vercel inspector: `https://vercel.com/andreas-svanes-projects/findbeskyttelsesrum/DkxJMJxiGXCPHDACcCaBnHy6bUH5`

### Preview access status
- All tested routes returned **401** (unauthorized), including `/`, `/kort`, `/sitemap.xml`, and `/robots.txt`.
- Result: **manual QA against preview could not be completed** until preview access is enabled for the operator/tester.

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
- Runtime check returned `status 401`.
- Marker payload needle was **not** found in the returned HTML (still good), but the 401 means the audit did not validate a real public HTML response.

## Manual QA checklist (preview)
Status: **NOT COMPLETED**
- Blocked by preview returning `401` on all routes.

## Supplemental local smoke (not a substitute for preview QA)
Because preview was not accessible, a basic HTTP/content smoke was run against `http://localhost:3000` to confirm:
- core routes returned 200 (`/`, `/land`, `/kommune`, `/kort`, `/om-data`, `/shelters/nearby`)
- `robots.txt` and `sitemap.xml` returned 200
- no visible internal jargon tokens were present in the tested HTML responses: `app_v2`, `cutover`, `datalag`, `appV2NearbyEligibility`

## Issues found
1. **Preview requires authorization (401)**, blocking the required preview/prod-like QA and the `/kort` runtime audit.

## Go/no-go recommendation
**NO-GO (for Sprint 9b completion)** — not because the build/sanity failed, but because:
- the preview environment is not accessible to run the required manual QA and runtime audit checks.

If preview access is fixed (or a different preview URL is provided that is accessible to testers), re-run:
- `/kort` runtime audit
- full manual QA checklist (`docs/manual-qa-checklist.md`)
- nearby smoke tests for København + Aarhus + Aalborg/Odense

## Rollback readiness status
- Legacy production snapshot + Python updater + `public.sheltersv2` remain untouched and are still the rollback net.

