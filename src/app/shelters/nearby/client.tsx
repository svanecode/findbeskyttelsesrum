'use client'

import { useEffect, useState } from 'react'
import type { Map as LeafletMap, LatLngExpression, Icon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '@/lib/supabase'
import { Shelter } from '@/types/shelter'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import GlobalFooter from '@/components/GlobalFooter'
import { Kommunekode } from '@/types/kommunekode'
import { Anvendelseskode } from '@/types/anvendelseskode'

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
)
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
)
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
)

interface ShelterWithDistance extends Shelter {
  distance: number
}

async function getNearbyShelters(lat: number, lng: number) {
  const { data, error } = await supabase
    .rpc('get_nearby_shelters', {
      lat,
      lng
    })

  if (error) {
    console.error('Error fetching shelters:', error)
    return []
  }

  if (!data) {
    return []
  }

  // The PostGIS function returns shelters with distance in meters
  const nearbyShelters = data
    .map((shelter: ShelterWithDistance) => ({
      ...shelter,
      distance: (shelter.distance || 0) / 1000 // Convert to kilometers, default to 0 if undefined
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
  const [youAreHereIcon, setYouAreHereIcon] = useState<Icon | null>(null)
  const [shelterIcon, setShelterIcon] = useState<Icon | null>(null)
  const lat = parseFloat(latString)
  const lng = parseFloat(lngString)

  // Fix for Leaflet marker icons in Next.js
  useEffect(() => {
    // Using dynamic import instead of require
    import('leaflet').then((L) => {
      // Create custom "You are here" icon (blue)
      setYouAreHereIcon(new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      }))

      // Create shelter icon (red)
      setShelterIcon(new L.Icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      }))
    })
  }, [])

  // Update map bounds when shelters change
  useEffect(() => {
    if (map && shelters.length > 0) {
      const bounds = shelters
        .filter(shelter => shelter.location)
        .map(shelter => [
          shelter.location!.coordinates[1],
          shelter.location!.coordinates[0]
        ] as [number, number])
      
      // Add current location to bounds
      bounds.push([lat, lng] as [number, number])
      
      map.fitBounds(bounds, {
        padding: [50, 50], // Add some padding around the bounds
        maxZoom: 15 // Don't zoom in too close
      })
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
          <h1 className="text-2xl font-bold">Nærmeste beskyttelsesrum</h1>
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
                  className={`group bg-[#1f1f1f] rounded-lg p-5 transition-all duration-300 hover:bg-[#252525] ${
                    selectedShelter === shelter.id ? 'ring-1 ring-orange-500/50 bg-[#252525]' : ''
                  } ${hoveredShelter === shelter.id ? 'ring-1 ring-orange-400/30' : ''}`}
                  onMouseEnter={() => setHoveredShelter(shelter.id)}
                  onMouseLeave={() => setHoveredShelter(null)}
                  onClick={() => setSelectedShelter(shelter.id)}
                >
                  <div className="flex justify-between items-start mb-5">
                    <div>
                      <h2 className="text-xl font-semibold text-white group-hover:text-orange-400/90 transition-colors">
                        {shelter.vejnavn} {shelter.husnummer}
                      </h2>
                      <p className="text-sm text-gray-400 mt-1.5">
                        {shelter.postnummer} {getKommunenavn(shelter.kommunekode, kommunekoder)}
                      </p>
                      <div className="flex items-center mt-3">
                        <span className="inline-flex items-center bg-[#2a2a2a] text-orange-400/90 px-3 py-1 rounded-md text-sm font-medium border border-orange-500/10">
                          {shelter.distance.toFixed(1)} km
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div className="bg-[#252525] p-3.5 rounded-lg group-hover:bg-[#2a2a2a] transition-colors border border-white/5">
                      <div className="text-sm text-gray-400 mb-1.5">Kapacitet</div>
                      <div className="text-white font-medium text-lg">{shelter.shelter_capacity} personer</div>
                    </div>
                    {shelter.anvendelse && (
                      <div className="bg-[#252525] p-3.5 rounded-lg group-hover:bg-[#2a2a2a] transition-colors border border-white/5">
                        <div className="text-sm text-gray-400 mb-1.5">Type</div>
                        <div className="text-white font-medium text-sm line-clamp-2">{getAnvendelseskodeBeskrivelse(shelter.anvendelse, anvendelseskoder)}</div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/5 pt-5">
                    <div className="text-sm text-gray-400 mb-3">Anslået rejsetid</div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-[#252525] p-3.5 rounded-lg group-hover:bg-[#2a2a2a] transition-colors border border-white/5">
                        <div className="text-gray-400 text-sm mb-1">Bil</div>
                        <div className="text-white font-medium text-lg">{Math.ceil(shelter.distance * 2)} min</div>
                      </div>
                      <div className="bg-[#252525] p-3.5 rounded-lg group-hover:bg-[#2a2a2a] transition-colors border border-white/5">
                        <div className="text-gray-400 text-sm mb-1">Cykel</div>
                        <div className="text-white font-medium text-lg">{Math.ceil(shelter.distance * 4)} min</div>
                      </div>
                      <div className="bg-[#252525] p-3.5 rounded-lg group-hover:bg-[#2a2a2a] transition-colors border border-white/5">
                        <div className="text-gray-400 text-sm mb-1">Gående</div>
                        <div className="text-white font-medium text-lg">{Math.ceil(shelter.distance * 12)} min</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="order-1 lg:order-2 lg:sticky lg:top-4 h-[300px] lg:h-[calc(100vh-8rem)] bg-[#2a2a2a] rounded-lg overflow-hidden">
            <MapContainer
              center={position}
              zoom={14}
              scrollWheelZoom={false}
              style={{ height: '100%', width: '100%' }}
              ref={setMap}
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
              {shelterIcon && shelters.map((shelter) => (
                shelter.location && (
                  <Marker
                    key={shelter.id}
                    position={[shelter.location.coordinates[1], shelter.location.coordinates[0]] as LatLngExpression}
                    icon={shelterIcon}
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
                            <div className="text-sm font-medium">Kapacitet</div>
                            <div>{shelter.shelter_capacity} personer</div>
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
                              <div>{Math.ceil(shelter.distance * 2)} min</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Cykel</div>
                              <div>{Math.ceil(shelter.distance * 4)} min</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Gående</div>
                              <div>{Math.ceil(shelter.distance * 12)} min</div>
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