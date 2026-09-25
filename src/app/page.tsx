import Link from 'next/link'

import AddressSearch from '@/components/AddressSearch'
import GlobalFooter from '@/components/GlobalFooter'
import OfficialGuidanceLinks from '@/components/OfficialGuidanceLinks'
import { ui } from '@/components/ui-classes'
import { createPageMetadata } from '@/lib/seo/metadata'

export const revalidate = 600

export const metadata = createPageMetadata({
  title: 'Find Beskyttelsesrum | Se BBR-registreringer nær dig',
  description:
    'Orientér dig i BBR-registreringer af sikringsrumspladser. Adgang, klargøring og fysisk stand er ikke bekræftet.',
  path: '/',
  absoluteTitle: true,
  keywords: [
    'find beskyttelsesrum',
    'beskyttelsesrum',
    'BBR-registrering',
    'sikringsrum',
    'sikringsrumspladser',
    'Danmark',
    'civilforsvar',
  ],
})

export default async function Home() {
  return (
    <main id="main-content" tabIndex={-1} className={`flex min-h-mobile-viewport flex-col ${ui.page}`}>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        {/* Phones: heading, one-line caveat, then search, so "Brug min placering" is
            reached first; the full explanation follows the search. Desktop keeps the
            explanation in the left column beside the search. */}
        <section
          className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)] lg:gap-x-14 lg:gap-y-5"
          aria-labelledby="home-heading"
        >
          <header className="max-w-xl lg:col-start-1 lg:row-start-1 lg:pt-6">
            <p className={ui.eyebrow}>Uafhængigt orienteringsværktøj</p>
            <h1 id="home-heading" className={`mt-3 ${ui.pageTitle}`}>
              Se registrerede beskyttelsesrum nær dig
            </h1>
            <p className="mt-3 text-sm leading-6 text-gray-300 lg:hidden">
              BBR-registreringer: offentlig adgang, klargøring og stand er ikke bekræftet.
            </p>
          </header>

          <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className={`${ui.panel} p-5 sm:p-7`}>
              <div suppressHydrationWarning className="relative z-20">
                <AddressSearch />
              </div>
            </div>

            <nav
              className="mt-3 grid grid-cols-2 items-center gap-2 text-sm text-gray-400 sm:flex sm:flex-wrap sm:gap-x-1 sm:gap-y-0"
              aria-label="Andre måder at søge på"
            >
              <span className="col-span-2 sm:mr-1">Kender du ikke adressen?</span>
              <Link href="/kommune" className={ui.secondaryAction + ' sm:border-0 sm:bg-transparent sm:font-medium sm:text-gray-300'}>Kommuner</Link>
              <Link href="/kort" className={ui.secondaryAction + ' sm:border-0 sm:bg-transparent sm:font-medium sm:text-gray-300'}>Landskort</Link>
            </nav>
          </div>

          <div className="max-w-xl lg:col-start-1 lg:row-start-2">
            <p className={ui.lead}>
              Søg i BBR&apos;s registreringer af sikringsrumspladser. En registrering er ikke en garanti for offentlig adgang,
              klargøring eller aktuel fysisk stand.
            </p>
            <p className="mt-4 max-w-lg text-sm leading-6 text-gray-400">
              Resultaterne viser registeroplysninger ved adresser – ikke åbne, kontrollerede eller anviste opholdssteder.
            </p>
          </div>
        </section>

        <aside
          className="mt-8 grid gap-2 border-y border-white/10 py-5 text-sm leading-6 sm:grid-cols-[auto_1fr] sm:gap-x-5 lg:mt-12"
          aria-labelledby="emergency-guidance-heading"
        >
          <h2 id="emergency-guidance-heading" className="font-semibold text-gray-100">Ved varsling</h2>
          <div className="max-w-3xl">
            <p className="text-gray-400">
              Gå indenfor, og følg information fra myndighederne. Kortet er til orientering og er ikke en
              evakueringsanvisning.
            </p>
            <OfficialGuidanceLinks className="mt-2" />
          </div>
        </aside>
      </div>

      <GlobalFooter />
    </main>
  )
}
