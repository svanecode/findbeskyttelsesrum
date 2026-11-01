# Data Schema

## Active boundary

The live application and importer use `app_v2`. Anonymous reads are limited to explicit public views and read-only RPC functions. Base tables, quarantine data, snapshots, moderation data, and audit data are private.

## Core tables

- `municipalities`: code-backed municipality identity and public metadata.
- `shelters`: stable canonical source rows and the current imported baseline.
- `shelter_slug_aliases`: private redirect history from the address-based URLs that existed before permanent route identities.
- `shelter_path_aliases`: private history of every readable detail path (`/beskyttelsesrum/ryesgade-18-8000-aarhus-c`) a registration has had, with `valid_from` and `valid_to` (null for today's path). Refreshed by `refresh_shelter_path_aliases_v1()` after each publication.
- `postal_areas`: private list of all Danish postcodes for the address search, with name, municipality codes, a position and `position_source` (`registrations` or `dar_address`). The public view `postal_area_public_v1` exposes rows that have a position.
- `shelter_sources`: official provenance and last verification.
- `import_runs`: checkpoints, explicit source-completion state, BBR/DAR mapping counters, failures, publication result, and quality metrics.
- `import_shelter_candidates`: private per-run quarantine, deleted after a terminal non-resumable result.
- `dataset_publications`: immutable publication ledger with one current version per source.
- `dataset_publication_shelters`: retained importer-owned snapshots for rollback.
- `shelter_overrides`: reviewed manual corrections applied at the public read boundary; active location-text overrides are currently blocked.
- `shelter_exclusions`: durable manual and migrated exclusions.
- `shelter_reports`: private public-feedback workflow.
- `privacy_contact_cases`: private mail-free contact cases, deadlines and access-key digests.
- `privacy_contact_messages`: private two-way case messages linked to a contact case.
- `moderator_accounts`: stable OAuth-subject allowlist and owner/moderator role.
- `audit_events`: append-only operational audit trail.
- `application_code_eligibility`: explicit BBR usage-code allowlist.
- `rate_limit_buckets`: short-lived HMAC-keyed API rate limits without raw client addresses.
- `product_metrics_hourly`: private hourly counters for a fixed event allowlist, without user or location fields.
- `operational_heartbeats`: private service-written production heartbeats, separated from untrusted browser metrics.
- `municipality_summary_public_v1`: small RLS-protected aggregate refreshed in the same transaction as public-data changes.
- `public_data_revisions`: private monotonic cache revision linked to the current dataset publication.

## Public reads

The app reads `shelter_public_v2`, `country_marker_public_v2`, `sitemap_shelter_public_v2`, `municipality_summary_public_v1`, the public statistics view, and bounded nearby/map RPCs. Public shelter rows must be active, published, capacity-eligible, application-code eligible, and not excluded. Active manual overrides take precedence at read time. Municipality and global public totals are served from the 98-row aggregate rather than rescanning all registrations on each request.

A detail page has two kinds of path. The stable path (`registrering-<uuid without hyphens>`) is built from the immutable shelter UUID and never changes. The readable path is built from address, postcode and city (`readable_shelter_base_slug_v1`, mirrored by `src/lib/shelter-public-url.ts`) and is the canonical URL, so it changes when BBR changes the address. When several public registrations share an address, the current owner of the plain path keeps it while it stays public; the others get a six-character id suffix. Stable paths, earlier readable paths (`resolve_shelter_path_alias_v1`) and older importer slugs (`shelter_slug_aliases`) redirect permanently to today's readable path, and only while the target still passes the public read boundary.

A registration removed from BBR (`missing_from_source`) answers 410 with its last known address through `resolve_retired_shelter_v1` and `retired_shelter_path_hashes_v1`. Both apply the same exclusions (`is_shelter_excluded_v1`) and active overrides as `shelter_public_v2`, so an excluded address never reappears there.

## Publication and operations functions

- `publish_datafordeler_import_v3`: service-role-only BBR/DAR mapping gate and atomic promotion.
- `publish_datafordeler_import_v2`: retired compatibility signature that always rejects direct publication.
- `copy_datafordeler_import_candidates_v1`: service-role-only safe resume helper.
- `get_latest_completed_datafordeler_import_v1` and `retry_completed_datafordeler_publication_v1(uuid)`: service-role-only selection and idempotent finalization of one fully staged source scan after a technical publication failure. The combined `retry_latest_completed_datafordeler_publication_v1` is retired.
- `get_import_operations_v1`: minimal MFA-protected operational overview.
- `rollback_dataset_publication_as_owner_v1`: service-role-only atomic restore with audit event, called by the MFA-checked admin server action with the owner's account id; it rechecks that the account is an active owner. `rollback_dataset_publication_v1` is a thin wrapper for the signed-in aal2 owner, still limited by the session timeout (8 seconds for `authenticated`); the app no longer calls it.
- `record_product_metric_v1`: service-only atomic increment of a privacy-safe hourly counter.
- `get_product_metrics_summary_v1`: service-only aggregate for the MFA-protected operations view.
- `get_product_metrics_health_v1`: service-only short-window aggregate for scheduled alerts.
- `record_operational_heartbeat_v1`: service-only trusted heartbeat writer.
- `get_operational_health_v1`: service-only semantic heartbeat status for `/api/health`.
- `redact_expired_personal_data_v1`: daily bounded-retention cleanup for reports, contact cases, audit, metrics, and heartbeats.
- `finalize_datafordeler_import`: retained as a denied legacy compatibility signature that always raises.

## Access boundary

`SUPABASE_SECRET_KEY` and `RATE_LIMIT_HASH_SECRET` are separate server-only values. Public clients use the publishable/anonymous key and explicit views. Contact forms call same-origin Next.js POST routes; browsers have no direct grants on contact tables or RPCs. The Next.js admin uses the signed-in user's Supabase session; every private RPC repeats authorization in the database.
