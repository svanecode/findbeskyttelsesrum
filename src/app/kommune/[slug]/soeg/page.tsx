import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { notFound, redirect } from 'next/navigation'

import { getMunicipalityPagePath, paginateMunicipalityGroups, parseMunicipalityPage } from '@/lib/municipalities/pagination'
import { filterMunicipalityGroups, getMunicipalitySearchPath, parseMunicipalitySearchQuery } from '@/lib/municipalities/search'
import { createPageMetadata } from '@/lib/seo/metadata'
import {
  getAppV2MunicipalityBySlug,
  getAppV2PublicMunicipalityShelters,
  groupMunicipalityShelters,
} from '@/lib/supabase/app-v2-queries'
import KommuneView from '../kommune-view'

/**
 * Search across all of a municipality's addresses. Visitors reach it as
 * /kommune/<slug>?q=...&side=..., which src/proxy.ts rewrites to this route.
 */

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string | string[]; side?: string | string[] }>
}

// The registrations change once a day; searches share a ten-minute copy per municipality.
const getCachedMunicipalityShelters = unstable_cache(
  (municipalityId: string) => getAppV2PublicMunicipalityShelters(municipalityId),
  ['app-v2-municipality-shelters'],
  { revalidate: 600 },
)

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { q }] = await Promise.all([params, searchParams])
  const municipality = await getAppV2MunicipalityBySlug(slug)
  if (!municipality) return { title: 'Kommune ikke fundet', robots: { index: false, follow: false } }

  const query = parseMunicipalitySearchQuery(q)
  return createPageMetadata({
    title: query ? `Søgning efter "${query}" i ${municipality.name}` : `Beskyttelsesrum i ${municipality.name}`,
    description: `Søg i BBR-registreringer af sikringsrumspladser i ${municipality.name}.`,
    // Search pages point search engines at the municipality page.
    path: getMunicipalityPagePath(municipality.slug, 1),
    index: false,
    follow: true,
  })
}

export default async function KommuneSearchPage({ params, searchParams }: Props) {
  const [{ slug }, { q, side }] = await Promise.all([params, searchParams])
  const municipality = await getAppV2MunicipalityBySlug(slug)
  if (!municipality) notFound()

  const query = parseMunicipalitySearchQuery(q)
  if (!query) redirect(getMunicipalityPagePath(municipality.slug, 1))

  const requestedPage = parseMunicipalityPage(Array.isArray(side) ? side[0] : side) ?? 1
  const shelters = await getCachedMunicipalityShelters(municipality.id)
  const matches = filterMunicipalityGroups(groupMunicipalityShelters(shelters), query)
  const pagination = paginateMunicipalityGroups(matches, requestedPage)
  // A page past the end (an old link after new data) falls back to the first page.
  if (!pagination) redirect(getMunicipalitySearchPath(municipality.slug, query))

  return (
    <KommuneView
      municipality={municipality}
      shelters={shelters}
      pagination={pagination}
      searchQuery={query}
    />
  )
}
