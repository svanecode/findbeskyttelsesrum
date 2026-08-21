# Landskortets dataflow

Landskortet er et gratis, orienterende kort over den samme publicerede BBR-læsemodel som resten af siden. Kortet bruger fortsat OpenStreetMaps offentlige standardtiles ansvarligt og har kommuneoversigten som fallback, hvis kortbaggrunden ikke kan hentes.

Den nationale afgrænsning går til 15,3° øst, så hele Bornholm indgår. Registreringer øst for 15° er gyldige danske data og må ikke filtreres fra som koordinatafvigelser.

## Kortobjekter efter zoom

`GET /api/country-shelters?format=features&north=…&south=…&east=…&west=…&zoom=…` er den aktive kortkontrakt.

- Zoom 5–9: Postgres samler alle registreringer i deterministiske geografiske celler. Celler med flere registreringer returneres som klynger med antal, samlet kapacitet og grænser.
- Zoom 10–18: Postgres returnerer de konkrete offentlige registreringer i det synlige område.
- En enkelt registrering i en lav-zoom-celle returneres som en almindelig markør.
- Alle svar er begrænset til højst 5.000 kortobjekter og oplyser både antallet i området og eventuel afkortning.

Klyngning erstatter den tidligere udtynding. En klynge repræsenterer derfor alle offentlige registreringer i cellen; ingen registreringer vælges tilfældigt fra.

## Browseradfærd

Browseren henter et afrundet bufferområde omkring det synlige kort. Små panoreringer inden for bufferen udløser ingen ny forespørgsel. Ved en reel område- eller zoomændring:

1. Forespørgslen forsinkes kort, så afsluttede kortbevægelser samles.
2. En forældet forespørgsel afbrydes.
3. De eksisterende kortobjekter bliver stående, mens det nye område hentes.
4. CDN-cachen genbruger samme afrundede område i op til en time og kan servere et ældre svar, mens det opdateres.

## Sikkerhed og drift

- Databasefunktionen er `security invoker` og læser kun `app_v2.country_marker_public_v2`.
- Basetabellen er fortsat utilgængelig for anonyme brugere.
- Funktionen validerer koordinater, zoom og maksimumstørrelse i databasen.
- Den historiske markørliste uden `format=features` bevares midlertidigt for bagudkompatibilitet, men bruges ikke af landskortet eller produktionsovervågningen.
- Den syntetiske produktionskontrol kræver, at landsvisningen returnerer klynger med konsistente totaler.

## Lokal integrationsmåling

En isoleret Postgres 15-kørsel med 10.000 offentlige testregistreringer gav ved zoom 7:

- 10.000 repræsenterede registreringer
- 272 kortobjekter
- cirka 70 KB JSONB mod cirka 3,0 MB for den fulde markørliste
- cirka 42 ms databasekørsel i den kolde, syntetiske test

Tallene er en regressionsbaseline for kontrakten, ikke et løfte om identiske produktionstider.
