# Import Flow

## Purpose
Track how the `app_v2` importer foundation is intended to receive official shelter data while the live product still reads from the current legacy/current public data structures.

## Current Boundary
- The live app runtime still uses the existing public data flow documented in `docs/audit-baseline.md`.
- `app_v2` is present as a new schema foundation and importer target, not as the active public read model.
- This repo includes the fixture importer and a Datafordeler adapter for dry-run live-source validation. Importer workflow, scheduled runs, Datafordeler writes, and public app cutover are later phases.
- The Python updater and current Supabase/RPC paths remain untouched until the TypeScript importer and `app_v2` data are proven.

## Importer Flow
1. Select a fixture snapshot from `src/lib/importer/fixtures/shelter-fixtures.ts`.
2. Normalize records through the shared importer contract in `src/lib/importer/types.ts`.
3. In `--dry-run` mode, validate uniqueness, source consistency, counters, warnings, and summary output without creating a Supabase client.
4. In non-dry-run mode, require an explicit `--write` flag before writing to `app_v2.import_runs`, `app_v2.municipalities`, `app_v2.shelters`, `app_v2.shelter_sources`, and `app_v2.audit_events`.

## CLI
Run the safe fixture validation path with:

```bash
npm run importer:fixture -- baseline --dry-run
```

Run bounded Datafordeler live-source validation with:

```bash
npm run importer:datafordeler -- --dry-run --max-pages 5
```

Datafordeler dry-run requires:
- `DATAFORDELER_API_KEY`
- optional `DATAFORDELER_BBR_GRAPHQL_URL`
- optional `DATAFORDELER_DAR_GRAPHQL_URL`
- optional `DATAFORDELER_PAGE_SIZE`
- optional `DATAFORDELER_REQUEST_TIMEOUT_MS`
- optional `DATAFORDELER_MUNICIPALITY_CODES`
- optional `DATAFORDELER_BBR_SHELTER_USAGE_CODES` or `DATAFORDELER_BBR_USAGE_CODES`
- optional `DATAFORDELER_DAR_ACTIVE_STATUSES`
- optional `DATAFORDELER_BITEMPORAL_TIMESTAMP`
- optional `DATAFORDELER_MUNICIPALITY_METADATA`

Non-dry-run fixture execution requires:
- `--write`
- `IMPORTER_WRITE_TARGET=app_v2_fixture`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- applied `app_v2` migrations
- Supabase API access to the `app_v2` schema

Controlled fixture write validation should be run only against a known non-production or otherwise intentionally selected `app_v2` target:

```bash
IMPORTER_WRITE_TARGET=app_v2_fixture npm run importer:fixture -- baseline --write
```

The CLI preflights the target and logs the Supabase URL host before creating the importer write client. It never logs `SUPABASE_SECRET_KEY`.

Datafordeler non-dry-run is intentionally blocked in this phase. The adapter is present for dry-run validation only.

`--resume-latest` is a database-backed operation and is intentionally rejected with `--dry-run`.

## Future Flow
The later write-enabled Datafordeler importer should keep the same normalized contract:
1. Fetch official source records.
2. Resolve stable canonical source identities.
3. Upsert importer-owned municipality and shelter baseline fields.
4. Upsert provenance rows in `shelter_sources`.
5. Mark missing records through lifecycle state after a guarded complete run.
6. Keep manual or editorial fields separate from importer-owned baseline data.

Legacy owner-request exclusions are also kept separate from importer-owned baseline data. The app_v2 foundation now has `app_v2.shelter_exclusions`, but this flow does not seed it, write it from the importer, or migrate legacy rows. Server-side app_v2 nearby diagnostics can read active app_v2 exclusions through `app_v2.get_nearby_shelters(...)`, but the live `/shelters/nearby` runtime still stays on legacy.

## Guardrails
- Do not mutate legacy `public` tables as part of `app_v2` importer work.
- Do not move public app reads to `app_v2` until data coverage and sparse-data UX are validated.
- Keep Datafordeler, scheduling, and workflow concerns out of the fixture foundation.
- Treat `app_v2` schema exposure as an operational prerequisite for later server/browser reads, not something this skeleton proves.
