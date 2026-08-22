# Find Beskyttelsesrum

[![Application quality](https://github.com/svanecode/findbeskyttelsesrum/actions/workflows/application-quality.yml/badge.svg)](https://github.com/svanecode/findbeskyttelsesrum/actions/workflows/application-quality.yml)
[![Production smoke monitoring](https://github.com/svanecode/findbeskyttelsesrum/actions/workflows/production-smoke.yml/badge.svg)](https://github.com/svanecode/findbeskyttelsesrum/actions/workflows/production-smoke.yml)

[findbeskyttelsesrum.dk](https://findbeskyttelsesrum.dk) er et gratis, uafhængigt orienteringsværktøj til BBR-registreringer af sikringsrumspladser i Danmark. Brugeren kan søge på en adresse, bruge sin aktuelle placering eller gå via kommuneoversigten og landskortet.

En registrering er ikke en garanti for offentlig adgang, klargøring eller aktuel fysisk stand. Tjenesten er ikke en myndighedstjeneste eller en evakueringsanvisning. Ved varsling skal man gå indenfor og følge myndighedernes information.

## Hvad løsningen indeholder

- adressesøgning med DAWA og nærhedsberegning uden adresse eller koordinater i URL'en;
- landskort og lokale kort med Leaflet og OpenStreetMap;
- kommune- og registreringssider med forklaring af datagrundlaget;
- privat fejlrapportering med moderationskø;
- GitHub-login, tilladelsesliste og MFA til administration;
- daglig BBR/DAR-import med staging, kvalitetskontrol, atomisk publicering og rollback;
- transaktionelt opdaterede kommuneaggregater og versionsbundet kortcache;
- verificerbar produktions- og dataversion via `/api/health`;
- gratis produktionskontrol, uafhængig uptime-kontrol og privatlivsvenlige, aggregerede driftstællere.

Tjenesten skal forblive gratis for brugeren. Kortet må ikke få en obligatorisk betalt kortleverandør, og driften er indrettet til at bruge leverandørernes gratis muligheder og tydelige forbrugsgrænser. OpenStreetMaps offentlige standardtiles bruges ansvarligt med listevisninger som fallback.

## Arkitektur og dataflow

```text
Datafordeler (BBR + DAR)
        │
        ▼
Python-importer ──► privat staging ──► kvalitetskontrol
                                          │
                                          ▼
                            versioneret publicering i app_v2
                                          │
                                          ▼
DAWA ──► Next.js på Vercel ──► offentlige views/RPC'er i Supabase
                 │
                 └──► Leaflet + OpenStreetMap
```

Den offentlige app læser kun eksplicitte, offentlige views og read-only funktioner i Supabase-skemaet `app_v2`. Importkandidater, snapshots, moderation, audit og driftstællere er private. En fejlet eller mistænkelig import ændrer aldrig det aktuelt publicerede datasæt.

## Kom i gang lokalt

### Krav

- Node.js 24 og npm;
- en Supabase-projektadresse og publishable key;
- valgfrit: Python 3.12 og `uv` til importeren;
- valgfrit: Supabase CLI til migrationsarbejde.

### Installation

```bash
nvm use
npm ci
cp .env.example .env
npm run dev
```

Åbn derefter [http://localhost:3000](http://localhost:3000).

Udfyld som minimum disse offentlige værdier i `.env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

`SUPABASE_SECRET_KEY` er kun til server-, import- og driftsopgaver. `RATE_LIMIT_HASH_SECRET` er en separat serverhemmelighed til anonyme forbrugsgrænser og skal indeholde mindst 32 tilfældige tegn. Ingen af dem må få præfikset `NEXT_PUBLIC_`, bruges i browserkode, skrives i logoutput eller lægges i Git. Se alle sikre pladsholdere i [`.env.example`](.env.example).

## Kvalitetskontrol

| Kommando | Formål |
| --- | --- |
| `npm run lint` | Kontrollerer kodekvalitet. |
| `npm run typecheck` | Kontrollerer TypeScript-typer. |
| `npm test` | Kører enheds- og sikkerhedstests. |
| `npm run test:db` | Kører databaseinvarianter mod lokal Supabase. |
| `npm run build` | Bygger produktionsversionen. |
| `npm run test:e2e` | Bygger og kører Playwright i en browser. |
| `npm run test:release` | Kører den samlede lokale releasekontrol. |
| `npm run monitor:production` | Kontrollerer den live brugerrejse og dataalder. |

Pull requests skal bestå lint, typekontrol, kode- og databaseinvarianter. Efter merge til `main` køres desuden produktionsbuild og hele browserhistorien.

## Dataimport

Den autoritative importer ligger i [`tools/datafordeler-importer`](tools/datafordeler-importer). GitHub Actions kører den dagligt. En manuel kørsel starter som tørkørsel; en fuld skrivning kræver en eksplicit produktionsbekræftelse.

Importerens lokale kontroller køres fra dens egen mappe:

```bash
uv sync --frozen --extra dev
uv run ruff check .
uv run mypy shelter_importer
uv run pytest
uv run python -m build
```

Læs den operationelle kontrakt i [importerens README](tools/datafordeler-importer/README.md) og det samlede dataflow i [`docs/data/import-flow.md`](docs/data/import-flow.md).

## Databaseændringer

Alle databaseskemaændringer skal ligge som tidsstemplede filer i `supabase/migrations`. Brug Supabase CLI, så lokal og ekstern migrationshistorik forbliver enige:

```bash
supabase db push --dry-run
supabase db push
supabase migration list
```

Kør ikke migrationsfiler direkte én efter én uden migrationshistorik. Kontrollér altid den konkrete diff og Supabase-advisors ved ændringer i views, funktioner, rettigheder eller RLS.

## Drift og administration

- `/admin` er den beskyttede indgang til moderation og drift.
- Administratorer logger ind gennem GitHub OAuth, skal være på tilladelseslisten og skal gennemføre MFA.
- `/admin/drift` viser importer, kvalitetskontroller, aktivt datasæt, rollback og 30 dages aggregerede driftstal.
- `/api/health` viser deployet Git SHA, deployment-ID, byggetid, publication-ID, offentlig datarevision, import-run-ID og dataalder. Gamle eller inkonsistente data giver `503 degraded`.
- Produktionsflowet kontrolleres automatisk to gange i timen. Fejl opretter en GitHub-issue; næste succes lukker den igen.
- Et service-only heartbeat kobler health-status til den seneste gennemførte produktionskontrol. En gratis ekstern monitor kan derfor også opdage, hvis GitHub-workflowet slet ikke starter.
- De egne driftstællere indeholder ikke IP-adresse, bruger-id, adresse, koordinater, søgetekst eller fuld URL og slettes senest efter 90 dage.
- Rapportfritekst og identificerende auditfelter redigeres efter 24 måneder; struktureret audit slettes efter 5 år. Se [`docs/privacy/retention.md`](docs/privacy/retention.md).
- Recovery og nøgleudskiftning er dokumenteret i [`docs/operations/mfa-recovery-and-secret-rotation.md`](docs/operations/mfa-recovery-and-secret-rotation.md).

## Release

1. Opret en feature branch og en pull request.
2. Lad de obligatoriske kvalitetskontroller bestå.
3. Anvend og verificér eventuelle Supabase-migrations før kode, der afhænger af dem, frigives.
4. Merge til `main`.
5. Byg og udgiv fra det linkede Vercel-projekt; projektet er ikke afhængigt af automatisk Git-deploy.
6. Kontrollér browserhistorien og produktionskontrollen mod det deployede Git-SHA.

## Struktur

| Mappe | Indhold |
| --- | --- |
| `src/app` | Sider, API-ruter, metadata og adminflader. |
| `src/components` | Genbrugelige brugerfladekomponenter. |
| `src/lib` | Dataadgang, sikkerhed, kort, SEO og domænelogik. |
| `supabase/migrations` | Versionsstyrede databaseændringer. |
| `tools/datafordeler-importer` | Autoritativ Python-importer og egne tests. |
| `tests` | Enheds- og sikkerhedstests. |
| `e2e` | Playwright-tests af hele brugerrejsen. |
| `scripts` | Aktive drifts-, parity- og verifikationsværktøjer. |
| `docs` | Aktive data-, kvalitets- og driftsaftaler. |

Se [dokumentationsoversigten](docs/README.md) for dataaftaler, kvalitet og drift.
