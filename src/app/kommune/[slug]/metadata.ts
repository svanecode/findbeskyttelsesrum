import { Metadata } from 'next'
import { getAppV2MunicipalityBySlug } from '@/lib/supabase/app-v2-queries'
import { siteUrl } from '@/lib/seo/site'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const kommune = await getAppV2MunicipalityBySlug(slug)

  if (!kommune) {
    return {
      title: 'Kommune ikke fundet',
    }
  }

  const kommuneName = kommune.name

  return {
    title: `BBR-registreringer i ${kommuneName}`,
    description: `Lokalt overblik over BBR-registreringer af sikringsrumspladser i ${kommuneName} — adresser, liste, kort og detaljesider.`,
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
    openGraph: {
      title: `BBR-registreringer i ${kommuneName}`,
      description: `BBR-registreringer af sikringsrumspladser i ${kommuneName} — lokalt overblik, liste og kort.`,
      type: 'website',
      locale: 'da_DK',
      siteName: 'Find Beskyttelsesrum',
      url: `${siteUrl}/kommune/${kommune.slug}`,
    },
    alternates: {
      canonical: `/kommune/${kommune.slug}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
} 
