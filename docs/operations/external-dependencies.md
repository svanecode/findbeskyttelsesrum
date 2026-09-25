# Eksterne afhængigheder

Tjenesten er gratis og drives af én person. Derfor skal enhver ekstern tjeneste, som brugerrejsen afhænger af, stå her med konsekvens, fallback og den handling, der holder ejeren orienteret. DAWA-lukningen 1. oktober 2026 blev næsten overset; dette register skal gøre den næste synlig i god tid.

Gennemgå registret hvert kvartal og ved hver større release. Opdatér datoen nederst.

| Tjeneste | Bruges til | Hvis den svigter | Fallback i appen | Hold dig orienteret |
| --- | --- | --- | --- | --- |
| Adressevælger (Klimadatastyrelsen), `adressevaelger.dk` | Adresseforslag og adressens placering i browseren | Adressesøgningen virker ikke | "Brug min placering", kommuneoversigt og landskort; fejlbanner med "Prøv igen" | Tilmeld [Notifikationsservice](https://confluence.kds.dk/display/ADV/Notifikationsservice). Delt token `adressevaelger123` indtil brugerstyring kommer (forventet ultimo 2026/primo 2027); sæt da `NEXT_PUBLIC_ADRESSEVAELGER_TOKEN`. Produktionskontrollen tester søgning og opslag. |
| Datafordeler (BBR + DAR) | Daglig import af registreringer | Data bliver gamle; `/api/health` bliver `degraded` efter 48 timer | Seneste publicerede datasæt bliver stående | Datafordelerens driftsstatus og nyheder; importworkflowet opretter en GitHub-issue ved fejl. |
| OpenStreetMap-tiles og embed | Kortbaggrund og kort på detaljesiden | Kort uden baggrund | Resultatlisten virker uden kort; kortfejl giver "Til resultatlisten" | [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Tiles hentes først, når et kort vises. |
| Supabase | Database, offentlige RPC'er, moderation og login | Nærhedssøgning, kort og sider fejler | Statisk genererede sider serveres fra cache | Supabase status og projektets advisors; `/api/health` returnerer `503`. |
| Vercel | Hosting, CDN, funktioner, analytics | Siden er nede | Ingen | Vercel status. Produktion deployes manuelt; forrige deployment er rollback-kandidat. |
| GitHub Actions | CI, daglig import, produktionskontrol og heartbeat | Import og kontrol kører ikke | Heartbeat-advarsel efter 8 timer, `503` efter 24 timer | GitHub afvikler planlagte workflows forsinket; se `external-monitoring.md`. |
| UptimeRobot (gratis) | Uafhængig kontrol af `/api/health` | Ingen ekstern alarm | GitHub-kontrollen | Se `external-monitoring.md`. |

## Kendte datoer

- **2026-10-01 kl. 10:00:** DAWA lukker. Håndteret i #39 (skift til Adressevælger).
- **Ultimo 2026 / primo 2027:** Adressevælger indfører brugerstyring og personlige tokens.

Senest gennemgået: 2026-09-25.
