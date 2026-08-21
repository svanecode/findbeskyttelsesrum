# Import Model

## Layers

1. Per-run quarantine:
   - `app_v2.import_runs`
   - `app_v2.import_shelter_candidates`
2. Current imported baseline:
   - `app_v2.municipalities`
   - `app_v2.shelters`
   - `app_v2.shelter_sources`
3. Publication history and rollback:
   - `app_v2.dataset_publications`
   - `app_v2.dataset_publication_shelters`
4. Manual and editorial state:
   - `app_v2.shelter_overrides`
   - `app_v2.shelter_exclusions`
   - `app_v2.audit_events`

## Importer ownership

The importer owns canonical identity, municipality link, source-backed name and address, coordinates, capacity, application code, source status, summary, import lifecycle timestamps, and provenance. It does not own featured ordering, municipality descriptions, publication withholding, manual overrides, exclusions, reports, or audit history.

The public read model applies active manual corrections and exclusions after the imported baseline. A later import therefore cannot erase a reviewed correction or republish an excluded registration.

## Lifecycle rules

- Candidate rows are private and never participate in public reads.
- Missing rows are marked only inside a successful complete publication transaction.
- Source rows are not hard-deleted when they disappear.
- A returning canonical source identity restores the same shelter row.
- Suspicious datasets are rejected before any public baseline mutation.
- Each successful publication captures the importer-owned baseline needed for rollback.
- Rollback creates a new ledger entry rather than rewriting history.

## Application-code eligibility

BBR `byg021BygningensAnvendelse` is stored as `source_application_code`. Public views treat missing codes as unknown and include only codes explicitly allowed by `app_v2.application_code_eligibility`.
