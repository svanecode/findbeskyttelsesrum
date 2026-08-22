# Dokumentation

Denne mappe samler projektets aktive data-, kvalitets- og driftsaftaler. Den aktive kode, migrationshistorikken, GitHub Actions-filerne og [projektets README](../README.md) er autoritative.

## Data og import

Læs dokumenterne i denne rækkefølge:

1. [`data/schema.md`](data/schema.md) beskriver den aktive `app_v2`-grænse og de vigtigste tabeller.
2. [`data/import-model.md`](data/import-model.md) beskriver staging, publiceret baseline, snapshots og manuelle rettelser.
3. [`data/import-flow.md`](data/import-flow.md) beskriver den sikre import- og publiceringssekvens.
4. [`data/import-contract.md`](data/import-contract.md) fastlægger importerens krav og databaseinvarianter.
5. [`data/field-ownership.md`](data/field-ownership.md) fordeler ejerskab mellem import, administration og afledte felter.
6. [`data/country-map.md`](data/country-map.md) dokumenterer landskortets dataflow, klyngning og fallback.

Den konkrete Python-opsætning og lokale kommandoer findes i [importerens README](../tools/datafordeler-importer/README.md).

## Kvalitet, sikker kommunikation og drift

- [`qa/emergency-copy-standard.md`](qa/emergency-copy-standard.md) er standarden for offentlig tekst og forbehold.
- [`qa/emergency-utility-checklist.md`](qa/emergency-utility-checklist.md) er den genbrugelige QA-tjekliste.
- [`qa/emergency-utility-review.md`](qa/emergency-utility-review.md) og [`qa/emergency-hardening-release-summary.md`](qa/emergency-hardening-release-summary.md) dokumenterer den seneste samlede gennemgang.
- [`qa/free-observability.md`](qa/free-observability.md) beskriver gratis produktionskontrol, privatlivsvenlige målinger og de accepterede databaseadvarsler.
- [`operations/external-monitoring.md`](operations/external-monitoring.md) beskriver den gratis, uafhængige dead-man monitor.
- [`operations/mfa-recovery-and-secret-rotation.md`](operations/mfa-recovery-and-secret-rotation.md) er runbook for lockout, kompromittering og nøgleudskiftning.
- [`privacy/retention.md`](privacy/retention.md) fastlægger de automatiske opbevaringsfrister.
- Den offentlige `/kontakt`-side og den MFA-beskyttede `/admin/kontakt`-kø udgør den mailfri kontaktkanal; kontaktindhold må aldrig kopieres til GitHub-issues eller almindelige driftslogs.

Den korte release- og driftsprocedure står i [hoved-README'en](../README.md#drift-og-administration).
