# app_v2 Nearby Semantic Gap Analysis

## 1. Overview

This document analyzes the remaining app_v2 nearby mismatch after grouped app_v2 output, capacity eligibility, app_v2 exclusions, and ordering evaluation.

The question for this phase is narrow:

- Are app_v2-only nearby results mostly caused by unresolved legacy `anvendelseskoder.skal_med` semantics?
- Or are the remaining mismatches better explained by ordering, grouping, coverage, or capacity behavior?

No runtime cutover was made. The live `/shelters/nearby` default flow still uses legacy nearby data.

## 2. Analysis Workflow

A read-only analysis script was added:

```bash
npm run read:nearby-semantic-cases
```

The script compares:

- legacy nearby RPC output from `public.get_nearby_shelters_v3`
- grouped app_v2 nearby output from `getAppV2GroupedNearbySheltersWithDiagnostics()`
- legacy application-code metadata from `public.anvendelseskoder`
- exact address matches from `public.sheltersv2`

The script only reads data. It does not write telemetry, change runtime behavior, or mutate either schema.

The app_v2-only semantic annotation is deliberately conservative:

- it compares normalized address strings deterministically
- it requires exact normalized address + postal/city agreement through legacy `sheltersv2.address`
- it does not do fuzzy typo matching
- unmatched rows remain `no_exact_legacy_address_match`

This means the script can under-classify ambiguous cases, but it should not create optimistic false-positive semantic matches.

## 3. Cases Analyzed

The analysis used six realistic coordinate samples with the normal 50 km radius, limit `10`, candidate limit `500`, grouped app_v2 shape, and eligibility mode `legacy_capacity_v1`:

| Sample | Coordinates | Shared | Legacy-only | app_v2-only |
| --- | --- | ---: | ---: | ---: |
| Copenhagen | `55.6761, 12.5683` | 9 | 1 | 1 |
| Aarhus | `56.1629, 10.2039` | 7 | 3 | 3 |
| Lemvig | `56.5486, 8.3102` | 8 | 2 | 2 |
| Aalborg | `57.0488, 9.9217` | 10 | 0 | 0 |
| Odense | `55.4038, 10.4024` | 7 | 3 | 3 |
| Esbjerg | `55.4765, 8.4594` | 4 | 6 | 6 |

Aggregate result:

- shared grouped addresses: `45`
- legacy-only grouped addresses: `15`
- app_v2-only grouped addresses: `15`
- app_v2-only cases likely explained by legacy `skal_med` / eligibility filtering: `15`
- app_v2-only cases with exact legacy match that still appears legacy-eligible: `0`
- app_v2-only cases with mixed legacy semantics at the same address: `0`
- app_v2-only cases with no exact legacy address match: `0`

## 4. Legacy Inclusion Semantics

Legacy nearby inclusion is defined in `supabase/migrations/003_create_get_nearby_shelters_v3.sql`.

The important filters are:

- `s.location is not null`
- `s.shelter_capacity >= 40`
- `a.skal_med = TRUE`
- within the requested radius
- not matched by `public.excluded_shelters`

The current app_v2 eligibility layer already models the capacity part:

- `legacy_capacity_v1`
- `capacity >= 40`
- applied before grouped app_v2 output

The unresolved semantic gap is the application-code inclusion rule:

- legacy uses `public.anvendelseskoder.skal_med`
- app_v2 nearby does not currently carry an equivalent source-backed application-code signal

## 5. Mismatch Buckets

### app_v2-only cases

The app_v2-only bucket is the strongest signal in this analysis.

Across the six samples, every app_v2-only result had an exact legacy address match and all were classified as likely filtered by legacy `skal_med` / eligibility semantics.

Representative examples:

| Sample | app_v2-only result | Legacy annotation |
| --- | --- | --- |
| Copenhagen | `Sankt Peders Stræde 10, 1453 København K` | `140`, `skal_med=false`, `Etagebolig-bygning, flerfamiliehus eller to-familiehus` |
| Aarhus | `Høegh-Guldbergs Gade 6A, 8000 Aarhus C` | `150`, `skal_med=false`, `Kollegium` |
| Aarhus | `Falstersgade 39, 8000 Aarhus C` | `140`, `skal_med=false`, `Etagebolig-bygning, flerfamiliehus eller to-familiehus` |
| Lemvig | `Frederiksgade 29, 7620 Lemvig` | `140`, `skal_med=false`, `Etagebolig-bygning, flerfamiliehus eller to-familiehus` |
| Odense | `Kochsgade 55, 5000 Odense C` | `140`, `skal_med=false`, `Etagebolig-bygning, flerfamiliehus eller to-familiehus` |
| Esbjerg | `Haraldsgade 9, 6700 Esbjerg` | `140`, `skal_med=false`, `Etagebolig-bygning, flerfamiliehus eller to-familiehus` |

This strongly suggests that app_v2-only top-10 membership is not primarily an address-normalization, grouping, ordering, or coverage artifact. It is mainly app_v2 including shelter rows that legacy deliberately filters out through `anvendelseskoder.skal_med`.

### legacy-only cases

Legacy-only cases are legacy-eligible by construction because they came from `get_nearby_shelters_v3`.

Representative examples:

| Sample | legacy-only result | Legacy application code |
| --- | --- | --- |
| Copenhagen | `Vesterbrogade 6C, 1620 København V` | `322` |
| Aarhus | `Langelandsgade 62, 8000 Aarhus C` | `321` |
| Aarhus | `Høegh-Guldbergs Gade 2, 8000 Aarhus C` | `422` |
| Lemvig | `Østergade 50, 7620 Lemvig` | `441` |
| Odense | `Juelsgade 1, 5000 Odense C` | `441` |
| Esbjerg | `Nørrebrogade 6, 6700 Esbjerg` | `449` |

These cases do not prove app_v2 coverage problems by themselves. In the sampled runs, the app_v2-only cases occupying those top-10 positions are mostly closer addresses with legacy-ineligible application codes. If app_v2 had the same `skal_med` semantics, many of those legacy-only cases would likely move back into the app_v2 top 10.

### ordering cases

Shared rank deltas still exist, but they are smaller than the membership differences:

- Copenhagen: max shared rank delta `1`
- Aarhus: max shared rank delta `2`
- Lemvig: max shared rank delta `2`
- Aalborg: full 10/10 membership, max sampled deltas around `2`
- Odense and Esbjerg have larger membership gaps, but their app_v2-only cases still classify as likely `skal_med` filtered by legacy

Ordering/spatial quality remains relevant, but it no longer looks like the dominant blocker in the sampled data.

### grouping cases

Grouped app_v2 output already reduced the shape mismatch substantially. The current grouping key is deterministic:

- `address_line1 + postal_code + city`

Grouping is still not a full legacy shape replacement, but the sampled mismatch is no longer mainly caused by row-level app_v2 output.

### coverage cases

The semantic script found no app_v2-only case without an exact normalized legacy address match in the six sampled top-10 sets.

That does not prove global coverage parity, but it means the visible app_v2-only sample differences are not currently pointing at app_v2 inventing unrelated places or failing address reconciliation.

## 6. skal_med Assessment

`anvendelseskoder.skal_med` now looks like the dominant remaining semantic blocker for nearby parity.

The evidence is strong for app_v2-only cases:

- `15/15` app_v2-only grouped top-10 cases had exact legacy address matches
- `15/15` were classified as likely filtered by legacy `skal_med` / eligibility semantics
- `0/15` matched legacy rows that still looked legacy-eligible
- `0/15` were unclassified because of missing exact legacy address matches

The evidence is weaker for legacy-only cases, because they are top-10 consequences rather than direct semantic annotations. But the pattern is consistent: app_v2 includes closer legacy-ineligible addresses, which pushes some legacy-eligible addresses out of top 10.

The conclusion is not that app_v2 can blindly copy the legacy table. It is that the next app_v2 nearby quality improvement should model the underlying application-code eligibility signal explicitly rather than continuing with more generic ranking or grouping work.

## 7. Should skal_med Be Modeled Now?

Recommendation: model a narrow, source-backed app_v2 eligibility signal before any broader visible nearby experiment.

The safest version is not a heuristic. It should be one of:

- importing or deriving the source building/application code into app_v2, then joining it to a reviewed eligibility table
- adding a small app_v2 eligibility reference table that carries explicit include/exclude semantics for source building usage codes
- adding a read-side bridge only if it is deterministic, documented, and clearly temporary

What should not happen:

- fuzzy address-based `skal_med` inference in runtime
- broad migration of legacy semantics without reviewing what the app_v2 source model can actually carry
- presenting grouped app_v2 as ready for broader visible rollout while it knowingly includes legacy-ineligible categories like application code `140`

## 7.1 Source-Backed Model Status

The first narrow app_v2 model now exists, but current target data is not populated enough to activate it as the default nearby behavior.

Implemented pieces:

- `app_v2.shelters.source_application_code`
  - intended to store Datafordeler BBR `byg021BygningensAnvendelse`
- `app_v2.application_code_eligibility`
  - source-name + application-code eligibility table
  - seeded from the reviewed legacy `public.anvendelseskoder.skal_med` rule by code
- importer contract support
  - `ImportedShelterBaseline.sourceApplicationCode`
  - Datafordeler adapter maps `building.byg021BygningensAnvendelse`
- read-layer support
  - explicit `source_application_code_v1` nearby eligibility mode
  - requires `capacity >= 40`
  - requires `source_application_code` to be present and marked eligible
  - treats missing source codes as unknown/ineligible

Target environment verification after applying the focused app_v2 migration:

- application-code eligibility rows: `105`
- eligibility rows marked nearby eligible: `76`
- app_v2 shelters with `source_application_code`: `0`
- app_v2 shelters total: `23695`

That means the model is real and source-backed, but it cannot improve grouped parity until app_v2 shelter rows are refreshed or populated with their source application code.

Diagnostic source-code mode confirms this:

```bash
npm run parity:nearby -- --sample copenhagen --app-v2-shape grouped --eligibility source-application-code
```

The run returns `0` app_v2 results because all candidate rows have unknown `source_application_code`. This is intentional strict behavior; the model does not guess eligibility from address, name, capacity, or legacy result membership.

## 8. Recommendation for the Next Work Package

Primary recommendation: populate `app_v2.shelters.source_application_code` through a controlled importer/data-population follow-up, then rerun grouped parity with `--eligibility source-application-code`.

That package should answer:

- how grouped nearby parity changes after applying that rule
- whether source-code coverage is complete enough to make `source_application_code_v1` the normal grouped nearby eligibility mode
- whether any codes need product review before copying the legacy `skal_med` decision forward

Secondary recommendation: keep the current internal review mode available, but do not broaden it until source-code coverage exists and the strict eligibility mode has been measured.

## 9. Risks and Limitations

- The analysis covers six realistic coordinate samples, not full-country exhaustive parity.
- app_v2-only annotations rely on exact normalized address matching back to legacy `sheltersv2.address`; ambiguous or differently formatted addresses would remain unclassified.
- The analysis does not prove the right long-term shape for application-code semantics in app_v2.
- The legacy `skal_med` table may encode product choices that should be reviewed before copying into app_v2 unchanged.
- Ordering/spatial quality is not eliminated as a future concern; it is just not the dominant sampled blocker after grouped shape and capacity eligibility.
