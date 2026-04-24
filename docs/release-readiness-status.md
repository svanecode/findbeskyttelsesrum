# Release Readiness Status

Praktisk status for cutover-arbejde. Opdater efter target-QA og efter en eventuel senere cutover.

## Kort konklusion

Repoet er klar til en kontrolleret cutover-forberedelse, men **cutover er ikke udført**. Sprint 9a leverer en operator-venlig readiness package (runbook + sanity checks + opdaterede checklister). Næste reelle skridt er at køre checks mod preview/target-miljø og tage en go/no-go beslutning (Sprint 9b).

Bemærk: Den live public site kører stadig et gammelt Vercel snapshot med legacy dataflow (`public.sheltersv2`). Det legacy setup er rollback-nettet og må ikke røres som del af readiness.

## Leverancer i repoet (Sprints 4d, 6, 7, 8)

| Leverance | Hvor |
|-----------|------|
| Nearby: legacy path fjernet (Sprint 4d) | `/shelters/nearby` bruger grouped app_v2 |
| `/kort`: marker payload flyttet ud af RSC (Sprint 6) | `/api/country-shelters` + `/kort` |
| SEO + JSON-LD hardening (Sprint 7) | `src/lib/seo/*` + page metadata |
| Public UI copy + a11y polish (Sprint 8) | diverse `src/app/*` + components |
| Sitemap: alle aktive shelter-detaljer | `getAppV2SitemapShelters()` i `src/lib/supabase/app-v2-queries.ts`, kald fra `src/app/sitemap.ts` |

## Sprint 9a: Cutover readiness package (ikke cutover)

| Leverance | Status |
|-----------|--------|
| Operator runbook | `docs/cutover-runbook.md` |
| Read-only sanity script | `npm run read:app-v2-sanity` |
| First-load audit usage | `scripts/first-load-audit.mjs` + docs |
| Manual QA checklist opdateret | `docs/manual-qa-checklist.md` |
| Legacy cutover-outline markeret som superseded | `docs/cutover-outline.md` |

## Stadig før “vi cutter trafik” (mennesker + miljø)

| Område | Status |
|--------|--------|
| **Udført QA på target** | Skal køres og logges — checklisten ligger klar. |
| **Cutover-vindue** | Planlægning, roller, og “forrige gode deployment” udfyldes i runbook ved dagen. |
| **Prod Supabase vs. build** | Bekræft stadig migration/paritet på **den** database der peges på fra prod (operativt punkt i runbook §1). |
| **`/kort`** | Findes og loader markerdata separat via `/api/country-shelters` (Sprint 6). |

## Teknisk baseline (kør før cutover)

- `npx tsc --noEmit`, `npm run lint`, `npm run build` — kør efter hver meningsfuld ændring; se rapport i AD-slutnote.
- **Sitemap:** kræver runtime-adgang til Supabase som i dag (`force-dynamic`); på build uden DB verificeres struktur via kode + lokal/preview med `.env`.
- **OG:** verificér på kørende app at `og:image` i HTML peger på genereret route (ikke `/og-image.jpg`).

## Næste skridt

- Sprint 9b: kør readiness checks mod preview/prod-like env, udfør cutover efter go/no-go, og hold observation window med legacy rollback-net intakt.

## Nice-to-have (ikke readiness)

- JSON-LD på land/kommune, fælles layout-shell, udvidet E2E.
- Oprydning af forældede formuleringer i `docs/nearby-cutover-readiness.md` (default nearby = app_v2 i kode).

## Relaterede dokumenter

- `docs/cursor-master-brief.md`
- `docs/cutover-runbook.md` — **cutover runbook**
- `docs/cutover-outline.md` — historisk (superseded)
- `docs/manual-qa-checklist.md` — **udførbar QA**
- `docs/manual-qa-log-template.md`
- `docs/app-v2-nearby-evaluation.md`
