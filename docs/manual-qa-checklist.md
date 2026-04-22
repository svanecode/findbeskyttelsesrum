# Manuel QA-checkliste (target-miljø)

**Formål:** Udførbar, logbar kontrol før/efter cutover. Brug sammen med `docs/manual-qa-log-template.md`.

**Miljø-URL (udfyld):** `BASE = _________________________`

**Build / commit:** `_________________________`

**Tester:** `_________________________` **Dato:** `_________________________`

---

## A. Forside `/`

- [ ] **A1** Side loader uden synlig fejl (200).
- [ ] **A2** Adresse-/søgefelt er synligt og fokuserbart.
- [ ] **A3** Flow til nearby: indtast eller vælg kendt adresse → lander på `/shelters/nearby` med forventede koordinater (DAWA/search uændret — kun observe at det virker).
- [ ] **A4** Links til `/land`, `/kommune`, `/om-data` virker.
- [ ] **A5** **Desktop:** layout og typografi ser fornuftige ud.
- [ ] **A6** **Mobil** (smalt viewport): samme som A5, ingen horisontal overflow der ødelægger læsning.

---

## B. Land `/land`

- [ ] **B1** 200, national overskrift og tal vises (eller tydelig tom/fejl-tilstand hvis data mangler — notér i log).
- [ ] **B2** Regioner / kommuneindgange matcher forventet indhold (ingen åbenbar “0 overalt”-bug hvis prod normalt har data).
- [ ] **B3** Mindst ét link til `/kommune/[slug]` virker.
- [ ] **B4** Mindst ét link til `/beskyttelsesrum/[slug]` (eksempelregistrering) virker.
- [ ] **B5** Link til `/om-data` virker.

---

## C. Kommuneindeks `/kommune`

- [ ] **C1** 200, liste over kommuner vises.
- [ ] **C2** Sortering/navngivning ser korrekt ud (da-DK).
- [ ] **C3** Mindst én kommune-link fører til `/kommune/[slug]`.

---

## D. Kommunesider (repræsentative)

Udfør alle tre hvis data findes for dem på target:

| Route | D1 200 + lokalt indhold | D2 forventnings-callout om liste/kort (ikke fuld app_v2-kort-cutover) | D3 kort/liste sektion loader uden crash |
|--------|-------------------------|----------------------------------------------------------------------|----------------------------------------|
| `/kommune/kobenhavn` | [ ] | [ ] | [ ] |
| `/kommune/aarhus` | [ ] | [ ] | [ ] |
| `/kommune/lemvig` | [ ] | [ ] | [ ] |

---

## E. Beskyttelsesrum-detalje `/beskyttelsesrum/[slug]`

- [ ] **E1** Åbn **to** forskellige aktive detaljer (hent slug fra `/land` eller `/kommune/...`) — begge 200.
- [ ] **E2** Navigationslinks (forside, land, kommuner, om data) virker og giver mening.
- [ ] **E3** Kapacitet og adresse vises; copy taler om **registrerede pladser** / register — ingen åbenbar modstrid.
- [ ] **E4** **Metadata (manuel):** “Vis sidekilde” / devtools: `<title>` og meta description matcher siden; `canonical` peger på samme slug.

---

## F. Om data `/om-data`

- [ ] **F1** 200, indhold loader.
- [ ] **F2** Links tilbage til `/`, `/land`, `/kommune` virker.

---

## G. Nearby `/shelters/nearby` (ingen ændring af default — kun observe)

**Koordinater til test:** `lat=55.6761`, `lng=12.5683` (København — justér hvis I bruger andet fælles referencerum).

- [ ] **G1** `BASE/shelters/nearby?lat=55.6761&lng=12.5683` — 200, kort + resultatliste, **aktiv kilde = app_v2 revamp** (badge/copy som i build).
- [ ] **G2** `...&source=legacy` — 200, **legacy compare/fallback** vises som forventet.
- [ ] **G3** Mobil: kort og liste brugbare (scroll, ikke alt dækket af tastatur uden scroll).

---

## H. Tiny public nearby preview (opt-in)

- [ ] **H1** `BASE/shelters/nearby?lat=55.6761&lng=12.5683&appV2NearbyExperiment=public-preview` — 200, lille **preview**/sammenligningsblok vises, aktiv kilde følger stadig normal kontrakt (app_v2 med mindre `source=legacy`).
- [ ] **H2** Preview nævner/adresserer sammenligning med vej/husnummer/postnummer (copy sanity).

---

## I. Intern grouped review (opt-in)

- [ ] **I1** `BASE/shelters/nearby?lat=55.6761&lng=12.5683&appV2NearbyExperiment=grouped` — 200, intern review-panel vises over listen, kort følger aktiv kilde.
- [ ] **I2** Ingen console errors der blokerer interaktion (notér vigtige warnings i log).

---

## J. SEO / metadata sanity

- [ ] **J1** `GET BASE/sitemap.xml` — 200, XML gyldig; indeholder `BASE/land`, mindst én `BASE/kommune/`, mindst én `BASE/beskyttelsesrum/`.
- [ ] **J2** `GET BASE/robots.txt` — 200, `Sitemap:` peger på korrekt domæne.
- [ ] **J3** Forside (eller vilkårlig side uden eget OG-billede): i HTML-head findes `og:image` der peger på **genereret** Open Graph (typisk `opengraph-image` under `/_next/...` eller tilsvarende — **ikke** død link til manglende `/og-image.jpg`).
- [ ] **J4** `/land` og `/kommune`: `canonical` og `og:url` matcher forventede paths (stikprøve i kilde).

---

## K. Afslutning

- [ ] **K1** Alle fejl og afvigelser er skrevet i log (se template).
- [ ] **K2** Go/no-go anbefaling noteret: **Klar til cutover** / **Ikke klar** + årsag.
