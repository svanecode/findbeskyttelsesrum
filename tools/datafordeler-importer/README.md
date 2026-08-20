# Datafordeler-importer

Denne mappe indeholder den produktionsafprøvede BBR/DAR-importer, som blev
flyttet fra `svanecode/Shelter-updater` ved commit `4bdaedc`. Den skriver kun
importørens grunddata til det eksisterende `app_v2`-skema; redaktionelle
rettelser og offentlig synlighed håndteres fortsat separat af hovedprojektet.

## Sikkerhedsregler

- En manuel kørsel er som standard en tørkørsel uden databaseadgang.
- Kun en frisk, komplet og ucappet kørsel må markere poster som manglende.
- Genoptagne, afkortede og fejlede kørsler markerer aldrig poster som manglende.
- Den atomiske afslutningsfunktion er kun tilgængelig for `service_role` og
  ligger i hovedprojektets migrationshistorik.
- Privilegerede nøgler må aldrig ligge i `NEXT_PUBLIC_*`, i git eller i
  logoutput.

## Lokal udvikling

Installér det låste miljø fra denne mappe:

```bash
uv sync --frozen --extra dev
```

Kør kvalitetssikringen:

```bash
uv run ruff check .
uv run mypy shelter_importer
uv run pytest
uv run python -m build
```

En kort, skrivebeskyttet kontrol mod Datafordeler:

```bash
uv run python sync_shelters_graphql.py --dry-run --max-pages 1 --summary import-summary.json
```

På GitHub ligger den nye arbejdsgang som en manuel overtagelseskandidat. Den
gamle daglige kørsel skal først slås fra, når en fuld tørkørsel og én godkendt
produktionskørsel fra hovedprojektet er kontrolleret.

## Miljøvariabler

- `DATAFORDELER_API_KEY` kræves altid.
- `SUPABASE_URL` og `SUPABASE_SECRET_KEY` kræves kun ved skrivning.
- Efterkontrollerne i hovedprojektet bruger også projektets offentlige
  Supabase-nøgle.

Databasen skal have alle filer i `supabase/migrations` anvendt, herunder
`*_datafordeler_import_finalizer.sql`, før skrivning aktiveres.
