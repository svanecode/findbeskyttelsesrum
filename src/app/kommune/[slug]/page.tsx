import Link from 'next/link'
import { notFound } from 'next/navigation'

import GlobalFooter from '@/components/GlobalFooter'
import {
  getAppV2MunicipalityBySlug,
  getAppV2PublicMunicipalityShelters,
  groupMunicipalityShelters,
  type AppV2MunicipalityShelter,
} from '@/lib/supabase/app-v2-queries'
import { serializeJsonLd } from '@/lib/seo/json-ld'
import { siteUrl } from '@/lib/seo/site'
import { getShelterPublicDisplayName } from '@/lib/shelter-display-name'
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
    name: `Registrerede beskyttelsesrum i ${kommuneNavn}`,
    description: `Kommuneoversigt over beskyttelsesrum i ${kommuneNavn} ud fra offentlige registerdata — antal, kapacitet, adresser og detaljesider.`,
    url: `${siteUrl}/kommune/${municipality.slug}`,
    inLanguage: 'da-DK',
    isPartOf: {
      '@type': 'WebSite',
      name: 'Find Beskyttelsesrum',
      url: siteUrl,
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
    name: `Udvalgte beskyttelsesrum i ${kommuneNavn}`,
    numberOfItems: topShelters.length,
    itemListElement: topShelters.map((shelter, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Place',
        name: getShelterPublicDisplayName(shelter.name, shelter.addressLine1),
        url: `${siteUrl}/beskyttelsesrum/${shelter.slug}`,
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

export default async function KommunePage({ params }: Props) {
  const { slug } = await params
  const municipality = await getAppV2MunicipalityBySlug(slug)

  if (!municipality) notFound()

  const shelters = await getAppV2PublicMunicipalityShelters(municipality.id)

  const groups = groupMunicipalityShelters(shelters)
  const kommuneJsonLd = buildKommunePageJsonLd(municipality, shelters)

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#0a0a0a] text-white">
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
          Registrerede beskyttelsesrum i {municipality.name}
        </h1>

        <p className="mt-3 text-lg tabular-nums text-gray-300">
          {shelters.length.toLocaleString('da-DK')} beskyttelsesrum
        </p>
      </header>

      {/* Map experience */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <KommuneExperience
          groups={groups}
          municipalityName={municipality.name}
        />
      </section>

      <GlobalFooter />
    </main>
  )
}
