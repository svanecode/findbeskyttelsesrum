# Public Destination Surfaces

## Current status

The municipality index, municipality detail, shelter detail, and data pages form a **coherent public destination track** after a final cross-surface copy, hierarchy, and next-step pass:

- `/` frames address search as the normal entry and points clearly to kommune index, landskort (`/kort`), and Om data as the register destination track.
- `/kommune` is the municipality index with **aktive registreringer** labelling, aligned metadata, and explicit next steps back to forsiden and Om data.
- `/kommune/[slug]` gives local context with stat labels aligned to **aktive registreringer** / **registrerede pladser**, a short **map expectation** callout (liste/kort vs full app_v2 cutover), top links to Om data, and the existing map surface.
- `/beskyttelsesrum/[slug]` gives a single active app_v2 registration with aligned **registrerede pladser** copy in body and metadata, navigation order consistent with other surfaces (forside → kommuner → Om data), and a single cross-link block for next steps.
- `/kort` remains a secondary national map view; it is not a full register browser.
- `/om-data` explains the public data contract, uses the same vocabulary for examples, and ends with a **Næste skridt** block back into forsiden and kommuner.

**Note:** `/land` was removed as a product surface. Requests to `/land` should **301** to `/kommune` (see `next.config.js`).

These surfaces are part of the revamp build where app_v2 is the main public data track. Nearby retains its explicit revamp source contract: app_v2 is the default in this codebase, while legacy remains available through `source=legacy` as compare/fallback and as the Supabase rollback net.

## Final public-surface readiness snapshot

The central public hierarchy reads as one product path:

1. `/` remains the address-search entry point and distinguishes the normal nearby flow from the app_v2 destination pages.
2. `/kommune` is the municipality index and the stable route into local municipality pages.
3. `/kommune/[slug]` is the local destination page with aligned stats copy, expectation text for liste/kort, and metadata that describes liste and kort without implying a preparedness ranking.
4. `/beskyttelsesrum/[slug]` is the single-registration detail surface for active app_v2 rows, with metadata and UI copy aligned to **registrerede pladser**.
5. `/om-data` explains the public data contract and the boundary between app_v2 destination pages and the normal legacy nearby flow, with explicit handoff links back into the destination track.

## Public wording rules

Use these labels consistently:

- `aktive registreringer` means rows that are active in the current app_v2 data layer.
- `registreret kapacitet` or `registrerede pladser` means a register value, not confirmed access, readiness, or physical condition.
- `udvalgte eksempelregistreringer` means concrete entry points into shelter detail pages, not recommendations, rankings, or complete lists.
- `udvalgte lokale indgange` on municipality pages means a small capacity-sorted set of active app_v2 registrations that lead to detail pages, not a municipality browser.
- `regioner i datalaget` means the distribution of active app_v2 registrations by municipality region metadata, not a preparedness comparison between regions.
- `lokale tyngdepunkter i datalaget` means postal areas with the most active app_v2 registrations in that municipality, not a safety or preparedness ranking.
- nearby source language should distinguish app_v2 revamp mode from legacy compare/fallback mode.
- nearby preview language should say that address comparison uses street, house number, and postal code so city/bydel formatting does not look like a larger data difference.

Avoid wording that implies:

- a municipality is safer because it has more registrations
- a selected example is recommended or better
- a regional distribution is a preparedness ranking
- a postal area summary is a preparedness ranking
- registered capacity proves current usability
- legacy compare/fallback mode is the main app_v2 nearby path

## QA spot-check set

Representative public checks should include:

- `/kommune`
- `/kommune/kobenhavn`
- `/kommune/aarhus`
- `/kommune/lemvig`
- one shelter detail page reached from a municipality example (or sitemap)
- `/kort`
- `/om-data`
- `/sitemap.xml`
- `GET /land` → **301** til `/kommune`

For municipality detail checks, confirm that local overview stats, the expectation callout above liste/kort, and footer/top links to forsiden and Om data render as expected.

For final public-flow checks, include:

- frontpage -> `/kommune`
- `/kommune` -> `/kommune/[slug]`
- `/kommune/[slug]` -> one shelter detail page
- every public destination surface -> `/om-data`
- frontpage address search remains the normal nearby entry and uses the revamp nearby source contract

## Remaining gaps

The destination track is stronger, but not complete:

- There is no full national app_v2 shelter browser; `/kort` is a national map view, not a filterable register.
- **Sitemap:** `src/app/sitemap.ts` emits all **active** `app_v2` shelter detail URLs (`/beskyttelsesrum/[slug]`) with `lastModified` from `last_imported_at` / `last_seen_at` (see `getAppV2SitemapShelters()`). Kommune routes unchanged; shelter block fails soft (empty) if the query errors so the rest of the sitemap still returns.
- Nearby still needs final app_v2 Type-display work before the legacy compare/fallback path can be retired.
- The known nearby formatting edge case is now handled in shadow/preview comparison; remaining nearby differences should be treated as concrete review cases rather than assumed city/bydel noise.
- Municipality detail still combines local depth with the existing map surface; the on-page callout states that kort is not proof of full app_v2 cutover.
- Shelter detail pages only exist for active app_v2 registrations with valid slugs.

## Recommendation

Treat public surfaces as **release-coherent**: one vocabulary (aktive registreringer, registrerede pladser, eksempelregistreringer), one hierarchy (forside → kommune → detail → Om data; `/kort` og nearby som sekundære flader), and explicit expectation lines where liste/kort still carry legacy cartography.

The tiny public-facing nearby preview should (historical recommendation; the `appV2NearbyExperiment` query toggle was later removed from the app):

- have used an explicit opt-in such as `appV2NearbyExperiment=public-preview` when that flag still existed
- show a clearly labelled shadow comparison block
- use `source_application_code_v1` eligibility as the app_v2 variant
- use the hardened street/house/postal address comparison key
- link to `/om-data` for public data-context language
- avoid changing DAWA/search or expanding the preview
- be limited to learning whether public users can understand the app_v2 comparison, not proving full cutover readiness
