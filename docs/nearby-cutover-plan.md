# Nearby cutover plan

## 1. Executive summary

app_v2 nearby er tæt nok på legacy til en kontrolleret opt-in cutover, men ikke til et direkte swap. Broad parity i strict `source_application_code_v1` mode viser 234/240 shared top-10-adresser på 24 geografisk spredte samples, og de fleste afvigelser er top-10 grænseeffekter frem for manglende records eller forkert eligibility.

Anbefalingen er derfor feature flag gradual rollout i Sprint 4b: behold legacy som default, tilføj en app_v2 adapter bag `?source=app_v2`, og brug shadow comparison til at validere samme koordinater før default vendes.

## 2. Parity-status

Kommando:

```bash
npm run parity:nearby -- --sample-set=broad-mode --app-v2-shape grouped --eligibility source-application-code --json
```

Broad sample set: 24 samples fordelt på Hovedstadsområdet, Sjælland, Fyn, Østjylland, Vestjylland, Nordjylland og Sønderjylland.

Aggregate:

- Shared top-10 address keys: 234
- Legacy-only address keys: 6
- app_v2-only address keys: 6
- Average top-10 overlap: 9.75/10
- Best-case samples: 18 samples havde 10/10 overlap
- Worst-case samples: 6 samples havde 9/10 overlap
- Exact rank matches: 158/234 shared addresses
- Max absolute rank delta among shared addresses: 4

| Sample | Shared | Legacy-only | app_v2-only | Notes |
| --- | ---: | ---: | ---: | --- |
| København | 10/10 | 0 | 0 | - |
| Frederiksberg | 9/10 | 1 | 1 | legacy: Smallegade 45, 2000 Frederiksberg<br>app_v2: Hostrupsvej 24, 1950 Frederiksberg C |
| Ballerup | 10/10 | 0 | 0 | - |
| Hvidovre | 10/10 | 0 | 0 | - |
| Roskilde | 10/10 | 0 | 0 | - |
| Næstved | 10/10 | 0 | 0 | - |
| Slagelse | 10/10 | 0 | 0 | - |
| Helsingør | 10/10 | 0 | 0 | - |
| Odense | 10/10 | 0 | 0 | - |
| Svendborg | 10/10 | 0 | 0 | - |
| Nyborg | 9/10 | 1 | 1 | legacy: Svanedamsgade 2, 5800 Nyborg<br>app_v2: Helgetoftevej 1, 5800 Nyborg |
| Aarhus | 10/10 | 0 | 0 | - |
| Horsens | 10/10 | 0 | 0 | - |
| Vejle | 10/10 | 0 | 0 | - |
| Kolding | 10/10 | 0 | 0 | - |
| Esbjerg | 10/10 | 0 | 0 | - |
| Herning | 10/10 | 0 | 0 | - |
| Holstebro | 9/10 | 1 | 1 | legacy: Vestergade 7, 7500 Holstebro<br>app_v2: Østergade 5, 7500 Holstebro |
| Lemvig | 9/10 | 1 | 1 | legacy: Østergade 65, Nørlem, 7620 Lemvig<br>app_v2: Østergade 65, 7620 Lemvig |
| Aalborg | 10/10 | 0 | 0 | - |
| Hjørring | 10/10 | 0 | 0 | - |
| Frederikshavn | 9/10 | 1 | 1 | legacy: Rådhus Alle 100, 9900 Frederikshavn<br>app_v2: Havnepladsen 30, 9900 Frederikshavn |
| Sønderborg | 10/10 | 0 | 0 | - |
| Aabenraa | 9/10 | 1 | 1 | legacy: Dronning Margrethes Vej 6, 6200 Aabenraa<br>app_v2: Dronning Margrethes Vej 13, 6200 Aabenraa |

Mismatch classification:

| Sample | Direction | Address | Finding |
| --- | --- | --- | --- |
| Frederiksberg | legacy-only | Smallegade 45, 2000 Frederiksberg | Exists in app_v2, active, capacity 575, source code 433, eligible. Top-10 boundary/ranking difference, not missing data. |
| Frederiksberg | app_v2-only | Hostrupsvej 24, 1950 Frederiksberg C | Exists in legacy, active, capacity 200, anvendelse 321, `skal_med=true`. Top-10 boundary/ranking difference, not eligibility drift. |
| Nyborg | legacy-only | Svanedamsgade 2, 5800 Nyborg | Exists in app_v2, active, capacity 383, source code 421, eligible. Top-10 boundary/ranking difference. |
| Nyborg | app_v2-only | Helgetoftevej 1, 5800 Nyborg | Exists in legacy, active, capacity 65, anvendelse 449, `skal_med=true`. Top-10 boundary/ranking difference. |
| Holstebro | legacy-only | Vestergade 7, 7500 Holstebro | Exists in app_v2, active, capacity 230, source code 322, eligible. Top-10 boundary/ranking difference. |
| Holstebro | app_v2-only | Østergade 5, 7500 Holstebro | Exists in legacy, active, capacity 70, anvendelse 322, `skal_med=true`. Top-10 boundary/ranking difference. |
| Lemvig | legacy-only | Østergade 65, Nørlem, 7620 Lemvig | Same underlying shelter appears in app_v2 as Østergade 65, 7620 Lemvig. Address-normalization/locality mismatch. |
| Lemvig | app_v2-only | Østergade 65, 7620 Lemvig | Same underlying legacy row includes locality "Nørlem". Address-normalization mismatch, not missing data. |
| Frederikshavn | legacy-only | Rådhus Alle 100, 9900 Frederikshavn | Exists in app_v2, active, capacity 326, source code 321, eligible. Top-10 boundary/ranking difference. |
| Frederikshavn | app_v2-only | Havnepladsen 30, 9900 Frederikshavn | Exists in legacy, active, capacity 70, anvendelse 311, `skal_med=true`. Top-10 boundary/ranking difference. |
| Aabenraa | legacy-only | Dronning Margrethes Vej 6, 6200 Aabenraa | Exists in app_v2, active, capacity 485, source code 429, eligible. Top-10 boundary/ranking difference. |
| Aabenraa | app_v2-only | Dronning Margrethes Vej 13, 6200 Aabenraa | Exists in legacy, active, capacity 275, anvendelse 429, `skal_med=true`. Top-10 boundary/ranking difference. |

Interpretation: strict source-code mode has removed the earlier `skal_med` semantic gap as the dominant blocker. Remaining observed gaps are one address-normalization case and several boundary/ranking differences around rank 10.

## 3. UI field inventory

| Field used by `/shelters/nearby` UI | UI usage | Legacy RPC shape | app_v2 grouped helper shape | Mapping status |
| --- | --- | --- | --- | --- |
| `id` | React key, selected card, hovered card, marker/card sync | `id` per grouped legacy result | `groupKey`, `representativeShelter.id`, `shelters[].id` | Adapter should use `groupKey` as stable card id. Keep representative id only for detail links later. |
| `location.coordinates` | Map marker position, fit bounds, card click map centering, external map links | GeoJSON-like `{ type, coordinates: [lng, lat] }` | `latitude`, `longitude` | Adapter can synthesize `{ type: "Point", coordinates: [longitude, latitude] }`. |
| `vejnavn` / `husnummer` | Result card title | Split street and house number | `addressLine1` only | Do not split deterministically. Adapter can expose `vejnavn=addressLine1` and `husnummer=null`, or UI can render `addressLine1` directly for app_v2. |
| `postnummer` | Address subtitle | Postal code string | `postalCode` | Direct map. |
| `kommunekode` | Municipality display through `getKommunenavn(kommunekode, kommunekoder)` | Municipality code string | `municipality.code` | Direct map if adapter keeps legacy shape. Longer term, render `municipality.name` directly and stop loading `kommunekoder` for app_v2 mode. |
| `distance` | Distance pill and estimated travel times | RPC returns meters; client converts to km | `distanceMeters` | Adapter must set `distance = distanceMeters / 1000`. |
| `shelter_count` | Badge in card title | Group count | `shelterCount` | Direct map. |
| `total_capacity` | "Total kapacitet" card | Total grouped capacity | `totalCapacity` | Direct map. |
| `anvendelse` | "Type" card through `getAnvendelseskodeBeskrivelse` | Legacy application code | Not exposed on grouped result, but `representativeShelter.sourceApplicationCode` exists | Gap. Either extend app_v2 response with application-code label from `application_code_eligibility`, or omit Type in app_v2 mode. For visual parity, add label to app_v2 read/API output in Sprint 4b. |
| `address` | Shadow comparison and diagnostics; fallback address formatting in script-like debug UI | Full formatted address | `addressLine1`, `postalCode`, `city` | Compose in adapter as `${addressLine1}, ${postalCode} ${city}`. |
| `bygning_id` | Present in `Shelter` type, not visible in normal cards/map | Legacy building id | Not in nearby grouped helper | Not blocking for visible UI. Keep out of adapter unless future detail/exclusion behavior needs source references. |
| `shelter_capacity` | Present in type; normal grouped card uses `total_capacity` | Per-row capacity | `representativeShelter.capacity`; grouped total is `totalCapacity` | Not needed for grouped visible UI. |
| `created_at`, `deleted`, `last_checked` | Present in type; not used by visible nearby cards/map | Legacy metadata | Not exposed | Not blocking for visible UI. |

## 4. Blocking gaps

1. Legacy-shaped UI contract is still hard-coded in `client.tsx`.
   - Why blocking: direct swap would break map markers, card title fields, distance units, municipality display, and selected marker/card sync.
   - Proposed solution: Sprint 4b should add a narrow adapter from `AppV2GroupedNearbyShelter` to the existing `Shelter & { distance: number }` card shape, then call it only in opt-in app_v2 mode.

2. Type display (`anvendelse`) is not equivalent yet.
   - Why blocking: the current UI shows "Type" from legacy `anvendelseskoder.beskrivelse`. app_v2 grouped output only exposes `sourceApplicationCode` on the representative shelter, not a user-facing label.
   - Proposed solution: extend the app_v2 nearby API/helper response with `sourceApplicationCodeLabel` from `app_v2.application_code_eligibility`, or deliberately hide the Type card in app_v2 mode after product approval. For a visually identical cutover, add the label.

3. Address normalization can produce false mismatches.
   - Why blocking: Lemvig shows the same shelter as `Østergade 65, Nørlem, 7620 Lemvig` in legacy and `Østergade 65, 7620 Lemvig` in app_v2. This is not a missing shelter, but it can affect strict comparison and perceived address text.
   - Proposed solution: accept app_v2's cleaner address text for user display, but keep shadow comparison tolerant of locality-only differences.

4. Top-10 boundary/ranking differences remain.
   - Why blocking: five of six mismatches are legitimate eligible records on both sides, but one address around rank 10 is swapped.
   - Proposed solution: do not direct-swap silently. Roll out behind `?source=app_v2`, log/compare rank-boundary cases, and only flip default once observed production samples stay within the same tolerance.

5. Candidate limit is frequently hit in dense areas.
   - Why blocking: diagnostics often show `sourceReturnedRows=500`, so top-N quality can be sensitive to candidate-limit and post-RPC filtering/grouping.
   - Proposed solution: include candidate-limit sensitivity checks in Sprint 4b shadow/opt-in testing, at least for dense city-center samples.

## 5. Recommended cutover strategy

Recommended path: **b) Feature flag gradual rollout**.

Do not use direct swap yet. Parity is strong, but the UI still consumes legacy field names and one visible field (`Type`) lacks a clean app_v2 label. A feature-flagged app_v2 path lets us keep legacy as default while validating the adapter and field parity on real URLs.

Shadow comparison alone is useful but too passive for the next step because `/api/app-v2/nearby/shadow` and diagnostics already exist. The next useful PR should let reviewers and opt-in users exercise the actual app_v2-rendered UI without making it default for normal users.

Suggested rollout:

1. Sprint 4b: add app_v2 opt-in via `?source=app_v2` while legacy remains default.
2. Keep shadow comparison available for the same request so reviewers can compare app_v2-rendered UI against legacy.
3. Run opt-in review for dense, medium, and sparse areas for at least several days or one release cycle.
4. Flip default only after product approval of `Type` display behavior and rank-boundary tolerance.

## 6. Next concrete PR: Sprint 4b

1. Add a narrow app_v2-to-legacy nearby adapter for grouped results: map id, address, location, municipality, distance, count, capacity, and optional type label into the existing card/map shape.
2. Add `?source=app_v2` opt-in for `/shelters/nearby` while keeping legacy as default and preserving the current route/output for normal users.
3. Extend app_v2 nearby grouped response with a user-facing application-code label from `app_v2.application_code_eligibility`, or hide the Type card in app_v2 mode only if product approves that tradeoff.
4. Keep shadow comparison visible in development/review mode and include the rendered source (`legacy` vs `app_v2`) in diagnostics.
5. Add focused tests or script checks for the adapter using the 24 broad samples plus the six mismatch cases from this document.

## 7. Risks and open questions

- Product decision: must app_v2 preserve the "Type" card exactly, or may it be removed/hidden if no clean label is available?
- Ranking tolerance: is 9/10 overlap with rank-10 boundary swaps acceptable for opt-in and later default cutover?
- Address display: should app_v2's normalized address text be treated as canonical even when legacy included locality text such as "Nørlem"?
- Candidate-limit tuning: should dense city-center queries use a candidate limit above 500 before default cutover?
- Exclusions parity: diagnostics still note that legacy `public.excluded_shelters` address/bygning_id matching requires separate review against the active app_v2 exclusion model.
