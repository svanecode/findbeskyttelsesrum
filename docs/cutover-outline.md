# Cutover runbook (historical)

> **Superseded:** Use `docs/cutover-runbook.md` for current cutover operations and go/no-go.
>
> This document is kept for historical context and may contain stale assumptions (e.g. legacy nearby compare paths).

Brug dette dokument på cutover-dagen. Udfyld placeholders i starten af vinduet. Målgruppe: den der deployer og den der godkender go/no-go.

---

## 0. Roller og referencer (udfyld før vindue)

| Felt | Værdi |
|------|--------|
| **Ansvarlig deploy** | |
| **Go/no-go godkender** | |
| **Target-miljø** (prod / staging) | |
| **Deployment-kanal** (Vercel / andet) | |
| **Release commit / tag** | |
| **Forrige kendt gode deployment-id** (til rollback) | |
| **Supabase-projekt** (navn/ref, ingen secrets) | |

**Relateret:** `docs/manual-qa-checklist.md`, `docs/manual-qa-log-template.md`, `docs/release-readiness-status.md`.

---

## 1. Forudsætninger (alle skal være ja før cutover)

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` er kørt grønt på **den commit** der deployes.
- [ ] Miljøvariabler på target matcher repo-kontrakten (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-only nøgle til app_v2 — se `docs/app-v2-nearby-evaluation.md` § env).
- [ ] Supabase **produktion** har de migrationer denne build forventer (især app_v2 nearby RPC hvis nearby bruges — afstem med migrations i `supabase/migrations/` og eval-dokumentet).
- [ ] Manuel smoke på **preview/staging med samme env-profil som prod** er udført og logget (samme matrix som §4 nedenfor — kan være kortform hvis tidspres, men uden huller i §4.1).
- [ ] Rollback-målet er bekræftet: **hvilket forrige deployment** der promoveres ved fejl.

**Stop-signal:** Hvis et af punkterne mangler → **ingen cutover**; luk vinduet og planlæg på ny.

---

## 2. Cutover-flow (step-by-step)

1. **Freeze:** Ingen nye merges til release-branchen efter aftalt tidspunkt uden eksplicit go fra godkender.
2. **Deploy:** Promover den aftalte build til produktion (eller første trin i jeres pipeline).
3. **Vent** på at platform melder deployment healthy / ingen failed build.
4. **Kør post-deploy smoke** (§4) — ansvarlig deploy udfører; ved afvigelse → §3.
5. **Go/no-go:** Godkender bekræfter skriftligt (chat/ticket) at §4 er ok.
6. **Kommunikation:** Kort besked til team: cutover udført, tid (UTC+1), commit/deploy-id.

**Stop-signal under trin 2–4:** 5xx på forsiden, tom/fejlet sitemap, nearby der ikke loader med gyldige koordinater, eller åbenbar data-regression → **ikke** fortsæt til §5; gå til §3.

---

## 3. Rollback-flow

1. **Applikation:** Rul tilbage til **forrige kendt gode deployment** (§0) via jeres hosting — ingen ændring af database som standard-del af rollback.
2. **Verificér** forsiden og én `/beskyttelsesrum/[slug]` efter rollback.
3. **Data:** Følg `docs/cursor-master-brief.md` — **slet ikke** `public.sheltersv2` eller andet legacy rollback-net som panikreaktion.
4. **Log:** Kort incident: symptom, tid, antaget årsag, næste tekniske skridt før nyt cutover-forsøg.

**Stop-signal efter rollback:** Hvis rollback fejler → eskalér til platform/drift efter jeres playbook; stadig ingen destruktive DB-handlinger uden separat beslutning.

---

## 4. Post-deploy smoke (obligatorisk checklist)

Udfør mod **produktion** (eller det miljø I lige har cuttet til). Brug desktop + én mobil-check på forsiden og nearby.

### 4.1 HTTP og indhold

| # | Check | Forventet |
|---|--------|-------------|
| S1 | `GET /` | 200, søgning/adressefelt synligt, links til land/kommune/om-data virker |
| S2 | `GET /land` | 200, tal og navigation giver mening |
| S3 | `GET /kommune` | 200, liste over kommuner |
| S4 | `GET /kommune/kobenhavn` (eller kendt slug) | 200, lokalt indhold |
| S5 | `GET /beskyttelsesrum/<slug>` (aktiv slug fra land eller kommune) | 200, ikke 404 |
| S6 | `GET /om-data` | 200 |
| S7 | `GET /shelters/nearby?lat=55.6761&lng=12.5683` | 200, kort + resultater (app_v2 default uændret) |
| S9 | `GET /sitemap.xml` | 200, XML indeholder `/land`, mindst én `/beskyttelsesrum/` |
| S10 | `GET /robots.txt` | 200, peger på sitemap |
| S11 | `GET /opengraph-image` (eller platformens genererede OG-URL fra forsiden meta) | 200 billede / forventet adfærd fra Next |

### 4.2 Hvad der tæller som “go” fra smoke

- Ingen 5xx på S1–S11 der blokerer kerneflow.
- Nearby: uden ekstra parametre loader siden og viser kort + resultatliste.

### 4.3 Efter smoke samme dag

- [ ] Fuld manuel QA efter `docs/manual-qa-checklist.md` på target (eller planlagt indenfor 24 h — skriv i log hvis udskudt).
- [ ] Kort notat i `docs/manual-qa-log-template.md` eller tilsvarende ticket.

---

## 5. Efter cutover (ikke valgfrit, men kan være næste arbejdsdag)

- [ ] Fejlrate / 5xx i hosting-dashboard.
- [ ] Supabase usage inden for normale grænser.
- [ ] Opdatér `docs/release-readiness-status.md` hvis virkelighed afviger fra forventning.

---

## 6. Dette runbook erstatter ikke

Juridisk sign-off, ekstern brugerkommunikation, eller beslutning om at **pensionere** legacy nearby helt — det er separat produkt-/data-beslutning.
