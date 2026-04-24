# Cutover Runbook: modern repo and app_v2 production switch

## Current production reality
- The current live public site still runs from an old Vercel snapshot.
- The old live site reads from `public.sheltersv2`.
- `public.sheltersv2` is filled by the legacy Python updater running daily.
- That legacy setup remains the rollback net until Andreas explicitly decides otherwise.

## Purpose
This runbook prepares and describes a **future** cutover that switches the public deployment from the old snapshot / legacy data path to the modern repo build and the current `app_v2` data path.

## Explicit non-goals
- This document does **not** perform cutover.
- It does **not** disable the legacy Python updater.
- It does **not** mutate `public.sheltersv2`.
- It does **not** delete legacy data.
- It does **not** change the `app_v2` schema.
- It does **not** change product behavior or routing.

## Roles and ownership
- **Andreas**: product owner and go/no-go owner.
- **Cursor/Claude**: prepares code, docs, scripts, and checklists.
- **Operator**: performs Vercel/Supabase environment and deployment actions.
- **Safety rule**: nobody disables the rollback path (old snapshot + Python updater + `public.sheltersv2`) without explicit Andreas approval.

## Pre-cutover prerequisites (must be true before a cutover window)
- [ ] Latest `main` is pushed and the cutover candidate commit is identified.
- [ ] Preview deployment for the cutover candidate is green.
- [ ] `npm run build` passes on the cutover candidate.
- [ ] `npm run read:app-v2-sanity` has been run against the **target environment** (preview/staging with prod-like env).
- [ ] `/kort` first-load audit has been run against preview:

```bash
AUDIT_BASE_URL=https://<preview-url> node scripts/first-load-audit.mjs
```

- [ ] Manual QA checklist completed against preview (`docs/manual-qa-checklist.md`) and logged.
- [ ] No public UI contains internal wording: `app_v2`, `cutover`, `datalag`, or internal debug wording.
- [ ] `/kort` marker data loads separately via `/api/country-shelters` (not embedded in initial HTML).
- [ ] Legacy production remains available as rollback.
- [ ] Python updater remains enabled during the observation window after cutover.

## Go/no-go checklist (record observed values)

**Observed values (record, do not guess):**
- [ ] Active shelter registrations: ________
- [ ] Total registered capacity: ________
- [ ] Municipality count: ________
- [ ] Active municipality count: ________
- [ ] Shelters with coordinates: ________
- [ ] Country marker count: ________
- [ ] Latest import run status/time: ________
- [ ] `/kort` first-load audit: PASS / FAIL (attach output)
- [ ] Nearby smoke tests (3 locations): PASS / FAIL (notes below)

**Anchor numbers for comparison only (warning, not pass/fail):**
- Total capacity has historically been around **3,417,530**
- Marker/shelter count has recently been around **23,694**

If observed values deviate materially from recent anchors, **investigate before go/no-go**. Do not cut over on unclear data.

## Manual smoke tests (preview and then production)

Run these on preview **before** any cutover, and repeat immediately **after** cutover on production.

- [ ] `/` homepage renders and primary navigation works
- [ ] `/shelters/nearby` works for at least 3 locations:
  - [ ] København (`lat=55.6761&lng=12.5683`)
  - [ ] Aarhus (`lat=56.1629&lng=10.2039`)
  - [ ] Aalborg (`lat=57.0488&lng=9.9217`) or Odense (`lat=55.4038&lng=10.4024`)
- [ ] `/kort` renders and map loads markers
- [ ] One shelter detail page (`/beskyttelsesrum/[slug]`) renders
- [ ] One municipality page (`/kommune/[slug]`) renders
- [ ] `/land` renders
- [ ] `/kommune` renders
- [ ] `/om-data` renders
- [ ] `/sitemap.xml` returns valid XML and includes `/land`, at least one `/kommune/`, at least one `/beskyttelsesrum/`
- [ ] `/robots.txt` returns and references sitemap
- [ ] Mobile viewport smoke test: homepage + nearby + `/kort` are usable (no critical layout break)

Do not require `?source=legacy` or experiment/debug flags as part of the main smoke path.

## Cutover procedure (future, operator steps)
1. Confirm the **preview deployment URL** for the cutover candidate commit.
2. Run automated checks on preview:
   - `npm run build`
   - `npm run read:app-v2-sanity` (target env)
   - `AUDIT_BASE_URL=<preview-url> node scripts/first-load-audit.mjs`
3. Run manual QA on preview and log it (`docs/manual-qa-checklist.md`).
4. Record observed sanity numbers (see Go/no-go checklist).
5. Andreas decides **go/no-go**.
6. If **go**: promote/switch production deployment in Vercel according to the current Vercel setup.
   - Use the Vercel dashboard or the team’s established Vercel workflow.
   - Do not invent new deployment steps on the cutover day.
7. Verify production immediately (repeat the smoke tests above).
8. Keep the old legacy setup and the Python updater running during the observation window.
9. Start the observation window and capture notes (what looked good / what needs attention).

## Rollback procedure (safety-first)

### Trigger conditions (examples)
- Homepage unavailable or returning 5xx
- Nearby search broken (no results due to error, crash, or unusable UI)
- `/kort` fails to load markers or is unusably slow
- Obvious data sanity failure (e.g. zero shelters/capacity)
- Critical mobile usability regression

### Immediate action
1. Re-point production to the previous known-good legacy deployment/snapshot.
2. Leave the Python updater and `public.sheltersv2` untouched.
3. Verify old production loads (`/`, `/shelters/nearby`, and one detail page).
4. Record incident notes: symptom, start time, rollback time, suspected cause, and next steps.

## Observation window
- Keep the legacy Python updater running for an agreed observation window after cutover (e.g. days, not hours).
- Monitor key pages manually (and via existing platform dashboards if available).
- Do not disable the legacy updater or mutate rollback data until stable operation is confirmed and Andreas explicitly approves.

## Post-cutover cleanup candidates (future, not part of this sprint)
- Disable the legacy Python updater (only after proven stability and explicit approval).
- Archive or clearly mark legacy docs/scripts as historical.
- Decide what to do with `public.sheltersv2` long-term.
- Add monitoring/alerting (only if product decides to).

