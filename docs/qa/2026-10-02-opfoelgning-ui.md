# Opfølgning på UI-arbejdspakken, 2. oktober 2026

Svar på "Opfølgning på UI-arbejdspakken (arbejdspakke_UI_2026-10-01.md)". Rammerne er overholdt: ingen ændringer i data eller Supabase i denne runde, ingen nye tredjeparter, og alle gamle URL'er virker som før.

Skærmbilleder ligger i `docs/qa/screenshots-2026-10-opfoelgning/`. Filnavnet slutter på `-390` (390 x 844) eller `-1440` (1440 x 900). Målingerne bag tallene herunder står i `maalinger.txt` i samme mappe.

Test af denne runde: lint og typecheck uden fejl, 164 unit-tests bestået, e2e Chromium (desktop og mobil) 104 bestået og 28 sprunget over (de samme `@full-stack`- og browser-specifikke tests som før).

## 1. Beslutninger

### 1.1 Forslag søger med det samme
Allerede gennemført i PR #58 (`src/components/AddressSearch.tsx`). Klik eller Enter på et adresse- eller postnummerforslag søger straks, og adressen står i feltet, når man kommer tilbage. Vejforslag udfylder stadig kun feltet, så man kan skrive husnummer. Ingen ændring i denne runde.

### 1.2 Alle postnumre ved hver import
Gennemført i PR #58: tabellen `app_v2.postal_areas`, viewet `app_v2.postal_area_public_v1` og importerens trin i `tools/datafordeler-importer`. Postnumre uden registreringer viser de nærmeste i nabopostnumrene (søgningen udvides til 100 km, hvis intet ligger inden for 50 km).

Ikke færdigt endnu: produktionen har stadig 573 postnumre (målt 2. oktober via `/api/app-v2/postal-areas`). Det er dem med registreringer. Resten kommer ved første import efter merge, som kører planlagt 3. oktober kl. 04:00 UTC (`.github/workflows/datafordeler-import.yml`). DAR-felterne til positioner kunne ikke afprøves herfra uden Datafordeler-nøgle, så loggen bør tjekkes efter kørslen.

### 1.3 De 62 mulige dubletter
Gennemført i PR #58. Ingen kontakt til BBR eller kommuner. Der grupperes kun ved fælles bygnings-id, og ingen adresser deler et. De 62 par står i det interne view `app_v2.registration_duplicate_review_v1` (kun service role) med årsag: 25 på forskellige adresser, 37 på samme adresse.

### 1.4 Ét Leaflet-kort
Gennemført i PR #58: `src/components/ShelterMap.tsx` bruges af både resultatsiden og detaljesiden (`src/components/ShelterDetailMap.tsx`). Mørkt filter på flise-laget, ufiltreret orange markør, og kortet hentes først ved klik. Se 2.1 for knappen.

### 1.5 Aliasser, 410 og 404
Aliasser og 410 er gennemført i PR #58 (`app_v2.shelter_path_aliases` med path_slug, shelter_id, valid_from og valid_to, 308 til aktuel slug, 410 via `src/proxy.ts` og `src/app/beskyttelsesrum/[slug]/fjernet/route.ts`).

Nyt i denne runde: 404-siden har søgefeltet og links til forsiden og kommuneoversigten (`src/app/not-found.tsx`). Ukendte slugs svarer fortsat 404. Skærmbilleder under 3.8.

## 2. Rettelser

### 2.1 Én handling til kortet
Valg: "Vis på kort" bliver stående og viser Leaflet-kortet på siden. Knappen "Vis kortet" i pladsholderen er fjernet. Et klik på "Vis på kort" (et link til `#registrering-kort`) indlæser kortet og hopper til det. Pladsholderen viser adressen og teksten "Vælg "Vis på kort" for at hente kortet fra OpenStreetMap." Der er intet link til /kort, så omdøbning til "Se på landskortet" var ikke nødvendig.

Fil: `src/components/ShelterDetailMap.tsx`. Skærmbilleder: `3-7a-detalje-*`, `3-7b-detalje-kort-*`.

### 2.2 Forsidens titel
`<title>` og `og:title` er nu "Find beskyttelsesrum nær dig | Find Beskyttelsesrum" (`src/app/page.tsx`, standardtitlen i `src/app/layout.tsx`).

### 2.3 Footer uden for main
Footeren renderes nu én gang i `src/app/layout.tsx` efter `{children}`, så hver side har header, main og footer som landmarks. `GlobalFooter` er fjernet fra alle sider (blandt andet `src/app/page.tsx`, `src/app/beskyttelsesrum/[slug]/page.tsx`, `src/app/kommune/[slug]/kommune-view.tsx`, `src/app/kort/page.tsx`, `src/app/naer-dig/client.tsx`, `src/app/not-found.tsx` og admin-siderne). `main` bruger `flex-1` i stedet for `min-h-screen`, så footeren står i bunden uden ekstra scroll (`src/components/ui-classes.ts`).

### 2.4 Tekst på /kort
Nu: "Kortet kan ikke bruges med tastatur. Brug søgningen eller kommuneoversigten." med links til `/` og `/kommune` (`src/app/kort/page.tsx`).

### 2.5 Kommunesidernes H1 og titel
H1 er "Beskyttelsesrum i {kommune}", og `<title>` følger (`src/app/kommune/[slug]/kommune-view.tsx`, `src/app/kommune/[slug]/metadata.ts`, `src/app/kommune/[slug]/soeg/page.tsx`). Tallene under H1 er uændrede.

### 2.6 Kommaet under H1 på detaljesiden
Kommaet er kun til skærmlæsere: det ligger i `<span className="sr-only">, </span>`, og prikken "·" er `aria-hidden`. Det er ikke synligt, så det er ladt stå. Det sørger for, at en skærmlæser holder pause mellem "8000 Aarhus C", "286 registrerede pladser" og "Bygning til kontor" i stedet for at læse det som én sætning. Teksten "· , " opstår kun, når man kopierer den rå tekst.

## 3. Test

### 3.1 Forsiden
| Scenarie | Resultat | Skærmbilleder |
|---|---|---|
| Tom søgning plus "Søg" | Fejltekst "Skriv en adresse, et postnummer eller en by." ved feltet, fokus i feltet | `3-1a-tom-soegning-*` |
| "Banegårdspladsen 1, Aarhus" plus Enter | Forslagsliste. 1440: Aarhus-adresserne øverst. 390: København, Ballerup og Kalundborg øverst | `3-1b-fritekst-enter-*` |
| Tvetydig fritekst plus klik på "Søg" | 5 forslag, instruktionen står i aria-live-regionen | `3-1c-tvetydig-klik-*` |

Forskellen i 3.1b skyldes efter alt at dømme sandkassens langsomme netværk: den kommunefiltrerede forespørgsel nåede ikke frem, så den ufiltrerede blev vist. Søgningen viser hellere et ufiltreret svar end intet. Jeg har ikke kunnet genskabe det på et normalt netværk herfra, se åbne spørgsmål.

Fundet undervejs og rettet: på et langsomt netværk kunne opslaget af en adresses koordinater hænge, så kun en spinner blev vist. Alle kald til Adressevælger har nu en grænse på 10 sekunder, hvorefter fejlteksten med "Prøv igen" vises (`src/lib/address/adressevaelger.ts`, test i `tests/search-and-urls.test.ts`).

### 3.2 Resultatsiden efter "Rådhuspladsen 2, 8000 Aarhus C"
Listevisning, kortvisning og valgt resultat: `3-2a-liste-*`, `3-2b-kort-*`, `3-2c-valgt-resultat-*`. Siden starter øverst (scrollY 0), og fokus lander på overskriften `#nearby-results-heading` i begge størrelser. På 390 ramte første forsøg grænsen på 10 sekunder og viste fejlteksten. Andet forsøg lykkedes.

### 3.3 Mørke fliser
`3-3-moerke-fliser-*`. Flise-laget er mørkt, markørerne har deres egne farver.

### 3.4 Offline
Fremgangsmåde: søg, "Gem til brug uden net" på /naer-dig, sluk nettet (alle forespørgsler afvist og browseren offline), genindlæs forsiden og /naer-dig.

| Del | Uden net | Hvad siden siger |
|---|---|---|
| Forsiden | Vises fra den gemte kopi | Intet, siden virker |
| Adressesøgning | Virker ikke | "Adressesøgningen er ikke tilgængelig lige nu. Prøv igen, eller brug din placering." med "Prøv igen" |
| /naer-dig | 10 resultater fra gemte fliser | "Viser gemte data. Netværket svarer ikke, så resultaterne bygger på data gemt på din enhed 2. oktober kl. 09.58. De kan være forældede." |
| Kortets baggrund | Virker ikke (OpenStreetMap kræver net) | "Kortbaggrunden er ikke tilgængelig. Adresser og registreringer virker stadig." med "Prøv kortet igen" og "Til resultatlisten". Markørerne vises |

Fundet undervejs og rettet: på mobil viste kortfanen offline "Kortet kunne ikke indlæses". Kortets kode hentes først, når man åbner fanen "Kort", så den var ikke med i kopien. Nu henter "Gem til brug uden net" resultatsiden og kortets dele, før kopien gemmes. Kaldene går gennem de samme indlæsningsfunktioner som siden selv, fordi bundleren navngiver filerne efter, hvor de indlæses fra (`src/components/OfflineCopyControl.tsx`, `src/app/naer-dig/map-wrapper.tsx`, `src/app/naer-dig/client.tsx`, `src/components/ShelterMap.tsx`, test i `tests/public-ui.test.ts`). Efter rettelsen viser mobil det samme som desktop.

Skærmbilleder: `3-4a-gemt-*`, `3-4b-forside-offline-*`, `3-4c-resultat-offline-*`.

### 3.5 Kun tastatur
Kørt på 1440 x 900. Tastaturflowet er det samme på 390, men mobil bruges sjældent med tastatur.

1. Tab fra toppen når feltet `#adresse`.
2. Pil ned og pil op flytter markeringen i forslagene (aktiv: "Rådhuspladsen 1, 1550 København V").
3. Escape lukker listen (0 forslag tilbage).
4. Enter søger, og fokus lander på H1 "Nærmeste registrerede sikringsrum".
5. Tab når første resultatlink, "H.C. Andersens Boulevard 18".
6. Enter åbner `/beskyttelsesrum/h-c-andersens-boulevard-18-1553-koebenhavn-v`.

Skærmbilleder: `3-5a-tastatur-forslag-1440`, `3-5b-tastatur-resultat-1440`, `3-5c-tastatur-detalje-1440`.

### 3.6 VoiceOver iOS
Ikke testet. Miljøet har ingen iOS-enhed eller VoiceOver. Det nærmeste, jeg kan vise, er Chromiums tilgængelighedstræ: ved tom søgning er feltet markeret `[invalid]`, og fejlteksten "Skriv en adresse, et postnummer eller en by." ligger i en status-region (aria-live polite). Instruktionen "Vælg den rigtige adresse på listen" ligger i samme type region. Det bør læses op af VoiceOver, men det skal bekræftes på en iPhone (se åbne spørgsmål).

### 3.7 Detaljesiden
Én handling: 0 knapper med "Vis kortet" og 1 link "Vis på kort". Kortet indlæses ved klik og viser mørke fliser med orange markør. Skærmbilleder: `3-7a-detalje-*` (før klik), `3-7b-detalje-kort-*` (efter klik).

### 3.8 404 og 410
| Side | Status | Indhold | Skærmbilleder |
|---|---|---|---|
| `/beskyttelsesrum/findes-ikke-1234` | 404 | "Siden findes ikke", søgefelt, links til forsiden og kommuneoversigten | `3-8a-404-*` |
| En registrering fjernet fra BBR | 410 | "Registreringen findes ikke længere i BBR", sidste adresse (Jernet 2B, 6000 Kolding) og link til søgning nær den | `3-8b-410-*` |

Første 404-billede viste knapperne halvt gennemsigtige. Det var en farveovergang, der blev fanget midt i. Knapperne er hverken deaktiverede eller dæmpede (målt opacity 1), og billedet er taget om.

## Åbne spørgsmål

1. **3.6 VoiceOver:** kan du eller en kollega teste på en iPhone, om "Vælg den rigtige adresse på listen" og fejlteksten ved tom søgning læses op? Jeg kan ikke teste det herfra.
2. **1.2 Postnumre:** første import med alle postnumre kører 3. oktober kl. 04:00 UTC. Tjek loggen bagefter, eller start importen manuelt nu. Positionerne fra DAR er ikke afprøvet mod det rigtige API.
3. **3.1b på mobil:** de ufiltrerede forslag skyldtes efter alt at dømme sandkassens langsomme netværk. Ser du det samme på din telefon med "Banegårdspladsen 1, Aarhus", så sig til.
