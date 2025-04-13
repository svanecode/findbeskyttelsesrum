'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import type { Map as LeafletMap, LatLngExpression } from 'leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '@/lib/supabase'
import { Shelter } from '@/types/shelter'
import { Anvendelseskode } from '@/types/anvendelseskode'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'
import { initializeLeaflet, createCustomIcon } from '@/lib/leaflet-setup'
import { Kommunekode } from '@/types/kommunekode'

interface GroupedShelter extends Shelter {
  total_capacity: number
  shelter_count: number
  anvendelseskoder?: Anvendelseskode
}

export default function NationalMap() {
  const [shelters, setShelters] = useState<GroupedShelter[]>([])
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [shelterIcon, setShelterIcon] = useState<L.Icon | null>(null)
  const [anvendelseskoder, setAnvendelseskoder] = useState<Anvendelseskode[]>([])
  const [kommunekoder, setKommunekoder] = useState<Kommunekode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0, percentage: 0 })

  // Initialize Leaflet
  useEffect(() => {
    initializeLeaflet()
    setShelterIcon(createCustomIcon('red'))
  }, [])

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

  // Fetch all shelters
  useEffect(() => {
    async function fetchShelters() {
      setIsLoading(true)
      
      // First get all anvendelseskoder that should be included
      const { data: anvendelseskoderData, error: anvendelseskoderError } = await supabase
        .from('anvendelseskoder')
        .select('kode')
        .eq('skal_med', true)

      if (anvendelseskoderError) {
        console.error('Error fetching anvendelseskoder:', anvendelseskoderError)
        setIsLoading(false)
        return
      }

      const validAnvendelseskoder = anvendelseskoderData?.map(ak => ak.kode) || []

      // First get the total count
      const { count, error: countError } = await supabase
        .from('sheltersv2')
        .select('*', { count: 'exact', head: true })
        .gte('shelter_capacity', 40)
        .not('location', 'is', null)
        .in('anvendelse', validAnvendelseskoder)

      if (countError) {
        console.error('Error counting shelters:', countError)
        setIsLoading(false)
        return
      }

      console.log('Total shelters to fetch:', count)

      // Fetch shelters in batches of 1000
      const allShelters = []
      const batchSize = 1000
      const totalBatches = Math.ceil((count || 0) / batchSize)
      setLoadingProgress({ current: 0, total: totalBatches, percentage: 0 })

      for (let i = 0; i < totalBatches; i++) {
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
          .gte('shelter_capacity', 40)
          .not('location', 'is', null)
          .in('anvendelse', validAnvendelseskoder)
          .range(i * batchSize, (i + 1) * batchSize - 1)

        if (error) {
          console.error('Error fetching shelters batch:', error)
          continue
        }

        if (data) {
          allShelters.push(...data)
        }

        const percentage = Math.round(((i + 1) / totalBatches) * 100)
        setLoadingProgress({ current: i + 1, total: totalBatches, percentage })
        console.log(`Fetched batch ${i + 1}/${totalBatches} (${allShelters.length} shelters so far)`)
      }

      console.log('Total shelters fetched:', allShelters.length)

      // Group shelters by address and calculate total capacity
      const groupedShelters = allShelters.reduce((acc: { [key: string]: GroupedShelter }, shelter) => {
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
      setIsLoading(false)
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
                style={{ width: `${loadingProgress.percentage}%` }}
              />
            </div>
            <div className="text-sm text-gray-600 mt-2">
              {loadingProgress.current} / {loadingProgress.total} batches
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