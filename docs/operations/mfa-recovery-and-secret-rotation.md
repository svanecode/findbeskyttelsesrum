# MFA-recovery og rotation af hemmeligheder

Denne runbook gælder den private moderation. Den må ikke bruges til at omgå tilladelseslisten eller sænke kravet om MFA. Alle recoveryhandlinger skal dokumenteres i den private driftslog med tidspunkt, udfører og årsag, men uden hemmelige værdier.

## Forebyg ejer-lockout

- Bevar mindst to aktive `owner`-konti med hver sit stabile GitHub provider-ID.
- Hver owner bruger sin egen GitHub-konto og sin egen TOTP-faktor. Del aldrig en authenticator.
- Opbevar GitHubs recoverykoder sikkert uden for repositoryet.
- Test mindst hvert kvartal, at begge owners kan gennemføre GitHub-login og nå AAL2 i Supabase.
- Kontrollér provider-ID mod GitHub-identiteten, før en ny moderator aktiveres. Brug aldrig visningsnavn eller profiltekst som identitet.

## Mistet TOTP-faktor

1. Deaktivér den berørte moderator i `app_v2.moderator_accounts`, hvis der er mistanke om kompromittering.
2. En anden owner finder brugerens Supabase Auth user-ID og kontrollerer det mod det forventede GitHub provider-ID.
3. List brugerens MFA-faktorer med Supabase Admin MFA API.
4. Slet kun den mistede faktor med `auth.admin.mfa.deleteFactor({ userId, id })`. Sletning af en verificeret faktor logger brugerens aktive sessioner ud.
5. Brugeren logger ind igen gennem GitHub, tilmelder en ny TOTP-faktor og gennemfører MFA-verifikation.
6. Genaktivér først moderatorkontoen, når provider-ID, Supabase user-ID og AAL2 er kontrolleret.
7. Gennemgå auditsporet fra tidspunktet omkring hændelsen.

Slet aldrig rækker direkte i Supabases `auth`-skema. Hvis ingen anden owner kan udføre recovery, bruges Supabase-projektets ejeradgang og den dokumenterede Admin MFA API; en ny faktor må ikke tilknyttes uden en uafhængig identitetskontrol.

## Kompromitteret moderator

1. Sæt `is_active = false` på den konkrete række i `app_v2.moderator_accounts`.
2. Fjern alle Supabase Auth MFA-faktorer og tilbagekald aktive sessioner for den berørte bruger.
3. Tilbagekald projektets GitHub OAuth-adgang fra den berørte GitHub-konto, hvis kontoen kan være kompromitteret.
4. Gennemgå `app_v2.audit_events`, shelter-overrides, eksklusioner, rapportbeslutninger og dataset-publiceringer.
5. Gendan kun den importerede baseline, hvis auditgennemgangen viser en uautoriseret dataversion. Redaktionelle overrides og eksklusioner skal vurderes særskilt.
6. Rotér berørte fælles hemmeligheder efter proceduren nedenfor.

## Rotation af Supabase secret key

`SUPABASE_SECRET_KEY` er service-adgang og må kun findes i Vercel og GitHub Actions.

1. Opret en ny secret key i Supabase-projektets API-indstillinger uden at slette den gamle endnu.
2. Opdatér Vercels production- og preview-miljøer.
3. Opdatér GitHub Actions secret med samme nye værdi.
4. Udgiv en ny production deployment og kør database-, health- og browserkontroller.
5. Kontrollér daglig import, produktionssmoke og betroet heartbeat.
6. Tilbagekald først den gamle nøgle, når alle kontroller er grønne.

## Rotation af øvrige hemmeligheder

- `RATE_LIMIT_HASH_SECRET`: generér mindst 32 tilfældige bytes, opdatér Vercel og udgiv igen. Eksisterende anonyme rate-limit buckets får nye pseudonyme nøgler og udløber automatisk.
- GitHub OAuth client secret: opret en ny secret i GitHub OAuth-applikationen, opdatér GitHub-providerens secret i Supabase Auth, test login og slet derefter den gamle.
- `DATAFORDELER_API_KEY`: rotér hos Datafordeler, opdatér GitHub Actions secret og kør først en tørkørsel og derefter den normale importer.
- Uptime-konto: brug kontoens egen MFA. En eventuel API-nøgle skal ligge i tjenestens private secret store og er ikke nødvendig for den valgte HTTP-monitor.

Efter enhver rotation kontrolleres `/api/health`, det forventede Git SHA, den aktuelle publication-ID og det seneste betroede heartbeat. Hemmeligheder må aldrig skrives i issue-tekst, workflowoutput, dokumentation eller auditpayload.
