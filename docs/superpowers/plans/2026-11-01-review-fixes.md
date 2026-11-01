# Rettelser fra reviewet 1. november 2026: implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Luk alle fund i `docs/qa/2026-11-01-full-review.md` med test, én commit pr. opgave, på branchen `claude/grundigt-review-f07u72`.

**Architecture:** Databaserettelser kommer som nye migrationer (anvendte migrationer redigeres aldrig) med pgTAP-test. Klientrettelser i service worker, `/naer-dig` og adressesøgning får unit-test i den eksisterende `tests/`-stil og e2e, hvor adfærden kun kan ses i browseren. Revisionscachen gøres testbar ved at injicere cachefunktionen.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Postgres (pgTAP), Python-importer (pytest, ruff, mypy), GitHub Actions, `node:test` via `tsx --test`, Playwright.

**Spec:** `docs/qa/2026-11-01-full-review.md`

## Global Constraints

- Læs `AGENTS.md`: Next.js 16 adskiller sig fra træningsdata. Slå op i `node_modules/next/dist/docs/` før brug af cache- og route-API'er.
- Nye migrationer hedder `supabase/migrations/20261101HHMMSS_<navn>.sql` i den rækkefølge, opgaverne står. Rediger aldrig en eksisterende migration.
- Alle nye SECURITY DEFINER-funktioner: `set search_path = ''`, `revoke all ... from public, anon, authenticated`, og kun de grants opgaven nævner.
- Offentlig dansk tekst følger `docs/qa/emergency-copy-standard.md`.
- Commit-beskeder på dansk som i `git log`, afsluttet med:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_015BCimC1SJNhetQapXKWgBc
  ```
- Før hver commit: `npm run lint && npm run typecheck && npm test` skal være grønne. Rører opgaven importeren: `cd tools/datafordeler-importer && uv run pytest -q && uv run ruff check . && uv run mypy --strict shelter_importer` (eller samme kommandoer i en venv, hvis `uv` mangler).
- pgTAP kører med `npm run test:db`, som kræver `supabase start` og docker. Kan docker ikke startes i miljøet, skrives testen alligevel. CI-jobbet "Frisk database og integritetsregler" kører den. Skriv i commit-beskeden, at den ikke er kørt lokalt.
- E2e i dette cloud-miljø: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run test:e2e:ui` (find den præcise binær med `ls /opt/pw-browsers`). Kør aldrig `playwright install`.
- Push kun til `claude/grundigt-review-f07u72`. Opret ingen PR.

## Review Focus

1. Offline uden net, efter at brugeren har søgt online flere steder: den gemte søgning skal stadig give resultater (Opgave 8).
2. Et rum, som ejeren har fået udelukket, og som senere forsvinder fra BBR: den gamle URL skal give 404, ikke 410 med adresse (Opgave 2).
3. Netfejl midt i en søgning (429, timeout) må aldrig vises som "ingen rum" (Opgave 9).
4. En import publiceret mens en side regenereres: siden må ikke cache data under en forkert revision i mere end revisionstjekkets levetid (Opgave 11).
5. Rollback af et fuldt datasæt (ca. 24 000 rækker) skal kunne løbe over 8 sekunder (Opgave 3).

---

### Opgave 1: Sikkerhedsopdatering af Next.js og tilgængelighedsfejlen, der blokerede Dependabot (H1)

PR #74 fejler, fordi `@axe-core/playwright` 4.14.0 finder `label-content-name-mismatch` på knappen "Vis på kort": `aria-label` er "Vis <adresse> på kort", som ikke indeholder den synlige tekst.

**Files:**
- Modify: `src/app/naer-dig/client.tsx:557-564`
- Modify: `e2e/reflow.spec.ts:73`, `e2e/failure-states.spec.ts:213,258`, `e2e/search-flow.spec.ts:99`
- Modify: `package.json`, `package-lock.json`
- Modify: `.github/workflows/application-quality.yml` (job "Kode, typer og sikkerhedsregler")

- [ ] **Step 1:** Opdater versioner: `next` og `eslint-config-next` til `^16.4.2`, `@axe-core/playwright` til `4.14.0`, `sharp` til `^0.35.5`, `postcss` og `overrides.next.postcss` til `8.5.30`. Kør `npm install`, derefter `npm audit --omit=dev`. Forventet: `found 0 vulnerabilities`. Rør ikke `@playwright/test` (den forinstallerede Chromium passer til den nuværende version).
- [ ] **Step 2:** Ret knappen: `aria-label={\`Vis på kort: ${getAddressLine(shelter)}\`}`. Den synlige tekst "Vis på kort" er nu starten af navnet.
- [ ] **Step 3:** Ret de fire e2e-selektorer fra `/^Vis .* på kort$/` til `/^Vis på kort: /`. `e2e/map-lifecycle.spec.ts:115` ("på kortet") gælder en anden knap og røres ikke.
- [ ] **Step 4:** Tilføj et trin efter `npm ci` i kvalitetsjobbet: `run: npm audit --omit=dev --audit-level=high`.
- [ ] **Step 5:** Kør `npm run lint && npm run typecheck && npm test`, derefter e2e UI-suiten (se Global Constraints). Forventet: grønt bortset fra den kendte `offline.spec.ts:94`, som Opgave 13 retter.
- [ ] **Step 6:** Commit "Next.js 16.4.2 og kortknappens navn starter med den synlige tekst".

### Opgave 2: 410-opslaget respekterer udelukkelser og rettelser (H2)

**Files:**
- Create: `supabase/migrations/20261101120000_retired_shelters_respect_exclusions.sql`
- Create: `supabase/tests/retired_shelter_exclusions.sql`

**Interfaces:**
- Produces: uændrede signaturer `app_v2.resolve_retired_shelter_v1(p_slug text)` og `app_v2.retired_shelter_path_hashes_v1()`.

- [ ] **Step 1: Skriv pgTAP-testen.** Opret en registrering, gør den `missing_from_source`, og tjek:
  - uden udelukkelse: `resolve_retired_shelter_v1(slug)` returnerer 1 række, og hashen af sluggen er i `retired_shelter_path_hashes_v1()`
  - med en `shelter_exclusions`-række, der matcher på shelter id: 0 rækker og ingen hash
  - med en udelukkelse, der kun matcher på normaliseret adresse: 0 rækker
  - med en `shelter_overrides`-række, der retter adressen: den rettede `address_line1` returneres

  Genbrug fixtures fra `supabase/tests/postal_areas_path_aliases.sql` og udelukkelsesfixtures fra `supabase/tests/` (grep `shelter_exclusions`).
- [ ] **Step 2:** Kør `npm run test:db`. Forventet: FAIL på udelukkelses- og rettelsestilfældene.
- [ ] **Step 3: Skriv migrationen.** `create or replace` begge funktioner. Brug præcis samme udelukkelsesprædikat som det offentlige view (læs den nyeste definition: `grep -l "shelter_exclusions" supabase/migrations/*` og tag den seneste, `20260928120200_pin_exclusion_identity.sql`). Er prædikatet allerede en funktion, så kald den. Ellers opret `app_v2.is_shelter_excluded_v1(p_shelter_id uuid) returns boolean` (stable, security definer, ingen grants ud over service_role) og brug den i begge funktioner. Adressefelterne tages via `coalesce(override, base)` som i viewet. Behold grants til anon, authenticated og service_role.
- [ ] **Step 4:** Kør `npm run test:db`. Forventet: PASS.
- [ ] **Step 5:** Commit "Fjernede registreringer viser ikke adresser, ejeren har fået udelukket".

### Opgave 3: Rollback kan løbe længere end 8 sekunder (M10)

Verificeret i Postgres 16: `set statement_timeout` på en funktion forlænger ikke en sessionsgrænse, der allerede kører. Rollback skal derfor kaldes fra en rolle uden 8-sekunders grænsen, dvs. service role, efter at serveren har tjekket ejer og aal2.

**Files:**
- Create: `supabase/migrations/20261101120100_rollback_as_owner_via_service_role.sql`
- Modify: `src/app/admin/drift/actions.ts`
- Modify: `supabase/tests/dataset_rollback.sql`

**Interfaces:**
- Produces: `app_v2.rollback_dataset_publication_as_owner_v1(p_publication_id uuid, p_actor_account_id uuid) returns uuid`, kun `grant execute ... to service_role`.
- Consumes: `requireModerator(true)` giver `profile.moderatorId` og `profile.role`. `createAppV2AdminClient()` fra `src/lib/supabase/app-v2.ts`.

- [ ] **Step 1: pgTAP.** I `dataset_rollback.sql`: kald den nye funktion med en ejers account id (lykkes, samme forventninger som den eksisterende test), med en moderators id (`throws_ok ... '42501'`), og med et ukendt id (`42501`). Tilføj `select ok(not has_function_privilege('authenticated', 'app_v2.rollback_dataset_publication_as_owner_v1(uuid, uuid)', 'execute'))`.
- [ ] **Step 2:** Kør `npm run test:db`. Forventet: FAIL (funktionen findes ikke).
- [ ] **Step 3: Migration.** Opret den nye funktion med hele kroppen fra `20260928120000_harden_dataset_rollback.sql:13-` men hvor `current_account_id := p_actor_account_id`, efterfulgt af det eksisterende ejertjek mod `app_v2.moderator_accounts`. Omskriv `rollback_dataset_publication_v1(uuid)` til en tynd wrapper, der slår `current_moderator_account_id_v1(true)` op og kalder den nye funktion, så eksisterende kald og test virker.
- [ ] **Step 4: Server action.** I `rollbackPublicationAction`: efter de eksisterende tjek kaldes `createAppV2AdminClient().schema("app_v2").rpc("rollback_dataset_publication_as_owner_v1", { p_publication_id: publicationId, p_actor_account_id: profile.moderatorId })`. Resten (fejlredirect, revalidering) er uændret.
- [ ] **Step 5:** Kør `npm run test:db`, `npm run typecheck`, `npm test`. Forventet: PASS.
- [ ] **Step 6:** Commit "Gendannelse kører med service role, så den ikke stoppes efter 8 sekunder".

### Opgave 4: Postnumre over kommunegrænser og importens afledte trin (M4, L)

**Files:**
- Create: `supabase/migrations/20261101120200_postal_area_codes_accumulate.sql`
- Modify: `tools/datafordeler-importer/shelter_importer/datafordeler.py:120-134,489-551`
- Modify: `tools/datafordeler-importer/shelter_importer/importer.py:245-260`
- Test: `tools/datafordeler-importer/tests/test_datafordeler.py`, `tests/test_importer.py`, `supabase/tests/postal_areas_path_aliases.sql`

**Interfaces:**
- Produces: `DatafordelerClient.postal_areas(snapshot_at: str, complete: set[str]) -> list[dict]` uændret signatur. Ny konstant `POSTAL_RECHECK_DAYS = 30` og `POSTAL_RECHECK_MAX_PAGES = 5`.
- Produces: importens summary-JSON får `"derived": {"postal_areas": "ok" | "failed", "path_aliases": "ok" | "failed"}`.

- [ ] **Step 1: pytest.** `test_postal_areas_rechecks_complete_postcodes_on_rotation`: med `complete={"6100"}` og en snapshot-dato, hvor `int("6100") % 30 == date.toordinal() % 30`, forespørges 6100 alligevel. På en anden dag springes den over. `test_postal_area_query_follows_pages`: en fake DAR med `hasNextPage` på to sider giver husnumre fra begge sider, højst `POSTAL_RECHECK_MAX_PAGES` sider.
- [ ] **Step 2: pytest.** `test_derived_refresh_failure_is_reported`: når `upsert_dar_postal_areas` kaster, er `summary["derived"]["postal_areas"] == "failed"`, og kørslen er stadig `succeeded`.
- [ ] **Step 3:** Kør pytest. Forventet: FAIL.
- [ ] **Step 4: Implementér.** Tilføj `$after: String` og `first: 100` med `pageInfo` i `DAR_POSTAL_HOUSE_QUERY` og følg cursoren op til `POSTAL_RECHECK_MAX_PAGES` sider. Spring et komplet postnummer over, medmindre `int(postnr) % POSTAL_RECHECK_DAYS == date.fromisoformat(snapshot_at[:10]).toordinal() % POSTAL_RECHECK_DAYS`. Registrér status for hvert afledt trin i summary.
- [ ] **Step 5: pgTAP.** I `postal_areas_path_aliases.sql`: et postnummer med DAR-koderne `{0101,0147}` og registreringer kun i `0101` har efter `refresh_postal_areas_from_registrations_v1()` stadig begge koder.
- [ ] **Step 6: Migration.** I `refresh_postal_areas_from_registrations_v1` ændres `set municipality_codes = excluded.municipality_codes` til den sorterede, distinkte forening af `area.municipality_codes` og `excluded.municipality_codes` (samme mønster som `20261006072458…sql:55-60`). Tilføj i `upsert_dar_postal_areas_v1` et tidligt `if p_rows is null then raise exception ... using errcode = '22023'`, og spring rækker med koordinater uden for Danmark over i stedet for at afbryde hele batchen. Brug `left join` til `app_v2.municipalities` i `refresh_postal_areas_from_registrations_v1`, så registreringer uden kommune stadig tæller med i positionen.
- [ ] **Step 7:** Kør pytest, ruff, mypy og `npm run test:db`. Forventet: PASS.
- [ ] **Step 8:** Commit "Postnumre over kommunegrænser samler koder fra begge sider".

### Opgave 5: Den læsbare sti bliver hos den registrering, der har den (L)

**Files:**
- Create: `supabase/migrations/20261101120300_stable_readable_paths.sql`
- Test: `supabase/tests/postal_areas_path_aliases.sql`

- [ ] **Step 1: pgTAP.** To registreringer på samme adresse, A (50 pladser) ejer den læsbare sti. Hæv B til 80 pladser og kør `refresh_shelter_path_aliases_v1()`. Forventet: stien peger stadig på A, og `shelter_readable_path_v1` for A returnerer den samme sti. Fjernes A fra den offentlige visning, overtager B stien efter næste refresh.
- [ ] **Step 2:** Kør. Forventet: FAIL.
- [ ] **Step 3: Migration.** I `shelter_readable_path_v1` (find nyeste definition med grep) sorteres `row_number()` efter `(alias ejes allerede af denne registrering) desc, capacity desc, id`. I `refresh_shelter_path_aliases_v1` opdateres `shelter_id` kun, når den nuværende ejer ikke længere er i `app_v2.shelter_public_v2`.
- [ ] **Step 4:** Kør. Forventet: PASS. Commit "Delte links til en læsbar sti skifter ikke registrering".

### Opgave 6: Alarmer, der når en person, og planlagte kørsler, der ikke stopper (M5, M9, L)

**Files:**
- Create: `scripts/monitor/raise-alert.sh`, `scripts/monitor/close-alert.sh`
- Modify: `.github/workflows/datafordeler-import.yml:205-245`, `.github/workflows/production-smoke.yml:50-110`
- Test: `tests/operational-scripts.test.ts`

**Interfaces:**
- Produces: `raise-alert.sh <label> <title> <message>` med miljøvariablerne `GH_TOKEN`, `OWNER`, `REPO`, `RUN_URL`. Nyt issue: tildelt `OWNER`, brødtekst starter med `@OWNER`. Åbent issue: påmindelse højst én gang pr. 24 timer, regnet fra seneste påmindelse eller fra issuets oprettelse, med `gh api --paginate`. `close-alert.sh <label> <message>`.

- [ ] **Step 1: Test.** I `operational-scripts.test.ts`: kør `raise-alert.sh` med en fake `gh` først i `PATH` (et lille shellscript, der logger argumenter og returnerer opsatte svar). Tjek: intet åbent issue giver `issue create ... --assignee owner`, et issue oprettet for 2 timer siden uden påmindelser giver kun `issue edit`, et issue oprettet for 25 timer siden giver `issue comment` med "Påmindelse", og at `api` kaldes med `--paginate`.
- [ ] **Step 2:** Kør `npm test`. Forventet: FAIL.
- [ ] **Step 3:** Skriv de to scripts ud fra logikken i `production-smoke.yml:57-77`, rettet som beskrevet under Interfaces.
- [ ] **Step 4: Import-workflow.** Fjern alarmtrinnene fra `import`-jobbet. Tilføj jobbet `alert` med `needs: [quality, import]`, `if: always() && github.event_name == 'schedule'`, `permissions: issues: write`. Det kalder `raise-alert.sh data-import-alert "Datafordeler-import kræver opmærksomhed" "Den planlagte import eller kontrollerne efter den fejlede. Se kørslen for at se, om datasættet blev publiceret: $RUN_URL"`, når `needs.quality.result` eller `needs.import.result` er `failure` eller `cancelled`, og ellers `close-alert.sh`.
- [ ] **Step 5: Smoke-workflow.** Erstat de indlejrede trin med de to scripts.
- [ ] **Step 6: Keepalive.** Tilføj i `production-smoke.yml` et trin, der kun kører på `schedule` og når `date -u +%H` er `03`. Det kalder `gh api -X PUT repos/$REPO/actions/workflows/datafordeler-import.yml/enable` og samme for `production-smoke.yml`. Giv jobbet `actions: write`. Kommentér, at det nulstiller GitHubs 60-dages inaktivitetsgrænse for planlagte workflows.
- [ ] **Step 7:** Kør `npm test`. Forventet: PASS. Commit "Importalarmer tildeles ejeren, og planlagte kørsler holdes aktive".

### Opgave 7: Støj fra fejlalarmen og samtykke for fejltælleren (M6, L4)

Kræver adgang til Vercel-loggen og udføres af controlleren selv, ikke af en subagent.

**Files:**
- Modify (afhænger af fund): kilden til de hyppigste klientfejl, `scripts/monitor/product-metrics-health.mjs:4`, `src/app/privatliv/page.tsx:104-119`
- Test: `tests/product-metrics.test.ts`, `tests/public-ui.test.ts`

- [ ] **Step 1:** Hent `[CLIENT_ERROR]`-linjer fra Vercel runtime-loggen for 13. til 25. oktober (Vercel MCP `get_runtime_logs`). Gruppér efter `message`.
- [ ] **Step 2:** Er én fejl dominerende og reel: skriv en test, der genskaber den, og ret den. Er det støj (browserudvidelser, `ResizeObserver loop`, afbrudte anmodninger): filtrér den i `parseAndSanitizeClientErrorReport` med en test. Ændr kun grænsen på 25, hvis begge dele er udelukket, og skriv begrundelsen i scriptet.
- [ ] **Step 3:** `/privatliv`: flyt tælleren `client_error` til afsnittet om fejllogning under legitim interesse (den er en forudsætning for driftsalarmen og må ikke afhænge af samtykke). Opdatér "Senest opdateret" og den tilhørende assertion i `tests/public-ui.test.ts`.
- [ ] **Step 4:** Kør `npm test`. Commit "Fejltælleren er beskrevet under legitim interesse, og <fund> giver ikke længere falske alarmer".

### Opgave 8: Offline-kopien holder (M1, M3)

**Files:**
- Modify: `public/offline-sw.js`, `src/app/naer-dig/client.tsx:124-149`
- Test: `tests/offline-sw.test.ts`, `tests/nearby.test.ts` (eller en ny `tests/nearby-offline.test.ts`)

**Interfaces:**
- Produces: ny cache `${version}-saved` i service workeren. `saveUrls` lægger alt, beskeden `save-offline-copy` sender, i den cache. Den trimmes aldrig, og en ny gemning erstatter hele indholdet. `networkFirst` og `cacheFirst` slår op i den almindelige cache først og derefter i den gemte. `activate` beholder den gemte cache.
- Produces: `fetchNearbyFromTiles` accepterer blandede revisioner, når mindst én flise kom fra offline-cachen (`cachedAt.length > 0`) og genhentningen af den nyeste revision fejler eller stadig er blandet. Så rangeres de oprindelige fliser, og `savedAt` sættes.

- [ ] **Step 1: SW-test.** I `offline-sw.test.ts`: gem en kopi med 9 fliser og `/naer-dig`, hent derefter 60 andre fliser og 30 sider via fetch-handleren. Forventet: alle 9 gemte fliser og `/naer-dig` kan stadig besvares offline.
- [ ] **Step 2: Klienttest.** Fliser fra offline-cachen med revisionerne `p:7` og `p:8`, og en fejlende pinned URL: resultatet er ikke `null`, `savedAt` er sat, og rækkefølgen er den samme som `rankNearbyGroupsFromTiles` giver for de samme fliser. Er `fetchNearbyFromTiles` ikke eksporteret, så flyt den til `src/lib/nearby/fetch-nearby-from-tiles.ts` med `fetch` som parameter og test den der.
- [ ] **Step 3:** Kør `npm test`. Forventet: FAIL.
- [ ] **Step 4:** Implementér som beskrevet under Interfaces. Tjek at `rankNearbyGroupsFromTiles` ikke selv afviser blandede revisioner. Gør den det, så tilføj et options-flag `allowMixedRevisions`.
- [ ] **Step 5:** Kør `npm test` og e2e `offline.spec.ts`. Forventet: PASS.
- [ ] **Step 6:** Commit "Den gemte offlinekopi overlever almindelig brug og nye dataversioner".

### Opgave 9: En fejlet udvidet søgning vises som fejl, ikke som "ingen rum" (M2)

**Files:**
- Modify: `src/app/naer-dig/client.tsx:278-286`
- Test: `e2e/failure-states.spec.ts`

- [ ] **Step 1: E2e.** Ny test i `failure-states.spec.ts`: rut POST `/api/app-v2/nearby/grouped` til at svare `[]` for 2 km-søgningen og 429 for 100 km-søgningen (skeln på `radius` i body). Forventet: teksten "Ingen registreringer inden for 100 km" er ikke synlig, og der vises en `alert` med en prøv-igen-knap.
- [ ] **Step 2:** Kør. Forventet: FAIL.
- [ ] **Step 3:** Fjern `.catch(() => [])` på den udvidede søgning, så fejlen går til den eksisterende `catch`, der viser `getNearbyLoadErrorMessage`.
- [ ] **Step 4:** Kør. Forventet: PASS. Commit "En fejlet søgning i 100 km vises som fejl".

### Opgave 10: Adressesøgningens spinner og Enter på forældet tekst (L)

**Files:**
- Modify: `src/components/AddressSearch.tsx:255-283,337-379`
- Test: `e2e/search-flow.spec.ts`

- [ ] **Step 1: E2e.** (a) Skriv "Vestergade 1", vent på forslag, tilføj "0" og slet det igen, mens anmodningen er forsinket (rut Adressevælger med 500 ms forsinkelse). Forventet: indlæsningsindikatoren forsvinder. (b) Tryk Enter på "Vestergade 1", og skriv "0" før svaret kommer. Forventet: feltet indeholder "Vestergade 10", og der navigeres ikke.
- [ ] **Step 2:** Kør. Forventet: FAIL.
- [ ] **Step 3:** I effekten: `setIsLoading(false)` i det tidlige `return`, når teksten matcher seneste resultater. I `runSearch`: opret en `AbortController` i `abortControllerRef`, giv `signal` til `searchAddresses`, og afbryd uden handling, hvis feltets aktuelle tekst (via en ref) ikke længere er `trimmed` efter hvert `await`.
- [ ] **Step 4:** Kør. Forventet: PASS. Commit "Adressesøgningen hænger ikke og handler ikke på gammel tekst".

### Opgave 11: Revisionscachen er testet og koster mindre (M7, M8, L)

**Files:**
- Modify: `src/lib/supabase/queries/public-data-cache.ts`
- Modify: `src/lib/supabase/queries/shelters.ts:110,153,174,181,408,415,430,434`, `src/lib/supabase/queries/municipalities.ts:52`
- Test: `tests/public-data-cache.test.ts` (ny)

**Interfaces:**
- Produces: `createRevisionCache(deps: { cache: typeof unstable_cache; readRevisionKey: () => Promise<string>; enabled: () => boolean }) => { cachedPerRevision, readForRevision }`. Modulet eksporterer fortsat `cachedPerRevision` og `readForRevision` som i dag, bygget med de rigtige afhængigheder.
- Produces: `isPlausiblePublicSlug(slug: string): boolean` i `src/lib/shelter-public-url.ts`: `true` for 1 til 240 tegn, der matcher `/^[\p{Ll}\p{N}-]+$/u`.

- [ ] **Step 1: Test.** Med en fake `cache`, der husker på nøgle: samme revision giver ét databasekald for to læsninger. Ny revision giver et nyt kald. Nøglen indeholder revisionen. En læsning, der kaster, caches ikke. `enabled() === false` springer cachen over.
- [ ] **Step 2: Test.** `isPlausiblePublicSlug`: `registrering-1a2b`, `vestergade-12-aarhus`, `ærøskøbing-1` er gyldige. `""`, 241 tegn, `../x`, `A B`, `%00` er ugyldige.
- [ ] **Step 3:** Kør `npm test`. Forventet: FAIL.
- [ ] **Step 4:** Implementér `createRevisionCache` og `isPlausiblePublicSlug`. Sæt `revisionCheckSeconds = 3600`, så sidernes ISR ikke trækkes ned til 5 minutter (Next 16 bruger den laveste revalidate), og opdatér kommentaren: en import ses senest efter cirka 2 timer, en moderering med det samme via tag. Kald `isPlausiblePublicSlug` før de cachede slug-opslag og returnér `null` uden databasekald, når den er falsk.
- [ ] **Step 5:** I fallback-stierne (`shelters.ts:174,181,415,434`): kast en fejl, når RPC'en mangler (`PGRST202`), i stedet for at returnere `null`, så det ikke caches i 24 timer.
- [ ] **Step 6:** Kør `npm test`, `npm run typecheck`. Forventet: PASS. Commit "Revisionscachen er testet, og sider genopbygges ikke hvert 5. minut".

### Opgave 12: Ruter, der ikke kan bruges til at omgå CDN'en (L)

**Files:**
- Modify: `src/app/api/app-v2/postal-areas/route.ts`, `src/lib/nearby/tiles.ts:66-70`, `src/app/sitemap.ts`
- Test: `tests/postal-areas.test.ts`, `tests/nearby-tiles.test.ts`

- [ ] **Step 1: Test.** `GET /api/app-v2/postal-areas?r=1` giver 400 med `error.code === "unexpected_query"` uden databasekald (samme mønster som `src/app/api/health/route.ts:53-57`). `parseTileKey("05_10")`, `parseTileKey("5_010")` og `parseTileKey("-0_5")` giver `null`, mens `parseTileKey(tileKeyFor(56, 10))` stadig virker.
- [ ] **Step 2:** Kør. Forventet: FAIL.
- [ ] **Step 3:** Implementér. I `parseTileKey`: afvis, når `String(Number(match[n])) !== match[n]`. Sæt `revalidate = 86400` i `sitemap.ts` (sitemap'en læser hele tabellen to gange pr. genopbygning).
- [ ] **Step 4:** Kør. Forventet: PASS. Commit "Postnummerlisten og fliserne har kun én URL pr. indhold".

### Opgave 13: Dokumentation, konfiguration og e2e-oprydning (L)

**Files:**
- Modify: `supabase/config.toml:31`, `e2e/offline.spec.ts`, `docs/qa/free-observability.md:19-20`, `docs/operations/external-dependencies.md:10-12`, `docs/data/schema.md:35`, `docs/data/import-flow.md`, `docs/qa/2026-09-26-full-review.md:92`, `docs/improvement-plan.md`, `docs/qa/2026-11-01-full-review.md`, `src/app/privatliv/page.tsx`

- [ ] **Step 1:** `major_version = 17` i `supabase/config.toml`. Kør `npm run test:db`, hvis docker virker.
- [ ] **Step 2:** Giv testen ved `e2e/offline.spec.ts:94` tagget `{ tag: "@full-stack" }`. Kør UI-suiten. Forventet: 0 fejl.
- [ ] **Step 3:** Ret de dokumentationspunkter, reviewet lister under "Dokumentation, der ikke passer". Tilføj Supabase Free-kvoterne (5 GB egress, 500 MB database) og UptimeRobot som ejeropgave i `external-dependencies.md`. Beskriv `postal_areas`, `shelter_path_aliases` og de afledte trin efter publicering i `docs/data/`.
- [ ] **Step 4:** `/privatliv`: én sætning om, at teksten i kommunesøgningen står i adressen og derfor i hostingudbyderens tekniske logs. Opdatér den tilhørende test.
- [ ] **Step 5:** Tilføj en opfølgningstabel nederst i `docs/qa/2026-11-01-full-review.md` (samme form som i reviewet 26. september) med status for hvert fund. Opdatér `docs/improvement-plan.md` med en kort række for #53 til #69 og dette arbejde.
- [ ] **Step 6:** Kør `npm run lint && npm test`. Commit "Dokumentation og opsætning følger koden igen".

## Bevidst udeladt

- **M11 (build kræver Supabase).** Ejeren valgte 26. september at beholde det. En build-fallback ville kunne servere tomme kommune- og kortsider. Kræver en ny beslutning, før det ændres.
- **Kildetekst-testene** i `tests/public-ui.test.ts` og `security-migration.test.ts`. En omskrivning er et selvstændigt projekt og retter ingen fejl.
- **Playwright-versionen mod Chromium i cloud-miljøet.** Det er miljøet, ikke repoet. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` dækker det.

## Ejerhandlinger efter merge

- Luk Dependabot-PR #74, eller lad Dependabot rebase den, når Opgave 1 er flettet.
- Bekræft at UptimeRobot overvåger `/api/health`.
- Kør en rollback på en branch-database én gang for at se Opgave 3 virke med fuld datamængde.
