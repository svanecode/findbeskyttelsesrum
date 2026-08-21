import Link from 'next/link'

import AddressSearchDAWA from '@/components/AddressSearchDAWA'
import GlobalFooter from '@/components/GlobalFooter'
import { ui } from '@/components/ui-classes'

export const revalidate = 600

export default async function Home() {
  return (
    <main id="main-content" tabIndex={-1} className={`flex min-h-mobile-viewport flex-col ${ui.page}`}>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <section
          className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)] lg:gap-14"
          aria-labelledby="home-heading"
        >
          <header className="max-w-xl lg:pt-6">
            <p className={ui.eyebrow}>Uafhængigt orienteringsværktøj</p>
            <h1 id="home-heading" className={`mt-3 ${ui.pageTitle}`}>
              Se registrerede beskyttelsesrum nær dig
            </h1>
            <p className={`mt-5 ${ui.lead}`}>
              Søg i BBR&apos;s registreringer af sikringsrumspladser. En registrering er ikke en garanti for offentlig adgang,
              klargøring eller aktuel fysisk stand.
            </p>
            <p className="mt-4 max-w-lg text-sm leading-6 text-gray-400">
              Resultaterne viser registeroplysninger ved adresser – ikke åbne, kontrollerede eller anviste opholdssteder.
            </p>
          </header>

          <div className="min-w-0">
            <div className={`${ui.panel} p-5 sm:p-7`}>
              <div suppressHydrationWarning className="relative z-20">
                <AddressSearchDAWA key="dawa-v2" />
              </div>
            </div>

            <nav
              className="mt-3 flex flex-wrap items-center gap-x-1 text-sm text-gray-400"
              aria-label="Andre måder at søge på"
            >
              <span className="mr-1">Kender du ikke adressen?</span>
              <Link href="/kommune" className={ui.quietAction}>Kommuner</Link>
              <Link href="/kort" className={ui.quietAction}>Landskort</Link>
            </nav>
          </div>
        </section>

        <aside
          className="mt-8 grid gap-2 border-y border-white/10 py-5 text-sm leading-6 sm:grid-cols-[auto_1fr] sm:gap-x-5 lg:mt-12"
          aria-labelledby="emergency-guidance-heading"
        >
          <h2 id="emergency-guidance-heading" className="font-semibold text-gray-100">Ved varsling</h2>
          <p className="max-w-3xl text-gray-400">
            Gå indenfor, og følg information fra myndighederne. Kortet er til orientering og er ikke en
            evakueringsanvisning.
          </p>
        </aside>
      </div>

      <GlobalFooter />
    </main>
  )
}
