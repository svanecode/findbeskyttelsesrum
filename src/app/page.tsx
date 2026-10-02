import Link from 'next/link'

import AddressSearch from '@/components/AddressSearch'
import GlobalFooter from '@/components/GlobalFooter'
import OfflineCopyControl from '@/components/OfflineCopyControl'
import { ui } from '@/components/ui-classes'
import { officialGuidanceLinks } from '@/lib/official-guidance'
import { createPageMetadata } from '@/lib/seo/metadata'

export const revalidate = 600

export const metadata = createPageMetadata({
  title: 'Find Beskyttelsesrum | Se BBR-registreringer nær dig',
  description:
    'Find adresser med registrerede sikringsrumspladser i BBR nær dig. Adgang, klargøring og fysisk stand er ikke bekræftet.',
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
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-12 lg:px-8 lg:pt-16">
        <section className="max-w-[40rem]" aria-labelledby="home-heading">
          <h1 id="home-heading" className={ui.pageTitle}>
            Find beskyttelsesrum nær dig
          </h1>
          <p className="mt-2 text-base leading-7 text-gray-300">
            Adresser med registrerede sikringsrumspladser i BBR. Vi kan ikke se, om rummene er åbne.
          </p>

          <div suppressHydrationWarning className="relative z-20 mt-6">
            <AddressSearch />
          </div>

          <aside className="mt-8 border-l-2 border-l-[var(--accent)] pl-4" aria-labelledby="emergency-guidance-heading">
            <p className="text-base leading-7 text-gray-100">
              <strong id="emergency-guidance-heading" className="font-semibold text-white">Ved varsling:</strong>{' '}
              Gå indenfor, og følg myndighedernes information.{' '}
              {officialGuidanceLinks.map((link, index) => (
                <span key={link.href}>
                  {index > 0 ? <span className="text-gray-400" aria-hidden="true"> · </span> : null}
                  <a href={link.href} target="_blank" rel="noopener noreferrer" className={ui.textLink}>
                    {link.shortLabel}
                    <span className="sr-only"> (åbner i en ny fane)</span>
                  </a>
                </span>
              ))}
            </p>
          </aside>

          <nav className="mt-6 flex flex-wrap gap-x-6 text-base" aria-label="Andre måder at finde registreringer">
            <Link href="/kort" className={`${ui.textLink} inline-flex min-h-[44px] items-center`}>Se landskort</Link>
            <Link href="/kommune" className={`${ui.textLink} inline-flex min-h-[44px] items-center`}>Find en kommune</Link>
          </nav>

          <OfflineCopyControl className="mt-4 border-t border-white/10 pt-3" />
        </section>
      </div>

      <GlobalFooter />
    </main>
  )
}
