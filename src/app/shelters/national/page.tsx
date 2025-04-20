import MapWrapper from '@/components/map-wrapper'
import Link from 'next/link'

export default function NationalSheltersPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <Link
          href="/"
          className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-2 mb-4"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Tilbage til forsiden
        </Link>
        <h1 className="text-3xl font-bold">Beskyttelsesrum i Danmark</h1>
      </div>

      <div className="h-[calc(100vh-12rem)] w-full rounded-lg overflow-hidden mb-8">
        <MapWrapper />
      </div>
    </div>
  )
} 