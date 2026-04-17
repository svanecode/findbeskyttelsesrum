# Legacy Exclusions Mapping Plan

## 1. Overview

The read-only parity scripts could not run against a real Supabase environment in this local shell because `SUPABASE_SECRET_KEY` was not available. No database reads or writes were attempted beyond the scripts' env checks.

This plan defines how the legacy `public.excluded_shelters` behavior should be mapped into the future `app_v2` nearby read model before `/shelters/nearby` is cut over.

The main recommendation is:

- keep the current app_v2 nearby default of reading only `import_state = 'active'`;
- add a dedicated app_v2 exclusions model for legacy owner-request exclusions;
- migrate existing `public.excluded_shelters` rows into that model or an equivalent read-side table;
- apply that model in the future app_v2 nearby RPC/read model before any runtime cutover.

Using only `app_v2.shelters.import_state = 'suppressed'` is not enough to preserve legacy behavior, because the legacy table can exclude by address components and `bygning_id`, not only by known app_v2 shelter identity.

## 2. What legacy `public.excluded_shelters` does

Legacy exclusions are defined in `supabase/migrations/001_create_excluded_shelters.sql`.

The table stores owner-requested exclusions with:

- `address`
- `vejnavn`
- `husnummer`
- `postnummer`
- `bygning_id`
- `reason`
- `created_at`
- `created_by`

The table has:

- a required `address`;
- optional split address fields;
- optional `bygning_id`;
- a uniqueness constraint on `(address, vejnavn, husnummer, postnummer)`;
- lookup indexes on `address` and non-null `bygning_id`.

Helper functions in `supabase/migrations/004_helper_functions.sql` support:

- `add_excluded_shelter(...)`
- `remove_excluded_shelter(...)`
- `list_excluded_shelters()`

Those helpers are legacy operational tools and are not currently mirrored in app_v2.

## 3. How legacy nearby applies exclusions

`get_nearby_shelters_v3` applies exclusions inside the RPC before grouping nearby results.

A legacy shelter row is excluded when any of these match:

1. exact full address:
   - `excluded_shelters.address = sheltersv2.address`
2. split address identity:
   - `excluded_shelters.vejnavn = sheltersv2.vejnavn`
   - `excluded_shelters.husnummer = sheltersv2.husnummer`
   - `excluded_shelters.postnummer = sheltersv2.postnummer`
3. building identity:
   - `excluded_shelters.bygning_id is not null`
   - `excluded_shelters.bygning_id = sheltersv2.bygning_id`

This happens before the RPC groups shelters by `vejnavn`, `husnummer`, `postnummer`, `kommunekode`, and `location`. Therefore an exclusion can remove source rows before they affect `shelter_count`, `total_capacity`, marker placement, and result ordering.

## 4. Current app_v2 support

app_v2 currently has these related mechanisms:

- `app_v2.shelters.import_state`
  - values: `active`, `missing_from_source`, `suppressed`
  - public read policy only exposes `active`
  - current `getAppV2NearbyShelters()` defaults to `importStates: ['active']`
- `app_v2.shelter_overrides`
  - intended for future manual corrections
  - does not currently include an exclusion/suppression-specific schema
- `app_v2.audit_events`
  - can record operational events later
  - not currently wired to exclusions
- source identity fields on `app_v2.shelters`
  - `canonical_source_name`
  - `canonical_source_reference`

This is enough to suppress a known app_v2 shelter row if it has already been identified and marked `suppressed`.

It is not enough to mirror legacy exclusions because app_v2 currently lacks:

- `vejnavn`
- `husnummer`
- `bygning_id`
- a durable migrated copy of legacy exclusion requests
- a read-side exclusion match function equivalent to the legacy RPC
- a clear operational owner for manual exclusion state

## 5. Mapping options

### Option A: Migrate legacy exclusions directly into `import_state = 'suppressed'`

This would resolve each legacy exclusion to one or more app_v2 shelter rows and update those rows to `import_state = 'suppressed'`.

Benefits:

- simple read path;
- already respected by `getAppV2NearbyShelters()`;
- aligns with existing public app_v2 RLS behavior.

Problems:

- `import_state` is documented as importer-owned official lifecycle state;
- owner-request exclusions are manual/operational state, not source lifecycle state;
- importer runs may later overwrite or conflict with suppression unless explicitly taught not to;
- legacy address-only exclusions may not resolve cleanly to a current app_v2 shelter row;
- without storing the original exclusion request, future imported matching rows could reappear.

Verdict: useful only as a derived/effective state after a separate exclusion source of truth exists. It should not be the only migrated representation.

### Option B: Add a separate app_v2 exclusions model

Create an app_v2-owned table for exclusion requests, for example `app_v2.shelter_exclusions`.

Candidate fields:

- `id uuid`
- `shelter_id uuid null references app_v2.shelters(id)`
- `canonical_source_name text null`
- `canonical_source_reference text null`
- `address_line1 text null`
- `postal_code text null`
- `city text null`
- `legacy_address text null`
- `legacy_vejnavn text null`
- `legacy_husnummer text null`
- `legacy_postnummer text null`
- `legacy_bygning_id text null`
- `reason text`
- `source text not null default 'legacy_excluded_shelters'`
- `is_active boolean not null default true`
- `created_at timestamptz`
- `created_by text`
- `updated_at timestamptz`
- `updated_by text`

Recommended indexes:

- active exclusions by `shelter_id`
- active exclusions by `(canonical_source_name, canonical_source_reference)`
- active exclusions by normalized address fields
- active exclusions by `legacy_bygning_id`

Benefits:

- preserves the original owner-request exclusion as manual/operational state;
- avoids overloading importer-owned `import_state`;
- can match both current and future app_v2 shelter rows;
- can be audited and managed separately;
- can later derive effective public visibility without losing source facts.

Problems:

- requires a migration;
- requires a read-side filter in the future app_v2 nearby RPC/helper;
- requires a one-time migration or sync from `public.excluded_shelters`;
- requires a decision on normalization rules for address comparisons.

Verdict: recommended.

### Option C: Read-side mapping from legacy `public.excluded_shelters`

Keep `public.excluded_shelters` as the source of truth and have the future app_v2 nearby read model query it directly.

Benefits:

- preserves current operational data without migration;
- fastest route to parity for owner-request exclusions;
- reduces risk of losing legacy exclusion rows during transition.

Problems:

- keeps app_v2 dependent on legacy `public` schema;
- makes the cutover less clean;
- app_v2 does not have `bygning_id`, `vejnavn`, or `husnummer`, so only address matching is immediately possible unless source identity or legacy fields are added;
- can become a permanent mixed-source dependency if not time-boxed.

Verdict: acceptable only as a temporary bridge for parity validation, not as the long-term model.

### Option D: Use `shelter_overrides` for exclusions

Use `app_v2.shelter_overrides` to mark status or effective visibility.

Benefits:

- table already exists;
- conceptually related to manual operational changes.

Problems:

- current override schema has no explicit visibility/exclusion field;
- tying exclusions to `status` would conflate "temporarily closed" with "must not appear";
- does not cover address-only exclusions for future rows;
- unique active override per shelter does not represent broad address/building-level exclusion rules well.

Verdict: not recommended without changing the override schema. A dedicated exclusions table is clearer.

## 6. Recommended approach

Use a dedicated `app_v2.shelter_exclusions` model as the durable source of truth for manual/owner-request exclusions.

Then make future public reads apply effective visibility as:

1. start from app_v2 shelter candidates;
2. require `import_state = 'active'`;
3. exclude rows matched by active app_v2 exclusions;
4. only then apply distance, grouping, ordering, and limit.

This preserves the current app_v2 lifecycle boundary:

- importer-owned lifecycle remains in `import_state`;
- manual owner-request exclusions live in an operational exclusions table;
- public read logic combines both into an effective visible set.

The importer should not write exclusions directly. A later admin/manual workflow or migration should own those records.

## 7. Initial migration strategy

Migration `010_app_v2_shelter_exclusions.sql` adds the first dedicated table for this model.

The foundation migration:

1. creates `app_v2.shelter_exclusions`;
2. includes original legacy fields so no information is lost;
3. includes app_v2 link fields for resolved matches;
4. adds active-state and audit-ish timestamps;
5. adds indexes for the read-side matching paths;
6. does not mutate `public.excluded_shelters`;
7. does not update `app_v2.shelters.import_state`.

A separate data migration or script should then copy existing `public.excluded_shelters` rows into `app_v2.shelter_exclusions`.

That data migration should be explicit and reviewable because owner-request exclusions are trust-sensitive.

## 8. Matching strategy

The first matching pass should be conservative.

`getAppV2NearbyShelters()` now implements the first two matching paths for active `app_v2.shelter_exclusions` rows:

1. exact app_v2 shelter id;
2. exact canonical source identity.

Recommended match order:

1. exact app_v2 shelter id, if manually resolved;
2. canonical source identity, if `canonical_source_name` and `canonical_source_reference` can be mapped from legacy/source data;
3. normalized address match:
   - app_v2 `address_line1`
   - app_v2 `postal_code`
   - optionally app_v2 `city`
4. legacy identity fields retained for audit:
   - `legacy_address`
   - `legacy_vejnavn`
   - `legacy_husnummer`
   - `legacy_postnummer`
   - `legacy_bygning_id`

Do not treat fuzzy address matches as automatic exclusions in the first pass. Ambiguous matches should be reported for manual resolution.

The app_v2 schema does not currently store `bygning_id`, `vejnavn`, or `husnummer`, so exact legacy building/split-address parity requires either:

- adding source-specific identity fields to app_v2;
- storing those legacy fields in the exclusions table for later resolver scripts;
- or keeping a temporary read-side bridge to legacy until the identity is represented.

## 9. Read-model impact

The future app_v2 nearby RPC/helper should apply exclusions before grouping.

If grouping remains part of the public nearby model, filtering after grouping would be wrong because excluded rows could still contribute to:

- `shelter_count`;
- `total_capacity`;
- representative address/type fields;
- nearest-distance ordering.

Therefore the future query order should be:

1. candidate source rows;
2. lifecycle filter: `import_state = 'active'`;
3. manual exclusion filter;
4. distance/radius filter;
5. grouping;
6. ordering and limit;
7. shape mapping for the UI.

## 10. Validation plan

Before runtime cutover, run these read-only validations against a controlled environment:

1. `npm run parity:municipalities`
   - confirm municipality identity parity;
2. `npm run parity:nearby`
   - compare legacy grouped nearby output against active app_v2 output;
3. `npm run parity:nearby -- --include-suppressed`
   - measure whether app_v2 suppression exists and affects candidates;
4. `npm run parity:exclusions`
   - count `public.excluded_shelters`;
   - count existing `app_v2.shelter_exclusions`;
   - report strong candidates where legacy `bygning_id` matches app_v2 `canonical_source_reference`;
   - report potential address matches;
   - report unresolved legacy exclusions;

The fourth script is read-only and should be run before deciding the eventual exclusions data migration.

## 11. Recommendation for next nearby-related PR

The next nearby-related PR should not cut over `/shelters/nearby`.

Recommended next PR:

1. run `npm run parity:exclusions` against the intended Supabase environment;
2. review strong source-reference candidates separately from potential address matches;
3. decide which fields should be used in the eventual `app_v2.shelter_exclusions` data migration;
4. keep the migration explicit and reviewable;
5. do not cut over `/shelters/nearby` until the migrated exclusions are validated.

Only after that should the repo add the dedicated app_v2 exclusions table and a controlled migration path.
