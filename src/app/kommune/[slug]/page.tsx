import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'

import GlobalFooter from '@/components/GlobalFooter'
import { ui } from '@/components/ui-classes'
import {
  getMunicipalityPagePath,
  paginateMunicipalityGroups,
  parseMunicipalityPage,
} from '@/lib/municipalities/pagination'
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
  params: Promise<{ slug: string; page?: string }>
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
  pagePath: string,
  currentPage: number,
) {
  const kommuneNavn = municipality.name
  const pageSuffix = currentPage > 1 ? ` – side ${currentPage}` : ''

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `BBR-registreringer i ${kommuneNavn}${pageSuffix}`,
    description: `Kommuneoversigt over BBR-registreringer af sikringsrumspladser i ${kommuneNavn}${pageSuffix} — antal, kapacitet, adresser og detaljesider.`,
    url: `${siteUrl}${pagePath}`,
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
    name: `BBR-registreringer i ${kommuneNavn}${pageSuffix}`,
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

export function generateStaticParams() {
  return []
}

export default async function KommunePage({ params }: Props) {
  const { slug, page } = await params
  if (page === '1') permanentRedirect(`/kommune/${encodeURIComponent(slug)}`)

  const requestedPage = parseMunicipalityPage(page)
  if (requestedPage === null) notFound()

  const municipality = await getAppV2MunicipalityBySlug(slug)

  if (!municipality) notFound()

  const shelters = await getAppV2PublicMunicipalityShelters(municipality.id)

  const groups = groupMunicipalityShelters(shelters)
  const pagination = paginateMunicipalityGroups(groups, requestedPage)
  if (!pagination) notFound()

  const pageShelterIds = new Set(
    pagination.items.flatMap((group) => group.shelters.map((shelter) => shelter.id)),
  )
  const pageShelters = shelters.filter((shelter) => pageShelterIds.has(shelter.id))
  const pagePath = getMunicipalityPagePath(municipality.slug, pagination.currentPage)
  const publicShelterCount = shelters.length
  const totalCapacity = shelters.reduce((sum, shelter) => sum + shelter.capacity, 0)
  const kommuneJsonLd = buildKommunePageJsonLd(
    municipality,
    pageShelters,
    pagePath,
    pagination.currentPage,
  )

  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(kommuneJsonLd),
        }}
        suppressHydrationWarning
      />
      <div className="border-b border-white/10 bg-[var(--surface-inset)]">
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
        <p className={ui.eyebrow}>
          Kommune
        </p>
        <h1 className={`mt-2 ${ui.pageTitle}`}>
          BBR-registreringer i {municipality.name}
        </h1>

        <p className="mt-3 text-lg text-gray-300">
          {publicShelterCount === 1
            ? '1 BBR-registrering'
            : `${publicShelterCount.toLocaleString('da-DK')} BBR-registreringer`}
          <span className="text-gray-400"> · </span>
          {totalCapacity === 1
            ? '1 BBR-registreret plads'
            : `${totalCapacity.toLocaleString('da-DK')} BBR-registrerede pladser`}
        </p>
      </header>

      {/* Map experience */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <KommuneExperience
          groups={pagination.items}
          municipalityName={municipality.name}
          municipalitySlug={municipality.slug}
          pagination={pagination}
        />
      </section>

      <GlobalFooter />
    </main>
  )
}
