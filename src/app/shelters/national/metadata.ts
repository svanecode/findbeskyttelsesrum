import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Beskyttelsesrum i Danmark | Find nærmeste beskyttelsesrum',
  description: 'Find alle beskyttelsesrum i Danmark på et kort. Søg efter beskyttelsesrum i din kommune eller område. Komplet oversigt over offentlige beskyttelsesrum.',
  keywords: 'beskyttelsesrum, civilforsvar, sikkerhed, nødsituation, Danmark, kort, lokation, nærmeste beskyttelsesrum',
  openGraph: {
    title: 'Beskyttelsesrum i Danmark | Find nærmeste beskyttelsesrum',
    description: 'Find alle beskyttelsesrum i Danmark på et kort. Søg efter beskyttelsesrum i din kommune eller område.',
    type: 'website',
    locale: 'da_DK',
    siteName: 'Beskyttelsesrum',
  },
  alternates: {
    canonical: 'https://beskyttelsesrum.dk/shelters/national',
  },
  robots: {
    index: true,
    follow: true,
  },
} 