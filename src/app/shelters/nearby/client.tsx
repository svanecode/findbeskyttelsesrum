'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { supabase, retryRPC } from '@/lib/supabase'

// Fix Leaflet default markers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

// Create custom icons using div icons for better reliability
const createDivIcon = (className: string, html: string, size: number = 40) => {
  return L.divIcon({
    className: className,
    html: html,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2]
  })
}

const userLocationIcon = createDivIcon(
  'user-location-marker',
  '<div style="width: 24px; height: 24px; background: #3B82F6; border: 4px solid white; border-radius: 50%; box-shadow: 0 3px 8px rgba(0,0,0,0.5);"></div>',
  32
)

const shelterIcon = createDivIcon(
  'shelter-marker',
  '<div style="width: 24px; height: 24px; background: #EF4444; border: 4px solid white; border-radius: 50%; box-shadow: 0 3px 8px rgba(0,0,0,0.5);"></div>',
  32
)

const hoveredShelterIcon = createDivIcon(
  'shelter-marker-hovered',
  '<div style="width: 28px; height: 28px; background: #FB923C; border: 4px solid white; border-radius: 50%; box-shadow: 0 3px 10px rgba(0,0,0,0.6);"></div>',
  36
)
import { Shelter } from '@/types/shelter'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'
import Link from 'next/link'
import GlobalFooter from '@/components/GlobalFooter'
import { Kommunekode } from '@/types/kommunekode'
import { Anvendelseskode } from '@/types/anvendelseskode'

// Dynamic import to avoid SSR issues with Leaflet
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })

// Component to auto-fit map bounds to markers
function FitBounds({ userLocation, shelters }: { userLocation: [number, number], shelters: ShelterWithDistance[] }) {
  // This will be loaded client-side only
  const [MapHook, setMapHook] = useState<any>(null)

  useEffect(() => {
    import('react-leaflet').then(mod => {
      setMapHook(() => mod.useMap)
    })
  }, [])

  if (!MapHook) return null

  return <FitBoundsInner userLocation={userLocation} shelters={shelters} useMapHook={MapHook} />
}

function FitBoundsInner({ userLocation, shelters, useMapHook }: {
  userLocation: [number, number],
  shelters: ShelterWithDistance[],
  useMapHook: any
}) {
  const map = useMapHook()

  useEffect(() => {
    if (!map || shelters.length === 0) return

    // Create a feature group with all markers
    const group = L.featureGroup([
      L.marker(userLocation),
      ...shelters
        .filter(s => s.location)
        .map(s => L.marker([s.location!.coordinates[1], s.location!.coordinates[0]]))
    ])

    const bounds = group.getBounds()

    if (!bounds.isValid()) {
      group.clearLayers()
      return
    }

    // If only user location (no shelters with location), just center on user
    if (shelters.filter(s => s.location).length === 0) {
      map.setView(userLocation, 13, { animate: true })
    } else {
      // Fit to all markers with padding
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
      map.fitBounds(bounds, {
        padding: isMobile ? [30, 30] : [50, 50],
        maxZoom: 16,
        animate: true
      })
    }

    // Clean up
    group.clearLayers()
  }, [map, userLocation, shelters, useMapHook])

  return null
}

interface ShelterWithDistance extends Shelter {
  distance: number
}

type AppV2NearbyReviewEligibility = 'source-application-code' | 'legacy-capacity' | 'none'

type NearbyShadowComparison = {
  comparison: {
    eligibilityMode: string
    sharedAddressCount: number
    legacyOnlyAddressCount: number
    appV2OnlyAddressCount: number
    sharedAddressKeys: string[]
    legacyOnlyAddressKeys: string[]
    appV2OnlyAddressKeys: string[]
    rankOverlap: {
      shared: Array<{
        key: string
        legacyRank: number
        appV2Rank: number
        delta: number
      }>
      exactRankMatches: number
      averageAbsRankDelta: number
      maxAbsRankDelta: number
    }
    knownSemanticGaps: {
      legacyAnvendelseSkalMed: string
      note: string
    }
  }
  meta: {
    userVisibleSource: string
    appV2: {
      resultCount: number
      eligibility: {
        mode: string
        minimumCapacity: number | null
        sourceApplicationCodeRequired?: boolean
        sourceApplicationCodeSemantics?: string
        legacyAnvendelseSemantics?: string
        note?: string
      }
      diagnostics?: {
        sourceApplicationCodeRows?: number
        sourceApplicationCodeEligibleRows?: number
        sourceApplicationCodeUnknownRows?: number
        filteredByEligibility?: number
        eligibleRows?: number
      }
    }
  }
  legacyResults: Array<{
    rank: number
    addressKey: string
    address: string | null
    postalCode: string | null
    municipalityCode: string | null
    distanceMeters: number | null
    shelterCount: number | null
    totalCapacity: number | null
    anvendelse: string | null
  }>
  appV2Results: Array<{
    rank: number
    addressKey: string
    address: {
      line1: string
      postalCode: string
      city: string
    }
    distanceMeters: number
    shelterCount: number
    totalCapacity: number
    municipality: {
      name: string
      code: string | null
    }
  }>
}

function formatShadowDistance(distanceMeters: number | null | undefined) {
  return typeof distanceMeters === 'number' ? `${(distanceMeters / 1000).toFixed(1)} km` : 'ukendt afstand'
}

function formatRankDelta(delta: number) {
  if (delta === 0) {
    return 'samme placering'
  }

  return delta > 0 ? `app_v2 +${delta}` : `app_v2 ${delta}`
}

function normalizeReviewEligibility(value: string): AppV2NearbyReviewEligibility {
  if (value === 'legacy-capacity' || value === 'none') {
    return value
  }

  return 'source-application-code'
}

function getReviewEligibilityLabel(mode: string) {
  if (mode === 'source_application_code_v1' || mode === 'source-application-code') {
    return 'Strict source-backed'
  }

  if (mode === 'legacy_capacity_v1' || mode === 'legacy-capacity') {
    return 'Capacity-only'
  }

  if (mode === 'none') {
    return 'Ingen ekstra eligibility'
  }

  return mode
}

const reviewSampleLinks = [
  {
    label: 'København',
    href: '/shelters/nearby?lat=55.6761&lng=12.5683&appV2NearbyExperiment=grouped',
  },
  {
    label: 'Aarhus',
    href: '/shelters/nearby?lat=56.1629&lng=10.2039&appV2NearbyExperiment=grouped',
  },
  {
    label: 'Lemvig',
    href: '/shelters/nearby?lat=56.5486&lng=8.3102&appV2NearbyExperiment=grouped',
  },
  {
    label: 'Odense',
    href: '/shelters/nearby?lat=55.4038&lng=10.4024&appV2NearbyExperiment=grouped',
  },
  {
    label: 'Esbjerg',
    href: '/shelters/nearby?lat=55.4765&lng=8.4594&appV2NearbyExperiment=grouped',
  },
] as const

async function getNearbyShelters(lat: number, lng: number) {
  // Try v3 first (optimized with ST_DWithin and exclusions), fallback to v2
  let useV3 = process.env.NEXT_PUBLIC_USE_SHELTERS_V3 !== 'false' // Default to true unless explicitly disabled
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`Calling get_nearby_shelters_v${useV3 ? '3' : '2'} with:`, { p_lat: lat, p_lng: lng })
  }

  try {
    let response: { data: ShelterWithDistance[] | null; error: any } | null = null

    if (useV3) {
      // Try v3 first with 50km radius (50000 meters)
      response = await retryRPC<ShelterWithDistance[]>(async () => {
        const result = await supabase.rpc('get_nearby_shelters_v3', {
          p_lat: lat,
          p_lng: lng,
          p_radius_meters: 50000 // 50km default radius
        })
        return result
      })

      // If v3 function doesn't exist (error code 42883 = function does not exist), fallback to v2
      if (response && response.error && response.error.code === '42883') {
        if (process.env.NODE_ENV === 'development') {
          console.warn('get_nearby_shelters_v3 not found, falling back to v2')
        }
        useV3 = false // Fallback flag
        response = null // Reset to use v2
      } else if (response && response.error) {
        // Some other error with v3 - try v2 as fallback
        if (process.env.NODE_ENV === 'development') {
          console.warn('get_nearby_shelters_v3 had an error, falling back to v2:', response.error.message)
        }
        useV3 = false
        response = null
      }
    }

    // Use v2 if v3 not available, disabled, or failed
    if (!useV3 || !response) {
      response = await retryRPC<ShelterWithDistance[]>(async () => {
        const result = await supabase.rpc('get_nearby_shelters_v2', {
          p_lat: lat,
          p_lng: lng
        })
        return result
      })
    }

    if (response.error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Supabase RPC error:', {
          message: response.error.message,
          details: response.error.details,
          hint: response.error.hint,
          code: response.error.code,
          stack: response.error.stack
        })
      }
      throw response.error
    }

    if (!response.data) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`No data returned from get_nearby_shelters_v${useV3 ? '3' : '2'}`)
      }
      return []
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`Successfully fetched shelters (v${useV3 ? '3' : '2'}):`, response.data.length)
    }

    const nearbyShelters = response.data
      .map((shelter: ShelterWithDistance) => ({
        ...shelter,
        distance: (shelter.distance || 0) / 1000
      }))

    return nearbyShelters
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in getNearbyShelters:', error)
    }
    return []
  }
}

async function getAppV2NearbyShadowComparison(
  lat: number,
  lng: number,
  eligibility: AppV2NearbyReviewEligibility,
): Promise<NearbyShadowComparison | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: '50000',
    limit: '10',
    candidateLimit: '500',
    shadow: '1',
    eligibility,
  })
  const response = await fetch(`/api/app-v2/nearby/shadow?${params.toString()}`, {
    cache: 'no-store'
  })

  if (!response.ok) {
    throw new Error(`app_v2 nearby experiment failed with status ${response.status}`)
  }

  return response.json()
}

interface Props {
  lat: string
  lng: string
  appV2NearbyExperiment?: boolean
  appV2NearbyPublicExperiment?: boolean
  appV2NearbyEligibility?: string
}

export default function ShelterMapClient({
  lat: latString,
  lng: lngString,
  appV2NearbyExperiment = false,
  appV2NearbyPublicExperiment = false,
  appV2NearbyEligibility = 'source-application-code',
}: Props) {
  const [shelters, setShelters] = useState<(Shelter & { distance: number })[]>([])
  const [anvendelseskoder, setAnvendelseskoder] = useState<Anvendelseskode[]>([])
  const [kommunekoder, setKommunekoder] = useState<Kommunekode[]>([])
  const [appV2ShadowComparison, setAppV2ShadowComparison] = useState<NearbyShadowComparison | null>(null)
  const [appV2ShadowError, setAppV2ShadowError] = useState<string | null>(null)
  const [selectedShelter, setSelectedShelter] = useState<string | null>(null)
  const [hoveredShelter, setHoveredShelter] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const shelterRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const mapRef = useRef<any>(null)
  const lat = parseFloat(latString)
  const lng = parseFloat(lngString)
  const reviewEligibility = appV2NearbyPublicExperiment
    ? 'source-application-code'
    : normalizeReviewEligibility(appV2NearbyEligibility)
  const shouldLoadAppV2Shadow = appV2NearbyExperiment || appV2NearbyPublicExperiment

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Function to handle back to top
  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      try {
        setIsLoading(true)
        if (process.env.NODE_ENV === 'development') {
          console.log('Starting data load with coordinates:', { lat, lng })
        }

        const [sheltersData, anvendelseskoderData, kommunekoderData] = await Promise.all([
          getNearbyShelters(lat, lng),
          getAnvendelseskoder(),
          getKommunekoder()
        ])
        let shadowComparison: NearbyShadowComparison | null = null
        let shadowError: string | null = null

        if (shouldLoadAppV2Shadow) {
          try {
            shadowComparison = await getAppV2NearbyShadowComparison(lat, lng, reviewEligibility)
          } catch (error) {
            shadowError = error instanceof Error ? error.message : 'app_v2 nearby experiment kunne ikke indlæses.'
          }
        }

        if (process.env.NODE_ENV === 'development') {
          console.log('Data loaded:', {
            sheltersCount: sheltersData.length,
            anvendelseskoderCount: anvendelseskoderData.length,
            kommunekoderCount: kommunekoderData.length,
            appV2NearbyExperiment,
            appV2NearbyPublicExperiment,
            reviewEligibility,
            appV2ShadowResultCount: shadowComparison?.meta.appV2.resultCount ?? 0
          })
        }

        if (isMounted) {
          setShelters(sheltersData)
          setAnvendelseskoder(anvendelseskoderData)
          setKommunekoder(kommunekoderData)
          setAppV2ShadowComparison(shadowComparison)
          setAppV2ShadowError(shadowError)
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error in loadData:', error)
        }
        if (isMounted) {
          setShelters([])
          setAnvendelseskoder([])
          setKommunekoder([])
          setAppV2ShadowComparison(null)
          setAppV2ShadowError(null)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [lat, lng, shouldLoadAppV2Shadow, appV2NearbyExperiment, appV2NearbyPublicExperiment, reviewEligibility])

  if (isNaN(lat) || isNaN(lng)) {
    return (
      <main className="min-h-screen bg-[#1a1a1a] text-white">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Ugyldig position</h1>
          <Link
            href="/"
            className="text-blue-400 hover:text-blue-300"
          >
            ← Tilbage til forsiden
          </Link>
        </div>
      </main>
    )
  }

  const legacyOnlyResults = appV2ShadowComparison
    ? appV2ShadowComparison.legacyResults.filter((result) =>
        appV2ShadowComparison.comparison.legacyOnlyAddressKeys.includes(result.addressKey),
      )
    : []
  const appV2OnlyResults = appV2ShadowComparison
    ? appV2ShadowComparison.appV2Results.filter((result) =>
        appV2ShadowComparison.comparison.appV2OnlyAddressKeys.includes(result.addressKey),
      )
    : []
  const sharedRankDifferences = appV2ShadowComparison?.comparison.rankOverlap.shared ?? []
  const appV2Diagnostics = appV2ShadowComparison?.meta.appV2.diagnostics
  const appV2Eligibility = appV2ShadowComparison?.meta.appV2.eligibility
  const isStrictSourceBackedReview =
    appV2ShadowComparison?.comparison.eligibilityMode === 'source_application_code_v1' ||
    appV2Eligibility?.mode === 'source_application_code_v1'
  const hasReviewMismatches = legacyOnlyResults.length > 0 || appV2OnlyResults.length > 0
  const likelyAddressNormalizationEdge =
    isStrictSourceBackedReview &&
    legacyOnlyResults.length > 0 &&
    legacyOnlyResults.length === appV2OnlyResults.length
  const reviewModeLinks = [
    {
      key: 'source-application-code',
      label: 'Strict source-backed',
      href: `/shelters/nearby?lat=${encodeURIComponent(latString)}&lng=${encodeURIComponent(lngString)}&appV2NearbyExperiment=grouped&appV2NearbyEligibility=source-application-code`,
    },
    {
      key: 'legacy-capacity',
      label: 'Capacity-only',
      href: `/shelters/nearby?lat=${encodeURIComponent(latString)}&lng=${encodeURIComponent(lngString)}&appV2NearbyExperiment=grouped&appV2NearbyEligibility=legacy-capacity`,
    },
  ]

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-white">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex items-center mb-6">
          <Link
            href="/"
            className="text-gray-400 hover:text-white transition-colors mr-3 sm:mr-4 p-2 -ml-2 rounded-lg hover:bg-gray-800/50 touch-target"
            aria-label="Tilbage til forsiden"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold">Dine 10 nærmeste beskyttelsesrum</h1>
        </div>

        {appV2NearbyPublicExperiment && (
          <section className="mb-6 rounded-lg border border-sky-500/30 bg-[#1f1f1f] p-4 sm:p-5">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                  Eksperimentel preview
                </p>
                <h2 className="text-lg font-semibold text-white">
                  Ny app_v2 nearby-sammenligning
                </h2>
              </div>
              <div className="text-sm text-gray-400">
                Legacy-listen og kortet er stadig standard
              </div>
            </div>
            <p className="text-sm leading-6 text-gray-300">
              Denne lille preview vises kun, fordi siden er åbnet med et eksplicit eksperiment-flag. Den sammenligner
              den normale legacy-visning med grouped app_v2 nearby i strict source-backed mode. Den erstatter ikke
              resultatlisten eller kortet.
            </p>

            {appV2ShadowError ? (
              <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
                app_v2-preview kunne ikke indlæses lige nu. Den normale legacy-visning nedenfor er uændret.
              </div>
            ) : appV2ShadowComparison ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Fælles adresser</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {appV2ShadowComparison.comparison.sharedAddressCount}/10
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Kun normal visning</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {appV2ShadowComparison.comparison.legacyOnlyAddressCount}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Kun app_v2-preview</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {appV2ShadowComparison.comparison.appV2OnlyAddressCount}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white">app_v2-preview, første resultater</h3>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    {appV2ShadowComparison.appV2Results.slice(0, 3).map((result) => (
                      <div key={`${result.rank}-${result.addressKey}`} className="rounded-lg border border-white/10 bg-[#252525] p-3">
                        <div className="text-sm font-medium text-white">
                          {result.rank}. {result.address.line1}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-gray-400">
                          {result.address.postalCode} {result.address.city} · {formatShadowDistance(result.distanceMeters)}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {result.totalCapacity.toLocaleString('da-DK')} registrerede pladser · {result.shelterCount} gruppe-rækker
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg bg-sky-500/10 p-3 text-sm leading-6 text-sky-100">
                  Previewen bruger <span className="font-mono">source_application_code_v1</span> og grouped app_v2.
                  Den normale liste og alle kortmarkører nedenfor kommer stadig fra legacy-flowet.
                  <Link href="/om-data" className="ml-1 font-semibold underline underline-offset-4">
                    Læs om datagrundlaget.
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-[#252525] p-3 text-sm text-gray-300">
                Indlæser app_v2-preview...
              </div>
            )}
          </section>
        )}

        {appV2NearbyExperiment && (
          <section className="mb-6 rounded-lg border border-orange-500/30 bg-[#1f1f1f] p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">
                  Intern review mode
                </p>
                <h2 className="text-lg font-semibold text-white">
                  Grouped app_v2 nearby review
                </h2>
              </div>
              <div className="text-sm text-gray-400">
                Legacy er stadig standardvisningen
              </div>
            </div>
            <p className="mb-4 text-sm text-gray-300">
              Denne blok vises kun med <span className="font-mono text-orange-300">appV2NearbyExperiment=grouped</span>.
              Kortet og de normale resultatkort bruger stadig legacy-flowet. app_v2-reviewet er grouped og bruger som
              standard <span className="font-mono text-orange-300">source_application_code_v1</span>.
            </p>
            <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="rounded-lg border border-white/10 bg-[#252525] p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Mode</div>
                <div className="flex flex-wrap gap-2">
                  {reviewModeLinks.map((link) => (
                    <a
                      key={link.key}
                      href={link.href}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        reviewEligibility === link.key
                          ? 'border-orange-400 bg-orange-500/20 text-orange-100'
                          : 'border-white/10 bg-[#1f1f1f] text-gray-300 hover:border-orange-400/60 hover:text-white'
                      }`}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#252525] p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Trial cases</div>
                <div className="flex flex-wrap gap-2">
                  {reviewSampleLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      className="rounded-lg border border-white/10 bg-[#1f1f1f] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-orange-400/60 hover:text-white"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
            {appV2ShadowError ? (
              <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
                {appV2ShadowError}
              </div>
            ) : appV2ShadowComparison ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Overlap</div>
                    <div className="text-lg font-semibold text-white">{appV2ShadowComparison.comparison.sharedAddressCount}/10</div>
                  </div>
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Kun legacy</div>
                    <div className="text-lg font-semibold text-white">{appV2ShadowComparison.comparison.legacyOnlyAddressCount}</div>
                  </div>
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Kun app_v2</div>
                    <div className="text-lg font-semibold text-white">{appV2ShadowComparison.comparison.appV2OnlyAddressCount}</div>
                  </div>
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Max rank-delta</div>
                    <div className="text-lg font-semibold text-white">{appV2ShadowComparison.comparison.rankOverlap.maxAbsRankDelta}</div>
                  </div>
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Exact rank</div>
                    <div className="text-lg font-semibold text-white">{appV2ShadowComparison.comparison.rankOverlap.exactRankMatches}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Eligibility</div>
                    <div className="text-sm font-semibold text-white">
                      {getReviewEligibilityLabel(appV2Eligibility?.mode ?? appV2ShadowComparison.comparison.eligibilityMode)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Source-code rows</div>
                    <div className="text-sm font-semibold text-white">{appV2Diagnostics?.sourceApplicationCodeRows ?? 'n/a'}</div>
                  </div>
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Eligible by code</div>
                    <div className="text-sm font-semibold text-white">{appV2Diagnostics?.sourceApplicationCodeEligibleRows ?? 'n/a'}</div>
                  </div>
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Unknown code rows</div>
                    <div className="text-sm font-semibold text-white">{appV2Diagnostics?.sourceApplicationCodeUnknownRows ?? 'n/a'}</div>
                  </div>
                  <div className="rounded-lg bg-[#252525] p-3">
                    <div className="text-xs text-gray-400">Filtered rows</div>
                    <div className="text-sm font-semibold text-white">{appV2Diagnostics?.filteredByEligibility ?? 'n/a'}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#252525] p-3">
                  <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Trial vurdering</h3>
                      <p className="text-xs text-gray-400">
                        Brug denne blok til intern vurdering af grouped app_v2 i samme koordinatkontekst som legacy-listen.
                      </p>
                    </div>
                    <div className="text-xs text-gray-400">
                      {hasReviewMismatches ? 'Mismatch kræver review' : 'Ingen membership-mismatch i top 10'}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-sm text-gray-300 md:grid-cols-3">
                    <div className="rounded-lg bg-[#1f1f1f] p-3">
                      <div className="mb-1 font-medium text-white">1. Membership</div>
                      <div>
                        Shared {appV2ShadowComparison.comparison.sharedAddressCount}/10,
                        legacy-only {appV2ShadowComparison.comparison.legacyOnlyAddressCount},
                        app_v2-only {appV2ShadowComparison.comparison.appV2OnlyAddressCount}.
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#1f1f1f] p-3">
                      <div className="mb-1 font-medium text-white">2. Ranking</div>
                      <div>
                        Max rank-delta {appV2ShadowComparison.comparison.rankOverlap.maxAbsRankDelta};
                        exact rank {appV2ShadowComparison.comparison.rankOverlap.exactRankMatches}.
                      </div>
                    </div>
                    <div className="rounded-lg bg-[#1f1f1f] p-3">
                      <div className="mb-1 font-medium text-white">3. Semantik</div>
                      <div>
                        {isStrictSourceBackedReview
                          ? 'Strict source-backed eligibility er aktiv. Fokuser på edge cases, ikke capacity-only støj.'
                          : 'Denne fallback-mode er diagnostisk. Brug strict source-backed til primær trial-vurdering.'}
                      </div>
                    </div>
                  </div>
                </div>

                {hasReviewMismatches && (
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-yellow-100">Edge-case review</h3>
                      <p className="text-sm text-yellow-100/80">
                        {likelyAddressNormalizationEdge
                          ? 'Legacy-only og app_v2-only har samme antal i strict mode. Det kan være address-normalization eller city/postal formatting, men skal vurderes konkret.'
                          : 'Der er membership-forskelle i top 10. Vurder om de ligner coverage, grouping, ranking eller eligibility-semantik.'}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-lg bg-[#1f1f1f] p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-yellow-200">Legacy-only keys</div>
                        {legacyOnlyResults.length === 0 ? (
                          <p className="text-sm text-gray-400">Ingen.</p>
                        ) : (
                          <ul className="space-y-2 text-sm text-gray-200">
                            {legacyOnlyResults.map((result) => (
                              <li key={`${result.rank}-${result.addressKey}`} className="border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
                                <span className="font-medium">#{result.rank}</span> {result.addressKey}
                                {likelyAddressNormalizationEdge && (
                                  <span className="mt-1 block text-xs text-yellow-100/70">
                                    Sammenlign med app_v2-only key. Ligner ofte city/address-normalisering, hvis adresse og postnummer matcher.
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="rounded-lg bg-[#1f1f1f] p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-yellow-200">app_v2-only keys</div>
                        {appV2OnlyResults.length === 0 ? (
                          <p className="text-sm text-gray-400">Ingen.</p>
                        ) : (
                          <ul className="space-y-2 text-sm text-gray-200">
                            {appV2OnlyResults.map((result) => (
                              <li key={`${result.rank}-${result.addressKey}`} className="border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
                                <span className="font-medium">#{result.rank}</span> {result.addressKey}
                                {likelyAddressNormalizationEdge && (
                                  <span className="mt-1 block text-xs text-yellow-100/70">
                                    Hvis denne kun adskiller sig ved bydel/ekstra bynavn, bør casen vurderes som normalization før data-gap.
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {!hasReviewMismatches && isStrictSourceBackedReview && (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-100">
                    Strict source-backed app_v2 matcher legacy top-10 membership for denne koordinat. Brug stadig rank-delta og grouped capacity til at vurdere kvaliteten.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <div className="rounded-lg bg-[#252525] p-3">
                    <h3 className="mb-2 text-sm font-semibold text-white">Kun legacy</h3>
                    <div className="space-y-2">
                      {legacyOnlyResults.length === 0 ? (
                        <p className="text-sm text-gray-400">Ingen legacy-only resultater.</p>
                      ) : (
                        legacyOnlyResults.map((result) => (
                          <div key={`${result.rank}-${result.addressKey}`} className="border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
                            <div className="text-sm font-medium text-white">
                              {result.rank}. {result.address ?? result.addressKey}
                            </div>
                            <div className="text-xs text-gray-400">
                              {formatShadowDistance(result.distanceMeters)} · {result.totalCapacity ?? 'ukendt'} pers. · anvendelse {result.anvendelse ?? 'ukendt'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#252525] p-3">
                    <h3 className="mb-2 text-sm font-semibold text-white">Kun app_v2</h3>
                    <div className="space-y-2">
                      {appV2OnlyResults.length === 0 ? (
                        <p className="text-sm text-gray-400">Ingen app_v2-only resultater.</p>
                      ) : (
                        appV2OnlyResults.map((result) => (
                          <div key={`${result.rank}-${result.addressKey}`} className="border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
                            <div className="text-sm font-medium text-white">
                              {result.rank}. {result.address.line1}
                            </div>
                            <div className="text-xs text-gray-400">
                              {formatShadowDistance(result.distanceMeters)} · {result.totalCapacity} pers. · {result.shelterCount} gruppe-rækker
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg bg-[#252525] p-3">
                    <h3 className="mb-2 text-sm font-semibold text-white">Delte resultater med rank-delta</h3>
                    <div className="space-y-2">
                      {sharedRankDifferences.slice(0, 6).map((entry) => (
                        <div key={entry.key} className="border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
                          <div className="text-sm font-medium text-white">{entry.key}</div>
                          <div className="text-xs text-gray-400">
                            legacy #{entry.legacyRank} · app_v2 #{entry.appV2Rank} · {formatRankDelta(entry.delta)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-[#252525] p-3">
                  <h3 className="mb-2 text-sm font-semibold text-white">Grouped app_v2 top 5</h3>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {appV2ShadowComparison.appV2Results.slice(0, 5).map((result) => (
                      <div key={`${result.rank}-${result.addressKey}`} className="rounded-lg border border-white/5 bg-[#1f1f1f] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-white">
                              {result.rank}. {result.address.line1}
                            </div>
                            <div className="text-xs text-gray-400">
                              {result.address.postalCode} {result.address.city} · {result.municipality.name}
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-300">
                            <div>{formatShadowDistance(result.distanceMeters)}</div>
                            <div>{result.totalCapacity} pers.</div>
                            <div>{result.shelterCount} gruppe-rækker</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg bg-orange-500/10 p-3 text-sm text-orange-100">
                  Kortet viser stadig legacy-markører. Strict source-backed mode modellerer legacy
                  <span className="font-mono"> skal_med</span> via source application codes, men fuld legacy anvendelse/typevisning
                  er stadig ikke en del af app_v2-outputtet. Resterende forskelle bør især vurderes som address-normalization,
                  coverage, grouping eller ranking.
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
                  <div className="rounded-lg bg-[#252525] p-3 text-sm text-gray-300">
                    <h3 className="mb-2 text-sm font-semibold text-white">Reviewer checklist</h3>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>Normal liste og kort er stadig legacy og skal bruges som reference.</li>
                      <li>Strict source-backed er den primære app_v2 trial-variant; capacity-only er kun fallback-diagnostik.</li>
                      <li>Undersøg altid legacy-only og app_v2-only cases før en koordinat vurderes god nok.</li>
                      <li>Små rank-deltas er acceptable i intern trial, men systematiske membership-forskelle skal klassificeres.</li>
                      <li>Gentag samme koordinat med fallback-mode, hvis en forskel skal isoleres til source-code eligibility.</li>
                    </ul>
                  </div>
                  <div className="rounded-lg bg-[#252525] p-3 text-sm text-gray-300">
                    <h3 className="mb-2 text-sm font-semibold text-white">Mere kontekst</h3>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href="/om-data"
                        className="rounded-lg border border-white/10 bg-[#1f1f1f] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-orange-400/60 hover:text-white"
                      >
                        Om data
                      </Link>
                      <Link
                        href="/kommune"
                        className="rounded-lg border border-white/10 bg-[#1f1f1f] px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-orange-400/60 hover:text-white"
                      >
                        Kommuner
                      </Link>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-gray-400">
                      Brug de offentlige app_v2-sider til datakontekst. Nearby-trialen er stadig intern og ændrer ikke normal søgning.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-[#252525] p-3 text-sm text-gray-300">
                Indlæser app_v2 preview...
              </div>
            )}
          </section>
        )}

        {/* Back to top button */}
        <button
          onClick={handleBackToTop}
          className="fixed bottom-6 right-6 z-50 p-3 bg-orange-500/90 hover:bg-orange-500 text-white rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-orange-500/50 md:hidden"
          aria-label="Tilbage til toppen"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="order-2 lg:order-1 space-y-4">
            {isLoading ? (
              <div className="bg-[#2a2a2a] rounded-lg p-4">
                <p className="text-gray-300">Indlæser beskyttelsesrum...</p>
              </div>
            ) : shelters.length === 0 ? (
              <div className="bg-[#2a2a2a] rounded-lg p-4">
                <p className="text-gray-300">
                  Ingen beskyttelsesrum fundet inden for 5 km af den valgte position.
                </p>
              </div>
            ) : (
              shelters.map((shelter) => (
                <div
                  key={shelter.id}
                  ref={el => { shelterRefs.current[shelter.id] = el }}
                  className={`group bg-[#1f1f1f] rounded-lg p-4 sm:p-5 transition-all duration-300 hover:bg-[#252525] ${
                    selectedShelter === shelter.id ? 'ring-1 ring-orange-500/50 bg-[#252525]' : ''
                  } ${hoveredShelter === shelter.id ? 'ring-1 ring-orange-400/30' : ''}`}
                  onMouseEnter={() => setHoveredShelter(shelter.id)}
                  onMouseLeave={() => setHoveredShelter(null)}
                  onClick={() => {
                    setSelectedShelter(shelter.id)
                    if (shelter.location && mapRef.current) {
                      mapRef.current.setView([shelter.location.coordinates[1], shelter.location.coordinates[0]], 16)
                    }
                  }}
                >
                  <div className="flex justify-between items-start mb-4 sm:mb-5">
                    <div>
                      <h2 className="text-lg sm:text-xl font-semibold text-white group-hover:text-orange-400/90 transition-colors">
                        {shelter.vejnavn} {shelter.husnummer}
                        <span className="block sm:inline mt-1 sm:mt-0 sm:ml-2 text-sm bg-orange-500/20 text-orange-400/90 px-2 py-0.5 rounded">
                          {shelter.shelter_count} beskyttelsesrum
                        </span>
                      </h2>
                      <p className="text-sm text-gray-400 mt-1">
                        {shelter.postnummer} {getKommunenavn(shelter.kommunekode, kommunekoder)}
                      </p>
                      <div className="flex items-center mt-2">
                        <span className="inline-flex items-center bg-[#2a2a2a] text-orange-400/90 px-2 py-0.5 rounded-md text-sm font-medium border border-orange-500/10">
                          {shelter.distance.toFixed(1)} km
                        </span>
                      </div>
                    </div>
                    {shelter.location && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                          const lat = shelter.location!.coordinates[1];
                          const lng = shelter.location!.coordinates[0];

                          if (isMobile) {
                            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                            const isAndroid = /Android/i.test(navigator.userAgent);

                            if (isIOS) {
                              window.open(`maps://maps.apple.com/?q=${lat},${lng}`, '_blank');
                            } else if (isAndroid) {
                              window.open(`geo:${lat},${lng}?q=${lat},${lng}`, '_blank');
                            }
                          } else {
                            window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=15`, '_blank');
                          }
                        }}
                        className="bg-orange-500/10 hover:bg-orange-500/20 text-orange-400/90 p-2 sm:p-3 rounded-lg transition-colors border border-orange-500/20"
                        title="Åbn i kort"
                      >
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-5">
                    <div className="bg-[#252525] p-3 sm:p-3.5 rounded-lg group-hover:bg-[#2a2a2a] transition-colors border border-white/5">
                      <div className="text-sm text-gray-400 mb-1">Total kapacitet</div>
                      <div className="text-white font-medium text-base sm:text-lg">{shelter.total_capacity} personer</div>
                    </div>
                    {shelter.anvendelse && (
                      <div className="bg-[#252525] p-3 sm:p-3.5 rounded-lg group-hover:bg-[#2a2a2a] transition-colors border border-white/5">
                        <div className="text-sm text-gray-400 mb-1">Type</div>
                        <div className="text-white font-medium text-sm line-clamp-2">{getAnvendelseskodeBeskrivelse(shelter.anvendelse, anvendelseskoder)}</div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/5 pt-4 sm:pt-5">
                    <div className="text-sm text-gray-400 mb-2 sm:mb-3">Anslået rejsetid</div>
                    <div className="grid grid-cols-3 gap-2 sm:gap-4">
                      <div className="bg-[#252525] p-2.5 sm:p-3.5 rounded-lg group-hover:bg-[#2a2a2a] transition-colors border border-white/5">
                        <div className="text-gray-400 text-sm mb-0.5 sm:mb-1">Bil</div>
                        <div className="text-white font-medium text-base sm:text-lg">{Math.ceil(shelter.distance * 3)} min</div>
                      </div>
                      <div className="bg-[#252525] p-2.5 sm:p-3.5 rounded-lg group-hover:bg-[#2a2a2a] transition-colors border border-white/5">
                        <div className="text-gray-400 text-sm mb-0.5 sm:mb-1">Cykel</div>
                        <div className="text-white font-medium text-base sm:text-lg">{Math.ceil(shelter.distance * 5)} min</div>
                      </div>
                      <div className="bg-[#252525] p-2.5 sm:p-3.5 rounded-lg group-hover:bg-[#2a2a2a] transition-colors border border-white/5">
                        <div className="text-gray-400 text-sm mb-0.5 sm:mb-1">Gående</div>
                        <div className="text-white font-medium text-base sm:text-lg">{Math.ceil(shelter.distance * 20)} min</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Baseret på gennemsnitlige hastigheder i byområder. Rejsetiden kan variere afhængigt af trafik og forhold.
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="order-1 lg:order-2 h-[400px] lg:h-[600px] relative lg:sticky lg:top-4">
            <div className="absolute inset-0 rounded-lg overflow-hidden">
              {isClient && (
                <MapContainer
                  center={[lat, lng]}
                  zoom={13}
                  style={{ width: '100%', height: '100%' }}
                  ref={mapRef}
                  zoomControl={true}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />

                  {/* User location marker */}
                  <Marker
                    position={[lat, lng]}
                    icon={userLocationIcon}
                  />

                  {/* Shelter markers */}
                  {shelters.map((shelter) => (
                    shelter.location && (
                      <Marker
                        key={shelter.id}
                        position={[shelter.location.coordinates[1], shelter.location.coordinates[0]]}
                        icon={hoveredShelter === shelter.id || selectedShelter === shelter.id ? hoveredShelterIcon : shelterIcon}
                        eventHandlers={{
                          click: () => {
                            setSelectedShelter(shelter.id)
                            if (shelterRefs.current[shelter.id]) {
                              shelterRefs.current[shelter.id]?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'center'
                              })
                            }
                          }
                        }}
                      />
                    )
                  ))}

                  {/* Auto-fit bounds to all markers */}
                  <FitBounds userLocation={[lat, lng]} shelters={shelters} />
                </MapContainer>
              )}
            </div>
          </div>
        </div>
      </div>
      <GlobalFooter />
    </main>
  )
}
