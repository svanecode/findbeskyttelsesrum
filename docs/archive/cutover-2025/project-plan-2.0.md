# Findbeskyttelsesrum — Project Plan 2.0

## Formål
Denne plan styrer moderniseringen af det eksisterende live repo `svanecode/findbeskyttelsesrum`.
Arbejdet sker in-place. Sitet skal forblive deploybart under hele forløbet.

## Grundprincipper
- Arbejd i det eksisterende repo
- `main` må aldrig efterlades i brudt tilstand
- Hver PR skal være deploybar eller klart feature-flagged
- V2-repoet bruges som donor, ikke som noget der kopieres blindt
- `app_v2` er måldatalaget
- Python-updateren fortsætter parallelt indtil TS-importeren er bevist stabil
- Ingen admin, auth eller login i scope
- Dansk i brugerfladen, engelsk i kode og commits
