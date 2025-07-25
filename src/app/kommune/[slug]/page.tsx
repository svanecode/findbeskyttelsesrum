import Link from 'next/link'
import KommuneMap from './map'
import { getCachedKommune } from '@/lib/cached-queries'
import { notFound } from 'next/navigation'

interface Kommune {
  slug: string
  navn: string
  kode: string
}

interface Props {
  params: {
    slug: string
  }
}

export default async function KommunePage({ params }: Props) {
  const kommune = await getCachedKommune(params.slug) as Kommune

  if (!kommune) {
    notFound()
  }

  return (
    <div className="relative h-screen w-full">
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg p-4 shadow-lg">
        <Link
          href="/"
          className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-2 mb-2 text-sm font-medium"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Tilbage til forsiden
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Beskyttelsesrum i {kommune.navn}</h1>
      </div>

      <KommuneMap kommunekode={kommune.kode} />
    </div>
  )
} 