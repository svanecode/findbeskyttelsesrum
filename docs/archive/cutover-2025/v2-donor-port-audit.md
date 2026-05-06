# V2 Donor Port Audit

## 1. Overview

This audit compares the live repo `svanecode/findbeskyttelsesrum` with the donor repo at `../shelterv2`, whose Git remote is `https://github.com/svanecode/findbeskyttelsesrum-v2.git`.

The goal is a safe, selective port of importer and `app_v2`-relevant pieces from v2 into the live repo. V2 should be treated as a donor, not as a blueprint to replay wholesale. The live repo has already been modernized in small phases and still runs the current public product on legacy/current `public` structures such as `sheltersv2`, `kommunekoder`, `anvendelseskoder`, `get_nearby_shelters_v3`, and `/shelters/nearby`.

Key finding: v2 has a strong importer and `app_v2` foundation, but it also contains a full alternate product/app structure, admin flows, Tailwind 4, shadcn/Base UI dependencies, and migrations that first created or mutated `public` tables before later introducing `app_v2`. The safe path is to port only the importer/data foundation in stages and keep public runtime flows untouched until the imported `app_v2` data is proven.

## 2. Strong donor candidates from v2

### Importer contract and service

Strong candidates:

- `lib/importer/types.ts`
- `lib/importer/source-adapter.ts`
- `lib/importer/service.ts`
- `lib/importer/fixtures/shelter-fixtures.ts`
- `lib/importer/adapters/fixture-adapter.ts`
- `scripts/importer/run.ts`

Why they are good donors:

- They define an explicit normalized importer payload contract.
- They isolate source adapters from write behavior.
- The service writes to `app_v2`, not to legacy `public`.
- The fixture adapter gives a low-risk local verification path before touching Datafordeler.
- The service has important safety behavior: canonical source identity matching, import-run rows, lifecycle state, missing-transition guard, checkpoint/progress writes, transient write retries, and narrow audit events.

Porting note:

- In v2 these files live at repo-root `lib/*` and use `@/*` mapped to repo root.
- In live, `@/*` maps to `./src/*`, so the clean live target should be `src/lib/importer/**` and `scripts/importer/run.ts` should import from `@/lib/importer/...`.

### Datafordeler adapter and client

Strong candidates:

- `lib/importer/clients/datafordeler.ts`
- `lib/importer/adapters/datafordeler-official-adapter.ts`

Why they are valuable:

- They implement the real official-source adapter with BBR and DAR GraphQL.
- They include bounded retries for timeout, `429`, `5xx`, transient non-JSON upstream responses, and useful diagnostics.
- They encode the current official-source assumption: BBR `status = 6` plus positive `byg069Sikringsrumpladser`.
- They enrich addresses through DAR `Husnummer`, `NavngivenVej`, and `Postnummer`.
- They hard-cap DAR relation-id batches at `100`, which the v2 docs call out as correctness-critical.
- They convert BBR `byg404Koordinat.wkt` from EPSG:25832 to WGS84 via `proj4`.

Porting note:

- This path requires adding `proj4`.
- It requires Datafordeler env vars and operational docs before any real run.
- It should come after fixture importer and `app_v2` schema are already validated.

### Municipality metadata

Strong candidate:

- `lib/municipalities/metadata.ts`

Why it is valuable:

- Provides a bundled Denmark-wide municipality map keyed by BBR municipality code.
- Helps importer writes converge fallback municipality rows to canonical slug/name values.
- Helps runtime reads tolerate legacy fallback municipality slugs like `kommune-0175`.

Porting note:

- Live already has `src/lib/kommunekoder.ts` for current public table data. The v2 metadata module should not replace that in the first port.
- Target path should likely be `src/lib/municipalities/metadata.ts`, leaving `src/lib/kommunekoder.ts` intact for current public flows.

### App v2 Supabase access layer

Candidate files:

- `lib/supabase/app-v2.ts`
- `lib/supabase/admin.ts`
- `lib/supabase/env.ts`

Why they are useful:

- They make `app_v2` schema targeting explicit through `client.schema("app_v2")`.
- They separate public Supabase env from server-only write env.
- The importer service depends on `createAppV2AdminClient()`.

Porting note:

- Do not blindly port the full v2 `lib/supabase/client.ts` and `lib/supabase/server.ts` in the first importer PR unless needed. Live already has `src/lib/supabase.ts` for current public flows.
- A smaller live helper can provide only `createAppV2AdminClient` and `withAppV2Schema` first, using live env conventions plus `SUPABASE_SECRET_KEY`.

### Docs/data

Strong candidates:

- `docs/data/import-flow.md`
- `docs/data/import-contract.md`
- `docs/data/import-model.md`
- `docs/data/field-ownership.md`
- `docs/data/importer-implementation.md`
- `docs/data/schema.md`

Why they are valuable:

- They capture the importer and `app_v2` operating model better than code alone.
- They document field ownership, missing-record safety, Datafordeler env vars, workflow behavior, and known live-source limits.

Porting note:

- These should be ported selectively, with short live-repo notes where v2 references admin/product routes not yet in scope.

### App v2 migrations

Strong candidates, with caveats:

- `supabase/migrations/202603151830_app_v2_foundation.sql`
- `supabase/migrations/202603151845_app_v2_security_tightening.sql`
- `supabase/migrations/202603161130_app_v2_import_run_resilience.sql`
- `supabase/migrations/202603170930_app_v2_municipality_code_anchor.sql`

Why they are useful:

- They define the `app_v2` schema boundary.
- They create the tables the importer expects: `municipalities`, `shelters`, `shelter_sources`, `shelter_overrides`, `shelter_reports`, `import_runs`, and `audit_events`.
- They enable RLS and grant public read only on public read tables.
- They add import-run checkpoint fields and municipality code anchoring.

Porting note:

- These should be ported as new live migrations, not copied with old timestamps if that conflicts with live migration history.
- They should be reviewed against live Supabase exposed schemas. V2 docs explicitly note that `app_v2` must be exposed in Supabase API schemas for browser/server PostgREST access.

## 3. Areas that require selective porting

### Supabase access

V2 has a fuller Supabase layer:

- browser client via `@supabase/ssr`
- server client via cookies
- admin/write client via `SUPABASE_SECRET_KEY`
- app_v2 schema wrappers
- large public query layer in `lib/supabase/queries.ts`

Live currently has a simpler shared `src/lib/supabase.ts` using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus current helpers for public schema/RPC flows.

Recommendation:

- First port only the minimal app_v2 admin/write layer required by the importer.
- Do not replace live `src/lib/supabase.ts`.
- Do not move public app reads to `app_v2` in the first donor-port PR.

### `lib/supabase/queries.ts`

V2's query layer is useful as a later donor for public `app_v2` reads, but it is too broad for the importer-first PR.

Why selective:

- It encodes v2 product routes and public result shapes.
- It assumes `app_v2` tables are present and populated.
- It includes override precedence, municipality canonicalization, search, detail, reporting, admin support, and fallback public copy.
- Live still serves the active `/shelters/nearby` flow from legacy/current `public` structures.

Recommendation:

- Defer until after `app_v2` has schema, fixture importer, and at least a small verified dataset.

### GitHub Actions workflow

V2 workflow:

- `.github/workflows/datafordeler-importer.yml`
- scheduled daily at `01:15 UTC`
- `workflow_dispatch` inputs for `dry_run`, `max_pages`, and `resume_latest`
- `concurrency: datafordeler-importer`
- secrets for Supabase write access and Datafordeler
- summary output through `IMPORTER_SUMMARY_PATH`

Why selective:

- Live currently has no `.github` workflows.
- Enabling schedule before schema, secrets, app_v2 API exposure, and dry-run validation would be premature.

Recommendation:

- Port the workflow only after local fixture and capped Datafordeler dry-run are proven in live.
- Start with `workflow_dispatch` only or keep the schedule disabled/commented if the first workflow PR lands before full operational readiness.

### Docs and prompts

V2 docs are strong, but some refer to v2-only product/admin surfaces:

- admin routes
- override pages
- public reporting
- v2 search/detail product pages
- Tailwind 4/shadcn project shape

Recommendation:

- Port `docs/data/*` first.
- Avoid porting `docs/product/*`, full architecture docs, and admin-oriented prompt rules until live actually adopts those areas.

## 4. Areas that should not be copied directly

### Full v2 app routes and feature modules

Do not copy directly:

- `app/**`
- `features/**`
- `components/ui/**`
- `components/shared/**`
- admin routes and auth/moderation modules

Reason:

- The live product has a different active flow: `/` -> DAWA/geolocation -> `/shelters/nearby`.
- V2 has a broader product surface with `/find`, shelter detail pages, admin login, admin overrides, reporting, and different UI primitives.
- Copying these would be a product rewrite, not a donor importer port.

### Tailwind 4 and UI dependency stack

Do not copy directly:

- Tailwind 4 config/dependencies
- shadcn/Base UI stack
- `tw-animate-css`
- broad UI primitive layer

Reason:

- Live intentionally kept Tailwind 4 separate from framework stabilization.
- Donor importer work does not require UI dependency churn.

### Public-schema v2 migrations

Do not copy directly:

- `202603132210_initial_schema.sql`
- `202603132355_shelter_report_types.sql`
- `202603140015_shelter_report_statuses.sql`
- `202603141130_shelter_manual_overrides.sql`
- `202603141210_shelter_override_field_scope.sql`
- `202603151030_import_model_foundation.sql`

Reason:

- These create or mutate `public.municipalities`, `public.shelters`, `public.shelter_sources`, `public.shelter_reports`, and `public.shelter_status_overrides`.
- Live already has a different `public`/legacy model around `sheltersv2`, `kommunekoder`, `anvendelseskoder`, and RPC functions.
- The stated direction is `app_v2` as the target datalayer, not reshaping live legacy `public` tables.

### Full v2 `package.json`

Do not copy directly.

Reason:

- V2 includes Next `16.1.6`, Tailwind 4, shadcn, Base UI, lucide, npm as a dependency, and UI packages irrelevant to importer porting.
- Live already has a stabilized Next 16 / React 19 baseline.

### V2 `next.config.ts`, ESLint, and Tailwind/PostCSS configs

Do not copy directly.

Reason:

- V2 `next.config.ts` is basically empty.
- Live has important headers/CSP/build-id behavior in `next.config.js`.
- Tailwind/PostCSS differ because v2 is Tailwind 4 and live remains Tailwind 3.

## 5. Structural differences between live and v2

### Path alias difference

Live:

- `@/*` maps to `./src/*`
- app code lives under `src/app`, `src/lib`, `src/components`

V2:

- `@/*` maps to repo root
- app code lives under root `app`, `lib`, `features`, `components`

Porting implication:

- V2 `lib/importer/**` should become live `src/lib/importer/**`.
- V2 `lib/municipalities/metadata.ts` should become live `src/lib/municipalities/metadata.ts`.
- V2 `lib/supabase/app-v2.ts` style helpers should become live `src/lib/supabase/app-v2.ts` or another clearly scoped `src/lib/app-v2-supabase.ts`.
- V2 `scripts/importer/run.ts` can stay under live `scripts/importer/run.ts`, but imports must resolve against live `@/lib/...`.

### App structure difference

Live:

- current product app under `src/app`
- primary active flow is `/shelters/nearby`
- current map/search are Leaflet + vendored DAWA script + Supabase RPC

V2:

- route files are thin and delegate to `features/*`
- search lives under `/find`
- public reads target `app_v2`
- admin/reporting/override features are present

Porting implication:

- Importer port is structurally easy.
- Public app port is not easy and should be separate.

### Existing live related modules

Live already has:

- `src/lib/supabase.ts`
- `src/lib/kommunekoder.ts`
- `src/lib/anvendelseskoder.ts`
- `src/types/shelter.ts`
- current Supabase migrations for `sheltersv2`, `excluded_shelters`, and RPCs
- cache/header diagnostic scripts

Potential conflicts:

- `src/lib/supabase.ts` should not be replaced by v2 Supabase modules.
- `src/lib/kommunekoder.ts` should not be replaced by v2 municipality metadata in the first PR.
- `supabase/migrations/000_all_migrations_combined.sql` means migration history is already unconventional; app_v2 migrations should be added cleanly and not merged into the combined legacy file unless explicitly required by the repo's migration policy.

### Workflow difference

Live has no `.github` workflows in this checkout. V2 has an importer workflow. This makes workflow porting straightforward structurally, but risky operationally unless secrets and schema readiness are already confirmed.

## 6. Dependency implications

Likely needed for the first importer port:

- `tsx` as a dev dependency, because v2 importer scripts run through `tsx`.
- `proj4` as a runtime dependency, but only when porting `DatafordelerOfficialSourceAdapter`.

Possibly not needed in the first PR:

- `@supabase/ssr` upgrade. Live already has `@supabase/ssr`, but the first importer write path can use `@supabase/supabase-js` directly.
- `@supabase/supabase-js` upgrade. V2 uses `^2.99.1`; live currently has `^2.39.0` in `package.json` and an installed newer lockfile state from previous work. The app_v2 schema methods should be verified against live's installed client before deciding on a Supabase upgrade.

Do not add for importer port:

- `@base-ui/react`
- `shadcn`
- `lucide-react`
- `tailwind-merge`
- `tw-animate-css`
- Tailwind 4 packages
- `run`
- `npm` as an app dependency

Environment variables introduced by importer port:

- required for real importer:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SECRET_KEY`
  - `DATAFORDELER_API_KEY`
- recommended/optional:
  - `DATAFORDELER_BBR_GRAPHQL_URL`
  - `DATAFORDELER_DAR_GRAPHQL_URL`
  - `DATAFORDELER_REQUEST_TIMEOUT_MS`
  - `DATAFORDELER_PAGE_SIZE`
  - `DATAFORDELER_DAR_ACTIVE_STATUSES`
  - `DATAFORDELER_MUNICIPALITY_CODES`
  - `DATAFORDELER_MUNICIPALITY_METADATA`
  - `DATAFORDELER_BBR_SHELTER_USAGE_CODES`
  - `DATAFORDELER_BBR_USAGE_CODES`
  - `DATAFORDELER_BITEMPORAL_TIMESTAMP`
  - `IMPORTER_SUMMARY_PATH`

## 7. Migration implications

### Live migration state

Live currently has migrations for:

- `excluded_shelters`
- PostGIS index on `sheltersv2.location`
- `get_nearby_shelters_v3`
- exclusion helper functions
- `get_total_shelter_capacity`

These support the current public product and should remain untouched during importer porting.

### App v2 migration path

Recommended migration subset from v2:

1. `app_v2` schema foundation.
2. `app_v2.set_updated_at` security tightening.
3. import-run resilience columns/indexes.
4. municipality `code` anchor.

Important review points before applying in live:

- Confirm `pgcrypto` or `gen_random_uuid()` availability in live. V2 initial public migration created `pgcrypto`; the `app_v2` foundation assumes `gen_random_uuid()` exists.
- Confirm Supabase API exposed schemas include or will include `app_v2` before browser/server PostgREST reads are expected to work.
- Confirm RLS policies match live's desired public exposure. V2 allows public reads for active shelters, municipalities, and shelter sources only.
- Confirm service-role write path is available through `SUPABASE_SECRET_KEY`.
- Decide whether `app_v2.shelter_reports`, `shelter_overrides`, and admin-related tables should be included in the foundation now even if public/admin flows are not ported yet. Including them matches the v2 importer service expectations and field-ownership docs, but it expands schema surface.

### Migrations not to apply

Do not apply v2 migrations that create or reshape `public.*` v2 tables. They conflict conceptually with live's existing legacy/current public data model and are not needed for an importer targeting `app_v2`.

## 8. Recommended first donor-port PR

The first real donor-port PR should be schema-first and fixture-importer-first. It should avoid live product flow changes.

Recommended contents:

1. Add `app_v2` migrations only.
   - Port the `app_v2` foundation/resilience/code-anchor migrations as new live migrations.
   - Do not port public-schema v2 migrations.

2. Add minimal app_v2 Supabase admin helper.
   - Add a server-only write client using `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
   - Add explicit `app_v2` schema targeting.
   - Do not replace live `src/lib/supabase.ts`.

3. Add importer core and fixture path.
   - `src/lib/importer/types.ts`
   - `src/lib/importer/source-adapter.ts`
   - `src/lib/importer/service.ts`
   - `src/lib/importer/fixtures/shelter-fixtures.ts`
   - `src/lib/importer/adapters/fixture-adapter.ts`
   - `scripts/importer/run.ts`

4. Add only the scripts/dependencies required for fixture importer execution.
   - Add `tsx`.
   - Add `importer:fixture`.
   - Do not add `proj4` or Datafordeler dependencies until the Datafordeler adapter is ported.

5. Add relevant docs/data files.
   - Port or adapt `docs/data/import-flow.md`, `docs/data/import-contract.md`, and `docs/data/field-ownership.md`.
   - Keep notes clear that live public runtime still uses current legacy/current flow.

First PR should explicitly not include:

- Datafordeler real adapter.
- GitHub Actions schedule.
- public route changes.
- `/find` route or v2 feature modules.
- admin/auth/reporting UI.
- Tailwind 4 or shadcn/UI dependencies.
- Supabase app read migration to `app_v2`.
- any changes to `/shelters/nearby`, DAWA, or current RPC queries.

Recommended second donor-port PR:

- Add `proj4`.
- Port `src/lib/municipalities/metadata.ts`.
- Port `src/lib/importer/clients/datafordeler.ts`.
- Port `src/lib/importer/adapters/datafordeler-official-adapter.ts`.
- Add `importer:datafordeler`.
- Validate `--dry-run --max-pages 1` before any write run.

Recommended later PR:

- Add GitHub Actions workflow with `workflow_dispatch` first.
- Enable schedule only after at least one full or intentionally bounded real run is understood and secrets are configured.

## 9. Risks to watch during the port

- Path alias mismatch: v2 `@/*` means repo root; live `@/*` means `src/*`.
- Schema exposure: `app_v2` must be exposed in Supabase API schemas before browser/server reads can rely on it.
- Secret handling: importer writes need server-only `SUPABASE_SECRET_KEY`; do not expose this to client code.
- Migration drift: v2's early migrations mutate `public`; live should not replay those.
- Dependency creep: Datafordeler needs `proj4` and CLI needs `tsx`, but v2's UI stack should not come along.
- Runtime coupling: live public flows must remain on current data/RPC until app_v2 data is imported and validated.
- Missing-transition safety: do not enable missing/deactivation transitions until fixture behavior and a bounded real run are validated.
- Datafordeler reliability: keep retry, non-JSON diagnostics, DAR batch cap, `--max-pages`, and dry-run controls intact.
- Long-run contention: real importer runs should not overlap. If workflow is ported later, keep the v2 concurrency model.
- Municipality convergence: the code-anchor migration and metadata map should be kept together; otherwise canonical/fallback municipality rows can diverge.
- Sparse data UX: public app migration to app_v2 should happen later and must handle empty/partial imported records honestly.
- Current live worktree has prior modernization changes pending; donor-port PR planning should isolate future changes carefully to avoid mixing unrelated cleanup with importer/schema work.
