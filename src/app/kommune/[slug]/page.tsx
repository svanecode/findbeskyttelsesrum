import { notFound, permanentRedirect } from 'next/navigation'

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
import { siteUrl } from '@/lib/seo/site'
import { getShelterPublicDisplayName } from '@/lib/shelter-display-name'
import { getCanonicalShelterSlugs, getShelterPublicPath } from '@/lib/shelter-public-url'
import KommuneView from './kommune-view'
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

  const readableSlugs = getCanonicalShelterSlugs(shelters)
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
        url: `${siteUrl}${getShelterPublicPath(readableSlugs.get(shelter.id) ?? shelter.slug)}`,
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
  const kommuneJsonLd = buildKommunePageJsonLd(
    municipality,
    pageShelters,
    pagePath,
    pagination.currentPage,
  )

  return (
    <KommuneView
      municipality={municipality}
      shelters={shelters}
      pagination={pagination}
      jsonLd={kommuneJsonLd}
    />
  )
}
