'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { MapErrorBoundary } from '@/components/MapErrorBoundary'
import { defaultNearbySource, type NearbySource } from '@/lib/nearby/source'

const ShelterMapClient = dynamic(
  () => import('./client'),
  {
    ssr: false,
    loading: () => (
      <main className="min-h-screen bg-[#1a1a1a] text-white">
        <div className="mx-auto max-w-7xl p-4">
          {/* Approximate client header + source banner + map slot to reduce CLS when chunk hydrates */}
          <div className="mb-6 flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-white/5" />
            <div className="h-8 w-64 max-w-[70%] rounded bg-white/10" />
          </div>
          <div className="mb-4 h-12 w-full rounded-md border border-white/5 bg-white/5" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="order-1 lg:order-2">
              <div className="flex h-[400px] min-h-[400px] items-center justify-center rounded-lg border border-white/5 bg-[#252525] lg:h-[600px] lg:min-h-[600px]">
                <div className="flex animate-pulse flex-col items-center space-y-4">
                  <div className="h-12 w-12 rounded-full bg-orange-500/20" />
                  <div className="h-4 w-48 rounded bg-orange-500/20" />
                  <div className="text-sm text-gray-400">Indlæser kort...</div>
                </div>
              </div>
            </div>
            <div className="order-2 min-h-[320px] rounded-lg border border-white/5 bg-[#252525] lg:order-1" />
          </div>
        </div>
      </main>
    )
  }
)

interface MapWrapperProps {
  lat: string
  lng: string
  appV2NearbyExperiment?: boolean
  appV2NearbyPublicExperiment?: boolean
  appV2NearbyEligibility?: string
  source?: NearbySource
}

export default function MapWrapper({
  lat,
  lng,
  appV2NearbyExperiment = false,
  appV2NearbyPublicExperiment = false,
  appV2NearbyEligibility = 'source-application-code',
  source = defaultNearbySource,
}: MapWrapperProps) {
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
      <ShelterMapClient
        lat={lat}
        lng={lng}
        appV2NearbyExperiment={appV2NearbyExperiment}
        appV2NearbyPublicExperiment={appV2NearbyPublicExperiment}
        appV2NearbyEligibility={appV2NearbyEligibility}
        source={source}
      />
    </MapErrorBoundary>
  )
} 
