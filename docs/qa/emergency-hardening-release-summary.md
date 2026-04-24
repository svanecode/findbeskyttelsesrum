# Emergency hardening release summary (RC)

Formålet med denne release candidate er at sikre, at Findbeskyttelsesrum fungerer som en **akut nyttefunktion**: brugeren skal hurtigt kunne finde nærmeste beskyttelsesrum, forstå de vigtigste oplysninger og starte navigation.

## Scope og principper

- Fokus på **journey, copy, hierarki og recovery** — ikke redesign.
- Public UI er **dansk-only** og undgår “v2”, overclaims og teknisk sprog.
- Data beskrives som **“bygger på offentlige registerdata”** og tjenesten er **uafhængig**.

## Ruter ændret

- `/` (forside)
- `/shelters/nearby`
- `/beskyttelsesrum/[slug]`
- `/kommune`
- `/kommune/[slug]`
- `/land`
- `/kort`
- `/om-data`
- `/tell-me-more` (redirect)

## Centrale UX/copy ændringer

- **Forside**: én opgave — adresse eller “Brug min placering”.
- **Nærliggende resultater**:
  - Mobil: **liste før kort**.
  - Resultatkort prioriterer beslutning: **afstand/adresse → kapacitet/status → handling**.
  - Handlinger: **“Åbn”** (detalje) + **“Rute”** (Google Maps) når koordinater findes.
  - No-result state: “Vi fandt ikke et beskyttelsesrum” + konkrete næste skridt.
- **Detaljeside**:
  - Above-the-fold beslutningsblok: adresse, kapacitet, status, kilde, data senest hentet.
  - Primær CTA: **“Navigér hertil”** + sticky bund-CTA på mobil/tablet når koordinater findes.
- **Header/footer og sekundære sider**:
  - Header: **Søg**, **Kommuneoversigt**, **Datagrundlag**.
  - Footer: rolig copy + forbehold, tydelig uafhængighed.
  - `/tell-me-more` redirecter til `/om-data` (undgår parallel, forvirrende side).

## Trust/disclaimer tilgang

- Primære trust paths (forside/resultat/detalje) bruger konsekvent:
  - “Bygger på offentlige registerdata” (og hvor relevant: BBR/DAR)
  - “Følg altid myndighedernes anvisninger.”
  - “Uafhængig. Ikke tilknyttet den danske stat.”

## Accessibility checks (sanity)

- Søg inputs har labels (inkl. skjulte).
- Knapper/links har synlig tekst.
- Tastatur: Enter kan gennemføre søgning (når søgning giver et valg).
- Ingen nested anchors i resultatkort (CTA’er er separate links).

## Performance-noter

- **Forside**: loader ikke kort-payload.
- **/shelters/nearby**: liste er brugbar uden map-interaktion (og kommer først på mobil).
- **/kort**: markerdata hentes client-side (ikke indlejret i HTML), og markers pumpes i batches.

## Local QA (kort)

- Dev server smoke test: ruter renderede uden synlige “v2”, engelsk fallback eller “Officielle data”.
- Bemærkning: I én session viste Turbopack en ældre build; løst ved restart af `npm run dev`.

## Preview QA: kommandoer og konkrete URL’er

Når preview er deployed, test disse URL’er (erstat `<PREVIEW_BASE_URL>`):

- `<PREVIEW_BASE_URL>/`
- `<PREVIEW_BASE_URL>/shelters/nearby?lat=55.6761&lng=12.5683`
- `<PREVIEW_BASE_URL>/shelters/nearby?lat=56.1629&lng=10.2039`
- `<PREVIEW_BASE_URL>/shelters/nearby?lat=57.0488&lng=9.9217`
- `<PREVIEW_BASE_URL>/shelters/nearby?lat=abc&lng=12` (ugyldig position)
- `<PREVIEW_BASE_URL>/kommune`
- `<PREVIEW_BASE_URL>/kommune/kobenhavn`
- `<PREVIEW_BASE_URL>/land`
- `<PREVIEW_BASE_URL>/kort`
- `<PREVIEW_BASE_URL>/om-data`
- `<PREVIEW_BASE_URL>/tell-me-more` (redirect til `/om-data`)
- `<PREVIEW_BASE_URL>/beskyttelsesrum/kobenhavn-radhuspladsen-14-e317aa299d35`

## Remaining manual preview checks

- Geolocation “placering afvist” (permissions) på flere enheder/browsere.
- DAWA autocomplete: forslag + “Søg” flow med realistiske adresser.
- Verificer at “Rute”/“Navigér hertil” altid åbner korrekt destination for flere shelters.

## Go / No-go (forslag)

- [ ] Go: Primær rejse fungerer end-to-end (adresse + placering)
- [ ] Go: Mobilrejse (liste før kort, sticky CTA på detalje)
- [ ] Go: Copy-checks (dansk-only, ingen v2/overclaim, trustlinjer ok)
- [ ] Go: Failure states (ugyldige koordinater, ingen resultater, kort-fejl)
- [ ] Go: Sekundære sider er tydeligt sekundære og linker tilbage til søgning
- [ ] Go: Lint/typecheck/build grøn

