# Review af skærmbilledpakken 2. oktober (main 9f8b679), opfølgning 5. oktober 2026

Rammerne er som før. Der er ingen ændringer i Supabase-skema eller -data og ingen nye tredjeparter, og alle gamle URL'er virker.

Skærmbilleder ligger i `docs/qa/screenshots-2026-10-05-review/`, i 390 x 844 (`-390`) og 1440 x 900 (`-1440`). De målte værdier står i `maalinger.txt` i samme mappe. Billederne er taget af en lokal produktionsbuild af grenen mod produktionsdata. Testmiljøets proxy afviser en del kortfliser og enkelte opslag hos Adressevælger. Kortfliserne hentes derfor uden om browserens netværk, og afviste søgninger prøves igen. Siden selv er uændret.

Test: lint og typecheck uden fejl, 173 unit-tests bestået, e2e i Chromium (desktop og mobil) 104 bestået og 28 sprunget over (de samme `@full-stack`- og browserspecifikke tests som før).

## 1. Postnumre (kritisk)

**Årsag bekræftet.** `/api/app-v2/postal-areas` bad om `.limit(5000)`, men PostgREST returnerer højst `max_rows` = 1000 rækker pr. kald. Viewet `app_v2.postal_area_public_v1` har 1089 postnumre efter importen 4. oktober. Svaret stoppede derfor ved 8766.

**Den manglende kommune er Læsø (0825).** Kommunelisten kom fra `municipality_public_v2`, som kun har kommuner med mindst én offentlig registrering. Læsø har 0. Kommuneoversigten bruger `municipality_summary_public_v1`, som har alle 98.

| Kilde | Postnumre | Første og sidste | Kommuner |
|---|---|---|---|
| Live før rettelsen (målt 5. okt.) | 1000 | 1050 og 8766 | 97 |
| `postal_area_public_v1` i databasen | 1089 | 1050 og 9990 | |
| Lokal build af grenen | 1089 | 1050 og 9990 | 98 |
| Live efter deploy | *udfyldes efter merge* | | |

Rettelser:
- `src/lib/supabase/read-all-pages.ts`: én hjælpefunktion, der læser side for side med `.range()`, indtil en side kommer kort tilbage. En fejlet side fejler hele læsningen, så en halv tabel aldrig bliver cachet. Grænsen er ikke hævet globalt.
- `src/lib/supabase/queries/postal-areas.ts`: postnumre og kommuner læses i sider. Kommunerne kommer nu fra `municipality_summary_public_v1` (98).
- `src/lib/address/postal-areas.json`: den indbyggede reservefil havde 573 postnumre og 97 kommuner. Den er genereret igen med 1089 og 98 med den nye kode.

Andre steder, der kunne ramme samme grænse:

| Sted | Rækker i dag | Før | Nu |
|---|---|---|---|
| Listen over fjernede registreringer til proxyen (`src/lib/retired-shelter-paths.ts`) | 79 | Ét kald uden grænse, ville blive skåret ved 1000 | Læses i sider med `limit` og `offset` |
| Registreringer pr. postnummer (`getPublicRegistrationsInPostcode`) | højst 165 (5000 Odense C) | `.limit(2000)`, i praksis 1000 | Læses i sider |
| Landskort, kortfliser, sitemap, kommunesider | op til 10.103 | Paginerer allerede | Uændret |
| Landskortets RPC | én række med JSON | Ikke berørt | Uændret |

Test:
- `tests/postal-areas.test.ts` simulerer PostgREST med 1000 rækker pr. kald og 1093 postnumre. Testen kræver, at alle læses, inklusive 3700, 9000, 9940 og 9990. Den kontrollerer også, at reservefilen har mindst 1050 postnumre, 3700, 9000, 9990 og 98 kommuner med Læsø, og at forespørgslerne ikke bruger `.limit()` eller `municipality_public_v2`.
- Produktionskontrollen (`scripts/monitor/production-smoke.mjs`, kører hver time) har fået kontrollen "Postnumre til adressesøgningen". Den kræver mindst 1050 postnumre, at 3700, 9000 og 9990 findes, og 98 kommuner. Kørt mod produktion i dag fejler den med "Kun 1000 postnumre", som den skal.

Fundet undervejs: produktionskontrollen har fejlet hver time siden 2. oktober kl. 12.25, og sag nr. 60 er åben. Den ledte efter forsidens gamle overskrift "Se registrerede beskyttelsesrum nær dig", som jeg ændrede i PR #58. Kontrollen leder nu efter "Find beskyttelsesrum nær dig". De øvrige ti kontroller bestod. Sagen lukker sig selv ved første grønne kørsel efter deploy.

Skærmbilleder: `1a-postnummer-9000-*` ("9000" giver "9000 Aalborg · postnummer") og `1b-hjoerring-*` ("Hjørring" giver "9800 Hjørring · postnummer" øverst).

## 2. Søgefeltet

### 2.1 Aktivt forslag
Den aktive række har en orange venstrekant på 4 px og en lysere baggrund (`--surface-option-active`, #2c3138). Det gælder både mus og tastatur, fordi musen sætter samme aktive række. Hover har ikke længere sin egen stil.

| Kontrast | Forhold |
|---|---|
| Orange kant (#f97316) mod de andre rækker (#141619) | 6,5:1 |
| Orange kant mod den aktive baggrund | 4,7:1 |
| Hvid tekst på den aktive baggrund | 13,1:1 |
| Aktiv baggrund mod de andre rækker | 1,4:1 |

Kravet på mindst 3:1 opfyldes af kanten. Baggrunden alene når ikke 3:1, og det er derfor, kanten er med.

Fil: `src/components/AddressSearch.tsx`, `src/app/globals.css`. Skærmbilleder: `2-1a-aktivt-forslag-tastatur-*` og `2-1b-aktivt-forslag-mus-1440`.

### 2.2 Synlig instruktion
"Vælg den rigtige adresse på listen." står nu øverst i den åbne liste. Den visuelle linje er `aria-hidden`, fordi status-regionen under feltet stadig læser den op. Mens listen er åben, er statusteksten kun for skærmlæsere, så den ikke står to gange. Skærmbilleder: `2-2-instruktion-over-listen-*`.

### 2.3 Eksakt match søger med det samme
Ny funktion `pickExactAddressMatch` i `src/lib/address/adressevaelger.ts`. Fritekst med vej, husnummer og et sted søger med det samme, når præcis én adresse i forslagene matcher eksakt. Stedet kan være et postnummer, et postnummernavn, starten af et ("Aarhus" dækker Aarhus C, N og V) eller et kommunenavn. "aa" og "å" behandles ens, og kommaer og mellemrum ignoreres. Husnummeret skal passe præcist, så "1" ikke tager "1A". Uden husnummer, eller med to eksakte match, åbner listen som før.

"Banegårdspladsen 1, Aarhus" plus Enter gik direkte til resultaterne i første forsøg i begge størrelser ("Ved Banegårdspladsen 1, 8000 Aarhus C"). Test: `tests/search-and-urls.test.ts` (fem stavemåder, 1A, ingen by, intet husnummer, to match). Skærmbilleder: `2-3-eksakt-match-resultater-*`.

### 2.4 Én fejlstil
Alle fejl ved feltet ser ens ud:
- **Placering og udseende:** lige under feltet, med et rødt udråbstegn-ikon og lys rød tekst.
- **Feltets kant:** rød (#f87171), målt til rgb(248, 113, 113) både ved tom søgning og offline.
- **Hvilke fejl:** tom søgning, ingen fund, søgning ikke tilgængelig (offline eller serverfejl) og blokeret sessionslager.

Kontrast: den røde kant 7,1:1 og teksten 16:1 mod siden. `aria-invalid` er sat ved alle fejl. Skærmbilleder: `2-4a-fejl-tom-soegning-*` og `2-4b-3-1-offlinefejl-med-link-*`.

## 3. Offline

### 3.1 Link til gemte resultater
Er der en gemt kopi med en søgning, viser forsidens fejl linket "Se gemte resultater for Rådhuspladsen 2, 8000 Aarhus C". Linket åbner /naer-dig med den gemte søgning, og i testen viste det 10 resultater.

Offline står der "Adressesøgningen virker ikke uden net.", uden "brug din placering". Positionen kan godt hentes uden net, men resultaterne kræver data, der er gemt for netop det område. Placering nævnes derfor kun, når søgningen fejler med net, fordi den så virker. Skærmbilleder: `2-4b-3-1-offlinefejl-med-link-*` og `3-1b-gemte-resultater-*`.

### 3.2 og 3.3 Én linje, "Opdatér" skjult offline
Statuslinjen er nu "Gemt 5. okt. kl. 13.02 for Rådhuspladsen 2, 8000 Aarhus C" med "Opdatér" og "Slet". Offline er "Opdatér" skjult, og "Gem til brug uden net" vises ikke, når der ikke er net. Knapperne hedder "Opdatér kopien til brug uden net" og "Slet kopien til brug uden net" for skærmlæsere. Bekræftelsen "Gemt. Siden virker nu også uden net." læses op, men vises ikke. Kun en delvis kopi eller en fejl vises som tekst.

Filer: `src/components/OfflineCopyControl.tsx` og `src/lib/offline-copy.ts` (datoformat). Privatlivssiden siger nu "Slet" i stedet for "Slet kopien". Skærmbilleder: `3-3a-status-online-*`. Offlinelinjen ses nederst i `2-4b-3-1-offlinefejl-med-link-390`.

### 3.4 Kortets offlinebesked som bjælke
`src/components/MapUnavailableNotice.tsx` er nu en bjælke øverst på kortet i stedet for en boks i midten. Markørerne kan stadig bruges, og kortet er ikke længere `inert` under fejlen. Bjælken lægger sin højde i `--map-notice-height`, så zoomknapper og forklaring rykker ned i stedet for at blive dækket. Ændringen gælder alle fire kort: resultat, detalje, kommune og landskort.

Højde: 49 px på desktop (én linje). På mobil er den 75 px, fordi teksten og de to knapper ikke kan stå på én linje i 356 px. Sætningen "Adresser og registreringer virker stadig." læses kun op. Skærmbilleder: `3-4-kortbjaelke-offline-*`.

## 4. Kort

### 4.1 Markører oven i hinanden
Markører, der ville dække hinanden på skærmen (under 30 px fra hinanden), bliver nu til én markør med "1, 2". Grupperingen regnes i pixels ved den aktuelle zoom, så markørerne deler sig, når man zoomer ind. Et klik vælger den næste i gruppen, så hver kan vælges på skift. Pop-up'en på desktop viser alle i gruppen.

Ved Rådhuspladsen 2 i Aarhus giver det "1, 2, 4" (Ryesgade 18, 20 og 22A) og "3, 6" (Frederiksgade 78A og 76). Resultatmarkører ligger nu altid over søgepunktet, når de har samme position. Det fandt en e2e-test.

Filer: `src/lib/maps/group-overlapping.ts`, `src/components/ShelterMap.tsx`, `src/app/globals.css`. Test: `tests/map-pins.test.ts`. Skærmbilleder: `4-1-samlede-markoerer-*`.

### 4.2 OSM-attributionen på mobil
Panelet med det valgte resultat sidder nu 32 px fra kortets bund (`bottom-8`), så "Leaflet | © OpenStreetMap contributors" altid er synlig. Fil: `src/app/naer-dig/client.tsx`.

## 5. Sider

### 5.1 410-siden
410-siden har nu sitets layout med header, footer og Inter, plus "Ved varsling"-blokken fra forsiden. Statuskoden 410 og URL'en er uændrede.

En Next-side kan ikke svare 410. Siden ligger derfor som en almindelig side på `/intern/fjernet/[slug]` (`noindex`, og `/intern/` er spærret i `robots.txt`). Route-handleren `/beskyttelsesrum/[slug]/fjernet` henter den og returnerer HTML'en med status 410. Kan siden ikke hentes, for eksempel bag adgangsbeskyttelse på en preview, bruges den gamle simple side.

"Ved varsling" er nu én komponent (`src/components/EmergencyGuidance.tsx`), som forsiden og 410-siden deler.

Målt: status 410, URL'en bliver stående, én header, én main og én footer, og skriften er Inter. Skærmbilleder: `5-1-410-*`.

### 5.2 Detaljesiden
Pladsholderen er nu selv knappen "Vis kort", 160 px høj, med adressen og "Kortet hentes fra OpenStreetMap, når du vælger det.". Den separate "Vis på kort" er fjernet, og der er 0 tilbage. Når kortet åbner, flytter fokus til kortet. Gamle links til `#registrering-kort` åbner stadig kortet. Indholdet står nu venstrestillet i sidens brede kolonne som på de andre sider.

Filer: `src/components/ShelterDetailMap.tsx` og `src/app/beskyttelsesrum/[slug]/page.tsx`. Skærmbilleder: `5-2a-detalje-kortknap-*` og `5-2b-detalje-kort-*`.

### 5.3 Mobil
Liste/Kort-bjælken ligger nu i en ramme med sidens baggrund, der starter lige under headeren. Den målte afstand er -1 px, så headerens kant dækker overlappet, og der er intet hul. `text-wrap: balance` er lagt på den fælles H1-stil (`ui.pageTitle`) og på resultatsidens H1. Skærmbilleder: `5-3-mobil-bjaelke-390`.

## Åbne spørgsmål

1. **Merge og deploy:** må jeg merge PR'en, når CI er grøn? Først da kan jeg måle postnumre og kommuner live og udfylde tabellen under punkt 1. Produktionskontrollen bliver også grøn igen og lukker sag nr. 60.
2. **Postnumre uden registreringer** (for eksempel 8766 Nørre Snede og 9940 Læsø) har ingen kommunekode i `postal_area_public_v1`. "9940" og "Læsø" virker som område, men "Vestergade 1, Læsø" filtreres ikke på kommune og falder tilbage til en søgning i hele landet. Rettelsen er i importeren, som skal sætte kommunekoden fra DAR. Skal den med i næste runde?
3. **Kortbjælken på mobil** er to linjer (75 px), fordi tekst og to knapper ikke er plads til på én linje. Vil du have den på én linje, kan "Til resultatlisten" fjernes på mobil, fordi fanen "Liste" står lige over kortet.
