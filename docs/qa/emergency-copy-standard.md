# Emergency utility copy standard (public UI)

Dette dokument fastlægger **public copy-regler** for Findbeskyttelsesrum med fokus på korrekt databetydning, rolig orientering og høj tillid.

## Formål

Den offentlige UI-tekst (navigation, labels, knapper, fejl, tomme states, hjælpetekster og metadata) skal støtte en orienterende brugerrejse:

1. **Søg efter BBR-registreringer i nærheden**
2. **Forstå adresse, afstand i luftlinje og registreret kapacitet**
3. **Forstå at adgang, klargøring og fysisk stand ikke er bekræftet**
4. **Kom tilbage på sporet ved fejl eller ingen resultater**

## Grundprincipper

- **Uafhængig tjeneste**: Sitet er en uafhængig nyttefunktion baseret på offentlige registerdata og er **ikke** en officiel myndighed eller en myndighedskanal.
- **Orientering, ikke evakuering**: Kort og søgeresultater må aldrig fremstilles som en anvisning om at bevæge sig mod en adresse.
- **Præcis databetydning**: Brug “BBR-registrering”, “registrerede sikringsrumspladser”, “adgang ikke bekræftet” og “stand ikke verificeret”.
- **Dansk i al public UI**: Alt, der kan ses af brugeren, skal være **dansk** — inkl. fallback-tekster, tomme states, fejlbeskeder, loading, og edge cases.
- **Ingen produkt-/versionsprog i public**: Brug aldrig public-facing produkt- eller versionssprog som **“v2”**.
- **Ingen demo-/eksplorer-links i nødrejsen**: Undgå eksplorative eller “prøv”-links (fx “Prøv København”) i den primære nødrejse.
- **Handlingsførst**: Foretræk korte, handlingsorienterede formuleringer:
  - “Søg”
  - “Brug min placering”
  - “Se detaljer”
  - “Se adressen i kort”
- **Forbehold i hovedrejsen**: Vis den korte BBR-forklaring på forside, resultat og detalje. Læg metode og fuld afstemning på **Datagrundlag**.
- **Korrekt datakilde-sprog**: Brug formuleringen **“Bygger på offentlige registerdata”** (undgå ordvalg der kan få sitet til at fremstå officielt).
- **Myndighedsvejledning på tillidsstier**: På primære søge-/detalje-stier skal teksten forklare, at brugeren ved varsling skal gå indenfor og følge information fra myndighederne.
- **Undgå tekniske termer i public UI**: Undgå ord som:
  - “importeret”, “parametre”, “provider”, “geocoding”, “source context”, “filter”

## Tone og stil

- **Klarhed før fuldstændighed**: Brugeren skal kunne handle hurtigt uden at læse lange forklaringer.
- **Konsekvente ordvalg**: Brug samme term for samme handling på tværs af UI.
- **Tryg og nøgtern**: Undgå reklamesprog, “beta”, “demo”, eller eksperimentelle formuleringer.

## Placering af forklaringer (praktisk regel)

- **Søg/list/detail**: Datatype, afstand i luftlinje, adresse, registreret kapacitet og faste forbehold.
- **Om data**: Uddybninger om datakilder, registerlogik, begrænsninger, definitioner og datadækning.
