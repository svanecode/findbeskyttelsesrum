'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { MapErrorBoundary } from '@/components/MapErrorBoundary'

const ShelterMapClient = dynamic(
  () => import('./client'),
  {
    ssr: false,
    loading: () => (
      <main className="min-h-screen bg-[#1a1a1a] text-white">
        <div className="max-w-7xl mx-auto p-4">
          <div className="flex items-center justify-center h-[200px]">
            <div className="animate-pulse flex flex-col items-center space-y-4">
              <div className="w-12 h-12 bg-orange-500/20 rounded-full"></div>
              <div className="w-48 h-4 bg-orange-500/20 rounded"></div>
              <div className="text-gray-400 text-sm">Indlæser kort...</div>
            </div>
          </div>
        </div>
      </main>
    )
  }
)

interface MapWrapperProps {
  lat: string
  lng: string
}

export default function MapWrapper({ lat, lng }: MapWrapperProps) {
  // Add validation for coordinates
  const latNum = parseFloat(lat)
  const lngNum = parseFloat(lng)

  if (!lat || !lng || isNaN(latNum) || isNaN(lngNum)) {
    return (
      <main className="min-h-screen bg-[#1a1a1a] text-white">
        <div className="max-w-7xl mx-auto p-4">
          <h1 className="text-3xl font-bold mb-8">Manglende position</h1>
          <p className="text-gray-400 mb-4">
            Ingen koordinater blev sendt med. Gå tilbage til forsiden og prøv at søge efter en adresse igen.
          </p>
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
          >
            ← Tilbage til forsiden
          </Link>
        </div>
      </main>
    )
  }

  return (
    <MapErrorBoundary>
      <ShelterMapClient lat={lat} lng={lng} />
    </MapErrorBoundary>
  )
} 