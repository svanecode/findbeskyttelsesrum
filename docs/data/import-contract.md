# Import Contract

## Purpose
Define the normalized record contract that importer adapters must produce before records can be written to `app_v2`.

## Current Implementation
- `src/lib/importer/types.ts` defines the normalized shelter record and run summary.
- `src/lib/importer/source-adapter.ts` defines the adapter boundary.
- `src/lib/importer/adapters/fixture-adapter.ts` provides local fixture validation.
- `src/lib/importer/adapters/datafordeler-official-adapter.ts` provides bounded live-source dry-run validation through BBR and DAR.
- Datafordeler writes, scheduling, and workflow automation are intentionally not enabled yet.

## Source Assumptions
- DAWA remains only a public address search/geocoding aid for the current product.
- DAWA is not the shelter baseline source of truth.
- Future official-source adapters must map source data into the same normalized contract used by the fixture adapter.

## Required Normalized Record Shape
Each imported shelter record must provide:
- stable source identity:
  - `sourceName`
  - `sourceType`
  - `sourceReference`
  - `canonicalSourceName`
  - `canonicalSourceReference`
- municipality identity:
  - `code`
  - `slug`
  - `name`
  - optional `regionName`
- shelter baseline:
  - `slug`
  - `name`
  - `addressLine1`
  - `postalCode`
  - `city`
  - optional `latitude`
  - optional `longitude`
  - `capacity`
  - `status`
  - optional `accessibilityNotes`
  - `summary`
- lifecycle:
  - `importState`

## Importer Responsibilities
- Reject duplicate canonical source identities within one run.
- Keep adapter source labels consistent with record source labels.
- Write only importer-owned baseline fields.
- Keep manual overrides, editorial fields, and live product routing out of importer writes.
- Leave `source_summary` on its schema default until the later public trust-copy model is decided.
- Preserve source provenance in `app_v2.shelter_sources`.
- Record import-run state clearly enough to diagnose failed or partial runs.
- Require explicit fixture write confirmation before any non-dry-run fixture write.

## Explicitly Deferred
- Datafordeler non-dry-run writes.
- GitHub Actions importer scheduling.
- Public app reads from `app_v2`.
- Admin UI, reporting flows, or override editing.
