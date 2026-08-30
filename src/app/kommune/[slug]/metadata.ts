import { Metadata } from 'next'
import { getMunicipalityPagePath, parseMunicipalityPage } from '@/lib/municipalities/pagination'
import { createPageMetadata } from '@/lib/seo/metadata'
import { getAppV2MunicipalityBySlug } from '@/lib/supabase/app-v2-queries'

type Props = {
  params: Promise<{ slug: string; page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, page } = await params
  const requestedPage = parseMunicipalityPage(page)
  const kommune = await getAppV2MunicipalityBySlug(slug)

  if (!kommune || requestedPage === null) {
    return {
      title: 'Kommune ikke fundet',
      robots: { index: false, follow: false },
    }
  }

  const kommuneName = kommune.name
  const pageSuffix = requestedPage > 1 ? ` – side ${requestedPage}` : ''

  return createPageMetadata({
    title: `BBR-registreringer i ${kommuneName}${pageSuffix}`,
    description: `Lokalt overblik over BBR-registreringer af sikringsrumspladser i ${kommuneName}${pageSuffix} — adresser, liste, kort og detaljesider.`,
    path: getMunicipalityPagePath(kommune.slug, requestedPage),
    keywords: [
      `beskyttelsesrum ${kommuneName}`,
      `beskyttelsesrum ${kommuneName} kommune`,
      `beskyttelsesrum i ${kommuneName}`,
      `beskyttelsesrum ${kommuneName.toLowerCase()}`,
      'beskyttelsesrum',
      'civilforsvar',
      'kommune',
      'lokation',
    ],
  })
} 
