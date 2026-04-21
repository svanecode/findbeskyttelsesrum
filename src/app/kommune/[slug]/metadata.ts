import { Metadata } from 'next'
import { getAppV2MunicipalityBySlug } from '@/lib/supabase/app-v2-queries'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const kommune = await getAppV2MunicipalityBySlug(slug)

  if (!kommune?.code) {
    return {
      title: 'Kommune ikke fundet',
    }
  }

  const kommuneName = kommune.name

  return {
    title: `Beskyttelsesrum i ${kommuneName}`,
    description: `Se registrerede beskyttelsesrum i ${kommuneName} kommune — adresser, pladser, kort og nøgletal.`,
    keywords: [
      `beskyttelsesrum ${kommuneName}`,
      `beskyttelsesrum ${kommuneName} kommune`,
      `find beskyttelsesrum ${kommuneName}`,
      `beskyttelsesrum i ${kommuneName}`,
      `beskyttelsesrum ${kommuneName.toLowerCase()}`,
      'beskyttelsesrum',
      'civilforsvar',
      'sikkerhed',
      'nødsituation',
      'kommune',
      'lokation',
      'nærmeste beskyttelsesrum'
    ],
    openGraph: {
      title: `Beskyttelsesrum i ${kommuneName}`,
      description: `Find beskyttelsesrum i ${kommuneName} — adresser, kapacitet og kort.`,
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
