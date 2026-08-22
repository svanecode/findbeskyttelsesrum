# Gratis uafhængig produktionsovervågning

Den interne produktionskontrol kører i GitHub Actions. En ekstern monitor skal derfor kontrollere den samme kæde uden at være afhængig af GitHub. Den valgte gratis opsætning er UptimeRobot Free, som understøtter HTTP-kontrol med fem minutters interval.

## Det monitoren skal kontrollere

Opret én HTTP-monitor med disse værdier:

- URL: `https://findbeskyttelsesrum.dk/api/health`
- Interval: 5 minutter
- Forventet HTTP-status: `200`
- Valgfrit keyword: `"status":"ok"`
- Alarm: projektets driftsmail

Endpointet returnerer `503`, når kode-, database-, datasæt- eller driftskontrollen er degraded. Det omfatter også et manglende eller for gammelt betroet produktionsheartbeat. En almindelig besøgende kan ikke oprette dette heartbeat.

Der sendes ingen adresse, koordinater, rapporttekst eller brugeridentifikation til monitoren. Monitoren læser kun et offentligt, aggregeret sundhedsresultat.

## Aktivering

1. Opret eller brug en eksisterende gratis UptimeRobot-konto.
2. Opret HTTP-monitoren ovenfor.
3. Bekræft alarmmailen.
4. Kontrollér, at monitoren er grøn efter en gennemført `Production smoke monitoring`-kørsel.
5. Udløs en kontrolleret fejl i et ikke-produktionsmiljø eller brug monitorens indbyggede testalarm til at verificere alarmkanalen.
6. Registrér dato, kontoansvarlig og alarmmodtager i den private driftslog. Skriv aldrig adgangskoder eller API-nøgler i repositoryet.

## Fejlretning

Ved en alarm læses `/api/health` først. Feltet `reasons` angiver den konkrete årsag. Hvis årsagen begynder med `trusted_operational_heartbeat_`, kontrolleres GitHub-workflowet og repositoryets secrets. En ny succesfuld produktionskontrol opretter et frisk heartbeat og gør endpointet grønt igen.

Health-endpointets grænse er som standard 90 minutter. Den kan justeres med `HEALTH_MAX_OPERATION_AGE_MINUTES`, men skal altid være længere end det planlagte workflowinterval og kort nok til at opdage en udeblevet kørsel.

UptimeRobot er ikke en del af applikationens funktionalitet. Hvis leverandøren ændrer gratisvilkår, kan monitoren flyttes til en anden gratis tjeneste uden kodeændring, så længe den kontrollerer samme URL og HTTP-status.
