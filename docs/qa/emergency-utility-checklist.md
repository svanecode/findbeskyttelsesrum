# Emergency utility checklist (manual QA)

Denne checkliste bruges før preview/prod release for at sikre, at Findbeskyttelsesrum fungerer som en akut nyttefunktion.

## A. Primær brugerrejse

- [ ] Åbn `/`
- [ ] Søg på en adresse (fx vejnavn + nummer)
- [ ] Vælg et forslag i autocomplete
- [ ] Bekræft at du lander på `/shelters/nearby?lat=...&lng=...`
- [ ] Åbn nærmeste resultat
- [ ] Start navigation
- [ ] Gå tilbage til søgning (til `/`) og gentag med en ny adresse

## B. Mobil-checks

- [ ] Forsidens søgning er synlig hurtigt (uden at scroll)
- [ ] “Brug min placering” er synlig og tydelig
- [ ] På `/shelters/nearby` vises **listen før kortet** på mobil
- [ ] Hvert resultat har **“Åbn”** og (hvis koordinater findes) **“Rute”**
- [ ] Detaljesiden har sticky bund-CTA: **“Navigér hertil”** (hvis koordinater findes)
- [ ] Detaljesiden viser **adresse, kapacitet, status, kilde/dato** før rapport-/sekundære elementer

## C. Copy-checks

- [ ] Dansk-only i public UI (inkl. fejl/tomme states/fallbacks)
- [ ] Ingen public “v2”
- [ ] Ingen “Officielle data”/overclaim
- [ ] Ingen demo-links som “Prøv København”
- [ ] Ingen tekniske UI-ord som “parametre”, “provider”, “geocoding”, “source context”
- [ ] “Bygger på offentlige registerdata” bruges hvor relevant
- [ ] “Følg altid myndighedernes anvisninger” findes på primære trust paths (søg/resultat/detalje)

## D. Fejl- og tomme states

- [ ] **Placering afvist** i browser: brugeren får en brugbar fejl og kan fortsætte med adresse
- [ ] **Ugyldige koordinater** på `/shelters/nearby?lat=...&lng=...` giver dansk, praktisk fejltekst
- [ ] **Adresseopslag fejler** (DAWA nede): brugeren får dansk besked og kan bruge placering
- [ ] **Ingen forslag** ved adresseinput: “Søg” kan stadig prøves uden at bryde flow
- [ ] **Ingen nærliggende resultater**: “Vi fandt ikke et beskyttelsesrum” + næste skridt + links
- [ ] **Kort-fejl / kort indlæser ikke**: listen er stadig brugbar
- [ ] **Detaljeside uden koordinater**: siden er stadig brugbar, og navigation-CTA er skjult/erstattet

## E. Sekundære sider

For hver side: tjek at den er sekundær og linker tydeligt tilbage til “Find nærmeste beskyttelsesrum”.

- [ ] `/kommune`
- [ ] `/kommune/[slug]`
- [ ] `/land` (hvis til stede)
- [ ] `/om-data`
- [ ] `/tell-me-more` (redirect til `/om-data`)
- [ ] `/kort` (hvis til stede)

## F. Accessibility sanity

- [ ] Søg inputs har labels (også hvis de er visuelt skjulte)
- [ ] Knapper/links har synlig tekst (ikke kun ikoner)
- [ ] Tastatur: Enter kan gennemføre søgning
- [ ] Ingen nested anchors / knapper i knapper
- [ ] Fokus-states er synlige og brugbare

## G. Performance sanity

- [ ] Forsiden loader ikke tung map-payload
- [ ] `/shelters/nearby` er brugbar via liste før map-interaktion
- [ ] `/kort` (hvis til stede) embedder ikke fuld marker-payload i HTML (skal hentes klient-side)
- [ ] Ingen stor payload blev tilføjet til forsiden i denne hardening-pass

