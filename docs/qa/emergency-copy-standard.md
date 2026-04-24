# Emergency utility copy standard (public UI)

Dette dokument fastlægger **public copy-regler** for Findbeskyttelsesrum, med fokus på brugere under stress, hvor målet er hurtig handling og høj tillid.

## Formål

Den offentlige UI-tekst (navigation, labels, knapper, fejl, tomme states, hjælpetekster og metadata) skal støtte en akut brugerrejse:

1. **Find nærmeste beskyttelsesrum**
2. **Forstå adresse, afstand, kapacitet og status**
3. **Start navigation**
4. **Kom tilbage på sporet ved fejl/ingen resultater**

## Grundprincipper

- **Uafhængig tjeneste**: Sitet er en uafhængig nyttefunktion baseret på offentlige registerdata og er **ikke** en officiel myndighed eller en myndighedskanal.
- **Dansk i al public UI**: Alt, der kan ses af brugeren, skal være **dansk** — inkl. fallback-tekster, tomme states, fejlbeskeder, loading, og edge cases.
- **Ingen produkt-/versionsprog i public**: Brug aldrig public-facing produkt- eller versionssprog som **“v2”**.
- **Ingen demo-/eksplorer-links i nødrejsen**: Undgå eksplorative eller “prøv”-links (fx “Prøv København”) i den primære nødrejse.
- **Handlingsførst**: Foretræk korte, handlingsorienterede formuleringer:
  - “Søg”
  - “Brug min placering”
  - “Se rute”
  - “Navigér hertil”
- **Kort forklaring i hovedrejsen**: Hold forklaringer om BBR/DAR korte i den primære rejse. Læg detaljer på **Om data**-siden.
- **Korrekt datakilde-sprog**: Brug formuleringen **“Bygger på offentlige registerdata”** (undgå ordvalg der kan få sitet til at fremstå officielt).
- **Myndighedsforbehold på tillidsstier**: På primære søge-/detalje-trust paths skal teksten inkludere:
  - **“Følg altid myndighedernes anvisninger”**
- **Undgå tekniske termer i public UI**: Undgå ord som:
  - “importeret”, “parametre”, “provider”, “geocoding”, “source context”, “filter”

## Tone og stil

- **Klarhed før fuldstændighed**: Brugeren skal kunne handle hurtigt uden at læse lange forklaringer.
- **Konsekvente ordvalg**: Brug samme term for samme handling på tværs af UI.
- **Tryg og nøgtern**: Undgå reklamesprog, “beta”, “demo”, eller eksperimentelle formuleringer.

## Placering af forklaringer (praktisk regel)

- **Søg/list/detail (nødrejse)**: Kun det nødvendige (afstand, adresse, status, kapacitet, rute).
- **Om data**: Uddybninger om datakilder, registerlogik, begrænsninger, definitioner og datadækning.

