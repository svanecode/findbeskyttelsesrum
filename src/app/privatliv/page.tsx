import type { Metadata } from 'next'
import Link from 'next/link'

import GlobalFooter from '@/components/GlobalFooter'

export const metadata: Metadata = {
  title: 'Privatliv',
  description: 'Sådan behandler Find Beskyttelsesrum adresse, placering, analyse og fejlrapporter.',
  alternates: { canonical: '/privatliv' },
}

export default function PrivacyPage() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="max-w-2xl space-y-4">
          <p className="text-sm uppercase tracking-wide text-gray-400">Om tjenesten</p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Privatliv</h1>
          <p className="text-lg leading-8 text-gray-300">
            Du behøver ikke en konto for at bruge Find Beskyttelsesrum. Her kan du se, hvilke oplysninger de enkelte
            funktioner behandler.
          </p>
        </header>

        <div className="mt-8 grid gap-5">
          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Adresse og placering</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Når du søger, bruges koordinater til at beregne registreringer i nærheden. Adresseteksten og koordinaterne
              lægges ikke i sidens URL. Søgekonteksten gemmes kun i den aktuelle browsers fanesession og udløber senest
              efter 12 timer.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              Adresseforslag hentes fra den offentlige danske adressetjeneste DAWA. Kortfelter hentes fra OpenStreetMap.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Analyse og tekniske fejl</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Analyse måler brug af sidens overordnede sider. Før en sideadresse sendes til analyse, fjernes
              queryparametre og fragmenter, så adresse og koordinater ikke følger med. I tekniske fejlrapporter fjernes
              queryparametre fra URL&apos;er, og strukturerede lokationsfelter redigeres.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Netforbindelse og lokal lagring</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              Tjenesten er en almindelig hjemmeside og kræver netforbindelse. Den tilbyder ikke en offlinekopi af
              registreringerne eller kortet, så ældre data ikke kan forveksles med den seneste dataimport.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Fejlrapporter</h2>
            <p className="mt-3 text-sm leading-6 text-gray-300">
              En fejlrapport indeholder den valgte kategori, din beskrivelse og kun en e-mailadresse, hvis du selv vælger
              at oplyse den. Rapporten gemmes i en privat moderationskø med et auditspor og offentliggøres ikke direkte.
            </p>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              Undlad CPR-nummer og andre følsomme oplysninger i beskrivelsen.
            </p>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/5 p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Læs mere</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/om-data" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-white underline underline-offset-4 hover:bg-white/5">
                Datagrundlag og forbehold
              </Link>
              <Link href="/" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-white underline underline-offset-4 hover:bg-white/5">
                Til forsiden
              </Link>
            </div>
          </section>
        </div>
      </div>

      <GlobalFooter />
    </main>
  )
}
