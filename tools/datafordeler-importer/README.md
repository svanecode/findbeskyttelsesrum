# Datafordeler-importer

Denne mappe indeholder projektets autoritative BBR/DAR-importer. Den lægger
først en hel kørsel i privat staging. Databasen publicerer kun datasættet, hvis
de samlede kvalitetskontroller består; redaktionelle rettelser og eksklusioner
håndteres fortsat separat.

## Sikkerhedsregler

- En manuel kørsel er som standard en tørkørsel uden databaseadgang.
- Kun en komplet, ucappet stagingkørsel kan publiceres eller markere poster som manglende.
- Genoptagne kørsler kopierer det tidligere checkpointede stagingsæt og valideres samlet.
- Kun teknisk fejlede kørsler med et reelt stagingsæt kan genoptages; kvalitetsafviste kørsler kan ikke vælges.
- Afkortede, fejlede og afviste kørsler ændrer aldrig det offentlige datasæt.
- Nye kilderækker starter `withheld` og publiceres kun eksplicit efter bestået BBR/DAR-kvalitetsgate.
- Publiceringsfunktion v3 er kun tilgængelig for `service_role`; den interne v2-implementering kan ikke kaldes direkte.
- Privilegerede nøgler må aldrig ligge i `NEXT_PUBLIC_*`, i git eller i
  logoutput.

## Lokal udvikling

Importeren kræver Python 3.12 og `uv`.

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

GitHub-arbejdsgangen kører automatisk hver dag og kan også startes manuelt som
tørkørsel. En manuel skrivning kræver den præcise produktionsbekræftelse, som
arbejdsgangen viser.

## Miljøvariabler

- `DATAFORDELER_API_KEY` kræves altid.
- `SUPABASE_URL` og `SUPABASE_SECRET_KEY` kræves kun ved skrivning.
- Efterkontrollerne i hovedprojektet bruger også
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Alle privilegerede værdier skal blive i lokale miljøfiler eller GitHub
  Secrets. De må ikke indgå i `import-summary.json`.

Databasen skal have alle filer i `supabase/migrations` anvendt, herunder
`*_versioned_import_publishing.sql` og `*_release_1_data_integrity.sql`, før skrivning aktiveres.

Se [projektets dokumentationsoversigt](../../docs/README.md) for den samlede
importmodel, feltansvar og driftskontrol.
