# Retention og automatisk redigering

Dette dokument er den tekniske opbevaringsaftale for personhenførbare eller fritekstbaserede driftsdata. Den offentlige forklaring findes på `/privatliv`.

| Data | Maksimal opbevaring | Automatisk handling |
| --- | --- | --- |
| Valgfri kontaktmail i fejlrapport | Ved afslutning/afvisning eller senest 90 dage | Feltet sættes til `null` |
| Brugerens rapporttekst | 24 måneder | Erstattes med en fast redigeringsmarkør |
| Moderatorens fritekstnote | 24 måneder | Feltet sættes til `null` |
| Identificerende moderator-id og følsomme auditpayloadfelter | 24 måneder | Identifikator og udvalgte payloadfelter fjernes |
| Resterende struktureret auditspor | 5 år | Hændelsen slettes |
| Aggregerede produktmålinger | 90 dage | Timebucket slettes |
| Betroede driftsheartbeats | 90 dage | Heartbeat slettes |
| Adresse og koordinater i søgeflowet | Højst 60 minutter i fanesessionen | Udløber eller forsvinder med fanen; blokeret storage bruger kun hukommelse |

`app_v2.redact_expired_personal_data_v1()` kører dagligt via Supabase Cron. Funktionen er service-only, idempotent og returnerer kun antal redigerede eller slettede rækker. Den må ikke logge det tidligere feltindhold.

Ved ændring af frister skal migration, databaseinvarianter, denne aftale og den offentlige privatlivsside ændres i samme release. Frister må ikke forlænges alene for analysebekvemmelighed.
