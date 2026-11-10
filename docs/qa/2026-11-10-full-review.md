# Grundigt review: findbeskyttelsesrum (main @ 370addc, 2026-11-10)

Kun læsning. Ingen kode er ændret. Metode: projektets egne tjek er kørt lokalt, produktionen er undersøgt (`/api/health`, Vercels fejloversigt, Supabase-logs, `pg_stat_statements`, advisors), GitHub Actions, issues og åbne PR'er er læst, migrationsloggen er sammenlignet med Supabase, og fire uafhængige gennemgange (sikkerhed, database og import, frontend og caching, test, drift og dokumentation) er kørt. De vigtigste fund er efterprøvet i koden eller i produktionsdatabasen bagefter. Fokus er rettelserne fra reviewet 1. november (`80d07c0..370addc`, #80) og driften i de 8 døgn siden.

## Konklusion

Projektet er i god stand, og rettelserne fra 1. november holder med én undtagelse. Offline-rettelsen (M3) har indført en regression: "Opdatér" på forsiden sletter de gemte kortfliser, mens siden stadig siger "Gemt". Derudover viser produktionen to ting, som repoet ikke selv afslører. Databasen rammer anon-rollens grænse på 3 sekunder cirka 22 gange i døgnet, fordi alle offentlige læsninger scanner hele tabellen. Og produktionsalarmen støjer stadig (#82 den 8. november), fordi fejlede GPS-opslag og fejl fra browserudvidelser tælles som tekniske fejl. Ingen sikkerhedsfund er høje.

## Hvad er verificeret

| Tjek | Resultat |
| --- | --- |
| `npm run lint`, `npm run typecheck` | rent |
| `npm test` | 214/214 bestået |
| Importer `pytest`, `ruff`, `mypy` | 45 bestået, rent |
| `npm audit --omit=dev` | 0 fund |
| `npm audit` (med dev) | 13 fund (11 moderate, 2 høje: `brace-expansion`, `js-yaml`), kun i udviklingsværktøjer |
| Playwright | ikke kørt lokalt (kendt forskel mellem Playwright og den forinstallerede Chromium). Seneste CI-kørsel med browsertest er PR #83, som er rød (se M3) |
| Live `/api/health` | 200, 10 090 registreringer, data 6,8 timer gamle, deployet SHA = main HEAD, heartbeat 247 minutter gammel (grænse 480) |
| Migrationer i git mod produktion | 65 = 65, samme versionsnumre |
| Import | 14 af 14 kørsler lykkedes de seneste 14 dage |
| Produktionskontrol | 1 fejl på 8 døgn (#82, 8. november kl. 15:05 UTC), lukkede sig selv efter 4,5 time |
| Supabase API-kald | ca. 40 400 på 24 timer. Mod de 148 000 pr. døgn fra oktober er det 73 % færre. Målet på 80 % (højst 29 600) er ikke nået |
| Database | 215 MB af Free-planens 500 MB (43 %) |
| Supabase advisors | Ingen nye fund fra #80. Én advarsel er ikke nævnt i dokumentationen: beskyttelse mod lækkede adgangskoder er slået fra |

## Høj

### H1. "Opdatér" på forsiden sletter de gemte kortfliser, men siden siger stadig "Gemt"
Regression fra M3-rettelsen 1. november. Forsiden viser `OfflineCopyControl` uden `extraUrls` (`src/app/page.tsx:51`). Service workeren sletter alt i `offline-v1-saved`, som den nye gemning ikke bad om, altså de 9 fliser fra den gemte søgning (`public/offline-sw.js:175-180`). `saveOfflineCopy` beholder alligevel den gamle søgning i posten (`src/lib/offline-copy.ts:139-140`).

Scenarie: brugeren gemmer en søgning på `/naer-dig` og trykker senere "Opdatér" på forsiden. Der står fortsat "Gemt for <adresse>". Uden net svarer `/naer-dig` "ingen gemte data for dette område". For en beredskabstjeneste er det den forkerte fejl på det forkerte tidspunkt. Bekræftet ved kodelæsning, ikke afprøvet i en browser.

Rettelse: tag fliserne for `previous.search` med i URL-listen, når `extraUrls` mangler, eller lad workeren kun slette fliser, når gemningen selv indeholder fliser. Tilføj en test for netop den rækkefølge.

## Mellem

### M1. Offentlige læsninger scanner hele tabellen og rammer 3 sekunders grænsen cirka 22 gange i døgnet
Målt i produktionen 10. november:

| Måling | Værdi |
| --- | --- |
| "canceling statement due to statement timeout" i Postgres-loggen, 24 timer | 22 |
| HTTP 5xx fra Supabase API, 24 timer | 22 af ca. 40 400 kald |
| Heraf `get_nearby_shelters_public_v2` | 21 |
| Kald til `get_nearby_shelters_public_v2`, 24 timer | 9 884 |
| Gennemsnitstid for samme kald (`pg_stat_statements` siden 19. august) | 332 ms, maks. 2 993 ms |
| Ét kald for København med 20 km radius (`EXPLAIN ANALYZE`) | 421 ms, 10 574 buffere |
| `shelter_public_v2` filtreret på postnummer 8210 | 46 ms, sekventiel scanning af 23 644 rækker, 12 268 opslag i `shelter_overrides` |

Årsag: `shelter_public_v2` filtrerer på `COALESCE(override.postal_code, shelter.postal_code)` og slår rettelser op pr. række, så intet indeks kan bruges. Kaldet til `get_nearby_shelters_public_v2` kommer ikke længere fra søgningen (den bruger fliser), men fra "andre registreringer" på detaljesiden (`src/lib/supabase/queries/shelters.ts:255`). Resultatet caches pr. dataversion, og versionen skifter ved hver daglig import. Derfor genberegnes de tre nærmeste for alle ca. 10 000 detaljesider hvert døgn, når crawlere besøger dem. 9 884 kald gange 0,33 sekunder er cirka 54 minutters databasetid i døgnet for en liste på tre links.

Følger: en timeout i "andre registreringer" fanges (`src/app/beskyttelsesrum/[slug]/page.tsx:198-205`), så siden vises uden listen og caches sådan i op til en time. De øvrige opslag fanges ikke. Vercels fejloversigt har en gruppe med 62 fejlede sidevisninger på `/beskyttelsesrum/[slug]` og `/kommune/[slug]` (senest 10. november, oversigten oplyser ikke tallet pr. uge) med blandt andet "Could not load public app_v2 shelters in 3250: canceling statement due to statement timeout" og 9 gange "Could not read owners of plain readable paths" den 7. november. De sidste kommer fra `public_plain_path_owner_ids_v1`, som blev tilføjet i #80.

Rettelse, i prioriteret rækkefølge:
1. Beregn "andre registreringer" uden databasekald pr. side, for eksempel fra de samme fliser som søgningen, eller cache dem uafhængigt af dataversionen med lang levetid.
2. Gør de offentlige opslag indekserbare: filtrér på basistabellens `postal_code` og `slug` først og læg rettelserne på bagefter, eller byg en lille materialiseret offentlig tabel ved publicering og moderering.
3. `resolvePublicShelterSlugAlias` smider fejlbeskeden væk (`shelters.ts:192`), så loggen kun siger "Could not resolve public app_v2 shelter alias". Tag `error.message` med, som de andre opslag gør.

Det her er også den nærmeste vej til målet på 80 % færre API-kald: `shelter_public_v2` (16 261) og `get_nearby_shelters_public_v2` (9 884) er tilsammen 65 % af døgnets kald.

### M2. Produktionsalarmen støjer stadig (#82)
Den 8. november kl. 15:05 UTC fejlede kontrollen med "41 tekniske fejl er registreret på 2 timer; grænsen er 25". Tælleren viser 41 `client_error` i timen fra kl. 14 UTC den 8. november og 40 i timen fra kl. 9 UTC den 5. november. Den sidste gav ingen alarm, fordi ingen kontrol faldt i vinduet. Vercels logs for selve timerne er ikke længere tilgængelige, men fejloversigtens eksempler viser to kilder, som filteret fra 1. november ikke fanger:

- **Fejlede GPS-opslag rapporteres som tekniske fejl.** `src/components/AddressSearch.tsx:333-337` kalder `handleError` for alle andre udfald end "afvist", altså også timeout og "position ikke tilgængelig". De er allerede talt som `geolocation_error`. Eksempel fra loggen: "Failed to get location" med `component: 'useErrorHandler'`.
- **Fejl fra browserudvidelser som afviste promises.** `isForeignBrowserNoise` (`src/lib/errors/sanitize-client-error.ts:86-92`) afviser kun `window-error` uden filnavn. Eksempel fra 8. november kl. 14:13 UTC: `TypeError … (reading 'M_ID')` med `type: 'unhandledrejection'` og en stak, der kun indeholder `chrome-extension://…`.

Rettelse: rapportér ikke GPS-udfald som `client_error`, og afvis rapporter, hvor alle stakrammer peger på `chrome-extension://`, `moz-extension://` eller `safari-web-extension://`. Grænsen på 25 kan blive stående. Forbehold: fordelingen mellem de to kilder i de 41 fejl kan ikke opgøres, fordi loggen er udløbet.

### M3. Dependabot sidder fast igen (PR #83)
PR #83 (9. november, 15 opdateringer, blandt andet `next` 16.4.3 til 16.4.5, `react` 19.3.1 og `@supabase/supabase-js` 2.119.0) er rød. `e2e/accessibility.spec.ts:43` fejler i Firefox i alle tre forsøg med "frame.evaluate: Page crashed" inde i axe. Det ligner Playwright eller Firefox, ikke sitet. `e2e/search-flow.spec.ts:421` var desuden ustabil i Chromium i samme kørsel. Det er samme mønster som #74: én gruppe (`.github/dependabot.yml:9-13`) samler testværktøjer og `next`, så et testværktøj blokerer en sikkerhedsrettelse. Lige nu er der ingen kendte sårbarheder (`npm audit --omit=dev` er ren), men `next` er allerede på 16.4.6.

Rettelse: del gruppen i produktion og udvikling, og giv Playwright og axe deres egen gruppe. Find årsagen til Firefox-nedbruddet, før Playwright løftes. De fire major-PR'er fra 25. september (#45 til #48) er stadig åbne og udskudt som DEPS-01. #78 (actions) og #79 (importer) er grønne og kan flettes.

### M4. En levende registrering kan svare 410 "findes ikke længere"
Begge 410-funktioner tager alle stier fra `shelter_path_aliases` for en fjernet registrering uden at tjekke, om stien nu er den kanoniske sti for en offentlig registrering (`supabase/migrations/20261101120000_retired_shelters_respect_exclusions.sql:68-76,144-150`), og `src/proxy.ts:19-37` tjekker 410-listen før siden. Scenarie: A og B deler adresse, A ejer den rene sti og forsvinder fra BBR, og opdateringen af stihistorikken fejler den dag. Stien står på 410-listen, mens appen giver B samme sti. Besøgende får 410, indtil en senere opdatering lykkes, og et fejlet afledt trin giver ingen alarm.

Efterprøvet i produktionen 10. november: 0 stier er i den tilstand, og alle 10 090 offentlige stier har et åbent alias. Fundet er altså latent. Rettelse: udelad stier, der findes i `shelter_readable_path_v1`, i begge funktioner.

### M5. En udelukket adresses koordinat kan blive stående som postnummerets position
Når et postnummers eneste offentlige registrering udelukkes, sætter `refresh_postal_areas_from_registrations_v1` kun `has_registrations = false` og beholder positionen (`supabase/migrations/20261101120200_postal_area_codes_accumulate.sql:66-73`). Importeren regner postnummeret som komplet og slår det ikke op i DAR igen. Koordinatet kan læses af anon via `postal_area_public_v1` og `/api/app-v2/postal-areas`. Opdateringen kører desuden kun efter import, ikke efter en moderering.

Efterprøvet i produktionen: 0 postnumre har `position_source = 'registrations'` og `has_registrations = false` (572 med registreringer, 517 med DAR-position). Latent, men det er netop udelukkelser, sitet lover ejerne. Rettelse: nulstil position og kilde, når et postnummer mister sine registreringer, så DAR udfylder det igen.

### M6. Udelukkelser når ikke alle kopier "med det samme"
ISR-siderne ryddes korrekt ved moderering. Det gør disse ikke:
- 410-siden caches med `s-maxage=3600, stale-while-revalidate=86400` (`src/app/beskyttelsesrum/[slug]/fjernet/route.ts:51`), så adressen kan vises fra CDN'en i op til en time plus ét forældet svar inden for et døgn.
- Versionslåste fliser har `s-maxage=86400` (`src/app/api/app-v2/nearby/tiles/[tile]/[[...revision]]/route.ts:18`).
- Gemte offline-fliser opdateres aldrig, før brugeren selv trykker "Opdatér".

Rettelse: kort `s-maxage` og ingen SWR på 410-siden, højst en time på låste fliser, og ret formuleringen i dokumentationen.

### M7. "Gemt. Siden virker nu også uden net." holder ikke i tyndt dækkede områder
`rankNearbyGroupsFromTiles` returnerer `null`, når den tiende adresse ligger uden for de 9 flisers garanterede dækning (`src/lib/nearby/tiles.ts:194-200`). Offline falder siden så tilbage til et netværkskald, som fejler (`src/app/naer-dig/client.tsx:228-229`). På for eksempel Læsø eller Anholt gemmer brugeren uden fejl og får offline "ingen gemte data". Kodevejen er bekræftet. Hvor mange adresser det rammer, er ikke målt. Rettelse: vis de rangerede fliseresultater offline med en notits om, at listen kan være ufuldstændig.

### M8. Tilbage fra resultater: et ekstra mellemrum giver "ingen resultater" for en gyldig adresse
Gendannelsen sætter `suggestionsQuery` til etiketten, mens forslagslisten er tom (`src/components/AddressSearch.tsx:397`). Tilføjer mobiltastaturet et mellemrum, nulstilles den valgte adresse, søgningen springes over, og Enter giver "ingen resultater". Rettelse: sæt ikke `suggestionsQuery` i gendannelsen.

### M9. Alarmer, der kan udeblive
- **Produktionskontrollen ved timeout.** Alarmtrinnet kræver `failure()` (`.github/workflows/production-smoke.yml:52`), som ikke er sandt, når jobbet rammer `timeout-minutes: 10`. Et langsomt site kan nå grænsen via de gentagne forsøg (mistanke, ca. 65 %). Rettelse: eget alarmjob med `if: always()`, som importworkflowet har.
- **Planlagt import kan annulleres stille.** Concurrency-gruppen deles af schedule, PR og push (`.github/workflows/datafordeler-import.yml:49-51`). En ventende planlagt kørsel kan fortrænges af en tredje, og så kører alarmjobbet heller ikke (mistanke om GitHubs adfærd, ca. 70 %). Rettelse: flyt `concurrency` ned på `import`-jobbet.
- **`npm audit` kører kun ved PR og push** (`.github/workflows/application-quality.yml:35-36`). I et stille repo opdages en ny kritisk advisory først ved næste commit. Trinnet ligger desuden før lint og test, så en ny advisory eller et registry-udfald gør alle PR'er røde. Rettelse: eget job plus en ugentlig `schedule`.

## Lav

- Service workeren gemmer navigationer pr. sti uden query (`public/offline-sw.js:83-85,191-193`). `/kommune/<slug>?q=<tekst>` gemmes under `/kommune/<slug>`, så et filtreret resultat kan vises som kommunesiden ved dødt net, og søgeteksten ligger på enheden.
- En sen GPS-position kan overskrive en nyere adressesøgning og navigere til `/naer-dig` op til 20 sekunder senere (`AddressSearch.tsx:312-341`).
- Gemt-datoen vises uden årstal (`client.tsx:104`), så en kopi på 13 måneder ser ny ud.
- "Viser gemte data" kan stå over friske data, fordi `cachedAt` ikke nulstilles efter en vellykket opdatering (`src/lib/nearby/fetch-nearby-from-tiles.ts:78-94`).
- Skiftes workerens `version` til `offline-v2`, slettes `offline-v1-saved`, mens localStorage stadig siger "Gemt" (`offline-sw.js:62-69`).
- De afledte trin (stihistorik og postnumre) kører ikke efter `--finalize-latest` eller efter en gendannelse (`tools/datafordeler-importer/shelter_importer/cli.py:69-89`).
- `refresh_shelter_path_aliases_v1` tager ingen lås, så en samtidig gendannelse eller et gentaget kald kan efterlade lukkede aliaser til næste import (`20261102120000_readable_path_owner_moves.sql:7-58`).
- En manglende ejer-RPC caches som "ingen ejere" for hele dataversionen (`shelters.ts:323`). Migrationen er i produktion, så den bør kaste en fejl nu.
- Postnumrenes 30-dages genopslag læser sandsynligvis de samme første 500 adresser hver gang, og fejl i opslaget rapporteres stadig som `ok` i `derived` (`datafordeler.py:501-506,557-617`).
- Kommunekoder på postnumre akkumuleres for evigt. Én forkert kode fra en enkelt import bliver stående.
- `alter role service_role set statement_timeout = '60s'` gælder alle service role-kald, også rate limiter, rapporter og health. Ved låse kan anonyme kald hænge i 60 sekunder i stedet for 8 (mistanke, ca. 50 %). `src/app/admin/drift/actions.ts` sætter ingen `maxDuration`.
- Fremmede kan undertrykke alarmpåmindelser ved at skrive en kommentar, der starter med "Påmindelse" (`scripts/monitor/raise-alert.sh:40-41`). Filtrér på `github-actions[bot]`.
- Påmindelsens grænse på over 86 400 sekunder betyder, at importalarmen ofte først påminder hver anden dag (`raise-alert.sh:44`).
- `gh label create` mangler `--repo` (`raise-alert.sh:22`).
- Genaktiveringen af planlagte workflows hviler på udokumenteret GitHub-adfærd, og kommentaren siger "once a day", selvom kørslen kun rammer timen omkring kl. 03 UTC cirka ugentligt (`production-smoke.yml:69-88`).
- Afhængigheder: `@eslint/eslintrc` og `sharp` importeres ingen steder, `dotenv` og `@types/leaflet*` hører til i devDependencies. De 2 høje fund i udviklingsværktøjer kan rettes med `npm audit fix`.
- De gamle tabeller i `public` (`sheltersv2` på 15 MB med 3 500 døde rækker, `excluded_shelters`, `kommunekoder`) ligger stadig i databasen. `import_shelter_candidates` fylder 15 MB med 0 rækker.
- Dækningshuller: overvågningsscripts har kun kildetekst-test, alarmtesten kører aldrig `--jq`-udtrykkene, og ingen test viser, at en ikke-ejer afvises før gendannelsen kalder service role. pgTAP dækker ikke en udelukket ejer, et fejlet afledt trin eller M4.

## Dokumentation, der ikke passer

- `docs/improvement-plan.md:69`: arbejdet fra 1. november står som "in review" på en branch. Det blev flettet som #80 den 2. november.
- `docs/qa/2026-11-01-full-review.md:100,128`: nævner fire migrationer til `20261101120300`. Repoet og produktionen har også `20261102120000_readable_path_owner_moves.sql`.
- `docs/data/import-flow.md`: siger, at de afledte trin kører efter en vellykket publicering. De kører ikke efter `--finalize-latest` eller en gendannelse.
- `docs/data/schema.md` (adgangsgrænse): siger, at admin bruger den indloggede session. Gendannelse bruger nu service role.
- `docs/data/import-contract.md`: nævner ikke `derived` i kørslens resultat.
- `docs/data/field-ownership.md:62`: siger, at appen stadig bruger det gamle datalag.
- `README.md:87` og `docs/qa/free-observability.md:8-11`: nævner ikke `npm audit` i CI. `free-observability.md` nævner heller ikke advarslen om lækkede adgangskoder blandt de accepterede.
- `docs/README.md:26`: kalder de gamle emergency-dokumenter "seneste samlede gennemgang".
- `.env.example`: mangler `PRODUCT_METRICS_DISABLED`, `METRICS_HEALTH_*` og `SMOKE_TRANSIENT_*`.
- `src/components/OfflineSupport.tsx:11`: kommentaren siger, at workeren holder kopien frisk. Det gælder kun de trimmede cacher.
- `docs/superpowers/plans/2026-11-01-review-fixes.md`: en agentplan med alle bokse umarkerede, selvom arbejdet er flettet. Slet den, eller markér den afsluttet.

## Kontrolleret uden fund

Rettelserne fra 1. november: H2 (410 respekterer udelukkelser med samme prædikat som det offentlige view), M10 (gendannelse via service role tjekker ejer og aal2 i både action og database, `pg_roles` viser 60 s, 8 s og 3 s for de tre roller), M8 (3600 sekunder er rigtigt i Next 16.4.3), M7 (cachetestene ville fejle, hvis rettelsen blev fjernet), M5 (alarmjobbet dækker fejl og annullering, og #82 blev tildelt ejeren), M2 og M1. Admin: alle sider og actions kræver aal2. Service role-nøglen kan ikke nå klienten. API-ruter har same-origin-tjek, begrænset body og to lag rate limit. Workflows bruger ikke `pull_request_target`, actions er låst på SHA, og logs viser ingen hemmeligheder. Ingen hemmeligheder er committet. Node 24 står ens i `engines`, `.nvmrc` og workflows. Combobox, live-regioner og de nye `aria-label` er i orden, og ingen tekster lover åben eller verificeret adgang. Databasen beholder snapshots for 3 publiceringer ud af 78.

## Kan ikke verificeres fra repoet

Egress på Supabase efter #69, om UptimeRobot er sat op, om en gendannelse er afprøvet på en branch-database, om VoiceOver-testen på iPhone er udført, og fordelingen af de 41 klientfejl 8. november (loggen er udløbet).

## Anbefalet rækkefølge

1. Ret H1 (forsidens "Opdatér" sletter fliserne) med en test.
2. Fjern databasekaldet bag "andre registreringer", og gør opslagene på postnummer indekserbare (M1). Det fjerner de fleste timeouts og bringer API-kaldene mod målet på 80 %.
3. Stop GPS-udfald og udvidelsesfejl i fejltælleren (M2).
4. Del Dependabot-gruppen, flet #78 og #79, og få #83 grøn (M3).
5. Luk de to latente huller om udelukkelser og 410 (M4, M5, M6).
6. Resten kan tages løbende.

**Ejeropgaver:**

1. Stadig åben fra 1. november: bekræft, at UptimeRobot kontrollerer `https://findbeskyttelsesrum.dk/api/health`. Det er den eneste alarm, hvis begge planlagte workflows bliver slået fra.
2. Stadig åben fra 1. november: kør én gendannelse på en branch-database.
3. Ny: slå beskyttelse mod lækkede adgangskoder til i Supabase Auth, eller skriv den ind blandt de accepterede advarsler.
4. Ny: tjek egress i Supabase-dashboardet for november.

## Opfølgning (2026-11-10)

Gennemført samme dag på branchen `claude/zen-galileo-hg9u3m`, én commit pr. område. Efter rettelserne: `npm run lint` og `npm run typecheck` rene, `npm test` 242/242, importerens `pytest` 49 bestået, `npm audit --omit=dev` uden fund. Playwright er ikke kørt. Nye migrationer: `20261110120000` til `20261110120300`. **De er ikke kørt i produktionen endnu.** Appen virker uden dem, men får først gevinsten på postnummeropslag, M4 og M5, når de er kørt.

| Fund | Status |
| --- | --- |
| H1 "Opdatér" på forsiden sletter fliserne | Rettet: en gemning uden egne fliser tager fliserne fra den gemte søgning med (`src/lib/offline-copy.ts`). Ny test `tests/offline-copy-save.test.ts`, som fejler uden rettelsen. Ikke afprøvet i en browser. |
| M1 Offentlige læsninger scanner hele tabellen | Rettet i to dele. "Andre registreringer" rangeres nu i hukommelsen fra registreringens egen flise og de otte omkring, læst gennem samme cache pr. dataversion som fliseruten. Databasen læses dermed én gang pr. flise og version, ikke én gang pr. detaljeside. Fliserne har samme registreringer som det gamle kald (`country_marker_public_v2` er `shelter_public_v2` med koordinater), og den største flise fylder 215 KB mod datacachens grænse på 2 MB. Postnummeropslag går gennem den nye `public_shelters_in_postcode_v1` med et delindeks på `shelters.postal_code` (migration `20261110120000`), med fald tilbage til viewet, indtil migrationen er kørt. Efterprøvet mod produktionen uden at ændre noget: samme 558 rækker som viewet for ti postnumre, og planen henter kandidaterne via primærnøglen. Aliasfejlen tager nu `error.message` med. Viewet selv er ikke omskrevet. |
| M2 Støj fra produktionsalarmen | Rettet: GPS-udfald rapporteres ikke længere som tekniske fejl, og rapporter, hvis stak kun består af browserudvidelser, afvises uanset type. Grænsen på 25 er uændret. |
| M3 Dependabot sidder fast | Rettet i konfigurationen: testværktøjer, produktion og udvikling har hver sin gruppe. Årsagen til Firefox-nedbruddet i #83 er ikke undersøgt. **Ejer:** luk #83, så Dependabot åbner nye PR'er efter de nye grupper, og flet #78 og #79. |
| M4 Levende registrering kan svare 410 | Rettet i migration `20261110120100`: begge funktioner udelader stier, der i dag er en offentlig registrerings læsbare sti. pgTAP-tilfælde tilføjet. |
| M5 Udelukket adresses koordinat som postnummerposition | Rettet i migration `20261110120200`: et postnummer med position fra registreringer, som mister dem, får position og kilde nulstillet, så DAR udfylder det igen. Opdateringen kører stadig kun efter import, ikke efter en moderering. |
| M6 Udelukkelser når ikke alle kopier | Delvist rettet: 410-siden caches i 300 sekunder uden SWR (30 sekunder ved fejlet opslag), og versionslåste fliser i højst en time. Gemte offline-fliser opdateres stadig kun, når brugeren trykker "Opdatér". |
| M7 Offline i tyndt dækkede områder | Rettet: uden net vises listen fra de gemte fliser med en notits om, at den kan være ufuldstændig. Er der slet ingen registreringer i de gemte fliser, vises stadig "ingen gemte data". |
| M8 Mellemrum efter tilbage-navigation | Rettet. Ingen enhedstest, fordi `AddressSearch.tsx` ikke har et DOM-testmiljø. |
| M9 Alarmer, der kan udeblive | Rettet: produktionsalarmen ligger i et eget job med `always()`, importens `concurrency` gælder kun importjobbet, og `npm audit` kører i et eget job samt ugentligt med egen alarm (`dependency-audit-alert`). Kan kun bekræftes af rigtige GitHub-kørsler. |

Lave fund rettet: navigationer med query gemmes ikke af service workeren, en sen GPS-position overskriver ikke en nyere søgning, gemt-datoen viser årstal, "Viser gemte data" forsvinder efter en vellykket opdatering, de afledte trin kører også efter `--finalize-latest` (uden DAR-opslaget), `refresh_shelter_path_aliases_v1` tager publiceringslåsen (migration `20261110120300`), en manglende ejer-RPC kaster en fejl, påmindelser tælles kun fra `github-actions[bot]` og sendes efter 20 timer, `gh label create` har `--repo`, kommentaren om genaktivering beskriver den faktiske hyppighed, `dotenv` og typerne ligger i devDependencies, `@eslint/eslintrc` og `sharp` er fjernet fra `package.json` (`sharp` følger stadig med `next`), og `npm audit fix` er kørt (8 moderate fund tilbage, kun i udviklingsværktøjer). Dokumentationen er rettet på alle punkter under "Dokumentation, der ikke passer".

Lave fund ladt være: versionsskift af service workeren, de afledte trin efter en gendannelse, postnumrenes 30-dages genopslag, akkumulerede kommunekoder, 60 sekunders grænsen for alle service role-kald, `maxDuration` for gendannelsen (hører til i `src/app/admin/drift/page.tsx`), de gamle tabeller i `public` og dækningshullerne i test af overvågningsscripts.

**Ejeropgaver:**

1. Kør migrationerne `20261110120000` til `20261110120300` i produktionen, og tjek bagefter med `explain analyze select * from app_v2.public_shelters_in_postcode_v1('8210')`, at postnummerindekset bruges. De nye pgTAP-tilfælde er kun kørt mod en lokal Postgres 16 med en erstatning for pgTAP, ikke med `supabase test db` på 17. CI kører den rigtige test.
2. Luk Dependabot-PR #83, og flet #78 og #79.
3. Bekræft, at UptimeRobot kontrollerer `/api/health` (åben fra 1. november).
4. Kør én gendannelse på en branch-database (åben fra 1. november).
5. Slå beskyttelse mod lækkede adgangskoder til i Supabase Auth, eller notér den som accepteret.
6. Tjek egress i Supabase-dashboardet for november.
