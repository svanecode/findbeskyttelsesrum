'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

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
import { adaptAppV2Grouped, type NearbyResultShelter } from '@/lib/nearby/app-v2-adapter'
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
function FitBounds({ userLocation, shelters }: { userLocation: [number, number], shelters: NearbyResultShelter[] }) {
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
  shelters: NearbyResultShelter[],
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

type AppV2NearbyEligibilityParam = 'source-application-code' | 'legacy-capacity' | 'none'

function normalizeEligibilityParam(value: string): AppV2NearbyEligibilityParam {
  if (value === 'legacy-capacity' || value === 'none' || value === 'source-application-code') {
    return value
  }

  return 'source-application-code'
}

async function fetchAppV2GroupedShelters(
  lat: number,
  lng: number,
  eligibility: AppV2NearbyEligibilityParam,
): Promise<NearbyResultShelter[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    limit: '10',
    eligibility,
  })
  const response = await fetch(`/api/app-v2/nearby/grouped?${params.toString()}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`app_v2 grouped nearby failed with status ${response.status}`)
  }

  const json = await response.json()
  return adaptAppV2Grouped(json.results ?? [])
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
  appV2NearbyEligibility = 'source-application-code',
}: Props) {
  const [shelters, setShelters] = useState<NearbyResultShelter[]>([])
  const [anvendelseskoder, setAnvendelseskoder] = useState<Anvendelseskode[]>([])
  const [kommunekoder, setKommunekoder] = useState<Kommunekode[]>([])
  const [selectedShelter, setSelectedShelter] = useState<string | null>(null)
  const [hoveredShelter, setHoveredShelter] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  const shelterRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const mapRef = useRef<any>(null)
  const lat = parseFloat(latString)
  const lng = parseFloat(lngString)
  const eligibility = normalizeEligibilityParam(appV2NearbyEligibility)

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
        setLoadError(null)
        if (process.env.NODE_ENV === 'development') {
          console.log('Starting data load with coordinates:', { lat, lng })
        }

        const [rawSheltersData, anvendelseskoderData, kommunekoderData] = await Promise.all([
          fetchAppV2GroupedShelters(lat, lng, eligibility),
          getAnvendelseskoder(),
          getKommunekoder()
        ])
        const sheltersData: NearbyResultShelter[] = rawSheltersData

        if (process.env.NODE_ENV === 'development') {
          console.log('Data loaded:', {
            sheltersCount: sheltersData.length,
            anvendelseskoderCount: anvendelseskoderData.length,
            kommunekoderCount: kommunekoderData.length,
            eligibility,
          })
        }

        if (isMounted) {
          setShelters(sheltersData)
          setAnvendelseskoder(anvendelseskoderData)
          setKommunekoder(kommunekoderData)
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error in loadData:', error)
        }
        if (isMounted) {
          setShelters([])
          setAnvendelseskoder([])
          setKommunekoder([])
          setLoadError('Kunne ikke hente nærliggende registreringer lige nu. Prøv igen om lidt.')
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
  }, [lat, lng, eligibility])

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

  // Legacy nearby compare path removed (Sprint 4d).

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
            {loadError ? (
              <div className="bg-[#2a2a2a] rounded-lg p-4" role="alert">
                <p className="text-gray-200">{loadError}</p>
                <p className="mt-2 text-sm text-gray-400">Du kan også prøve at genindlæse siden.</p>
              </div>
            ) : isLoading ? (
              <div className="bg-[#2a2a2a] rounded-lg p-4" role="status" aria-live="polite">
                <p className="text-gray-300">Indlæser nærliggende beskyttelsesrum...</p>
              </div>
            ) : shelters.length === 0 ? (
              <div className="bg-[#2a2a2a] rounded-lg p-4" role="status" aria-live="polite">
                <p className="text-gray-300">
                  Der blev ikke fundet registrerede beskyttelsesrum tæt på den valgte placering.
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
                        aria-label={`Åbn kort for ${shelter.vejnavn} ${shelter.husnummer}, ${shelter.postnummer} ${getKommunenavn(shelter.kommunekode, kommunekoder)}`}
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
                    {(shelter.typeLabel || (shelter.source === 'legacy' && shelter.anvendelse)) && (
                      <div className="bg-[#252525] p-3 sm:p-3.5 rounded-lg group-hover:bg-[#2a2a2a] transition-colors border border-white/5">
                        <div className="text-sm text-gray-400 mb-1">Type</div>
                        <div className="text-white font-medium text-sm line-clamp-2">
                          {shelter.typeLabel
                            ? shelter.typeLabel
                            : getAnvendelseskodeBeskrivelse(shelter.anvendelse!, anvendelseskoder)}
                        </div>
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

          <div className="order-1 lg:order-2 h-[400px] min-h-[400px] lg:h-[600px] lg:min-h-[600px] relative lg:sticky lg:top-4">
            <div
              className="absolute inset-0 rounded-lg overflow-hidden"
              aria-label="Kort med din placering og nærliggende beskyttelsesrum"
            >
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
