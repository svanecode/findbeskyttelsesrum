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

| Route | D1 200 + lokalt indhold | D2 note om at liste/kort viser registrerede oplysninger | D3 kort/liste sektion loader uden crash |
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

- [ ] **G1** `BASE/shelters/nearby?lat=55.6761&lng=12.5683` — 200, kort + resultatliste.
- [ ] **G2** Gentag for yderligere to lokationer:
  - Aarhus (`lat=56.1629&lng=10.2039`)
  - Aalborg (`lat=57.0488&lng=9.9217`) eller Odense (`lat=55.4038&lng=10.4024`)
- [ ] **G3** Mobil: kort og liste brugbare (scroll, ingen kritisk layoutfejl).

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

---

## L. `/kort` first-load guard (skal køres mod preview)

- [ ] **L1** Kør `scripts/first-load-audit.mjs` mod preview og gem output i QA-loggen:

```bash
AUDIT_BASE_URL=https://<preview-url> node scripts/first-load-audit.mjs
```

- [ ] **L2** Verificér at output siger at marker payload **ikke** er i `/kort` HTML (markers skal komme via `/api/country-shelters`).
