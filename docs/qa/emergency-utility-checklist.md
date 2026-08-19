# Orienteringsværktøj: manuel QA-checkliste

Denne checkliste bruges før preview/prod release for at sikre, at Findbeskyttelsesrum er et tydeligt og ansvarligt
orienteringsværktøj baseret på BBR-registreringer.

## A. Primær brugerrejse

- [ ] Åbn `/`
- [ ] Søg på en adresse (fx vejnavn + nummer)
- [ ] Vælg et forslag i autocomplete
- [ ] Bekræft at du lander på `/shelters/nearby` uden adresse eller koordinater i URL'en
- [ ] Åbn nærmeste resultat
- [ ] Åbn adressen i kort som en sekundær handling
- [ ] Gå tilbage til søgning (til `/`) og gentag med en ny adresse

## B. Mobil-checks

- [ ] Forsidens søgning er synlig hurtigt (uden at scroll)
- [ ] “Brug min placering” er synlig og tydelig
- [ ] På `/shelters/nearby` vises **listen før kortet** på mobil
- [ ] Hvert resultat viser **afstand i luftlinje**, BBR-labels og **“Se detaljer”**
- [ ] Der findes ingen sticky navigations-CTA
- [ ] Detaljesiden viser **adresse, kapacitet, adgangsforbehold, datakilde og importdato**

## C. Copy-checks

- [ ] Dansk-only i public UI (inkl. fejl/tomme states/fallbacks)
- [ ] Ingen public “v2”
- [ ] Ingen “Officielle data”/overclaim
- [ ] Ingen demo-links som “Prøv København”
- [ ] Ingen tekniske UI-ord som “parametre”, “provider”, “geocoding”, “source context”
- [ ] “Bygger på offentlige registerdata” bruges hvor relevant
- [ ] “Ikke en evakueringsanvisning” og myndighedsvejledning findes på primære tillidsstier

## D. Fejl- og tomme states

- [ ] **Placering afvist** i browser: brugeren får en brugbar fejl og kan fortsætte med adresse
- [ ] Gammelt link med ugyldige koordinater renses og giver dansk, praktisk fejltekst
- [ ] **Adresseopslag fejler** (DAWA nede): brugeren får dansk besked og kan bruge placering
- [ ] **Ingen forslag** ved adresseinput: der vises en forklaring, og “Søg” er deaktiveret, indtil en gyldig adresse er valgt
- [ ] **Ingen nærliggende resultater**: “Ingen registreringer i resultatet” + næste skridt + links
- [ ] **Kort-fejl / kort indlæser ikke**: listen er stadig brugbar
- [ ] **Detaljeside uden koordinater**: siden er stadig brugbar, og kortlinket er skjult

## E. Sekundære sider

For hver side: tjek at den er sekundær og linker tydeligt tilbage til forsiden.

- [ ] `/kommune`
- [ ] `/kommune/[slug]`
- [ ] `GET /land` → **301** til `/kommune` (land-side fjernet)
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

## H. Automatiske releasekontroller

- [ ] `npm run test:release` består mod en produktionsbygning
- [ ] Playwright består i desktop- og mobilprofil
- [ ] Axe finder ingen automatiserbart registrerbare WCAG A/AA-fejl på nøglesiderne
- [ ] Afvist placering, DAWA-fejl samt nearby-fejl 429, 502 og 504 giver brugbare danske fejltilstande
- [ ] Adresseflowet forlader ikke adresse eller koordinater i resultat-URL'en
- [ ] Rapporteringsflowet er testet uden at skrive testdata til moderationskøen
- [ ] `npm run monitor:production` består for forside, database, DAWA, nearby, kort, kommune og detaljeside
