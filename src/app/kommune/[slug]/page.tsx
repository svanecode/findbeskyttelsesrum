import Link from 'next/link'
import { notFound } from 'next/navigation'

import GlobalFooter from '@/components/GlobalFooter'
import SiteHeader from '@/components/SiteHeader'
import {
  getAppV2MunicipalityBySlug,
  getAppV2MunicipalityShelters,
  getAppV2MunicipalityShelterStats,
  groupMunicipalityShelters,
  type AppV2MunicipalityShelter,
} from '@/lib/supabase/app-v2-queries'
import { serializeJsonLd } from '@/lib/seo/json-ld'
import KommuneExperience from './kommune-experience'
export { generateMetadata } from './metadata'

export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string }>
}

function hasShelterAddressForJsonLd(shelter: AppV2MunicipalityShelter): boolean {
  return (
    shelter.addressLine1.trim().length > 0 &&
    shelter.postalCode.trim().length > 0 &&
    shelter.city.trim().length > 0
  )
}

function buildKommunePageJsonLd(
  municipality: { name: string; slug: string },
  shelters: AppV2MunicipalityShelter[],
) {
  const kommuneNavn = municipality.name

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Beskyttelsesrum i ${kommuneNavn}`,
    description: `Kommuneoversigt over registrerede beskyttelsesrum i ${kommuneNavn}: aktive registreringer, kapacitet, adresser og vej til detail-sider.`,
    url: `https://findbeskyttelsesrum.dk/kommune/${municipality.slug}`,
    inLanguage: 'da-DK',
    isPartOf: {
      '@type': 'WebSite',
      name: 'Find Beskyttelsesrum',
      url: 'https://findbeskyttelsesrum.dk',
    },
  }

  const administrativeArea = {
    '@context': 'https://schema.org',
    '@type': 'AdministrativeArea',
    name: `${kommuneNavn} Kommune`,
    containedInPlace: {
      '@type': 'Country',
      name: 'Danmark',
    },
  }

  const topShelters = shelters
    .filter(hasShelterAddressForJsonLd)
    .sort((a, b) => b.capacity - a.capacity)
    .slice(0, 10)

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Beskyttelsesrum i ${kommuneNavn}`,
    numberOfItems: topShelters.length,
    itemListElement: topShelters.map((shelter, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Place',
        name: shelter.name,
        url: `https://findbeskyttelsesrum.dk/beskyttelsesrum/${shelter.slug}`,
        address: {
          '@type': 'PostalAddress',
          streetAddress: shelter.addressLine1,
          postalCode: shelter.postalCode,
          addressLocality: shelter.city,
          addressCountry: 'DK',
        },
      },
    })),
  }

  return [webPage, administrativeArea, itemList]
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  const formatted =
    typeof value === 'number' ? value.toLocaleString('da-DK') : value
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white">{formatted}</p>
    </div>
  )
}

export default async function KommunePage({ params }: Props) {
  const { slug } = await params
  const municipality = await getAppV2MunicipalityBySlug(slug)

  if (!municipality) notFound()

  const [shelters, stats] = await Promise.all([
    getAppV2MunicipalityShelters(municipality.id),
    getAppV2MunicipalityShelterStats(municipality.id),
  ])

  const groups = groupMunicipalityShelters(shelters)
  const kommuneJsonLd = buildKommunePageJsonLd(municipality, shelters)

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(kommuneJsonLd),
        }}
        suppressHydrationWarning
      />
      {/* Background grid */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      <SiteHeader />

      <div className="border-b border-white/10 bg-black/30 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-3 text-sm text-gray-400 sm:px-6 lg:px-8">
          <Link href="/kommune" className="transition-colors hover:text-white">
            Kommuneoversigt
          </Link>
          <span className="mx-2 text-gray-600" aria-hidden>
            ›
          </span>
          <span className="font-medium text-white">{municipality.name}</span>
        </div>
      </div>

      {/* Header */}
      <header className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Kommune
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
          Beskyttelsesrum i {municipality.name}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-gray-300">
          {groups.length.toLocaleString('da-DK')}{' '}
          {groups.length === 1 ? 'adresse' : 'adresser'} med samlet{' '}
          {stats.totalCapacity.toLocaleString('da-DK')} registrerede pladser (sum af kapacitet i aktive registreringer).
        </p>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Adresser" value={groups.length} />
          <StatCard label="Aktive registreringer" value={municipality.activeShelterCount} />
          <StatCard label="Registrerede pladser" value={stats.totalCapacity} />
          <StatCard label="Postområder i oversigten" value={stats.postalAreaCount} />
        </div>
      </header>

      {/* List + map experience */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-6 max-w-3xl rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-gray-300 sm:p-5">
          <p>
            Liste og kort viser de aktuelle registreringer i oversigten. Kortet giver lokalt overblik og kan indeholde
            ufuldstændige eller forældede oplysninger.
          </p>
          <p className="mt-2 text-gray-400">
            Brug{" "}
            <Link href="/om-data" className="text-white underline-offset-2 hover:underline">
              Om data
            </Link>{" "}
            for metode, kilder og forbehold.
          </p>
        </div>
        <KommuneExperience
          groups={groups}
          municipalityName={municipality.name}
        />
      </section>

      <GlobalFooter />
    </main>
  )
}
