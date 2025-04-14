'use client'

import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import type { Map as LeafletMap, LatLngExpression, Icon } from 'leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '@/lib/supabase'
import { Shelter } from '@/types/shelter'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'
import Link from 'next/link'
import GlobalFooter from '@/components/GlobalFooter'
import { Kommunekode } from '@/types/kommunekode'
import { Anvendelseskode } from '@/types/anvendelseskode'
import { initializeLeaflet, createCustomIcon } from '@/lib/leaflet-setup'

interface ShelterWithDistance extends Shelter {
  distance: number
}

async function getNearbyShelters(lat: number, lng: number) {
  console.log('Calling get_nearby_shelters_v2 with:', { p_lat: lat, p_lng: lng })
  
  const { data, error } = await supabase
    .rpc('get_nearby_shelters_v2', {
      p_lat: lat,
      p_lng: lng
    })

  if (error) {
    console.error('Error details:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    })
    return []
  }

  if (!data) {
    console.log('No data returned from get_nearby_shelters_v2')
    return []
  }

  console.log('Successfully fetched shelters:', data.length)
  
  const nearbyShelters = data
    .map((shelter: ShelterWithDistance) => ({
      ...shelter,
      distance: (shelter.distance || 0) / 1000
    }))
    
  return nearbyShelters
}

interface Props {
  lat: string
  lng: string
}

export default function ShelterMapClient({ lat: latString, lng: lngString }: Props) {
  const [shelters, setShelters] = useState<(Shelter & { distance: number })[]>([])
  const [anvendelseskoder, setAnvendelseskoder] = useState<Anvendelseskode[]>([])
  const [kommunekoder, setKommunekoder] = useState<Kommunekode[]>([])
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [selectedShelter, setSelectedShelter] = useState<string | null>(null)
  const [hoveredShelter, setHoveredShelter] = useState<string | null>(null)
  const shelterRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const [youAreHereIcon, setYouAreHereIcon] = useState<Icon | null>(null)
  const [shelterIcon, setShelterIcon] = useState<Icon | null>(null)
  const [hoveredShelterIcon, setHoveredShelterIcon] = useState<Icon | null>(null)
  const lat = parseFloat(latString)
  const lng = parseFloat(lngString)

  // Initialize Leaflet
  useEffect(() => {
    initializeLeaflet();
    setYouAreHereIcon(createCustomIcon('blue'));
    setShelterIcon(createCustomIcon('red'));
    setHoveredShelterIcon(createCustomIcon('orange'));
  }, []);

  // Update map bounds when shelters change
  useEffect(() => {
    if (map && shelters.length > 0) {
      const bounds = shelters
        .filter(shelter => shelter.location)
        .map(shelter => [
          shelter.location!.coordinates[1],
          shelter.location!.coordinates[0]
        ] as [number, number])
      
      bounds.push([lat, lng] as [number, number])
      
      const boundsOptions = {
        padding: [50, 50] as [number, number],
        maxZoom: 15,
        animate: true
      }
      
      map.fitBounds(bounds, boundsOptions)
    }
  }, [map, shelters, lat, lng])

  // Center map on selected shelter
  useEffect(() => {
    if (map && selectedShelter) {
      const shelter = shelters.find(s => s.id === selectedShelter)
      if (shelter?.location) {
        map.setView([shelter.location.coordinates[1], shelter.location.coordinates[0]], 16)
      }
    }
  }, [map, selectedShelter, shelters])

  // Scroll to shelter card when selected
  useEffect(() => {
    if (selectedShelter && shelterRefs.current[selectedShelter]) {
      shelterRefs.current[selectedShelter]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
  }, [selectedShelter])

  useEffect(() => {
    async function loadData() {
      const [sheltersData, anvendelseskoderData, kommunekoderData] = await Promise.all([
        getNearbyShelters(lat, lng),
        getAnvendelseskoder(),
        getKommunekoder()
      ])
      setShelters(sheltersData)
      setAnvendelseskoder(anvendelseskoderData)
      setKommunekoder(kommunekoderData)
    }
    loadData()
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

  const position: LatLngExpression = [lat, lng]

  return (
    <main className="min-h-screen bg-[#1a1a1a] text-white">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex items-center mb-6">
          <Link
            href="/"
            className="text-gray-400 hover:text-white transition-colors mr-4"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold">Dine 10 nærmeste beskyttelsesrum</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="order-2 lg:order-1 space-y-4">
            {shelters.length === 0 ? (
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
                  onClick={() => setSelectedShelter(shelter.id)}
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
                              // For iOS, show options for Apple Maps and Google Maps
                              if (window.confirm('Vil du åbne i Apple Maps eller Google Maps?')) {
                                window.open(`maps://maps.apple.com/?q=${lat},${lng}`, '_blank');
                              } else {
                                window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
                              }
                            } else if (isAndroid) {
                              // For Android, show options for Google Maps and other map apps
                              if (window.confirm('Vil du åbne i Google Maps eller en anden kortapp?')) {
                                window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
                              } else {
                                window.open(`geo:${lat},${lng}?q=${lat},${lng}`, '_blank');
                              }
                            }
                          } else {
                            // For desktop, just use Google Maps
                            window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
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

          <div className="order-1 lg:order-2 lg:sticky lg:top-4 h-[300px] lg:h-[calc(100vh-8rem)] rounded-lg overflow-hidden">
            <MapContainer
              key={`${lat}-${lng}`}
              center={position}
              zoom={14}
              scrollWheelZoom={false}
              style={{ height: '100%', width: '100%', background: '#1a1a1a' }}
              ref={setMap}
              className="rounded-lg"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {youAreHereIcon && (
                <Marker position={position} icon={youAreHereIcon}>
                  <Popup>
                    <div className="font-semibold">Din position</div>
                  </Popup>
                </Marker>
              )}
              {shelterIcon && hoveredShelterIcon && shelters.map((shelter) => (
                shelter.location && (
                  <Marker
                    key={shelter.id}
                    position={[shelter.location.coordinates[1], shelter.location.coordinates[0]] as LatLngExpression}
                    icon={hoveredShelter === shelter.id ? hoveredShelterIcon : shelterIcon}
                    eventHandlers={{
                      click: () => setSelectedShelter(shelter.id),
                      mouseover: () => setHoveredShelter(shelter.id),
                      mouseout: () => setHoveredShelter(null)
                    }}
                  >
                    <Popup>
                      <div className="min-w-[200px]">
                        <div className="font-semibold text-lg mb-2">{shelter.vejnavn} {shelter.husnummer}</div>
                        <div className="text-sm text-gray-600 mb-3">
                          {shelter.postnummer} {getKommunenavn(shelter.kommunekode, kommunekoder)}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <div className="text-sm font-medium">Total kapacitet</div>
                            <div>{shelter.total_capacity} personer</div>
                          </div>
                          {shelter.anvendelse && (
                            <div>
                              <div className="text-sm font-medium">Type</div>
                              <div>{getAnvendelseskodeBeskrivelse(shelter.anvendelse, anvendelseskoder)}</div>
                            </div>
                          )}
                        </div>

                        <div className="border-t border-gray-200 pt-2">
                          <div className="text-sm font-medium mb-1">Anslået rejsetid</div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <div className="text-gray-600">Bil</div>
                              <div>{Math.ceil(shelter.distance * 3)} min</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Cykel</div>
                              <div>{Math.ceil(shelter.distance * 5)} min</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Gående</div>
                              <div>{Math.ceil(shelter.distance * 20)} min</div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 text-sm text-orange-600 font-medium">
                          {shelter.distance.toFixed(1)} km væk
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )
              ))}
            </MapContainer>
          </div>
        </div>
      </div>
      <GlobalFooter />
    </main>
  )
} 