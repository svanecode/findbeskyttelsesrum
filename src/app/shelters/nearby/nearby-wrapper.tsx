'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import MapWrapper from './map-wrapper'

export default function NearbyWrapper() {
  const searchParams = useSearchParams()
  const lat = searchParams.get('lat') || ''
  const lng = searchParams.get('lng') || ''
  const appV2NearbyEligibility = searchParams.get('appV2NearbyEligibility') || 'source-application-code'

  // Only validate if both parameters are present
  if (lat && lng) {
    const latNum = Number(lat)
    const lngNum = Number(lng)
    
    // Check if coordinates are valid
    if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return (
        <main id="main-content" tabIndex={-1} className="min-h-screen bg-[var(--surface-page)] text-white">
          <div className="mx-auto max-w-7xl p-4">
            <h1 className="mb-3 text-2xl font-bold sm:text-3xl">Ugyldig position</h1>
            <p className="mb-6 max-w-xl text-gray-400">
              Koordinaterne er ugyldige. Gå til forsiden og søg igen, eller brug din placering.
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
  }

  return (
    <MapWrapper
      lat={lat}
      lng={lng}
      appV2NearbyEligibility={appV2NearbyEligibility}
    />
  )
} 
