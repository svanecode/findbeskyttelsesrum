# Field Ownership

## Purpose
Define which future `app_v2` fields belong to the importer, manual operations, or read-time derivation.

## Ownership Types
- `official import owned`: written by the importer from approved official sources.
- `admin override owned`: stored separately and applied later by read logic.
- `admin-only enrichment`: editorial or operational data with no official source equivalent.
- `derived/effective`: computed by read logic from baseline, source, or override rows.
- `internal operational`: ids, timestamps, audit, routing, or importer bookkeeping.

## Shelter Fields
| Field | Owner | Importer may write | Notes |
| --- | --- | --- | --- |
| `id` | internal operational | no | Stable database identity. |
| `slug` | internal operational | yes | Generated from normalized source data. |
| `municipality_id` | official import owned | yes | Resolved from municipality code/metadata. |
| `name` | admin override owned | yes | Baseline can later be overridden. |
| `address_line1` | admin override owned | yes | Baseline can later be overridden. |
| `postal_code` | admin override owned | yes | Baseline can later be overridden. |
| `city` | admin override owned | yes | Baseline can later be overridden. |
| `latitude` | official import owned | yes | No first-pass override model. |
| `longitude` | official import owned | yes | No first-pass override model. |
| `capacity` | admin override owned | yes | Baseline can later be overridden. |
| `status` | admin override owned | yes | Baseline can later be overridden. |
| `accessibility_notes` | admin override owned | yes | Only when source-backed. |
| `summary` | admin override owned | yes | Only when source-backed. |
| `source_summary` | admin-only enrichment / future derived | no | Kept out of importer ownership for now. |
| `is_featured` | admin-only enrichment | no | Editorial curation. |
| `featured_rank` | admin-only enrichment | no | Editorial ordering. |
| `import_state` | official import owned | yes | `active`, `missing_from_source`, or `suppressed`. |
| `last_seen_at` | official import owned | yes | Set when a source record appears in a successful run. |
| `last_imported_at` | official import owned | yes | Importer refresh timestamp. |
| `canonical_source_name` | official import owned | yes | Stable source namespace. |
| `canonical_source_reference` | official import owned | yes | Stable source identity. |

## Municipality Fields
| Field | Owner | Importer may write | Notes |
| --- | --- | --- | --- |
| `code` | official import owned | yes | Stable municipality identity anchor. |
| `slug` | internal operational | yes | Public route key for later cutover. |
| `name` | official import owned | yes | Canonical display name. |
| `region_name` | official import owned | yes | Metadata from bundled municipality map. |
| `description` | admin-only enrichment | no | Public/editorial copy, not importer data. |

## Source Fields
| Field | Owner | Importer may write | Notes |
| --- | --- | --- | --- |
| `source_name` | official import owned | yes | Source label. |
| `source_type` | internal operational | yes | Usually `official`. |
| `source_url` | official import owned | yes | Public or operational source reference. |
| `source_reference` | official import owned | yes | Source-specific id. |
| `last_verified_at` | official import owned | yes | Source freshness if available. |
| `imported_at` | internal operational | yes | Import timestamp. |
| `notes` | admin-only enrichment / future derived | no | Keep sparse until trust-copy model is clearer. |

## Override Fields
The importer must not write `app_v2.shelter_overrides`. Future read logic can apply active overrides first for name, address, capacity, status, accessibility notes, and summary.

## Current Live App
These ownership rules describe the `app_v2` target model. The live app still uses its current data layer until a later cutover phase.
