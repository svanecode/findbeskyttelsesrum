# Public Destination Surfaces

## Current status

The country, municipality, municipality detail, shelter detail, and data pages now form a coherent public destination track:

- `/land` gives national context, summary counts, active-municipality coverage, regional structure, municipality entry points, and a small set of selected example registrations.
- `/kommune` gives the municipality index and explains active registration counts.
- `/kommune/[slug]` gives local context, municipality-level app_v2 stats, postal-area summaries, selected local entry points, and the existing map surface.
- `/beskyttelsesrum/[slug]` gives a single active app_v2 registration with source and update context.
- `/om-data` explains what the displayed data means and what it does not prove.

These surfaces are intentionally not a nearby cutover. The normal `/shelters/nearby` experience still uses the existing legacy runtime flow.

## Final public-surface readiness snapshot

The central public hierarchy is now coherent enough to support a next-phase experiment:

1. `/` remains the address-search entry point and clearly distinguishes normal nearby search from the app_v2 destination pages.
2. `/land` is the national destination page with summary counts, active municipality coverage, regional structure, municipality handoff, selected example registrations, and data-context links.
3. `/kommune` is the municipality index and the stable route from national overview to local municipality pages.
4. `/kommune/[slug]` is the local destination page with app_v2 local stats, postal-area summaries, selected local detail links, and an explicit note that the map still uses the existing register flow.
5. `/beskyttelsesrum/[slug]` is the single-registration detail surface for active app_v2 rows.
6. `/om-data` explains the public data contract and the boundary between app_v2 destination pages and the normal legacy nearby flow.

## Public wording rules

Use these labels consistently:

- `aktive registreringer` means rows that are active in the current app_v2 data layer.
- `registreret kapacitet` or `registrerede pladser` means a register value, not confirmed access, readiness, or physical condition.
- `udvalgte eksempelregistreringer` means concrete entry points into shelter detail pages, not recommendations, rankings, or complete lists.
- `udvalgte lokale indgange` on municipality pages means a small capacity-sorted set of active app_v2 registrations that lead to detail pages, not a municipality browser.
- `regioner i datalaget` means the distribution of active app_v2 registrations by municipality region metadata, not a preparedness comparison between regions.
- `lokale tyngdepunkter i datalaget` means postal areas with the most active app_v2 registrations in that municipality, not a safety or preparedness ranking.
- `mixed-source` municipality detail should be explained in plain Danish: app_v2 is used for municipality lookup, counts, and example registrations; the map still uses the existing register flow.

Avoid wording that implies:

- a municipality is safer because it has more registrations
- a selected example is recommended or better
- a regional distribution is a preparedness ranking
- a postal area summary is a preparedness ranking
- registered capacity proves current usability
- the normal nearby result page has already moved to app_v2

## QA spot-check set

Representative public checks should include:

- `/land`
- `/kommune`
- `/kommune/kobenhavn`
- `/kommune/aarhus`
- `/kommune/lemvig`
- one shelter detail page reached from a country or municipality example
- `/om-data`
- `/sitemap.xml`

For municipality detail checks, confirm that local overview stats, postal-area summaries, and selected local entry points render when data exists and that the page still clearly says the map is not an app_v2 cutover.

For country-page checks, confirm that national overview, regional structure, municipality entry points, and selected examples render when data exists and that `/land` still does not present itself as a complete national shelter browser.

For final public-flow checks, include:

- frontpage -> `/land`
- frontpage -> `/kommune`
- `/land` -> `/kommune`
- `/land` -> one shelter detail page
- `/kommune` -> `/kommune/[slug]`
- `/kommune/[slug]` -> one shelter detail page
- every public destination surface -> `/om-data`
- frontpage address search remains the normal nearby entry and is not app_v2 by default

## Remaining gaps

The destination track is stronger, but not complete:

- There is no full national app_v2 shelter browser; `/land` is a national destination and entry page, not a filterable register.
- Municipality detail still uses a mixed-source page composition.
- Municipality detail now has stronger local depth, but its selected local entry points are still a bounded capacity-sorted set, not a complete local browser.
- Shelter detail pages only exist for active app_v2 registrations with valid slugs.

## Recommendation

Country and municipality detail now form a stronger land -> kommune -> shelter destination hierarchy. The next product gap is a final cross-surface polish pass against representative production-like data, while the internal nearby trial should keep running separately until a public-facing nearby experiment is explicitly chosen.

After this final polish, the recommended next phase is a tiny public-facing nearby experiment behind explicit gating. It should:

- keep legacy nearby as the default result and map source
- require `appV2NearbyExperiment=public-preview` or equivalent explicit opt-in
- show grouped app_v2 nearby as a clearly labelled comparison or preview, not as the primary answer
- use `source_application_code_v1` eligibility as the app_v2 variant
- link to `/om-data` for public data-context language
- avoid replacing markers, DAWA/search, or the normal result list
- be limited to learning whether public users can understand the app_v2 comparison, not proving full cutover readiness
