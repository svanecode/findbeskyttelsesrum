import Link from 'next/link'
import KommuneMap from './map'
import {
  getAppV2FeaturedShelters,
  getAppV2MunicipalityBySlug,
  type AppV2ShelterPreview,
} from '@/lib/supabase/app-v2-queries'
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

function LocalShelterExample({ shelter }: { shelter: AppV2ShelterPreview }) {
  return (
    <li>
      <Link
        href={`/beskyttelsesrum/${shelter.slug}`}
        className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition hover:bg-gray-50"
      >
        <span className="block font-semibold text-gray-900">{shelter.name}</span>
        <span className="mt-1 block text-xs leading-5 text-gray-600">
          {shelter.addressLine1}, {shelter.postalCode} {shelter.city}
        </span>
        <span className="mt-1 block text-xs text-gray-500">
          {shelter.capacity.toLocaleString('da-DK')} registrerede pladser
        </span>
      </Link>
    </li>
  )
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
  const featuredShelters = await getAppV2FeaturedShelters({
    municipalityId: appV2Kommune.id,
    limit: 3,
  })

  return (
    <main className="relative h-screen w-full">
      <section
        className="absolute top-2 left-2 z-10 max-h-[calc(100vh-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg bg-white/95 p-3 text-gray-900 shadow-lg backdrop-blur-sm sm:left-4 sm:top-4 sm:max-w-md sm:p-4 md:max-w-lg"
        aria-labelledby="kommune-title"
      >
        <nav className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
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
          <Link
            href="/land"
            className="text-blue-600 hover:text-blue-700 inline-flex items-center text-sm font-medium touch-target p-1 -m-1 rounded"
            aria-label="Se landssiden"
          >
            Hele landet
          </Link>
        </nav>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Kommune</p>
        <h1 id="kommune-title" className="text-lg sm:text-xl font-bold text-gray-900">
          Beskyttelsesrum i {kommune.name}
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-700">
          Kommunesiden samler den lokale indgang til registrerede beskyttelsesrum og giver en vej videre til
          landsoverblik, datagrundlag og andre kommuner.
        </p>

        <dl className="mt-4 divide-y divide-gray-200 border-y border-gray-200 text-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-3">
            <dt className="text-gray-600">Aktive registreringer i datalaget</dt>
            <dd className="font-semibold text-gray-900">{kommune.activeShelterCount.toLocaleString('da-DK')}</dd>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-3">
            <dt className="text-gray-600">Kommunekode</dt>
            <dd className="font-semibold text-gray-900">{kommune.kode}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <h2 className="text-sm font-semibold text-gray-900">Brug siden til</h2>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-gray-700">
            <li>at orientere dig i kommunens registreringer på kortet</li>
            <li>at gå videre til hele landet eller alle kommuner</li>
            <li>at læse hvordan data vises og afgrænses offentligt</li>
          </ul>
        </div>

        {featuredShelters.length > 0 && (
          <div className="mt-4">
            <h2 className="text-sm font-semibold text-gray-900">Udvalgte eksempelregistreringer</h2>
            <p className="mt-1 text-xs leading-5 text-gray-600">
              Få aktive app_v2-registreringer med høj registreret kapacitet. De er ikke anbefalinger eller en komplet
              liste over kommunen.
            </p>
            <ul className="mt-2 space-y-2">
              {featuredShelters.map((shelter) => (
                <LocalShelterExample key={shelter.id} shelter={shelter} />
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 border-l-4 border-gray-300 pl-3">
          <p className="text-xs leading-5 text-gray-600">
            Kommunesiden viser stadig data fra to spor: kommuneopslag, tal og eksempler kommer fra app_v2, mens kort og
            markører vises med det eksisterende registerflow, indtil nearby- og kortlaget er valideret separat.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/land"
            className="inline-flex items-center rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-700"
          >
            Se hele landet
          </Link>
          <Link
            href="/kommune"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-100"
          >
            Alle kommuner
          </Link>
          <Link
            href="/om-data"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-100"
          >
            Om data
          </Link>
        </div>
      </section>

      <KommuneMap kommunekode={kommune.kode} />
    </main>
  )
} 
