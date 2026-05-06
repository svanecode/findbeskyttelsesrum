'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { MapErrorBoundary } from '@/components/MapErrorBoundary'

const ShelterMapClient = dynamic(
  () => import('./client'),
  {
    ssr: false,
    loading: () => (
      <main id="main-content" tabIndex={-1} className="min-h-screen bg-[var(--surface-page)] text-white">
        <div className="mx-auto max-w-7xl p-4">
          {/* Approximate client header + source banner + map slot to reduce CLS when chunk hydrates */}
          <div className="mb-6 flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-white/5" />
            <div className="h-8 w-64 max-w-[70%] rounded bg-white/10" />
          </div>
          <div className="mb-4 h-12 w-full rounded-md border border-white/5 bg-white/5" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="order-2 lg:order-2">
              <div className="flex h-[400px] min-h-[400px] items-center justify-center rounded-lg border border-white/5 bg-[var(--surface-slot)] lg:h-[600px] lg:min-h-[600px]">
                <div className="flex animate-pulse flex-col items-center space-y-4">
                  <div className="h-12 w-12 rounded-full bg-orange-500/20" />
                  <div className="h-4 w-48 rounded bg-orange-500/20" />
                  <div className="text-sm text-gray-400">Indlæser kort...</div>
                </div>
              </div>
            </div>
            <div className="order-1 min-h-[320px] rounded-lg border border-white/5 bg-[var(--surface-slot)] lg:order-1" />
          </div>
        </div>
      </main>
    )
  }
)

interface MapWrapperProps {
  lat: string
  lng: string
  appV2NearbyEligibility?: string
}

export default function MapWrapper({
  lat,
  lng,
  appV2NearbyEligibility = 'source-application-code',
}: MapWrapperProps) {
  // Add validation for coordinates
  const latNum = parseFloat(lat)
  const lngNum = parseFloat(lng)

  if (!lat || !lng || isNaN(latNum) || isNaN(lngNum)) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-screen bg-[var(--surface-page)] text-white">
        <div className="mx-auto max-w-7xl p-4">
          <h1 className="mb-3 text-2xl font-bold sm:text-3xl">Manglende position</h1>
          <p className="mb-6 max-w-xl text-gray-400">
            Der mangler koordinater i linket. Gå til forsiden og søg adresse eller brug din placering.
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            Til forsiden
          </Link>
        </div>
      </main>
    )
  }

  return (
    <MapErrorBoundary>
      <ShelterMapClient
        lat={lat}
        lng={lng}
        appV2NearbyEligibility={appV2NearbyEligibility}
      />
    </MapErrorBoundary>
  )
} 
