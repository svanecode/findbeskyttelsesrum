# Import Model

## Goal
Establish the importer-side model for the future `app_v2` data layer without changing the current live app data source.

## Layers
1. Official imported baseline:
   - `app_v2.municipalities`
   - `app_v2.shelters`
   - `app_v2.shelter_sources`
   - `app_v2.import_runs`
2. Manual corrections and operational state:
   - `app_v2.shelter_overrides`
   - `app_v2.audit_events`
3. Future effective public read model:
   - not active in the live app yet
   - should apply override-first precedence later

## Importer-Owned Fields
The importer may write:
- canonical shelter slug
- municipality link
- official name and address fields
- coordinates
- capacity
- status
- accessibility notes when source-backed
- summary when source-backed
- import lifecycle fields
- canonical source identity
- source provenance rows
- not `source_summary`; that field stays on its database default until a later trust-copy/read-model decision

## Importer Must Not Own
- featured/curated ordering
- municipality editorial descriptions
- manual override rows
- public route cutover decisions
- current legacy/public tables

## Missing and Restore Rules
The future official importer should not hard-delete shelters when a source record disappears.

Expected behavior:
- mark records as `missing_from_source` only after a complete, non-resumed, adequately covered run
- keep source history and audit history
- restore the same shelter row when the canonical official identity reappears

## Current Skeleton
The fixture importer proves the contract, dry-run summary, source identity validation, and `app_v2` write surface. The Datafordeler adapter can validate a bounded live-source read/normalize path in dry-run mode. Neither path proves production scheduling, broad write safety, or public runtime cutover yet.
