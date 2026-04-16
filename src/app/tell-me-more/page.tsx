import Link from 'next/link'

export default function TellMeMore() {
  return (
    <main className="min-h-screen text-white p-4 sm:p-6 lg:p-8 relative">
      {/* Background gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#0f0f0f] to-[#0a0a0a] -z-10" />
      <div className="fixed inset-0 bg-[url('/grid.svg')] opacity-10 -z-10" />
      
      <div className="max-w-3xl mx-auto">
        <div
          className="tell-me-more-enter relative glass-effect p-6 sm:p-10 rounded-2xl overflow-hidden card-interactive"
        >
          {/* Card background effects */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.1),transparent_50%)]" />
          
          {/* Card content */}
          <div className="relative z-10">
            <Link 
              href="/"
              className="inline-flex items-center text-base font-medium text-white hover:text-white transition-all duration-200 mb-8 group bg-[#F97316]/90 hover:bg-[#F97316] px-6 py-3 rounded-xl border border-white/20 backdrop-blur-sm relative overflow-hidden shadow-lg hover:shadow-xl touch-target focus-visible btn-interactive"
              aria-label="Gå tilbage til forsiden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <div className="relative z-10 flex items-center">
                <svg 
                  className="w-5 h-5 mr-3 group-hover:-translate-x-1 transition-transform duration-200" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Tilbage til forsiden
              </div>
            </Link>

            <h1 
              className="text-3xl sm:text-4xl font-bold mb-8 font-space-grotesk bg-gradient-to-r from-white to-[#E5E7EB] bg-clip-text text-transparent"
              style={{ animationDelay: '200ms' }}
            >
              Om Sikringsrum, Beskyttelsesrum og Sikringspladser i Danmark
            </h1>

            <div
              className="space-y-10 text-[#E5E7EB]"
              style={{ animationDelay: '400ms' }}
            >
              <div className="space-y-4">
                <p className="text-base sm:text-lg leading-relaxed">
                  På denne hjemmeside finder du information om placeringen af udvalgte sikrings- og beskyttelsesrum i Danmark. Herunder kan du læse mere om, hvad disse rum er, de gældende regler, samt hvordan data præsenteres på siden.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center">
                  <span className="w-2 h-2 bg-[#F97316] rounded-full mr-3"></span>
                  Hvad er et Sikringsrum og et Beskyttelsesrum?
                </h2>
                <p className="text-base sm:text-lg leading-relaxed">
                  Begreberne "sikringsrum" og "beskyttelsesrum" dækker over forskellige typer forstærkede rum, der er konstrueret til at beskytte befolkningen mod virkningerne af krigshandlinger, primært luftangreb og bygningskollaps. Begrebet "sikringsplads" bruges typisk til at angive kapaciteten, altså hvor mange personer et rum er beregnet til.
                </p>
                <p className="text-base sm:text-lg leading-relaxed">
                  Der skelnes overordnet mellem:
                </p>
                <ul className="space-y-3 pl-6">
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <div>
                      <span className="font-medium text-white">Sikringsrum:</span>
                      <p className="text-sm text-[#9CA3AF]">Disse findes ofte i kældre under f.eks. etageejendomme, virksomheder eller offentlige bygninger (som skoler og institutioner). Det er bygningens ejer, der har ansvaret for at vedligeholde sikringsrummet og eventuelt klargøre det efter påbud. Mange sikringsrum blev etableret i perioden ca. 1950-1993.</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <div>
                      <span className="font-medium text-white">Offentlige Beskyttelsesrum:</span>
                      <p className="text-sm text-[#9CA3AF]">Disse er beregnet til offentlig brug, f.eks. for trafikanter eller beboere uden adgang til sikringsrum. Det er kommunen, der har ansvaret for disse rum. Eksempler inkluderer offentligt tilgængelige P-kældre eller de fritliggende betondækningsgrave (ofte kaldet bunkers), som blev bygget efter 2. verdenskrig.</p>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center">
                  <span className="w-2 h-2 bg-[#F97316] rounded-full mr-3"></span>
                  Nuværende Status og Anvendelse
                </h2>
                <p className="text-base sm:text-lg leading-relaxed">
                  Det er vigtigt at vide, at sikrings- og beskyttelsesrum i Danmark ikke er klargjorte til øjeblikkelig brug i tilfælde af pludselige hændelser i fredstid. De er primært en del af krigsberedskabet. Hvis situationen kræver det, kan Ministeren for Samfundssikkerhed og Beredskab give kommunerne og bygningsejere påbud om at klargøre rummene inden for en fastsat tidsfrist.
                </p>
                <p className="text-base sm:text-lg leading-relaxed">
                  I fredstid kan rummene anvendes til andre formål (f.eks. depotrum, cykelkælder, øvelokale), men denne anvendelse må ikke forringe rummenes brugbarhed som beskyttelsesrum eller forhindre hurtig klargøring.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center">
                  <span className="w-2 h-2 bg-[#F97316] rounded-full mr-3"></span>
                  Regler og Krav
                </h2>
                <p className="text-base sm:text-lg leading-relaxed">
                  Etablering, indretning og vedligeholdelse af sikrings- og beskyttelsesrum reguleres primært af Beskyttelsesrumsloven. Beredskabsstyrelsen har fastsat detaljerede tekniske krav i "Reglement for indretning af sikringsrum...", som bl.a. stiller krav til:
                </p>
                <ul className="space-y-3 pl-6">
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <span>Konstruktion: Forstærket beton i vægge og dæk for at modstå bygningskollaps.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <span>Størrelse/Kapacitet: Minimumskrav til gulvareal (typisk 0,5 m²/person) og luftvolumen pr. person.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <span>Adgangsforhold: Krav til antal, størrelse og placering af døre og nødudgange.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <span>Installationer: Regler for el, ventilation (begrænset) og plads til nødtoiletter.</span>
                  </li>
                </ul>
                <p className="text-base sm:text-lg leading-relaxed">
                  Selvom kravet om automatisk at bygge sikringsrum i nybyggeri blev lempet i 1990'erne/start 00'erne, kan kommunerne stadig påbyde det i visse tilfælde, og eksisterende rum skal som udgangspunkt bevares.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center">
                  <span className="w-2 h-2 bg-[#F97316] rounded-full mr-3"></span>
                  Kapacitet i Danmark
                </h2>
                <p className="text-base sm:text-lg leading-relaxed">
                  Ifølge Beredskabsstyrelsens seneste opgørelser (f.eks. fra 2024) findes der omkring 3,4-3,6 millioner registrerede sikrings- og beskyttelsesrumspladser i Danmark. Der pågår dog en debat om den reelle brugbarhed af mange af disse pladser, da en del rum anvendes til andre formål eller deres stand er ukendt.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center">
                  <span className="w-2 h-2 bg-[#F97316] rounded-full mr-3"></span>
                  Information på Denne Hjemmeside
                </h2>
                <p className="text-base sm:text-lg leading-relaxed">
                  For at give et relevant overblik over større og potentielt tilgængelige beskyttelsesmuligheder, bruger denne hjemmeside data fra officielle kilder, men med visse filtre:
                </p>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Datakilder:</h3>
                  <ul className="space-y-3 pl-6">
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <div>
                        <span className="font-medium text-white">BBR (Bygnings- og Boligregistret):</span>
                        <p className="text-sm text-[#9CA3AF]">Indeholder information om bygningers anvendelse og tekniske data, herunder om der er registreret sikringsrum.</p>
                      </div>
                    </li>
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <div>
                        <span className="font-medium text-white">DAR (Danmarks Adresseregister):</span>
                        <p className="text-sm text-[#9CA3AF]">Indeholder præcise adresseoplysninger for lokalisering.</p>
                      </div>
                    </li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Hvad er inkluderet?</h3>
                  <p className="text-base sm:text-lg leading-relaxed">
                    For at sikre relevans og overskuelighed, viser vi som udgangspunkt kun sikrings- og beskyttelsesrum med 40 eller flere registrerede pladser. Vi fokuserer på lokationer, der formodes at være offentligt tilgængelige eller tilknyttet bygninger med mange brugere (f.eks. offentlige institutioner, større boligkomplekser).
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Hvad er udeladt?</h3>
                  <ul className="space-y-3 pl-6">
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Private hjem (enfamiliehuse etc.)</span>
                    </li>
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Lokationer med færre end 40 pladser</span>
                    </li>
                    <li className="flex items-start">
                      <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                      <span>Lokationer, der med stor sikkerhed ikke har offentlig adgang</span>
                    </li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Hvorfor disse filtre?</h3>
                  <p className="text-base sm:text-lg leading-relaxed">
                    Valget er truffet for at gøre det nemmere at finde de potentielt mest relevante og rummelige beskyttelsesmuligheder i en nødsituation, hvor tid og overskuelighed kan være afgørende.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Vigtigt:</h3>
                  <p className="text-base sm:text-lg leading-relaxed">
                    Oplysningerne på denne hjemmeside er baseret på tilgængelige registerdata og de nævnte filtre. Det er ikke en garanti for, at et vist rum er klargjort, tilgængeligt eller i brugbar stand. Myndighederne vurderer aktuelt (april 2025), at der ikke er en direkte militær trussel mod Danmark, og der er derfor ikke behov for at klargøre rummene.
                  </p>
                  <p className="text-base sm:text-lg leading-relaxed">
                    For konkret information om beskyttelsesmuligheder i dit lokalområde, anbefales det at kontakte din kommune eller det lokale redningsberedskab (brandvæsen).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes tell-me-more-enter {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .tell-me-more-enter,
        .tell-me-more-enter h1,
        .tell-me-more-enter .space-y-10 {
          animation: tell-me-more-enter 500ms ease-out both;
        }
      `}</style>
    </main>
  )
} 
