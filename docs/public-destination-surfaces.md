# Public Destination Surfaces

## Current status

The country, municipality, municipality detail, shelter detail, and data pages now form a coherent public destination track:

- `/land` gives national context, summary counts, municipality entry points, and a small set of selected example registrations.
- `/kommune` gives the municipality index and explains active registration counts.
- `/kommune/[slug]` gives local context, selected example registrations, and the existing map surface.
- `/beskyttelsesrum/[slug]` gives a single active app_v2 registration with source and update context.
- `/om-data` explains what the displayed data means and what it does not prove.

These surfaces are intentionally not a nearby cutover. The normal `/shelters/nearby` experience still uses the existing legacy runtime flow.

## Public wording rules

Use these labels consistently:

- `aktive registreringer` means rows that are active in the current app_v2 data layer.
- `registreret kapacitet` or `registrerede pladser` means a register value, not confirmed access, readiness, or physical condition.
- `udvalgte eksempelregistreringer` means concrete entry points into shelter detail pages, not recommendations, rankings, or complete lists.
- `mixed-source` municipality detail should be explained in plain Danish: app_v2 is used for municipality lookup, counts, and example registrations; the map still uses the existing register flow.

Avoid wording that implies:

- a municipality is safer because it has more registrations
- a selected example is recommended or better
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

For municipality detail checks, confirm that example registrations render when data exists and that the page still clearly says the map is not an app_v2 cutover.

## Remaining gaps

The destination track is stronger, but not complete:

- There is no full national app_v2 shelter browser.
- Municipality detail still uses a mixed-source page composition.
- Example registrations are capacity-sorted entry points, not a product ranking.
- Shelter detail pages only exist for active app_v2 registrations with valid slugs.

## Recommendation

The public destination surfaces are now coherent enough for broader review. Before a public-facing nearby experiment, do one final representative content QA pass against production-like data and keep the internal nearby trial running separately.
