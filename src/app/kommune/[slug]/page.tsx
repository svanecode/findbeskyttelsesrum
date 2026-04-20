import Link from 'next/link'
import KommuneMap from './map'
import {
  getAppV2FeaturedShelters,
  getAppV2MunicipalityBySlug,
  getAppV2MunicipalityShelterStats,
  type AppV2MunicipalityShelterStats,
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

function formatDate(value: string | null) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat('da-DK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function LocalInsightCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs leading-5 text-gray-600">{note}</p>
    </div>
  )
}

function PostalAreaSummary({ stats }: { stats: AppV2MunicipalityShelterStats }) {
  if (stats.postalAreas.length === 0) {
    return null
  }

  return (
    <div className="mt-4">
      <h2 className="text-sm font-semibold text-gray-900">Lokale tyngdepunkter i datalaget</h2>
      <p className="mt-1 text-xs leading-5 text-gray-600">
        Postområderne her har flest aktive registreringer i kommunen. Det er en lokal dataoversigt, ikke en vurdering
        af adgang eller beredskab.
      </p>
      <ul className="mt-2 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
        {stats.postalAreas.map((area) => (
          <li
            key={`${area.postalCode}-${area.city}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              <span className="block font-medium text-gray-900">
                {area.postalCode} {area.city}
              </span>
              <span className="block text-xs text-gray-600">
                {area.totalCapacity.toLocaleString('da-DK')} registrerede pladser
              </span>
            </span>
            <span className="self-center whitespace-nowrap text-xs font-semibold text-gray-700">
              {area.activeShelterCount.toLocaleString('da-DK')} registreringer
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LocalShelterExample({ shelter, position }: { shelter: AppV2ShelterPreview; position: number }) {
  return (
    <li>
      <Link
        href={`/beskyttelsesrum/${shelter.slug}`}
        className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition hover:bg-gray-50"
      >
        <span className="flex items-start gap-2">
          <span className="mt-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">
            Eksempel {position}
          </span>
          <span className="min-w-0 flex-1 font-semibold text-gray-900">{shelter.name}</span>
        </span>
        <span className="mt-1 block text-xs leading-5 text-gray-600">
          {shelter.addressLine1}, {shelter.postalCode} {shelter.city}
        </span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>{shelter.capacity.toLocaleString('da-DK')} registrerede pladser</span>
          <span>Åbn detail-side</span>
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
  const [featuredShelters, municipalityStats] = await Promise.all([
    getAppV2FeaturedShelters({
      municipalityId: appV2Kommune.id,
      limit: 4,
    }),
    getAppV2MunicipalityShelterStats(appV2Kommune.id),
  ])
  const latestSeenAt = formatDate(municipalityStats.latestSeenAt)

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
          Kommunesiden samler lokale nøgletal, kortkontekst og udvalgte indgange til detail-sider for registrerede
          beskyttelsesrum i {kommune.name}.
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
            <li>at se hvor mange aktive registreringer kommunen har i app_v2-datalaget</li>
            <li>at orientere dig i postområder og kort uden at ændre det eksisterende nearby-flow</li>
            <li>at åbne få konkrete detail-sider og læse hvordan data er afgrænset</li>
          </ul>
        </div>

        <section className="mt-4" aria-labelledby="local-overview-title">
          <h2 id="local-overview-title" className="text-sm font-semibold text-gray-900">
            Lokalt overblik
          </h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <LocalInsightCard
              label="Registrerede pladser"
              value={municipalityStats.totalCapacity.toLocaleString('da-DK')}
              note="Summen af registreret kapacitet i aktive rækker for kommunen."
            />
            <LocalInsightCard
              label="Postområder"
              value={municipalityStats.postalAreaCount.toLocaleString('da-DK')}
              note="Antal postnummer/by-kombinationer med aktive registreringer."
            />
            {municipalityStats.largestCapacity !== null && (
              <LocalInsightCard
                label="Største enkeltregistrering"
                value={municipalityStats.largestCapacity.toLocaleString('da-DK')}
                note="Højeste registrerede kapacitet for en enkelt aktiv række."
              />
            )}
            {latestSeenAt && (
              <LocalInsightCard
                label="Senest set i kilden"
                value={latestSeenAt}
                note="Seneste kildeobservation blandt kommunens aktive registreringer."
              />
            )}
          </div>
        </section>

        <PostalAreaSummary stats={municipalityStats} />

        {featuredShelters.length > 0 && (
          <section className="mt-4" aria-labelledby="local-examples-title">
            <h2 id="local-examples-title" className="text-sm font-semibold text-gray-900">
              Udvalgte lokale indgange
            </h2>
            <p className="mt-1 text-xs leading-5 text-gray-600">
              Få aktive app_v2-registreringer med høj registreret kapacitet i {kommune.name}. De er konkrete veje ind
              til detail-sider, ikke anbefalinger, beredskabsvurderinger eller en komplet kommuneliste.
            </p>
            <ul className="mt-2 space-y-2">
              {featuredShelters.map((shelter, index) => (
                <LocalShelterExample key={shelter.id} shelter={shelter} position={index + 1} />
              ))}
            </ul>
          </section>
        )}

        <div className="mt-4 border-l-4 border-gray-300 pl-3">
          <p className="text-xs leading-5 text-gray-600">
            Kortet nedenfor er stadig det eksisterende registerflow. Lokale nøgletal, postområder og eksempler herover
            kommer fra app_v2, så siden kan give lokal kontekst uden at ændre den normale nearby-oplevelse.
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
