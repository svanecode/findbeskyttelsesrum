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
            Se registrerede beskyttelsesrum nær dig
          </h1>
          <p className="mx-auto max-w-lg text-body-lg leading-snug text-[#E5E7EB] sm:text-xl">
            Søg i BBR&apos;s registreringer af sikringsrumspladser. En registrering er ikke en garanti for offentlig adgang,
            klargøring eller aktuel fysisk stand.
          </p>
        </div>

        <div className="relative overflow-visible rounded-xl border border-white/15 bg-[#151515] p-6 sm:p-8 lg:p-10">
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

            <div className="rounded-lg border border-orange-400/30 bg-orange-400/10 p-4 text-sm leading-6 text-gray-100">
              <p className="font-semibold text-white">Til orientering – ikke en evakueringsanvisning</p>
              <p className="mt-1">
                Ved varsling skal du gå indenfor og følge information fra myndighederne.
              </p>
            </div>
            
          </div>
        </div>
      </div>

      <GlobalFooter />
    </main>
  )
}
