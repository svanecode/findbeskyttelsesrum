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
  params: Promise<{
    slug: string
  }>
}

export default async function KommunePage({ params }: Props) {
  const resolvedParams = await params
  const kommune = await getCachedKommune(resolvedParams.slug) as Kommune

  if (!kommune) {
    notFound()
  }

  return (
    <div className="relative h-screen w-full">
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg p-3 sm:p-4 shadow-lg max-w-[calc(100vw-1rem)] sm:max-w-none">
        <Link
          href="/"
          className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-2 mb-2 text-sm font-medium touch-target p-1 -m-1 rounded"
          aria-label="Tilbage til forsiden"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="hidden sm:inline">Tilbage til forsiden</span>
          <span className="sm:hidden">Tilbage</span>
        </Link>
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">Beskyttelsesrum i {kommune.navn}</h1>
      </div>

      <KommuneMap kommunekode={kommune.kode} />
    </div>
  )
} 