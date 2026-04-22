# Findbeskyttelsesrum — Cursor Master Brief

## Projektstatus
Dette repo er en senfase-revamp af findbeskyttelsesrum.dk.

Live-sitet kører stadig på et gammelt snapshot og påvirkes ikke af arbejdet i dette repo, før en bevidst cutover-dag.

Det betyder:
- vi må gerne arbejde offensivt i repoet
- vi må gerne lade den nye kodebase være midlertidigt ujævn mellem pakker
- men vi må ikke ødelægge rollback-nettet

## Hårde regler
- Rør ikke legacy tabeller eller legacy funktioner i Supabase
- Slet ikke `public.sheltersv2`
- Slet ikke rollback-nettet
- Ingen DAWA/search-ændringer medmindre opgaven eksplicit handler om det
- Ingen broad redesign af hele sitet
- Ingen opportunistiske refactors
- Ingen nye arkitekturlag uden eksplicit beslutning
- Server components som default
- Brug dansk i al brugervendt tekst
- Bevar v1-æstetikken

## Current reality
- app_v2 er målskemaet
- nearby-sporet er langt fremme
- strict source-backed nearby trial findes
- tiny public-facing nearby preview findes bag eksplicit opt-in
- shelter detail, kommune, land og om-data er reelle public surfaces
- nearby skal nu behandles som maintenance, ikke hovedspor

## Nuværende nearby-kontrakt
- revamp-buildet er app_v2-first
- `source=legacy` er compare/fallback
- `source=app_v2` er eksplicit app_v2
- tiny public preview er lille og opt-in
- legacy-kort og legacy-liste er stadig standardoplevelsen i preview-sammenhæng
- Type/anvendelse skjules i app_v2 hvor mapping ikke er troværdig

## Arbejdsstil
- Arbejd i små, fokuserede pakker
- Vær eksplicit om hvad du ikke ændrer
- Hvis antagelser viser sig falske, stop og rapportér
- Kør altid:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
- Brug representative route/content checks når relevant
- Rapporter ærligt, ikke optimistisk

## Hovedprioritet nu
Nearby er ikke længere det primære projektspor.
Fokus er nu:
1. public surfaces polish og coherence
2. release-readiness / cutover-prep
3. små nearby maintenance-fixes hvis konkrete edge cases dukker op

## What not to do
- Byg ikke nye store nearby-features
- Udvid ikke previewet unødigt
- Lav ikke fuld browser uden beslutning
- Rør ikke legacy Supabase structures
- Gør ikke noget til default cutover uden eksplicit beslutning