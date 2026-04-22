# Release Readiness Status

Praktisk snapshot efter **Work Package AD** (cutover-prep implementation). Opdater efter faktisk target-QA eller cutover.

## Kort konklusion

De fire tidligere **operative** blockers er nu **lukket i repoet**: runbook, logbar QA-skabelon, OG-hul lukket via **genereret** root Open Graph-billede, og **fuld** sitemap-dækning af aktive `/beskyttelsesrum/[slug]`. **Næste reelle skridt** er at **udføre og arkivere** manuel QA på **target-miljøet** (preview/prod) med `docs/manual-qa-checklist.md` — det kan ikke automatiseres herfra.

Destinationsspor og nearby-kontrakt er uændret i denne pakke (ingen default-nearby-ændring).

## Lukket i denne pakke (AD)

| Leverance | Hvor |
|-----------|------|
| Cutover + rollback + smoke + stop-signaler | `docs/cutover-outline.md` |
| Manuel QA-checkliste + log-skabelon | `docs/manual-qa-checklist.md`, `docs/manual-qa-log-template.md` |
| OG: ingen død `/og-image.jpg`-reference | `src/app/opengraph-image.tsx` + fjernet statiske `images` fra `src/app/layout.tsx` (Next tilføjer genereret OG-URL) |
| Sitemap: alle aktive shelter-detaljer | `getAppV2SitemapShelters()` i `src/lib/supabase/app-v2-queries.ts`, kald fra `src/app/sitemap.ts` |
| Public doc alignet med sitemap | `docs/public-destination-surfaces.md` (sitemap-bullet) |

## Stadig før “vi cutter trafik” (mennesker + miljø)

| Område | Status |
|--------|--------|
| **Udført QA på target** | Skal køres og logges — checklisten ligger klar. |
| **Cutover-vindue** | Planlægning, roller, og “forrige gode deployment” udfyldes i runbook ved dagen. |
| **Prod Supabase vs. build** | Bekræft stadig migration/paritet på **den** database der peges på fra prod (operativt punkt i runbook §1). |
| **Fælles nav/footer** | Uændret: ikke del af AD; stadig nice-to-have for visuel ensartethed. |
| **`/kort`** | Findes ikke; separat produktbeslutning. |

## Teknisk baseline (sidste verifikation i AD)

- `npx tsc --noEmit`, `npm run lint`, `npm run build` — kør efter hver meningsfuld ændring; se rapport i AD-slutnote.
- **Sitemap:** kræver runtime-adgang til Supabase som i dag (`force-dynamic`); på build uden DB verificeres struktur via kode + lokal/preview med `.env`.
- **OG:** verificér på kørende app at `og:image` i HTML peger på genereret route (ikke `/og-image.jpg`).

## Nice-to-have (ikke AD)

- JSON-LD på land/kommune, fælles layout-shell, udvidet E2E.
- Oprydning af forældede formuleringer i `docs/nearby-cutover-readiness.md` (default nearby = app_v2 i kode).

## Relaterede dokumenter

- `docs/cursor-master-brief.md`
- `docs/cutover-outline.md` — **cutover runbook**
- `docs/manual-qa-checklist.md` — **udførbar QA**
- `docs/manual-qa-log-template.md`
- `docs/public-destination-surfaces.md`
- `docs/app-v2-nearby-evaluation.md`
