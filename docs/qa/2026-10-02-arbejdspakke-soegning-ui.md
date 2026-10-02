# Tilbagemelding: arbejdspakke søgning og UI (version 1, 1. oktober 2026)

Udført 2. oktober 2026 på grenen `claude/great-carson-cxzqp8`. Skærmbilleder før og efter ligger i
`docs/qa/screenshots-2026-10/` (`foer-*` og `efter-*`, 390 px og 1440 px). Billederne er taget på en lokal
produktionsbuild mod de rigtige offentlige data.

## Leverance A: Funktion

### A1. Kommunesøgning dækker hele kommunen

- Søgningen kører på serveren over alle kommunens adresser og pagineres bagefter. URL: `/kommune/aarhus?q=ryesgade&side=2`.
- `src/proxy.ts` omskriver `?q=` til den dynamiske rute `src/app/kommune/[slug]/soeg/page.tsx`. De almindelige kommunesider forbliver statiske (ISR).
- Søgelogik: `src/lib/municipalities/search.ts` (alle ord skal matche adresse, postnummer, by eller anvendelse, "aa" = "å").
- Fælles visning: `src/app/kommune/[slug]/kommune-view.tsx`, `kommune-experience.tsx`.
- Tomt resultat: "Ingen registreringer i Aarhus matcher 'x'" med link til forsiden.
- Kortet har en overskrift, der siger, hvad det viser ("Kortet viser adresse 1–30 af 667 fra listen"). Teksten om sideafgrænsning er fjernet.
- Test: `e2e/seo-security.spec.ts` "kommunesøgningen dækker hele kommunen": tager første adresse på side 14, søger på den fra side 1, genindlæser.

### A2. "Søg" og Enter

- `src/components/AddressSearch.tsx`: én funktion (`runSearch`) bag både knap og Enter. Knappen er aldrig deaktiveret.
- Valgt forslag søges. Ét entydigt match (eneste forslag eller præcis samme tekst) vælges og søges. Ellers åbnes listen med "Vælg den rigtige adresse på listen." i en `aria-live`-region.
- Tom søgning: "Skriv en adresse, et postnummer eller en by." ved feltet.
- Den grønne "Valgt adresse"-boks er fjernet.
- Målt i browser mod den rigtige Adressevælger: "Rådhuspladsen 2, 8000" med Enter og med klik giver begge "Ved Rådhuspladsen 2, 8000 Aarhus C".
- Fejl fundet og rettet undervejs: fokus på feltet lukkede listen igen, når søgningen selv havde hentet forslagene.

### A3. Bynavn og postnummer i adresseforslag

Årsag: Adressevælger (DAWA er lukket og svarer 410) matcher vejnavn og husnummer, men ignorerer et bynavn i teksten og sorterer efter postnummer. Den forstår et postnummer i teksten og har et `kommunekode`-filter, der også tager flere koder. Med filteret matcher den selv "aa" mod "å".

Rettelse i vores forespørgsel, ikke i en omvej:
- `src/lib/address/locality.ts`: finder by eller postnummer efter komma eller i de sidste 1 til 3 ord, slår op i en postnummertabel og sender `kommunekode` med.
- `src/lib/address/postal-areas.json`: 573 postnumre og 97 kommuner, afledt af `app_v2.shelter_public_v2` og `app_v2.municipality_public_v2`. Indlæses først ved første søgning (28 KB).
- Uden bynavn søges også den anden "aa"/"å"-stavning, og resultaterne flettes.
- Et rent postnummer eller bynavn giver et områdeforslag ("8000 Aarhus C · postnummer"), som søger fra midten af postnummerets registreringer.

| Input | Første forslag (målt mod den rigtige tjeneste) |
|---|---|
| Banegårdspladsen 1, Aarhus | Banegårdspladsen 1, 8000 Aarhus C |
| Banegaardspladsen 1 Aarhus | Banegårdspladsen 1, 8000 Aarhus C |
| Rådhuspladsen 1, København | Rådhuspladsen 1, 1550 København V |
| Rådhuspladsen 2, 8000 | Rådhuspladsen 2, 8000 Aarhus C |
| 8000 | 8000 Aarhus C (postnummer som område) |

Begrænsning: Tabellen dækker kun postnumre med mindst én registrering. Et bynavn uden registreringer falder tilbage til Adressevælgers egen sortering.

### A4. Offlinekopi adskilt fra samtykke

Sådan var det: en service worker (`public/offline-sw.js`, Cache API) med sider, `_next/static`-filer og offentlige nærheds-fliser (`/api/app-v2/nearby/tiles/*`), registreret kun ved samtykke til "offlinekopi".

Sådan er det nu:
- Samtykket gælder kun statistik (`src/lib/consent.ts`, `src/components/ConsentBanner.tsx`).
- "Gem til brug uden net" på forsiden og resultatsiden (`src/components/OfflineCopyControl.tsx`, `src/lib/offline-copy.ts`). Status: "Gemt 2. okt. 2026", plus "Opdatér" og "Slet kopien".
- Workeren gemmer på opfordring siderne, de filer siderne henviser til, og fliserne omkring søgningen. Fra resultatsiden gemmes også søgningen i `localStorage`, så den kan åbnes uden net i en ny fane.
- `src/components/OfflineSupport.tsx` holder workeren registreret, når der er en gemt kopi, og fjerner den ellers. Besøgende, der tidligere sagde ja til offlinekopi, beholder deres kopi (engangs-migrering).
- `/privatliv` er opdateret.
- Test: `e2e/offline.spec.ts` med "Kun nødvendige": gem, gå offline, forsiden og den gemte søgning virker, og resultaterne mærkes "Viser gemte data". Uden gemt kopi registreres ingen worker. Ingen statistik uden samtykke testes fortsat i `e2e/consent.spec.ts`.

Valg (beslutning til Andreas): aktiv handling, som anbefalet i pakken.

## Leverance B: Design og indhold

### B1. Forsiden
`src/app/page.tsx`, `src/components/AddressSearch.tsx`. Én kolonne på maks. 40rem, ingen ramme, "Eller søg på en adresse" i stedet for "ELLER", "Ved varsling" med Borger.dk og SAMSIK, tekstlinks til landskort og kommuner, ingen eyebrow. Kun én orange knap: "Søg" bliver primær, når der står noget i feltet.
Målt: søgefeltets bund ved 455 px på 375 x 667. "Ved varsling" slutter ved 511 px på 390 x 844.

### B2. Forbehold
Footer: "Uafhængig tjeneste. Ikke en myndighedstjeneste." `RegistrationNotice` og `BackLinkButton` er slettet. Evakueringsforbeholdet er flyttet til `/om-data`.
Målt "ikke bekræftet" i sidens indhold: forside 0, resultatside 1, detaljeside 1, footer 0.

### B3. Resultater som adresseliste
`src/app/naer-dig/client.tsx`, `src/app/globals.css`. Rækker med skillelinjer, nummer, adresse som link, afstand, postnummer og by, "286 pladser". Ingen udfoldning, ingen "Se detaljer". Kun det valgte resultat er orange i liste og kort (de andre numre er neutrale). Liste og sticky kort side om side fra 1024 px, faner på mobil.
Målt: 10 resultater fylder 735 px på 390 px bredde (grænse 1688 px). `scrollY` 0 og fokus på resultatoverskriften efter søgning.

### B4. Ryesgade 18 og 20
Undersøgt i `app_v2.shelters`. De er ikke samme rum ifølge data:

| | Ryesgade 18 | Ryesgade 20 |
|---|---|---|
| BBR-bygning (`canonical_source_reference`) | 371ababe-bba2-46d7-8a1b-3dd49c820dc4 | df67b275-762b-4d34-bf77-4bcea2f11c45 |
| Anvendelse (`byg021`) | 321 kontor | 322 detailhandel |
| Pladser (`byg069`) | 286 | 286 |
| Afstand mellem koordinater | ca. 4 m | |

To forskellige BBR-bygninger med hver sin registrering af 286 pladser. Der er ingen fælles nøgle i `app_v2`, der viser samme rum, så der er ingen ændring. Det kan være samme fysiske rum registreret på to bygninger, men det kan data ikke afgøre. Samme mønster (samme postnummer, samme antal pladser, under ca. 35 m fra hinanden) findes i 62 par.

### B5. Detaljesiden
`src/app/beskyttelsesrum/[slug]/page.tsx`, `src/components/ShelterOsmEmbedMap.tsx`. H1 er adressen. Linjen under: "8000 Aarhus C · 286 registrerede pladser · Bygning til kontor", én forbeholdslinje, "Vis vej i Google Maps" (rutevejledning) og "Vis på kort". Eyebrow og "Tilbage" er fjernet, brødkrummen er beholdt. Kortets pladsholder viser adressen i kortets højde.

### B6. Kommunesiderne
Hele rækken er ét link, "Se kommune" er væk (målt 0). Kapaciteten står én gang pr. adresse. Eyebrows er fjernet.

### B7. Typografi og flader
`src/components/ui-classes.ts`, `src/app/layout.tsx`, `tailwind.config.js`. Eyebrows er fjernet på alle offentlige sider. H1 er 28 px på mobil, 36 px fra `sm` og 40 px fra `lg`, med linjehøjde 1,15. Space Grotesk er fjernet helt (logoet bruger Inter), så der hentes én font mindre. Hjælpetekst er hævet til 14 px på de offentlige sider. Bokse er erstattet af skillelinjer på forside, resultater, detalje og kommuner.

### B8. Kortfliser og URL'er
- Mørke fliser: CSS-filter kun på `.leaflet-tile-pane` i `src/app/globals.css`. Markører, popups og attribution filtreres ikke. Det ser brugbart ud (se `efter-resultat-1440.png`), så CARTO er ikke nødvendig.
- `/shelters/nearby` er flyttet til `/naer-dig` med 308-redirect, som bevarer gamle `?lat=&lng=`-links (`next.config.js`).
- Læsbare detalje-URL'er: `/beskyttelsesrum/ryesgade-18-8000-aarhus-c` (`src/lib/shelter-public-url.ts`, `src/lib/supabase/queries/shelters.ts`). Ved flere registreringer på samme adresse beholder den med flest pladser den rene adresse, og de andre får seks tegn af id'et (`-281be9`). Gamle `registrering-<id>`- og alias-adresser giver 308 til den nye. Sitemap og canonical bruger de nye adresser (10.104 detaljesider).
- Der er ingen databaseændring. Adressen beregnes i appen ud fra adresse, postnummer og by.

## Test

| Område | Resultat |
|---|---|
| Lint, typecheck | Grønt |
| Unit-tests (`npm test`) | 157 bestået, heraf nye i `tests/search-and-urls.test.ts` og `tests/offline-sw.test.ts` |
| E2E Chromium desktop og mobil | 102 bestået, 27 sprunget over efter design. `contact.spec.ts` fejlede 1 af 3 kørsler på et fokus-tjek. Kontaktsiden er kun ændret ved at fjerne en eyebrow, så det ligner en eksisterende ustabil test |
| E2E Firefox og WebKit | Ikke kørt, fordi browserne ikke findes i miljøet. CI kører dem |
| 200 % zoom (640 px) | `e2e/reflow.spec.ts` bestået |
| WCAG A/AA (axe) | `e2e/accessibility.spec.ts` bestået for forside, åben autocomplete, resultatside, detaljeside, kommuneoversigt og privatliv |
| VoiceOver iOS, Slow 3G, åbent tastatur | Ikke testet manuelt. Kræver en rigtig enhed |

## Åbne spørgsmål

1. Skal et klik på et adresseforslag søge med det samme? I dag udfylder det feltet, og så skal man trykke "Søg", som pakken beskriver i A2.1.
2. Postnummertabellen (A3) er et øjebliksbillede fra 2. oktober 2026. Skal den genereres ved hver dataimport, eller er det fint at opdatere den manuelt en gang imellem?
3. Ryesgade-mønstret (B4) findes i 62 par. Skal vi bede BBR eller kommunerne om at afklare, om det er samme rum, eller lade det ligge?
4. Detaljesidens kort er stadig OpenStreetMaps eget iframe med lyse fliser. CSS-filteret kan ikke bruges dér uden også at farve markøren. Skal det skiftes til et Leaflet-kort med mørke fliser?
5. Læsbare URL'er: hvis en adresse ændres i BBR, ændres URL'en også. Den gamle adresse giver da 404 (registrerings-id'et virker fortsat). Er det acceptabelt, eller skal vi gemme gamle læsbare adresser som aliasser i `app_v2`?

## Opfølgning: beslutninger 2. oktober 2026

Svar på de åbne spørgsmål er implementeret på samme gren.

1. **Forslag søger med det samme.** Klik eller Enter på et adresse- eller postnummerforslag søger straks (`src/components/AddressSearch.tsx`). Vejforslag udfylder stadig feltet, så man kan skrive husnummer. Tilbage på forsiden står den søgte adresse i feltet. "Søg" bruges til fritekst efter A2.
2. **Alle postnumre, opdateret ved hver import.**
   - Ny tabel `app_v2.postal_areas` med det offentlige view `postal_area_public_v1` (migration `20261002120000_...`).
   - Importeren henter alle DAR-postnumre efter hver publicering (`tools/datafordeler-importer`). Postnumre uden registreringer får positionen fra én aktuel DAR-adresse. Postnumre med registreringer bruger gennemsnittet af dem.
   - Appen henter tabellen fra `/api/app-v2/postal-areas` (CDN-cache) og falder tilbage til den indbyggede fil.
   - Finder nærhedssøgningen intet inden for 50 km, søger den igen ud til 100 km og siger det tydeligt.
3. **Ingen gruppering uden fælles nøgle.** Der er ingen adresser, der deler bygnings-id, så der grupperes ikke på tværs af adresser. Det interne view `app_v2.registration_duplicate_review_v1` (kun service role) viser de 62 par med årsag: 25 på forskellige adresser og 37 på samme adresse.
4. **Ét kort.** `src/components/ShelterMap.tsx` bruges nu af både resultatsiden og detaljesiden (`ShelterDetailMap.tsx`). Det har mørkt filter på flise-laget og en orange markør uden filter, og det indlæses først ved klik. OSM-iframen er fjernet, og CSP har nu `frame-src 'none'`.
5. **Ingen 404 for delte links.**
   - Tabellen `app_v2.shelter_path_aliases` (path_slug, shelter_id, valid_from, valid_to) får alle læsbare adresser. `refresh_shelter_path_aliases_v1()` kører efter hver publicering, og gamle adresser giver 308 til den aktuelle. Hash-adresser og ældre importer-slugs giver også 308.
   - En registrering, der er fjernet fra BBR, svarer 410 med "Registreringen findes ikke længere i BBR" og et link til søgning ved den sidste adresse.
   - Next 16 kan ikke sætte 410 fra en side. Derfor omskriver `src/proxy.ts` til route handleren `/beskyttelsesrum/[slug]/fjernet`. Proxyen tjekker mod en liste med SHA-256 af de fjernede stier, som hver server holder i hukommelsen i 10 minutter. Det koster ingen databasekald pr. visning, og ved fejl falder den tilbage til normal visning.

SQL-reglen for læsbare adresser er kontrolleret mod TypeScript-reglen. MD5 over alle 10.104 registreringer er ens.

Test: 160 unit-tests, 41 importer-tests (ruff og mypy), 24 databasetests (pgTAP på en lokal Postgres med hele migrationshistorikken), e2e Chromium 102 bestået.

Kræver handling:
- Migrationen er ikke kørt i produktion. Koden virker uden den: aliaser og 410 er slået fra, og postnumre bruger den indbyggede fil. Den skal køres før merge, som README beskriver.
- Importerens DAR-felter til positioner (`DAR_Husnummer.adgangspunkt` og `DAR_Adressepunkt.position`) kan ikke afprøves herfra, fordi miljøet ikke har nogen Datafordeler-nøgle. Trinnet kan ikke få importen til at fejle. Fejler det, får postnumrene ingen position og vises ikke som område, før det er rettet. Tjek loggen efter første kørsel.
