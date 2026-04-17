'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import { supabase } from '@/lib/supabase'
import { Shelter } from '@/types/shelter'
import { Anvendelseskode } from '@/types/anvendelseskode'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'
import { Kommunekode } from '@/types/kommunekode'

// Dynamic import to avoid SSR issues with Leaflet
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false })
const MarkerClusterGroup = dynamic(() => import('@/components/MarkerClusterGroup').then(mod => mod.default), { ssr: false })

interface Props {
  kommunekode: string
}

interface GroupedShelter extends Shelter {
  total_capacity: number
  shelter_count: number
  anvendelseskoder?: Anvendelseskode
}

export default function KommuneMap({ kommunekode }: Props) {
  const [shelters, setShelters] = useState<GroupedShelter[]>([])
  const [anvendelseskoder, setAnvendelseskoder] = useState<Anvendelseskode[]>([])
  const [kommunekoder, setKommunekoder] = useState<Kommunekode[]>([])
  const [isLoadingShelters, setIsLoadingShelters] = useState(true)
  const [shelterError, setShelterError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [L, setL] = useState<any>(null)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    setIsClient(true)
    // Import Leaflet only on client side
    import('leaflet').then((leaflet) => {
      const L = leaflet.default
      // Fix Leaflet default markers
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl: '/leaflet/marker-icon.png',
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        shadowUrl: '/leaflet/marker-shadow.png',
      })
      setL(L)
    })
  }, [])

  // Create custom div icon for shelters
  const createShelterIcon = useCallback(() => {
    if (!L) return null
    return L.divIcon({
      className: 'shelter-marker',
      html: '<div style="width: 28px; height: 28px; background: #EF4444; border: 4px solid white; border-radius: 50%; box-shadow: 0 3px 8px rgba(0,0,0,0.4);"></div>',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20]
    })
  }, [L])

  // Function to fit all markers in view
  const fitAllMarkers = useCallback(() => {
    if (!mapRef.current || shelters.length === 0 || !L) return

    const bounds = L.latLngBounds([])

    // Add all shelter locations
    shelters.forEach(shelter => {
      if (shelter.location) {
        bounds.extend([shelter.location.coordinates[1], shelter.location.coordinates[0]])
      }
    })

    // Fit map to bounds with padding
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, {
        padding: [30, 30],
        maxZoom: 15
      })
    }
  }, [shelters, L])

  // Fit bounds when shelters are loaded
  useEffect(() => {
    if (!isClient || !mapRef.current || shelters.length === 0) return

    const map = mapRef.current
    let timeoutId: NodeJS.Timeout

    const performFit = () => {
      if (timeoutId) clearTimeout(timeoutId)

      // Wait for map to be fully rendered and tiles loaded
      timeoutId = setTimeout(() => {
        map.invalidateSize()
        fitAllMarkers()
      }, 500)
    }

    // Trigger on map ready
    map.whenReady(performFit)

    // Also trigger on tile load
    map.on('load', performFit)

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      map.off('load', performFit)
    }
  }, [shelters, isClient, fitAllMarkers])

  // Get map center from shelters
  const mapCenter = useMemo(() => {
    if (shelters.length === 0) return [56.2639, 9.5018] as [number, number]

    const latSum = shelters.reduce((sum, shelter) => {
      return sum + (shelter.location?.coordinates[1] || 0)
    }, 0)
    const lngSum = shelters.reduce((sum, shelter) => {
      return sum + (shelter.location?.coordinates[0] || 0)
    }, 0)

    return [latSum / shelters.length, lngSum / shelters.length] as [number, number]
  }, [shelters])

  // Fetch kommunekoder
  useEffect(() => {
    async function fetchKommunekoder() {
      const { data, error } = await supabase
        .from('kommunekoder')
        .select('*')
        .order('navn')

      if (error) {
        console.error('Error fetching kommunekoder:', error)
        return
      }

      setKommunekoder(data || [])
    }

    fetchKommunekoder()
  }, [])

  // Fetch anvendelseskoder
  useEffect(() => {
    async function fetchAnvendelseskoder() {
      const { data, error } = await supabase
        .from('anvendelseskoder')
        .select('*')

      if (error) {
        console.error('Error fetching anvendelseskoder:', error)
        return
      }

      setAnvendelseskoder(data || [])
    }

    fetchAnvendelseskoder()
  }, [])

  // Fetch shelters for the kommune
  useEffect(() => {
    async function fetchShelters() {
      setIsLoadingShelters(true)
      setShelterError(null)

      // First get all anvendelseskoder that should be included
      const { data: anvendelseskoderData, error: anvendelseskoderError } = await supabase
        .from('anvendelseskoder')
        .select('kode')
        .eq('skal_med', true)

      if (anvendelseskoderError) {
        console.error('Error fetching anvendelseskoder:', anvendelseskoderError)
        setShelterError('Kortets registreringer kunne ikke hentes lige nu.')
        setShelters([])
        setIsLoadingShelters(false)
        return
      }

      const validAnvendelseskoder = anvendelseskoderData?.map(ak => ak.kode) || []

      // Then fetch shelters with those anvendelseskoder
      const { data, error } = await supabase
        .from('sheltersv2')
        .select(`
          id,
          created_at,
          bygning_id,
          kommunekode,
          shelter_capacity,
          address,
          postnummer,
          vejnavn,
          husnummer,
          location,
          anvendelse,
          deleted,
          last_checked,
          anvendelseskoder (
            kode,
            beskrivelse,
            skal_med,
            kategori,
            created_at,
            updated_at
          )
        `)
        .eq('kommunekode', kommunekode)
        .gte('shelter_capacity', 40)
        .not('location', 'is', null)
        .in('anvendelse', validAnvendelseskoder)

      if (error) {
        console.error('Error fetching shelters:', error)
        setShelterError('Kortets registreringer kunne ikke hentes lige nu.')
        setShelters([])
        setIsLoadingShelters(false)
        return
      }

      // Group shelters by address and calculate total capacity
      const groupedShelters = (data || []).reduce((acc: { [key: string]: GroupedShelter }, shelter) => {
        const address = shelter.address || `${shelter.vejnavn} ${shelter.husnummer}`
        if (!acc[address]) {
          acc[address] = {
            ...shelter,
            total_capacity: Number(shelter.shelter_capacity) || 0,
            shelter_count: 1,
            anvendelseskoder: shelter.anvendelseskoder?.[0]
          }
        } else {
          acc[address].total_capacity += Number(shelter.shelter_capacity) || 0
          acc[address].shelter_count += 1
        }
        return acc
      }, {})

      setShelters(Object.values(groupedShelters))
      setIsLoadingShelters(false)
    }

    fetchShelters()
  }, [kommunekode])

  if (!isClient || !L) {
    return <div className="h-screen w-full bg-gray-100 flex items-center justify-center">Indlæser kort...</div>
  }

  return (
    <div className="relative h-screen w-full">
      {(isLoadingShelters || shelterError || shelters.length === 0) && (
        <div className="absolute bottom-4 left-2 right-2 z-10 rounded-lg bg-white/95 p-3 text-sm text-gray-800 shadow-lg backdrop-blur-sm sm:left-4 sm:right-auto sm:max-w-sm sm:p-4">
          {isLoadingShelters ? (
            <p>Henter kortets registreringer...</p>
          ) : shelterError ? (
            <p>{shelterError}</p>
          ) : (
            <p>Der er ingen legacy-kortmarkører for denne kommune i det nuværende registerflow.</p>
          )}
        </div>
      )}
      <MapContainer
        center={mapCenter}
        zoom={10}
        style={{ width: '100%', height: '100%' }}
        className="leaflet-container"
        ref={mapRef}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <MarkerClusterGroup
          maxClusterRadius={60}
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          zoomToBoundsOnClick={true}
          disableClusteringAtZoom={16}
          iconCreateFunction={(cluster: any) => {
            if (!L) return null
            const count = cluster.getChildCount()
            let c = ' marker-cluster-'

            if (count < 10) {
              c += 'small'
            } else if (count < 50) {
              c += 'medium'
            } else {
              c += 'large'
            }

            return L.divIcon({
              html: `<div><span>${count}</span></div>`,
              className: 'marker-cluster' + c,
              iconSize: L.point(40, 40)
            })
          }}
        >
          {shelters.map((shelter) => {
            if (!shelter.location) return null

            return (
              <Marker
                key={shelter.id}
                position={[shelter.location.coordinates[1], shelter.location.coordinates[0]]}
                icon={createShelterIcon()}
              >
                <Popup>
                  <div className="min-w-[360px] p-4">
                    <div className="font-semibold text-lg mb-2 text-gray-900">
                      {shelter.vejnavn} {shelter.husnummer}
                      {shelter.shelter_count > 1 && (
                        <span className="inline-flex items-center ml-2 text-sm bg-orange-500/20 text-orange-600 px-2 py-0.5 rounded-md font-medium border border-orange-500/10">
                          {shelter.shelter_count} beskyttelsesrum
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mb-3">
                      {shelter.postnummer} {getKommunenavn(shelter.kommunekode, kommunekoder)}
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <div className="text-sm text-gray-600 mb-1">Total kapacitet</div>
                        <div className="text-gray-900 font-medium text-base">{shelter.total_capacity} personer</div>
                      </div>
                      {shelter.anvendelse && (
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                          <div className="text-sm text-gray-600 mb-1">Type</div>
                          <div className="text-gray-900 font-medium text-sm line-clamp-2">
                            {shelter.anvendelseskoder?.beskrivelse ||
                             getAnvendelseskodeBeskrivelse(shelter.anvendelse, anvendelseskoder)}
                          </div>
                        </div>
                      )}
                    </div>

                    {shelter.anvendelseskoder && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-sm text-gray-600 mb-1">Detaljer</div>
                        <div className="text-xs text-gray-700">
                          {shelter.anvendelseskoder.beskrivelse}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <button
                        onClick={() => {
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
                        className="w-full bg-orange-500/90 hover:bg-orange-500 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors border border-orange-500/20"
                        title="Åbn i kort"
                      >
                        <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Åbn i kort
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  )
}
