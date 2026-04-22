import { Metadata } from 'next'
import { getAppV2MunicipalityBySlug } from '@/lib/supabase/app-v2-queries'

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
    title: `Beskyttelsesrum i ${kommuneName}`,
    description: `Lokalt overblik over aktive registreringer og registrerede pladser i ${kommuneName} — adresser, liste, kort og detail-sider for enkelte registreringer.`,
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
      title: `Beskyttelsesrum i ${kommuneName}`,
      description: `Aktive registreringer og registrerede pladser i ${kommuneName} — lokalt overblik, liste og kort.`,
      type: 'website',
      locale: 'da_DK',
      siteName: 'Find Beskyttelsesrum',
      url: `https://findbeskyttelsesrum.dk/kommune/${kommune.slug}`,
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
