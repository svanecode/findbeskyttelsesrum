# Import Flow

## Active production flow

The authoritative importer lives in `tools/datafordeler-importer` and runs every day from `.github/workflows/datafordeler-import.yml`. It reads BBR buildings and enriches them with DAR addresses. The public application reads the resulting `app_v2` public views.

## Safe publication sequence

1. Create an `app_v2.import_runs` lifecycle row with `publication_status = staging`.
2. Fetch a stable Datafordeler snapshot page by page.
3. Upsert normalized rows into the private `app_v2.import_shelter_candidates` table.
4. Persist the cursor and counters only after each complete staging batch succeeds.
5. For a complete uncapped traversal, call `app_v2.publish_datafordeler_import_v2(...)`.
6. In one database transaction, the publication function:
   - serializes publication with an advisory transaction lock;
   - verifies unique row counts and source counters;
   - compares record count, total capacity, coordinate coverage, and municipality coverage with the current known-good publication;
   - rejects suspicious data without touching `app_v2.shelters`;
   - otherwise promotes the complete candidate set, reconciles missing rows, records provenance, creates a retained snapshot, and advances the publication ledger.
7. Delete staging rows after publication, rejection, or an intentionally capped run.
8. Run public read-model, parity, and production smoke checks.

Failed and interrupted runs never change the public shelter baseline. Failed staging rows are retained temporarily so `--resume-latest` can copy the checkpointed candidate set into a continuation run. A completed continuation is safe to publish because the database validates the accumulated staging set as a whole.

Failed staging sets expire after 14 days and are pruned when a new run starts, keeping storage bounded on the free database plan.

## Quality gates

A publication is rejected when any of these conditions fail:

- staged unique rows must equal the importer's source counter;
- at least 500 rows and at least 80% of the current record count;
- at least 80% of the current total capacity;
- at least 35% coordinate coverage and no drop above five percentage points;
- at least 80% of the current municipality coverage.

The rejected run, metrics, and Danish rejection reasons remain available in the private `/admin/drift` view. The current publication remains unchanged.

## Rollback

The three latest snapshots are retained in `app_v2.dataset_publication_shelters`. An allowlisted owner with MFA can restore a retained version from `/admin/drift`. The restore is atomic, rechecks owner authorization in the database, preserves editorial overrides and exclusions, creates a new publication entry, and writes an audit event.

## CLI

From `tools/datafordeler-importer`:

```bash
uv run python sync_shelters_graphql.py --dry-run --max-pages 1 --summary import-summary.json
uv run python sync_shelters_graphql.py --write --summary import-summary.json
uv run python sync_shelters_graphql.py --write --resume-latest --summary import-summary.json
```

Write mode requires `DATAFORDELER_API_KEY`, `SUPABASE_URL`, and the server-only `SUPABASE_SECRET_KEY`. A privileged key must never use a `NEXT_PUBLIC_*` name.

## Free operations

The flow uses the existing Supabase database and GitHub Actions only. A failed scheduled run opens or updates a GitHub issue labelled `data-import-alert`; the next successful scheduled publication closes it automatically.
