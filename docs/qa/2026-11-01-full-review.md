# Grundigt review: findbeskyttelsesrum (main @ 80d07c0, 2026-11-01)

Kun læsning. Ingen kode er ændret. Metode: projektets egne tjek er kørt lokalt, produktionen er undersøgt, GitHub Actions, issues og åbne PR'er er læst, migrationsloggen er sammenlignet med Supabase, og fire uafhængige gennemgange (sikkerhed, database og import, frontend og caching, test, drift og dokumentation) er kørt. De vigtigste fund er efterprøvet i koden bagefter. Fokus er ændringerne siden sidste review (`00aa23e..80d07c0`, #53 til #69).

## Konklusion

Projektet er i god stand. Opfølgningen på reviewet fra 26. september er reelt gennemført, produktionen er sund, og grundmodellen (RLS, MFA, import i én transaktion, caching pr. dataversion) holder. To ting bør løses nu: Next.js står på en version med kritiske sårbarheder, fordi Dependabot-PR'en med rettelsen har været rød i 13 dage, og den nye 410-side for fjernede beskyttelsesrum kan vise en adresse, som ejeren har fået udelukket. Resten er offline-kopiens robusthed, alarmer der ikke når en person, og test af den nye cache.

## Hvad er verificeret

| Tjek | Resultat |
| --- | --- |
| `npm run lint`, `npm run typecheck` | rent |
| `npm test` | 181/181 bestået |
| Importer `pytest`, `ruff`, `mypy` | 42 bestået, rent |
| `npm run test:e2e:ui` | 92/92 fejler uden ændringer (Playwright 1.62.1 forventer Chromium-build 1234, miljøet har 1243). Med stien sat: 76 bestået, 15 sprunget over, 1 fejler altid (`e2e/offline.spec.ts:94`) |
| `npm audit --omit=dev` | 1 kritisk (`next` 16.3.6), 2 høje (`sharp` 0.35.4, `source-map-js` 1.2.1) |
| Live `/api/health` | 200, 10 096 registreringer, data 5,5 timer gamle, deployet SHA = main HEAD |
| Migrationer i git mod produktion | 60 = 60, samme versionsnumre |
| Produktionskontrol | Kører hver 4. til 7. time trods timeplan. Kendt og dokumenteret (`docs/operations/external-monitoring.md:32`) |

## Høj

### H1. Next.js 16.3.6 med kritiske sårbarheder, rettelsen sidder fast i en rød PR
`npm audit` rapporterer ti advisories for `next` 16.0.0 til 16.4.0. Gennemgået mod koden:

| Advisory | Kan nås? | Hvorfor |
| --- | --- | --- |
| GHSA-2464 (SVG RCE), GHSA-cjq9 (SSRF), `sharp`/librsvg | Nej | `images.unoptimized: true` (`next.config.js:98-100`), ingen `next/image` |
| GHSA-673q, GHSA-h694, GHSA-3w37 (`use cache`) | Nej | Kun `unstable_cache` bruges, ingen draft mode |
| GHSA-p3m5 (DoS via server actions) | Sandsynligvis ja | Server actions findes i `src/app/admin/**/actions.ts`, og Next afkoder anmodningen før `requireModerator` kører |
| GHSA-mcj8 (ISR cache poisoning) | Uafklaret | Sitet bruger ISR meget. Ikke tjekket, om Vercels platform afbøder det |

Dependabot-PR #74 (19. oktober) løfter `next` til 16.4.2, men tjekket "Byg og gennemfør browserhistorien" fejler, så den har ligget i 13 dage. CI kører ikke `npm audit`. Rettelse: gør #74 grøn og flet den. Overvej `npm audit --omit=dev --audit-level=critical` i CI.

### H2. 410-siden for fjernede registreringer ignorerer udelukkelser og manuelle rettelser
`app_v2.resolve_retired_shelter_v1` og `retired_shelter_path_hashes_v1` (`supabase/migrations/20261002085614_postal_areas_path_aliases_and_review.sql:185-256`) er SECURITY DEFINER, kan kaldes af anon og læser `app_v2.shelters` direkte. De tjekker hverken `shelter_exclusions` eller `shelter_overrides`, som det offentlige view gør. Udelukkelse ændrer ikke `publication_state`.

Scenarie: en ejer får sin adresse udelukket, og den gamle URL giver 404. Senere fjerner BBR registreringen, og importeren sætter `missing_from_source`. Nu svarer den gamle URL 410 med "Den sidst kendte adresse var …" og præcise koordinater (`src/lib/retired-shelter-page.ts:191-197`), cachet i CDN'en i en time, og RPC'en kan kaldes direkte. En rettet adresse erstattes også af den rå BBR-adresse. Rettelse: brug samme udelukkelses- og rettelseslogik i begge funktioner, gerne via et fælles prædikat, og tilføj en pgTAP-test.

## Mellem

- **M1. Offline-søgning fejler, når gemte fliser har forskellige dataversioner.** Service workeren gemmer alle hentede fliser, ikke kun den gemte søgning (`public/offline-sw.js:186-188`). Ved blandede versioner henter `fetchNearbyFromTiles` den nyeste version på en ny URL (`src/app/naer-dig/client.tsx:132-142`), som ikke findes offline. Brugeren får "ingen gemte data for dette område", selvom data ligger på enheden. Rettelse: brug de gemte fliser offline, også når versionerne er forskellige, eller fald tilbage til den nyeste gemte flise.
- **M2. En fejlet 100 km-søgning vises som "Ingen registreringer inden for 100 km".** `client.tsx:280` omsætter en fejl (429, timeout) til en tom liste. For en beredskabstjeneste er det falsk tryghed i den forkerte retning. Rettelse: vis en fejl med "prøv igen" i stedet.
- **M3. Almindelig browsing skubber den gemte offline-kopi ud.** Sidecachen rummer 20 sider og flisecachen 45, og begge trimmes ældste først uden beskyttelse af det gemte (`offline-sw.js:34,166-172`). Efter cirka 20 sidevisninger kan kopien være væk, mens knappen stadig viser "Gemt". Rettelse: læg den gemte kopi i en separat cache, der ikke trimmes.
- **M4. Postnumre, der krydser en kommunegrænse, beholder kun den ene kommune.** `complete_postal_codes()` (`tools/datafordeler-importer/shelter_importer/supabase.py:515`) regner et postnummer som færdigt, så snart det har én kommunekode, og `postal_areas()` springer det over (`datafordeler.py:493`). Migrationens løfte om, at koder "akkumuleres" (`20261006072458…sql:6`), indfries derfor ikke, og pgTAP-testen dækker en vej, importeren aldrig bruger. `refresh_postal_areas_from_registrations_v1` overskriver desuden DAR-koderne med registreringernes. Følge: adresser på den anden side af grænsen dukker ikke op i adressesøgningen, fordi `kommunekode` sendes med (`src/lib/address/adressevaelger.ts:164-165`).
- **M5. Importalarmer når ingen person.** Import-issues får ingen assignee eller omtale (`.github/workflows/datafordeler-import.yml:213-228`). #70 og #73 blev oprettet uden assignee. Fejler `quality`-jobbet på den planlagte kørsel, springes `import` over, og alarmen kører aldrig. Alarmteksten "fejlede uden at ændre det offentlige datasæt" er forkert, når fejlen kommer fra kontrollerne efter publicering.
- **M6. Støj fra produktionsalarmen.** Fem alarmer mellem 13. og 25. oktober (#71, #72, #75, #76, #77) lukkede sig selv efter 3 til 24 timer. Ifølge gennemgangen fejlede trinnet "Kontrollér anonyme driftstal" hver gang (over 25 fejl på 2 timer, `scripts/monitor/product-metrics-health.mjs`). Enten er grænsen for lav, eller der er en reel fejlkilde, som ingen undersøger. Undersøg de indrapporterede klientfejl, før grænsen ændres.
- **M7. Cachen pr. dataversion (#68/#69) har ingen reelle test.** `cachedPerRevision` springer cachen over uden `NEXT_RUNTIME` (`src/lib/supabase/queries/public-data-cache.ts:36`), og flisetesten erstatter `readForRevision` med en gennemstilling. Fjernes versionen fra cachenøglen, består alle test, mens sider viser data fra før en import.
- **M8. Versionstjekket på 300 s sænker ISR fra 3600 s til 300 s.** I Next 16 sætter `unstable_cache` sidens revalidate ned til sin egen værdi. Detalje- og kommunesider genopbygges derfor hvert 5. minut, ikke hver time som kommentaren i `public-data-cache.ts:13-15` antager. Det giver op til 12 gange flere ISR-skrivninger og funktionskald. Databaseforbruget påvirkes kun lidt. Vælg bevidst: fjern revalidate på versionsopslaget og stol på tag-udløb, eller behold 300 s og ret kommentaren.
- **M9. Planlagte workflows stopper sandsynligvis omkring 12. december.** GitHub slår planlagte workflows fra i offentlige repoer efter 60 dage uden aktivitet. Sidste commit er fra 13. oktober. Så stopper både import og produktionskontrol, og det opdages kun, hvis den eksterne UptimeRobot-monitor er sat op. Repoet viser ikke, at den er.
- **M10. Rollback-timeouten virker muligvis ikke (mistanke, ca. 65 % sikkerhed).** `statement_timeout = '60s'` sat på funktionen (`20260928120000…sql:21`) genstarter efter alt at dømme ikke den timer, der allerede kører for kaldet fra `authenticated`-sessionen (`src/app/admin/drift/actions.ts:25`). Så gælder rollens 8 sekunder stadig. pgTAP-testen tjekker kun konfigurationen. Afprøv med en tidsmålt rollback på en branch-database.
- **M11. Build kræver stadig Supabase (åben ejerbeslutning fra 26. september).** `/`, `/kort`, `/kommune` og `sitemap.ts` læser databasen ved build uden fallback. Et hotfix kan ikke deployes, hvis Supabase er nede. `docs/operations/external-dependencies.md:12` påstår, at statisk genererede sider serveres fra cache, men intet prærendres ved build.

## Lav

- `/api/app-v2/postal-areas` accepterer vilkårlige query strings uden rate limit (`route.ts:29-31`), så CDN-cachen kan omgås, og hvert kald koster et databaseopslag og cirka 50 KB. De andre ruter afviser ukendte parametre.
- Cachede opslag nøgles på rå slugs fra URL'en (`shelters.ts:110,153,408,430`, `municipalities.ts:52`). Tilfældige `/beskyttelsesrum/<x>` opretter cacheposter i 24 timer. Afvis ugyldige slugs før opslaget.
- `parseTileKey` (`src/lib/nearby/tiles.ts:67`) accepterer foranstillede nuller, så samme flise kan få op til 16 cacheposter.
- `src/app/api/errors/route.ts:70` tæller `client_error` uden samtykke, mens `/privatliv` siger, at egne tællere kun kører med samtykke.
- Den læsbare sti kan flytte til en anden registrering på samme adresse, når kapaciteten ændres (`shelter_readable_path_v1`, `refresh_shelter_path_aliases_v1`). Delte links peger så et andet sted hen.
- Postnummer- og stihistorik-opdatering efter import logger kun en advarsel (`importer.py:257-258`), uden felt i opsummeringen. En permanent fejl giver aldrig alarm.
- Påmindelsen i produktionskontrollen sendes første gang efter én time, ikke ét døgn, og kommentarlisten pagineres ikke (30 pr. side).
- Adressesøgningens spinner kan hænge, og Enter kan søge på forældet tekst (`src/components/AddressSearch.tsx:256-283,339-372`).
- "Ikke fundet"-svar fra fallback-stier caches i op til 24 timer under den aktuelle version (`shelters.ts:174,181,415,434`).
- Sitemap læser hele tabellen to gange pr. genopbygning uden versionscache. Det kan være en stor del af den resterende egress. Tjek Supabase-forbruget.
- Fritekst fra kommunesøgningen havner i URL'en (`/kommune/<slug>?q=`) og dermed i Vercels logs. Værd at nævne på `/privatliv`.
- Lokal Postgres er 15 (`supabase/config.toml`), produktion er 17.6.
- E2e: Playwright-versionen passer ikke til den forinstallerede Chromium, og `offline.spec.ts:94` kan ikke bestå mod `next dev`, fordi `OfflineSupport` kun indlæses i produktion. Testen skal have tagget `@full-stack`.
- Store dele af `tests/public-ui.test.ts` og `security-migration.test.ts` søger i kildetekst og fanger ikke regressioner (kendt fra sidste review).

## Dokumentation, der ikke passer

- `docs/qa/free-observability.md:19-20` siger to gange i timen. Workflowet kører hver time.
- `docs/operations/external-dependencies.md:11` nævner OpenStreetMap-embed på detaljesiden. Den er fjernet (`frame-src 'none'`).
- `docs/operations/external-dependencies.md:12` siger intet om Supabase Free-planens kvoter (5 GB egress, 500 MB database).
- `docs/qa/2026-09-26-full-review.md:92` lister M1 som ejeropgave, men den blev løst i #55.
- `docs/data/schema.md:35` siger, at offentlige URL'er aldrig ændres med adressen. Læsbare stier gør nu.
- `postal_areas`, `shelter_path_aliases` og opdateringerne efter publicering mangler i `docs/data/*.md`.
- `docs/improvement-plan.md` er sidst opdateret 25. september og har ingen rækker for #53 til #69.

## Kontrolleret uden fund

Admin: alle sider og actions kræver `requireModerator(true)` (aal2), og `/admin` og `/auth` får `private, no-store`. Cachen pr. dataversion indeholder kun offentlige data og blander ikke publiceringer permanent. Nye migrationer har `search_path=''`, RLS og smalle grants. Samtykke styrer Vercel Analytics, Speed Insights og produkttællere (bortset fra fundet ovenfor). Workflows bruger ikke `pull_request_target`, og logs viser kun tal. Adressesøgningens combobox og live region er korrekte. Rangering af "andre registreringer" er deterministisk.

## Kan ikke verificeres fra repoet

Om ejeren har slettet gamle importlogs (H1 fra 26. september), om UptimeRobot er sat op, om VoiceOver-testen på iPhone er udført, og hvad den faktiske egress er efter #69.

## Anbefalet rækkefølge

1. Gør Dependabot #74 grøn og flet den (H1).
2. Tilføj udelukkelser og rettelser til de to 410-funktioner med en pgTAP-test (H2).
3. Ret M2 (falsk "ingen inden for 100 km") og M1/M3 (offline-kopien).
4. Giv importalarmen en assignee, og tjek at UptimeRobot kører (M5, M9).
5. Resten kan tages løbende. Kildetekst-testene og M11 kan udskydes.
