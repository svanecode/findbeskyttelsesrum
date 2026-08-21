# Data Schema

## Active boundary

The live application and importer use `app_v2`. Anonymous reads are limited to explicit public views and read-only RPC functions. Base tables, quarantine data, snapshots, moderation data, and audit data are private.

## Core tables

- `municipalities`: code-backed municipality identity and public metadata.
- `shelters`: stable canonical source rows and the current imported baseline.
- `shelter_sources`: official provenance and last verification.
- `import_runs`: checkpoints, BBR/DAR mapping counters, failures, publication result, and quality metrics.
- `import_shelter_candidates`: private per-run quarantine, deleted after a terminal non-resumable result.
- `dataset_publications`: immutable publication ledger with one current version per source.
- `dataset_publication_shelters`: retained importer-owned snapshots for rollback.
- `shelter_overrides`: reviewed manual corrections applied at the public read boundary; active location-text overrides are currently blocked.
- `shelter_exclusions`: durable manual and migrated exclusions.
- `shelter_reports`: private public-feedback workflow.
- `moderator_accounts`: stable OAuth-subject allowlist and owner/moderator role.
- `audit_events`: append-only operational audit trail.
- `application_code_eligibility`: explicit BBR usage-code allowlist.
- `rate_limit_buckets`: short-lived HMAC-keyed API rate limits without raw client addresses.
- `product_metrics_hourly`: private hourly counters for a fixed event allowlist, without user or location fields.

## Public reads

The app reads `shelter_public_v2`, `country_marker_public_v2`, `sitemap_shelter_public_v2`, `municipality_public_v2`, the public statistics view, and the bounded nearby RPC. Public shelter rows must be active, published, capacity-eligible, application-code eligible, and not excluded. Active manual overrides take precedence at read time.

## Publication and operations functions

- `publish_datafordeler_import_v3`: service-role-only BBR/DAR mapping gate and atomic promotion.
- `publish_datafordeler_import_v2`: retired compatibility signature that always rejects direct publication.
- `copy_datafordeler_import_candidates_v1`: service-role-only safe resume helper.
- `get_import_operations_v1`: minimal MFA-protected operational overview.
- `rollback_dataset_publication_v1`: MFA owner-only atomic restore with audit event.
- `record_product_metric_v1`: service-only atomic increment of a privacy-safe hourly counter.
- `get_product_metrics_summary_v1`: service-only aggregate for the MFA-protected operations view.
- `get_product_metrics_health_v1`: service-only short-window aggregate for scheduled alerts.
- `finalize_datafordeler_import`: retained as a denied legacy compatibility signature that always raises.

## Access boundary

`SUPABASE_SECRET_KEY` is server-only. Public clients use the publishable/anonymous key and explicit views. The Next.js admin uses the signed-in user's Supabase session; every private RPC repeats authorization in the database.
