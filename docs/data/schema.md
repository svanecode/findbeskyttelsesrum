# Data Schema

## Current Boundary
The current public app still reads the existing live structures in `public`. The new `app_v2` schema is a foundation for importer and later read-model work.

## App V2 Tables
- `app_v2.municipalities`
  - canonical municipality records
  - code-backed identity for importer convergence
- `app_v2.shelters`
  - imported shelter baseline
  - lifecycle fields for active, missing, or suppressed records
- `app_v2.shelter_sources`
  - source provenance and freshness
- `app_v2.import_runs`
  - importer run bookkeeping, checkpoints, and failure summaries
- `app_v2.shelter_overrides`
  - future manual corrections, separate from imported baseline
- `app_v2.shelter_exclusions`
  - manual or migrated owner-request exclusions for future public read models
  - preserves legacy exclusion identities without overloading importer-owned lifecycle state
- `app_v2.shelter_reports`
  - future operational feedback surface
- `app_v2.audit_events`
  - append-only operational audit trail

## App V2 Read Functions
- `app_v2.get_nearby_shelters(...)`
  - first database-side nearby read foundation for app_v2
  - returns a JSON payload with app_v2-native shelter rows and diagnostics
  - uses bounding-box prefiltering plus database-side Haversine distance ordering
  - applies active app_v2 shelter exclusions for `shelter_id`, canonical source identity, and exact app_v2 address/postal matches
  - does not return the legacy grouped nearby shape and does not read `public.excluded_shelters`

## Migration Set
The live repo now carries these `app_v2` migrations:
- `006_app_v2_foundation.sql`
- `007_app_v2_security_tightening.sql`
- `008_app_v2_import_run_resilience.sql`
- `009_app_v2_municipality_code_anchor.sql`
- `010_app_v2_shelter_exclusions.sql`
- `011_app_v2_nearby_read_rpc.sql`

These migrations do not reshape legacy `public` tables.

## Access Boundary
- Importer writes use `createAppV2AdminClient()` from `src/lib/supabase/app-v2.ts`.
- The helper explicitly targets the `app_v2` schema through Supabase's schema API.
- Server-side public read helpers and routes for selected `app_v2` surfaces now exist. Browser code must not import service-role app_v2 helpers directly.
- `SUPABASE_SECRET_KEY` is server-only and must not be exposed to client code.

## Operational Notes
- `pgcrypto` is created in the foundation migration because the schema uses `gen_random_uuid()`.
- Supabase API schema exposure for `app_v2` must be confirmed before later public reads or non-SQL PostgREST access are expected to work.
- Public read policies exist for active shelter-related reads, but the live app does not rely on them yet.
- `app_v2.shelter_exclusions` has RLS enabled and no public read policy in this foundation phase. It is intended for service-role migration, parity scripts, and future server-side read-model work, not direct browser access.
- `app_v2.get_nearby_shelters(...)` is granted to `service_role` in this foundation phase. It is intended for server-side helpers and diagnostics, not direct browser use.
