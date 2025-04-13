import { Metadata } from 'next'

type Props = {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const kommuneName = decodeURIComponent(params.slug)
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  return {
    title: `Beskyttelsesrum ${kommuneName} | Find beskyttelsesrum i ${kommuneName} kommune`,
    description: `Find alle beskyttelsesrum i ${kommuneName} kommune. Oversigt over offentlige beskyttelsesrum, adresser og kapacitet. Komplet liste over beskyttelsesrum i ${kommuneName}.`,
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
      title: `Beskyttelsesrum ${kommuneName} | Find beskyttelsesrum i ${kommuneName} kommune`,
      description: `Find alle beskyttelsesrum i ${kommuneName} kommune. Oversigt over offentlige beskyttelsesrum, adresser og kapacitet.`,
      type: 'website',
      locale: 'da_DK',
      siteName: 'Find Beskyttelsesrum',
    },
    alternates: {
      canonical: `https://findbeskyttelsesrum.dk/kommune/${params.slug}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
} 