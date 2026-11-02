# Eksterne afhængigheder

Tjenesten er gratis og drives af én person. Derfor skal enhver ekstern tjeneste, som brugerrejsen afhænger af, stå her med konsekvens, fallback og den handling, der holder ejeren orienteret. DAWA-lukningen 1. oktober 2026 blev næsten overset; dette register skal gøre den næste synlig i god tid.

Gennemgå registret hvert kvartal og ved hver større release. Opdatér datoen nederst.

| Tjeneste | Bruges til | Hvis den svigter | Fallback i appen | Hold dig orienteret |
| --- | --- | --- | --- | --- |
| Adressevælger (Klimadatastyrelsen), `adressevaelger.dk` | Adresseforslag og adressens placering i browseren | Adressesøgningen virker ikke | "Brug min placering", kommuneoversigt og landskort; fejlbanner med "Prøv igen" | Tilmeld [Notifikationsservice](https://confluence.kds.dk/display/ADV/Notifikationsservice). Delt token `adressevaelger123` indtil brugerstyring kommer (forventet ultimo 2026/primo 2027); sæt da `NEXT_PUBLIC_ADRESSEVAELGER_TOKEN`. Produktionskontrollen tester søgning og opslag. |
| Datafordeler (BBR + DAR) | Daglig import af registreringer | Data bliver gamle; `/api/health` bliver `degraded` efter 48 timer | Seneste publicerede datasæt bliver stående | Datafordelerens driftsstatus og nyheder; importworkflowet opretter en GitHub-issue ved fejl. |
| OpenStreetMap-tiles | Kortbaggrund på sidens kort. Detaljesiden har ingen indlejret kortramme (`frame-src 'none'`) | Kort uden baggrund | Resultatlisten virker uden kort; kortfejl giver "Til resultatlisten" | [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Tiles hentes først, når et kort vises. |
| Supabase (Free-plan) | Database, offentlige RPC'er, moderation og login | Nærhedssøgning, kort og sider fejler. Et nyt deploy fejler også, fordi bygget læser databasen (ejerbeslutning, se reviewet 26. september, M7) | Sider, der allerede er genereret og ligger i Vercels cache, vises, indtil de skal genopbygges. Nærhedssøgning, kort og admin har ingen fallback | Supabase status og projektets advisors; `/api/health` returnerer `503`. Free-planen giver 5 GB egress pr. måned og 500 MB database; overskrides de, kan Supabase begrænse projektet. Se forbruget under Usage i Supabase-dashboardet hver måned. |
| Vercel | Hosting, CDN, funktioner, analytics | Siden er nede | Ingen | Vercel status. Hver commit på `main` udgives automatisk til produktion via Vercels Git-integration; forrige deployment er rollback-kandidat. |
| GitHub Actions | CI, daglig import, produktionskontrol og heartbeat | Import og kontrol kører ikke | Heartbeat-advarsel efter 8 timer, `503` efter 24 timer | GitHub afvikler planlagte workflows forsinket; se `external-monitoring.md`. |
| UptimeRobot (gratis) | Uafhængig kontrol af `/api/health` | Ingen ekstern alarm | GitHub-kontrollen | Se `external-monitoring.md`. **Ejeropgave:** Repoet kan ikke vise, at monitoren findes. Bekræft i UptimeRobot, at den kontrollerer `https://findbeskyttelsesrum.dk/api/health` og sender alarm til ejeren. Den er eneste alarm, hvis GitHub slår de planlagte workflows fra. |

## Kendte datoer

- **2026-10-01 kl. 10:00:** DAWA lukker. Håndteret i #39 (skift til Adressevælger).
- **Ultimo 2026 / primo 2027:** Adressevælger indfører brugerstyring og personlige tokens.

Senest gennemgået: 2026-11-01.
