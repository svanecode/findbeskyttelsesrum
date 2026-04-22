# app_v2 Nearby Evaluation

## 1. Overview

This document captures the current read-only evaluation status for the new app_v2 nearby stack:

- `app_v2.get_nearby_shelters(...)`
- `getAppV2NearbySheltersWithDiagnostics()`
- `getAppV2GroupedNearbySheltersWithDiagnostics()`
- `/api/app-v2/nearby`
- `/api/app-v2/nearby/grouped`
- app_v2 nearby eligibility mode `legacy_capacity_v1`
- app_v2 nearby eligibility mode `source_application_code_v1`
- municipality, nearby, and exclusions parity scripts

The deployed live site may still run an older snapshot, but the current revamp codebase now has an explicit nearby
source contract: app_v2 is the revamp default, `source=app_v2` is the explicit app_v2 mode, `source=legacy` is the
legacy compare/fallback mode, and unknown source values fall back to app_v2. The legacy Supabase tables/functions remain
the rollback net and are not mutated by this contract.

## 2. What Was Actually Tested

The local Codex shell now exposes the required read environment:

- `NEXT_PUBLIC_SUPABASE_URL`: present
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: present
- `SUPABASE_SECRET_KEY`: present

`SUPABASE_SECRET_KEY` is the current repo contract for privileged server-side Supabase access. It is used by `src/lib/supabase/env.ts`, `src/lib/supabase/admin.ts`, and the app_v2 helpers/importer scripts as the server-only key passed to `@supabase/supabase-js`. The name is legacy-looking, but functionally it is the privileged Supabase secret expected by the current code. The contract should be preserved until a separate env-contract cleanup is planned.

Read-only checks that were actually run against the target environment:

- `npm run parity:municipalities`
  - reached Supabase and returned concrete parity findings
- `npm run parity:nearby -- --sample copenhagen`
  - passed after target remediation
- `npm run parity:nearby -- --sample aarhus`
  - passed after target remediation
- `npm run parity:nearby -- --sample lemvig`
  - passed after target remediation
- `npm run parity:nearby -- --sample copenhagen --include-suppressed`
  - passed after target remediation
- `npm run parity:nearby -- --sample aarhus --include-suppressed`
  - passed after target remediation
- `npm run parity:nearby -- --sample lemvig --include-suppressed`
  - passed after target remediation
- `npm run parity:nearby -- --sample copenhagen --app-v2-shape grouped`
  - passed and returned grouped app_v2 overlap findings with eligibility active
- `npm run parity:nearby -- --sample aarhus --app-v2-shape grouped`
  - passed and returned grouped app_v2 overlap findings with eligibility active
- `npm run parity:nearby -- --sample lemvig --app-v2-shape grouped`
  - passed and returned grouped app_v2 overlap findings with eligibility active
- `npm run parity:nearby -- --sample copenhagen --app-v2-shape grouped --include-suppressed`
  - passed with the same top-level grouped overlap as active-only mode
- `npm run parity:nearby -- --sample aarhus --app-v2-shape grouped --include-suppressed`
  - passed with the same top-level grouped overlap as active-only mode
- `npm run parity:nearby -- --sample lemvig --app-v2-shape grouped --include-suppressed`
  - passed with the same top-level grouped overlap as active-only mode
- `npm run parity:exclusions`
  - reached Supabase and returned a read-only report
  - confirmed the single legacy exclusion now maps to one app_v2 shelter and one active app_v2 exclusion
- `npm run read:app-v2-nearby-api -- --sample copenhagen --base-url http://localhost:3000`
  - returned `200`
- `npm run read:app-v2-nearby-api -- --sample aarhus --base-url http://localhost:3000`
  - returned `200`
- `npm run read:app-v2-nearby-api -- --sample lemvig --base-url http://localhost:3000`
  - returned `200`
- `npm run read:app-v2-nearby-api -- --sample copenhagen --base-url http://localhost:3000 --shape grouped`
  - returned `200`
- `npm run read:app-v2-nearby-api -- --sample aarhus --base-url http://localhost:3000 --shape grouped`
  - returned `200`
- `npm run read:app-v2-nearby-api -- --sample lemvig --base-url http://localhost:3000 --shape grouped`
  - returned `200`

Before remediation, a direct Supabase RPC probe returned `PGRST202` for `app_v2.get_nearby_shelters(...)`, meaning PostgREST could not find the function in the app_v2 schema cache. Supabase MCP later confirmed that the target environment had `app_v2` tables but lacked `app_v2.shelter_exclusions` and `app_v2.get_nearby_shelters(...)`.

## 3. What Could Not Be Tested

The following still could not be fully evaluated:

- ordering differences between PostGIS legacy and SQL Haversine app_v2
- broad app_v2 exclusion effect outside the one migrated Porsvej case
- legacy exclusion migration behavior at scale, because only the one concrete legacy row was mapped
- full UI readiness, because grouped app_v2 output is closer to legacy but still lacks legacy `anvendelse` semantics and has not had a dedicated ordering/spatial evaluation after eligibility

The current evaluation gives real app_v2 nearby/API observations. It supports the revamp app_v2 default with legacy
fallback, but it still does not by itself justify retiring the legacy rollback net.

## 3.1 Target Environment Reconciliation Status

Supabase MCP inspection initially showed:

- `app_v2` schema exists
- `app_v2.municipalities`: `97` rows
- `app_v2.shelters`: `23694` rows
- `app_v2.shelter_sources`: `23694` rows
- `app_v2.import_runs`: `52` rows
- `app_v2.shelter_exclusions`: missing
- `app_v2.get_nearby_shelters(double precision, double precision, integer, integer, integer, text[])`: missing

The target migration list stopped at `app_v2_import_run_resilience`, so the two missing repo foundations were applied through Supabase MCP:

- `app_v2_shelter_exclusions`
- `app_v2_nearby_read_rpc`

Post-remediation MCP verification confirmed:

- `app_v2.shelter_exclusions` exists with RLS enabled and `0` rows
- `app_v2.get_nearby_shelters(...)` exists
- the RPC is callable and returned `3` rows for a Copenhagen smoke test with diagnostics `readModel=app_v2_nearby_db_rpc_v1`

The two smallest concrete data gaps were then closed:

- inserted missing app_v2 municipality `0825` / `leso` / `Læsø`
- inserted one active app_v2 shelter exclusion for `Porsvej 1, 9000 Aalborg`, matched exactly to one active app_v2 shelter by `shelter_id`, canonical source identity, address, postal code, and city

## 4. Tooling Improvements Made

The nearby parity script now supports named coordinate samples:

```bash
npm run parity:nearby -- --sample copenhagen
npm run parity:nearby -- --sample aarhus
npm run parity:nearby -- --sample lemvig
```

Explicit coordinates still work and override the sample:

```bash
npm run parity:nearby -- --lat 55.6761 --lng 12.5683 --radius 50000 --limit 10 --candidate-limit 500
```

The nearby parity output now reports the app_v2 read model diagnostics when a real run is possible:

- `readModel`
- `distanceStrategy`
- `spatialIndex`
- `groupedLegacyShape`
- shared address rank differences
- exact rank matches
- average and max absolute rank delta
- candidateLimit hit signal
- candidate rows read
- rows excluded by app_v2 exclusions
- candidates within radius
- returned rows

The nearby parity address-key comparison now uses the same deterministic normalization as the shadow preview:

- prefer legacy split fields `vejnavn + husnummer + postnummer`
- compare app_v2 as `address_line1 + postal_code`
- ignore city/bydel suffixes for the comparison key
- lowercase, trim, collapse whitespace, and treat commas as separators

It does not do fuzzy typo matching. This specifically prevents formatting cases such as `Østergade 65, Nørlem` versus
`Østergade 65` from looking like a larger data mismatch when street, house number, and postal code agree.

The nearby parity script now also supports grouped app_v2 evaluation:

```bash
npm run parity:nearby -- --sample copenhagen --app-v2-shape grouped
npm run parity:nearby -- --sample aarhus --app-v2-shape grouped
npm run parity:nearby -- --sample lemvig --app-v2-shape grouped
```

The grouped comparison uses `getAppV2GroupedNearbySheltersWithDiagnostics()` and groups app_v2 rows by deterministic `address_line1 + postal_code + city` normalization. It is a grouped app_v2 shape, not a claim of full legacy grouped parity.

The app_v2 nearby read layer now applies the first explicit eligibility mode by default:

- mode: `legacy_capacity_v1`
- rule: `capacity >= 40`
- timing: applied to app_v2 row results before grouping
- unresolved legacy signal: `anvendelseskoder.skal_med`

The parity script accepts `--eligibility none` for diagnostic comparison, but normal grouped evaluation uses the capacity eligibility mode.

The API probe now supports the same named coordinate samples:

```bash
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample copenhagen
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample aarhus
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample lemvig
```

It can also probe the grouped API route:

```bash
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample copenhagen --shape grouped
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample aarhus --shape grouped
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample lemvig --shape grouped
```

It can also probe the opt-in nearby shadow compare route:

```bash
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample copenhagen --shape shadow
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample aarhus --shape shadow
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample lemvig --shape shadow
```

The shadow route is `/api/app-v2/nearby/shadow` and requires `shadow=1`. It reads legacy nearby and grouped app_v2 nearby side by side, returns compare JSON, and does not write telemetry or database state. The user-visible nearby source is decided by the page-level source resolver, not by the shadow route.

## 4.1 Revamp nearby source contract

The current revamp build resolves nearby source as follows:

- no `source` parameter: app_v2 grouped nearby is the default result and map source
- `source=app_v2`: explicit app_v2 grouped nearby, same as default
- `source=legacy`: legacy nearby RPC result and map source, used for compare/fallback
- unknown `source` values: normalized back to app_v2

The app_v2 path uses `/api/app-v2/nearby/grouped` with strict `source_application_code_v1` eligibility. The legacy path
continues to call `get_nearby_shelters_v3` with the existing v2 fallback. app_v2 result cards deliberately hide the
legacy "Type" field because the grouped app_v2 response does not expose a legacy `anvendelse` code for the existing
display lookup. Legacy result cards still show Type through `public.anvendelseskoder`.

The internal grouped review remains explicitly gated on the existing nearby page:

```text
/shelters/nearby?lat=55.6761&lng=12.5683&appV2NearbyExperiment=grouped
```

Without `appV2NearbyExperiment=grouped`, the page does not fetch the shadow route. With the flag, the page shows an
internal "Grouped app_v2 nearby review" block above the active result list. The result list and map markers still follow
the source contract (`app_v2` by default, `legacy` only with `source=legacy`).

The tiny public preview remains explicitly gated:

```text
/shelters/nearby?lat=55.6761&lng=12.5683&appV2NearbyExperiment=public-preview
```

It shows a small shadow comparison block. It does not change the active source; the active source still follows the
same resolver.

The preview intentionally stays small. It shows overlap counts, the first app_v2 results, the active source label, and a
plain data-context link. It now uses the hardened address comparison key (`street + house number + postal code`) so
known city/bydel formatting differences are not presented as top-10 membership failures. Remaining differences after
that normalization should be treated as real review cases, not as formatting noise.

Internal reviewers should look at:

- overlap count
- legacy-only cases
- app_v2-only cases
- shared results with rank deltas
- grouped app_v2 top results, especially groups with multiple shelter rows
- whether app_v2-only cases look plausible or look like likely `anvendelseskoder.skal_med` misses
- whether legacy-only cases look like coverage gaps app_v2 should have had

Good enough signal for a broader internal visible test means:

- app_v2-only cases look plausible, not obviously irrelevant
- legacy-only cases are explainable by known semantic gaps or data differences
- rank deltas remain small for shared results
- reviewers do not need the map to be replaced to evaluate the result differences

Its output now includes the useful evaluation fields from API meta:

- effective query
- capabilities
- exclusion mode
- diagnostics
- limitations

## 5. Expected Real-Environment Evaluation Runbook

Run these commands in an environment with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`
- migration `011_app_v2_nearby_read_rpc.sql` applied
- app_v2 exposed to the Supabase API for service-role reads

Municipality parity:

```bash
npm run parity:municipalities
```

Nearby parity, normal active-only mode:

```bash
npm run parity:nearby -- --sample copenhagen
npm run parity:nearby -- --sample aarhus
npm run parity:nearby -- --sample lemvig
```

Nearby parity, grouped app_v2 mode:

```bash
npm run parity:nearby -- --sample copenhagen --app-v2-shape grouped
npm run parity:nearby -- --sample aarhus --app-v2-shape grouped
npm run parity:nearby -- --sample lemvig --app-v2-shape grouped
```

Nearby parity with suppressed rows included for diagnostics:

```bash
npm run parity:nearby -- --sample copenhagen --include-suppressed
npm run parity:nearby -- --sample aarhus --include-suppressed
npm run parity:nearby -- --sample lemvig --include-suppressed
```

Nearby parity with a larger app_v2 candidate pool:

```bash
npm run parity:nearby -- --sample copenhagen --app-v2-shape grouped --candidate-limit 2000
npm run parity:nearby -- --sample aarhus --app-v2-shape grouped --candidate-limit 2000
npm run parity:nearby -- --sample lemvig --app-v2-shape grouped --candidate-limit 2000
```

Exclusions parity:

```bash
npm run parity:exclusions
```

API probe against a local or preview app:

```bash
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample copenhagen
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample aarhus
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample lemvig
```

Grouped API probe:

```bash
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample copenhagen --shape grouped
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample aarhus --shape grouped
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample lemvig --shape grouped
```

Shadow compare probe:

```bash
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample copenhagen --shape shadow --eligibility source-application-code
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample aarhus --shape shadow --eligibility source-application-code
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --sample lemvig --shape shadow --eligibility source-application-code
```

API error-shape probes:

```bash
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --lat 91 --lng 12.5683
npm run read:app-v2-nearby-api -- --base-url http://localhost:3000 --lat 55.6761 --lng 12.5683 --radius 100001
```

## 6. Mismatch Categories to Record

For each nearby sample, record:

- legacy result count
- app_v2 result count
- shared normalized address keys
- shared normalized address rank deltas
- exact rank matches
- average and max absolute rank delta
- legacy-only address keys
- app_v2-only address keys
- whether top results differ only by ordering or by actual result membership
- app_v2 `candidateRowsRead`
- app_v2 `excludedByAppV2Exclusions`
- app_v2 `candidatesWithinRadius`
- app_v2 `returnedRows`
- whether `--include-suppressed` changes app_v2 result membership

Classify mismatches into these buckets:

- `shape-only`: app_v2 has the same location/address concept but not the legacy grouped field names
- `grouping`: legacy groups multiple rows and app_v2 returns individual shelter rows
- `ordering`: same or overlapping results but different order
- `data coverage`: app_v2 has missing or extra shelter records compared with legacy
- `exclusions`: legacy-excluded rows appear in app_v2 or app_v2 exclusions remove rows legacy still returns
- `municipality linkage`: municipality slug/name/code mismatch affects result display or future route links
- `suppression/import_state`: `--include-suppressed` reveals rows hidden by normal active-only app_v2 reads
- `spatial`: result differences likely caused by SQL Haversine/bounding-box behavior versus legacy PostGIS

## 7. Current Observations

Current real-environment observations:

- Municipality parity can run:
  - legacy rows: `98`
  - app_v2 rows: `98`
  - app_v2 rows with code: `98`
  - missing in app_v2 by code: `0`
  - slug mismatches after app_v2 normalization: `0`
  - name mismatches after app_v2 normalization: `98`
- The municipality name mismatches are systematic: legacy rows include the `Kommune` suffix, while app_v2 exposes shorter display names such as `København`.
- Nearby parity now runs for Copenhagen, Aarhus, and Lemvig.
  - all three normal runs return legacy count `10` and app_v2 count `10`
  - all three include-suppressed runs also return app_v2 count `10`
  - corrected shared address-key counts are `8/10` for Copenhagen, `6/10` for Aarhus, and `6/10` for Lemvig
- app_v2 diagnostics report `readModel=app_v2_nearby_db_rpc_v1`, `distanceStrategy=database_haversine`, `spatialIndex=false`, and `groupedLegacyShape=false`
  - app_v2 exclusions filtered `0` rows in all sampled runs
- The previous `0` shared address-key result was caused by punctuation/field-join normalization, not by true zero overlap.
- API probes against local `/api/app-v2/nearby` now return `200` for Copenhagen, Aarhus, and Lemvig.
- Grouped app_v2 parity now runs for Copenhagen, Aarhus, and Lemvig.
  - grouped Copenhagen overlap is `9/10` normalized address keys
  - grouped Aarhus overlap is `7/10`
  - grouped Lemvig overlap is `8/10`
  - include-suppressed grouped runs did not change the top-level overlap for these samples
  - grouped diagnostics report `groupedAppV2Shape=true`, `groupedLegacyShape=false`, `groupingKey=address_line1 + postal_code + city`
  - eligibility diagnostics report `eligibilityMode=legacy_capacity_v1`, `minimumCapacity=40`, and `legacyAnvendelseSemantics=unresolved`
  - capacity eligibility filtered `56` Copenhagen rows, `92` Aarhus rows, and `61` Lemvig rows from the app_v2 source result set before grouping
- API probes against local `/api/app-v2/nearby/grouped` return `200` for Copenhagen, Aarhus, and Lemvig.
- Grouped API meta now exposes the active eligibility model with `mode=legacy_capacity_v1`, `minimumCapacity=40`, and an explicit note that legacy `anvendelseskoder.skal_med` is not modeled.
- Grouped output correctly aggregates same-address app_v2 rows, for example Copenhagen `Vesterbrogade 3` returns `shelterCount=2` and `totalCapacity=1536`.
- The grouped comparison now shows that the simple capacity eligibility rule materially improves Aarhus and Lemvig overlap. The remaining mismatch is most likely ordering/spatial quality plus unresolved `anvendelseskoder.skal_med`, not basic grouping or capacity threshold.
- Focused ordering/ranking evaluation now reports rank deltas for shared address keys:
  - Copenhagen: `9/10` shared address keys, `5` exact rank matches, average absolute rank delta `0.44`, max delta `1`
  - Aarhus: `7/10` shared address keys, `1` exact rank match, average absolute rank delta `1.14`, max delta `2`
  - Lemvig: `8/10` shared address keys, `4` exact rank matches, average absolute rank delta `0.75`, max delta `2`
- Increasing grouped app_v2 `candidateLimit` from `500` to `2000` did not change top-10 overlap or rank-delta patterns for Copenhagen, Aarhus, or Lemvig.
  - Copenhagen and Aarhus still hit the larger candidate limit because the 50 km radius is dense, but the stable top-10 output means the sampled mismatch is not primarily caused by the default candidate pool.
  - Lemvig did not hit the candidate limit; its top-10 mismatch is not a candidateLimit artifact in this sample.
- The shared-address rank deltas are small. The larger remaining issue is top-10 membership: app_v2 sometimes returns closer addresses that legacy does not include. That points more toward unresolved legacy inclusion semantics, especially `anvendelseskoder.skal_med`, than toward broken distance ordering.
- Exclusions parity can run:
  - legacy exclusions: `1`
  - app_v2 shelters scanned: `1000`
  - `app_v2.shelter_exclusions`: `1` total, `1` active
  - deterministic address match candidates: `1`
  - unresolved legacy exclusions: `0`
- A Porsvej-local RPC smoke test near `Porsvej 1` reported `excludedByAppV2Exclusions=1` and omitted the excluded Porsvej 1 shelter from returned results.
- The first runtime-near shadow compare route now exists at `/api/app-v2/nearby/shadow`.
  - It requires `shadow=1`, otherwise it returns `404 shadow_not_enabled`.
  - It reads legacy nearby and grouped app_v2 nearby in the same route handler.
  - It returns overlap counts, legacy-only/app_v2-only address keys, rank deltas, legacy top results, and grouped app_v2 top results.
  - It reports `userVisibleSource=legacy` and keeps `anvendelseskoder.skal_med` as an explicit unresolved semantic gap.
  - It is read-only and does not write telemetry or database state.
- The first internal visible review mode now exists behind `appV2NearbyExperiment=grouped` on `/shelters/nearby`.
  - Normal `/shelters/nearby?lat=...&lng=...` remains legacy-only.
  - Review mode renders a separate grouped app_v2 comparison panel above the legacy list.
  - It shows overlap, legacy-only results, app_v2-only results, shared rank deltas, grouped top results, and a map-context note.
  - The map and legacy result cards are not replaced.
  - Review mode now defaults to strict source-backed eligibility.
  - Activate it with:
    - `/shelters/nearby?lat=55.6761&lng=12.5683&appV2NearbyExperiment=grouped`
    - optional diagnostic fallback: add `appV2NearbyEligibility=legacy-capacity`
  - The review panel now shows eligibility mode, source-code coverage, source-code eligible rows, unknown code rows, overlap, rank deltas, app_v2-only cases, and legacy-only cases.
  - Work Package T expands this from a preview block into a more useful internal trial surface: it adds a trial summary, explicit strict/fallback mode links, filtered-row diagnostics, edge-case review cues, and a reviewer checklist.
  - Work Package U broadens the trial surface for internal use: it adds quick links for representative trial cases, clearer strict/fallback mode grouping, stronger edge-case hints for address-normalization cases, and direct links to the app_v2 data context pages.
- Semantic mismatch analysis now runs through `npm run read:nearby-semantic-cases`.
  - Earlier capacity-only analysis across Copenhagen, Aarhus, Lemvig, Aalborg, Odense, and Esbjerg found `45` shared grouped addresses, `15` legacy-only grouped addresses, and `15` app_v2-only grouped addresses.
  - All `15/15` capacity-only app_v2-only cases had exact normalized legacy address matches and were classified as likely filtered by legacy `anvendelseskoder.skal_med` / eligibility semantics.
  - After `source_application_code_v1` population, strict source-backed analysis improved the same six-case set to `59` shared grouped addresses, `1` legacy-only grouped address, and `1` app_v2-only grouped address under the older raw-address comparison key.
  - The remaining sampled strict-mode mismatch was the Lemvig `Østergade 65, Nørlem` vs `Østergade 65` address/city formatting edge case.
  - After hardening the comparison key to prefer street, house number, and postal code, that six-case sample is `60/60` shared grouped addresses.
  - The detailed decision document is `docs/app-v2-nearby-semantic-gap-analysis.md`.
- A narrow source-backed application-code eligibility model now exists, and the target app_v2 data has now been populated with source codes.
  - `app_v2.shelters.source_application_code` stores the intended source code, currently Datafordeler BBR `byg021BygningensAnvendelse`.
  - `app_v2.application_code_eligibility` stores source-name + application-code nearby eligibility.
  - The Datafordeler adapter maps `building.byg021BygningensAnvendelse` into the importer contract.
  - The read layer supports explicit `source_application_code_v1` eligibility.
  - Population used the deterministic source identity join `app_v2.shelters.canonical_source_reference = public.sheltersv2.bygning_id`; no address/name/capacity heuristics were used.
  - Target verification now shows `23690/23695` app_v2 shelters with `source_application_code` populated, `86` distinct source codes, and `0` populated source codes without an eligibility rule.
  - Of the populated rows, `12324` are nearby eligible by code and `11366` are nearby ineligible by code.
  - Strict source-code grouped parity now improves the three standard samples from `9/10`, `7/10`, `8/10` address overlap to `10/10`, `10/10`, `9/10`.
  - The six-case semantic analysis improves from `45` shared / `15` app_v2-only / `15` legacy-only grouped addresses to `59` shared / `1` app_v2-only / `1` legacy-only; the remaining mismatch is Lemvig `Østergade 65, Nørlem` vs `Østergade 65`.
- Broader Work Package U runtime probes through the shadow route now show:
  - Copenhagen: `10/10` shared, max rank delta `1`
  - Aarhus: `10/10` shared, max rank delta `2`
  - Lemvig: `10/10` shared, max rank delta `0` after address-key hardening
  - Odense: `10/10` shared, max rank delta `3`
  - Esbjerg: `10/10` shared, max rank delta `2`, with `1` unknown source-code row in candidates but no top-10 membership mismatch
  - Aalborg: `10/10` shared, max rank delta `2`
- The API/read stack remains isolated from `/shelters/nearby`.

## 8. Decision Status

There is now enough trustworthy data to identify the next technical blocker, but still not enough to cut over the live UI.

The strongest current signal is:

- overlap is materially better than the old zero counters implied
- grouped app_v2 output is now close to legacy shape for deterministic address grouping, group counts, and aggregate capacity
- capacity eligibility improves grouped overlap from the previous `9/10`, `6/10`, `6/10` to `9/10`, `7/10`, `8/10`
- the three samples still have membership differences in the top 10
- shared-address ordering differences are small in the sampled runs: max rank delta is `1` for Copenhagen and `2` for Aarhus/Lemvig
- larger `candidateLimit` did not change sampled top-10 output
- the biggest visible remaining cause is no longer "app_v2 is only row-level", "capacity threshold is missing", or "candidateLimit is too small"; it is now unresolved inclusion semantics plus residual coordinate/distance differences
- after focused ranking evaluation, pure ordering/spatial quality no longer looks like the dominant blocker for a limited shadow test
- the shadow compare route now makes that comparison available in a runtime-near API context without changing the visible nearby flow
- the gated visible review mode now makes strict source-backed grouped app_v2 inspectable in the actual nearby page context, while preserving legacy as the default and visible primary source
- semantic mismatch analysis shows the sampled app_v2-only results are dominated by legacy `skal_med=false` application-code cases, especially code `140` and related residential/college categories
- the source-backed model is now populated and materially improves grouped nearby overlap
- the remaining sampled strict-mode mismatch was address/city formatting, and the hardened comparison key now classifies it correctly
- the strict source-backed internal review mode is now mature enough for a broader internal trial pass because it exposes membership, ranking, eligibility diagnostics, edge-case cues, and map-context limitations in the real nearby page context
- the broader internal trial cases now show `10/10` membership in Copenhagen, Aarhus, Lemvig, Odense, Esbjerg, and Aalborg
- suppression does not materially affect the three sampled outputs
- the one known legacy exclusion is now represented in app_v2 and the RPC can filter it

## 8.1 Internal Trial Guide

Activate the strict source-backed internal trial surface with:

```text
/shelters/nearby?lat=55.6761&lng=12.5683&appV2NearbyExperiment=grouped
```

The default review variant is `source_application_code_v1`. Use the capacity-only fallback only for diagnostics:

```text
/shelters/nearby?lat=55.6761&lng=12.5683&appV2NearbyExperiment=grouped&appV2NearbyEligibility=legacy-capacity
```

Internal reviewers should inspect:

- shared top-10 membership and rank deltas
- legacy-only and app_v2-only keys before judging a coordinate
- source-code coverage, eligible-by-code rows, unknown code rows, and filtered rows
- grouped app_v2 top results, especially grouped count and total capacity
- whether remaining differences look like coverage, grouping, ranking, or a formatting case not covered by the deterministic key

Use the built-in trial-case links in the review panel for a consistent first pass:

- Copenhagen
- Aarhus
- Lemvig
- Odense
- Esbjerg

For any mismatch:

1. Check whether legacy-only and app_v2-only counts are symmetric.
2. Compare normalized address keys. The built-in comparison already uses street, house number, and postal code; remaining differences should not be dismissed as city/bydel formatting without concrete evidence.
3. Re-run the same coordinate with `appV2NearbyEligibility=legacy-capacity` only if you need to isolate source-code eligibility from grouping/ranking.
4. Treat the legacy list and map as the visible reference until a separate public experiment is approved.
5. Use `/om-data` for public data-context language; do not present internal trial output as public truth.

Acceptable internal-trial findings:

- small rank deltas on shared addresses
- isolated formatting cases that are easy to explain and do not survive the street/house/postal comparison key
- no default-user-visible behavior change

Findings that should block a broader visible experiment:

- repeated app_v2-only cases that look semantically ineligible
- repeated legacy-only cases that look like app_v2 data coverage gaps
- high unknown source-code rows in nearby candidates
- systematic ranking divergence beyond small rank deltas

## 9. Recommendation

Primary recommendation: keep the tiny public-facing nearby preview standing as a sober opt-in confidence check, and shift project focus away from nearby unless new concrete edge cases appear.

Secondary recommendation: keep the internal strict source-backed trial mode available for maintenance checks, but do not expand it into a larger debug surface.

The tiny public experiment should be deliberately narrower than a cutover:

- require an explicit opt-in flag
- activate with `appV2NearbyExperiment=public-preview`
- keep the result list and map on the active nearby source contract
- show grouped app_v2 nearby as a labelled comparison or preview
- use `source_application_code_v1` eligibility
- expose overlap and known-gap language in plain public copy
- compare addresses with the hardened street/house/postal key so formatting-only differences do not look like data failures
- link to `/om-data` for data-context explanation
- avoid changing DAWA/search, markers, routing, or default result ordering

The current public destination surfaces are now coherent enough to support that limited experiment: `/land`, `/kommune`, `/kommune/[slug]`, `/beskyttelsesrum/[slug]`, and `/om-data` give users a clearer app_v2 data context before any nearby result becomes public-facing.

Example public-preview URL:

```text
/shelters/nearby?lat=55.6761&lng=12.5683&appV2NearbyExperiment=public-preview
```

The older `appV2NearbyExperiment=grouped` mode remains the larger internal review surface. The public preview is intentionally smaller and does not expose the internal reviewer checklist, mode switcher, or detailed diagnostics.
