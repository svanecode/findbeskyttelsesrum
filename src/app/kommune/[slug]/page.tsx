import Link from 'next/link'
import KommuneMap from './map'
import { getAppV2MunicipalityBySlug } from '@/lib/supabase/app-v2-queries'
import { notFound } from 'next/navigation'
export { generateMetadata } from './metadata'

interface Kommune {
  slug: string
  name: string
  kode: string
  activeShelterCount: number
}

interface Props {
  params: Promise<{
    slug: string
  }>
}

function isLegacyKommuneCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}$/.test(value)
}

export default async function KommunePage({ params }: Props) {
  const resolvedParams = await params
  const appV2Kommune = await getAppV2MunicipalityBySlug(resolvedParams.slug)

  if (!appV2Kommune || !isLegacyKommuneCode(appV2Kommune.code)) {
    notFound()
  }

  const legacyKommuneCode = appV2Kommune.code

  const kommune: Kommune = {
    slug: appV2Kommune.slug,
    name: appV2Kommune.name,
    kode: legacyKommuneCode,
    activeShelterCount: appV2Kommune.activeShelterCount,
  }

  return (
    <main className="relative h-screen w-full">
      <section
        className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10 max-w-[calc(100vw-1rem)] rounded-lg bg-white/95 p-3 text-gray-900 shadow-lg backdrop-blur-sm sm:max-w-sm sm:p-4"
        aria-labelledby="kommune-title"
      >
        <nav className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-2 text-sm font-medium touch-target p-1 -m-1 rounded"
            aria-label="Tilbage til forsiden"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="hidden sm:inline">Tilbage til forsiden</span>
            <span className="sm:hidden">Tilbage</span>
          </Link>
          <Link
            href="/kommune"
            className="text-blue-600 hover:text-blue-700 inline-flex items-center text-sm font-medium touch-target p-1 -m-1 rounded"
            aria-label="Se alle kommuner"
          >
            Alle kommuner
          </Link>
          <Link
            href="/om-data"
            className="text-blue-600 hover:text-blue-700 inline-flex items-center text-sm font-medium touch-target p-1 -m-1 rounded"
            aria-label="Læs om datagrundlaget"
          >
            Om data
          </Link>
        </nav>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Kommune</p>
        <h1 id="kommune-title" className="text-lg sm:text-xl font-bold text-gray-900">
          Beskyttelsesrum i {kommune.name}
        </h1>
        <div className="mt-3 grid gap-2 text-sm text-gray-700">
          <p>
            Kommunekode <span className="font-medium text-gray-900">{kommune.kode}</span>
          </p>
          <p>
            {kommune.activeShelterCount.toLocaleString('da-DK')} aktive registreringer i app_v2. Kort og markører
            vises fortsat fra det eksisterende registerflow.
          </p>
        </div>
      </section>

      <KommuneMap kommunekode={kommune.kode} />
    </main>
  )
} 
