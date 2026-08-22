# Retention og automatisk redigering

Dette dokument er den tekniske opbevaringsaftale for personhenførbare eller fritekstbaserede driftsdata. Den offentlige forklaring findes på `/privatliv`.

| Data | Maksimal opbevaring | Automatisk handling |
| --- | --- | --- |
| Ældre kontaktmail i fejlrapporter | Ved afslutning/afvisning eller senest 90 dage | Feltet sættes til `null`; nye rapporter indsamler ikke mail |
| Brugerens rapporttekst | 24 måneder | Erstattes med en fast redigeringsmarkør |
| Moderatorens fritekstnote | 24 måneder | Feltet sættes til `null` |
| Kontaktportalens emne, beskeder og adgangskode-hash | 24 måneder efter seneste aktivitet; højst 12 måneder efter lukning | Hele sagen og beskederne slettes samlet |
| Identificerende moderator-id og følsomme auditpayloadfelter | 24 måneder | Identifikator og udvalgte payloadfelter fjernes |
| Resterende struktureret auditspor | 5 år | Hændelsen slettes |
| Aggregerede produktmålinger | 90 dage | Timebucket slettes |
| Betroede driftsheartbeats | 90 dage | Heartbeat slettes |
| Adresse og koordinater i søgeflowet | Højst 60 minutter i fanesessionen | Udløber eller forsvinder med fanen; blokeret storage bruger kun hukommelse |

`app_v2.redact_expired_personal_data_v1()` kører dagligt via Supabase Cron. Funktionen er service-only, idempotent og returnerer kun antal redigerede eller slettede rækker. Den må ikke logge det tidligere feltindhold. Kontaktportalens auditspor indeholder aldrig emne, beskedtekst, sagsnummer eller adgangskode-hash.

En moderator med MFA kan slette en allerede lukket kontaktsag før fristen, når det konkrete sagsnummer indtastes som bekræftelse. Sletningen fjerner sagen og alle beskeder atomisk og efterlader kun en indholdsfri audit-hændelse.

Ved ændring af frister skal migration, databaseinvarianter, denne aftale og den offentlige privatlivsside ændres i samme release. Frister må ikke forlænges alene for analysebekvemmelighed.
