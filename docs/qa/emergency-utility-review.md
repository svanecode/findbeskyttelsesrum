# Emergency utility hardening review

Denne note opsummerer hardening-pass’et og fungerer som release-gate sammen med den manuelle checklist.

## Hvad blev ændret (kort)

- **Kopi-standard**: ensartede regler for public UI-tekst i `docs/qa/emergency-copy-standard.md`.
- **Metadata**: offentlig beskrivelse og trust-linje harmoniseret (Danish-only, ingen “v2”).
- **Forside (`/`)**: gjort til én opgave: søg adresse eller brug placering.
- **Nærliggende resultater (`/shelters/nearby`)**:
  - mobil: liste før kort
  - beslutningskort med afstand/adresse/kapacitet/status
  - actions: “Åbn” + “Rute” (Google Maps) når koordinater findes
  - forbedrede tomme/failure states (dansk og praktisk)
- **Detaljeside (`/beskyttelsesrum/[slug]`)**:
  - beslutningsblok over fold (adresse, kapacitet, status, kilde/dato)
  - “Navigér hertil” + sticky mobil CTA når koordinater findes
  - rapportfunktion holdt sekundær
- **Navigation (header/footer)**:
  - header: “Søg”, “Kommuneoversigt”, “Datagrundlag”
  - footer: rolig copy + forbehold, færre links, ingen overclaims
- **Sekundære sider**:
  - `/om-data` → “Datagrundlag” med plain-language fokus
  - `/tell-me-more` redirect til `/om-data`
  - `/land`, `/kommune`, `/kort` tydeliggjort som sekundære og linker tilbage til søgning

## Ruter berørt

- `/` (forside)
- `/shelters/nearby`
- `/beskyttelsesrum/[slug]`
- `/kommune`
- `/kommune/[slug]` (kun label-konsistens)
- `/land`
- `/om-data`
- `/tell-me-more` (redirect)
- `/kort`

## Intentionally left unchanged

- **Datamodel/query-adfærd**: ingen ændringer i supabase queries eller datakontrakter ud over at bruge felter, der allerede var tilgængelige i API-responser til rendering.
- **Importer / interne tekster**: interne engelske strenge i importer-kode (fx “Imported…”, “Unknown…”) blev ikke ændret, da de ikke er public UI.
- **Større visuel redesign**: styling-retning og komponentstruktur er bevaret; ændringer er primært hierarki/copy/utility.

## Kendte begrænsninger / ting at verificere manuelt

- **Geolocation**: browser-permissions og device-specifik fejltekst varierer; tjek “placering afvist” flow.
- **DAWA**: hvis autocomplete fejler eller returnerer 0 resultater, skal “Søg” stadig føles robust.
- **Kort**: kort-fejl må ikke blokere liste/detalje-journey.
- **Status-konsistens**: verify at status labels vises korrekt i resultater + detalje.
- **/kort payload**: markers skal hentes client-side (ikke indlejret i HTML).

## Repo-wide public string smoke check (resultat)

Søgt efter: `v2`, `Officielle data`, `officielle data`, `Prøv København`, `Udforsk København`, `parametre`, `provider`,
`geocoding`, `source context`, `Shelter record`, `Public shelter`, `Unknown municipality`, `Imported`.

- **Public-facing matches fixed**: Ingen nye public matches blev fundet i app-koden i denne pass.
- **Internal-only matches left unchanged**:
  - `src/lib/importer/*`: “Imported …”, “Unknown …” (intern importer/logik, ikke public UI)

## /kort tilstede?

- [x] `/kort` findes i denne branch.
- Notat: Markers hentes via fetch i client-komponenten (ikke indlejret i HTML), og popups linker til detaljesider.

## Go / No-go

- [ ] Go: Primær rejse er testet manuelt (A)
- [ ] Go: Mobilrejse er testet manuelt (B)
- [ ] Go: Copy-checks er bestået (C)
- [ ] Go: Failure states er testet (D)
- [ ] Go: Sekundære sider er testet og sekundære (E)
- [ ] Go: Accessibility sanity check (F)
- [ ] Go: Performance sanity check (G)

## Local functional QA pass

**Dato**: 24. april 2026  

**Ruter testet lokalt**:
- `/`
- `/shelters/nearby?lat=55.6761&lng=12.5683`
- `/shelters/nearby?lat=56.1629&lng=10.2039`
- `/shelters/nearby?lat=abc&lng=12` (ugyldig position)
- `/kommune`
- `/land`
- `/kort`
- `/om-data`
- `/tell-me-more` (redirect)

**Issues fundet**:
- Efter flere ændringer viste Turbopack i én session en ældre build af `/shelters/nearby` (manglede “Åbn”/“Rute”). Dette blev løst ved at genstarte `npm run dev`.
- Mobil: sticky bund-CTA “Navigér hertil” på detaljesiden var ikke synlig ved første mobiltest. Justeret til at være synlig op til `md` breakpoint og med safe-area padding.

**Fixes lavet**:
- `src/app/beskyttelsesrum/[slug]/page.tsx`: sticky bund-CTA vises nu på mobil/tablet (op til `md`) og tager højde for safe-area.

**Blockers**:
- Ingen hårde blockers identificeret under route-smoke test med direkte lat/lng.
- Bemærk: Adresseautocomplete afhænger af DAWA/Dataforsyningen og bør verificeres manuelt i det miljø, hvor API’en er tilgængelig.

**Resterende manuelle checks**:
- Geolocation “placering afvist” (permissions) på flere enheder/browsere.
- DAWA autocomplete: forslag + “Søg” flow ved realistiske adresser.
- “Rute”/“Navigér hertil” destinations-koordinater verificeres for flere tilfældige shelters.

