import Link from 'next/link'

import GlobalFooter from '@/components/GlobalFooter'
import AddressSearchDAWA from '@/components/AddressSearchDAWA'

export const revalidate = 600

export default async function Home() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative flex min-h-mobile-viewport flex-col bg-[#0a0a0a] text-white"
    >
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="mb-6 text-center sm:mb-10 lg:mb-12">
          <h1 className="mb-3 text-heading-md text-white sm:mb-4 sm:text-heading-lg lg:mb-6 lg:text-heading-xl">
            Find nærmeste beskyttelsesrum
          </h1>
          <p className="mx-auto max-w-lg text-body-lg leading-snug text-[#E5E7EB] sm:text-xl">
            Søg efter en adresse, eller brug din placering.
          </p>
        </div>

        <div className="glass-effect card-interactive relative overflow-visible rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-md sm:p-8 lg:p-10">
          <div className="relative z-20 space-y-6 sm:space-y-6 lg:space-y-8">
            <div suppressHydrationWarning className="relative z-20">
              <AddressSearchDAWA key="dawa-v2" />
            </div>

            <p className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2 text-center text-sm text-gray-400">
              <span>Mangler du adressen?</span>
              <Link
                href="/kommune"
                className="inline-flex min-h-[44px] items-center rounded-md px-2 font-medium text-gray-200 underline-offset-2 transition hover:bg-white/5 hover:text-white hover:underline"
              >
                Kommuneoversigt
              </Link>
              <span className="text-gray-600" aria-hidden="true">
                ·
              </span>
              <Link
                href="/kort"
                className="inline-flex min-h-[44px] items-center rounded-md px-2 font-medium text-gray-200 underline-offset-2 transition hover:bg-white/5 hover:text-white hover:underline"
              >
                Landskort
              </Link>
            </p>

            <p className="text-center text-xs text-gray-300/90 sm:text-sm">
              Bygger på offentlige BBR- og DAR-registerdata. Følg altid myndighedernes anvisninger.
            </p>
            
          </div>
        </div>
      </div>

      <GlobalFooter />
    </main>
  )
}
