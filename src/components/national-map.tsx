'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import type { Map as LeafletMap, LatLngExpression } from 'leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Anvendelseskode } from '@/types/anvendelseskode'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'
import { initializeLeaflet, createCustomIcon } from '@/lib/leaflet-setup'
import { Kommunekode } from '@/types/kommunekode'

interface GroupedShelter {
  id: string
  kommunekode: string | null
  shelter_capacity: number | null
  address: string | null
  postnummer: string | null
  vejnavn: string | null
  husnummer: string | null
  location: {
    type: string
    coordinates: number[]
  } | null
  anvendelse: string | null
  total_capacity: number
  shelter_count: number
  anvendelseskoder?: {
    kode: string
    beskrivelse: string
    skal_med: boolean
  }
}

interface NationalSheltersData {
  lastUpdated: string
  shelters: GroupedShelter[]
}

export default function NationalMap() {
  const [shelters, setShelters] = useState<GroupedShelter[]>([])
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [shelterIcon, setShelterIcon] = useState<L.Icon | null>(null)
  const [anvendelseskoder, setAnvendelseskoder] = useState<Anvendelseskode[]>([])
  const [kommunekoder, setKommunekoder] = useState<Kommunekode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  // Initialize Leaflet
  useEffect(() => {
    initializeLeaflet()
    setShelterIcon(createCustomIcon('red'))
  }, [])

  // Fetch kommunekoder
  useEffect(() => {
    async function fetchKommunekoder() {
      const data = await getKommunekoder()
      setKommunekoder(data)
    }

    fetchKommunekoder()
  }, [])

  // Fetch anvendelseskoder
  useEffect(() => {
    async function fetchAnvendelseskoder() {
      const data = await getAnvendelseskoder()
      setAnvendelseskoder(data)
    }

    fetchAnvendelseskoder()
  }, [])

  // Fetch shelters from static JSON
  useEffect(() => {
    async function fetchShelters() {
      setIsLoading(true)
      try {
        const response = await fetch('/data/national-shelters.json')
        const data: NationalSheltersData = await response.json()
        setShelters(data.shelters)
        setLastUpdated(data.lastUpdated)
      } catch (error) {
        console.error('Error fetching shelters:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchShelters()
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
      
      const boundsOptions = {
        padding: [50, 50] as [number, number],
        maxZoom: 15,
        animate: true
      }
      
      map.fitBounds(bounds, boundsOptions)
    }
  }, [map, shelters])

  if (!shelterIcon) return null

  return (
    <div className="h-[500px] w-full rounded-lg overflow-hidden relative">
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded-lg shadow-lg">
            <div className="text-center mb-2">Indlæser beskyttelsesrum...</div>
            <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      )}
      <MapContainer
        center={[56.2639, 9.5018]} // Center of Denmark
        zoom={7}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%', background: '#1a1a1a' }}
        ref={setMap}
        className="rounded-lg"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MarkerClusterGroup>
          {shelters.map((shelter) => (
            shelter.location && (
              <Marker
                key={shelter.id}
                position={[shelter.location.coordinates[1], shelter.location.coordinates[0]] as LatLngExpression}
                icon={shelterIcon}
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
                        {shelter.shelter_count > 1 && (
                          <div className="text-xs text-gray-500">
                            ({shelter.shelter_count} beskyttelsesrum)
                          </div>
                        )}
                      </div>
                      {shelter.anvendelse && (
                        <div>
                          <div className="text-sm font-medium">Type</div>
                          <div>
                            {shelter.anvendelseskoder?.beskrivelse || 
                             getAnvendelseskodeBeskrivelse(shelter.anvendelse, anvendelseskoder)}
                          </div>
                        </div>
                      )}
                    </div>
                    {lastUpdated && (
                      <div className="text-xs text-gray-400 mt-2">
                        Opdateret: {new Date(lastUpdated).toLocaleDateString('da-DK')}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  )
} 