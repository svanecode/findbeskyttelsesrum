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
  '<div style="width: 16px; height: 16px; background: #3B82F6; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.5);"></div>',
  22
)

const shelterIcon = createDivIcon(
  'shelter-marker',
  '<div style="width: 16px; height: 16px; background: #EF4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.5);"></div>',
  22
)

const hoveredShelterIcon = createDivIcon(
  'shelter-marker-hovered',
  '<div style="width: 20px; height: 20px; background: #FB923C; border: 3px solid white; border-radius: 50%; box-shadow: 0 3px 10px rgba(0,0,0,0.6);"></div>',
  26
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

interface ShelterWithDistance extends Shelter {
  distance: number
}


async function getNearbyShelters(lat: number, lng: number) {
  if (process.env.NODE_ENV === 'development') {
    console.log('Calling get_nearby_shelters_v2 with:', { p_lat: lat, p_lng: lng })
  }

  try {
    const response = await retryRPC<ShelterWithDistance[]>(async () => {
      const result = await supabase.rpc('get_nearby_shelters_v2', {
        p_lat: lat,
        p_lng: lng
      })
      return result
    })

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
        console.log('No data returned from get_nearby_shelters_v2')
      }
      return []
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('Successfully fetched shelters:', response.data.length)
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

interface Props {
  lat: string
  lng: string
}

export default function ShelterMapClient({ lat: latString, lng: lngString }: Props) {
  const [shelters, setShelters] = useState<(Shelter & { distance: number })[]>([])
  const [anvendelseskoder, setAnvendelseskoder] = useState<Anvendelseskode[]>([])
  const [kommunekoder, setKommunekoder] = useState<Kommunekode[]>([])
  const [selectedShelter, setSelectedShelter] = useState<string | null>(null)
  const [hoveredShelter, setHoveredShelter] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const shelterRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const mapRef = useRef<any>(null)
  const lat = parseFloat(latString)
  const lng = parseFloat(lngString)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Function to fit bounds to all markers
  const fitMapBounds = useCallback(() => {
    if (!mapRef.current || shelters.length === 0) return

    const map = mapRef.current
    const bounds = L.latLngBounds([])

    // Add user location
    bounds.extend([lat, lng])

    // Add all shelter locations
    shelters.forEach(shelter => {
      if (shelter.location) {
        bounds.extend([shelter.location.coordinates[1], shelter.location.coordinates[0]])
      }
    })

    if (bounds.isValid()) {
      // Calculate padding based on screen size
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
      const padding = isMobile ? [30, 30] : [60, 60]

      // Invalidate size to handle any layout changes
      map.invalidateSize()

      // Fit bounds with appropriate padding
      map.fitBounds(bounds, {
        padding: padding,
        animate: true,
        duration: 0.5
      })
    }
  }, [shelters, lat, lng])

  // Fit bounds when map is ready and shelters are loaded
  useEffect(() => {
    if (!isClient || !mapRef.current || shelters.length === 0) return

    const map = mapRef.current
    let timeoutId: NodeJS.Timeout

    // Wait for map to be fully ready and tiles to load
    const performFit = () => {
      // Clear any pending timeouts
      if (timeoutId) clearTimeout(timeoutId)

      // Wait a bit longer to ensure tiles are loaded
      timeoutId = setTimeout(() => {
        fitMapBounds()
      }, 300)
    }

    // Listen for when map is ready
    map.whenReady(performFit)

    // Also trigger on tile load events
    map.on('load', performFit)

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      map.off('load', performFit)
    }
  }, [shelters, isClient, fitMapBounds])

  // Function to handle back to top
  const handleBackToTop = () => {
    fitMapBounds()
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

        if (process.env.NODE_ENV === 'development') {
          console.log('Data loaded:', {
            sheltersCount: sheltersData.length,
            anvendelseskoderCount: anvendelseskoderData.length,
            kommunekoderCount: kommunekoderData.length
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
  }, [lat, lng])

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