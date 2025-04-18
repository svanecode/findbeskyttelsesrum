'use client'

import { useEffect, useState, useMemo } from 'react'
import Map, { Marker, Popup, MapRef, Source, Layer } from 'react-map-gl'
import type { ViewState } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from '@/lib/supabase'
import { Shelter } from '@/types/shelter'
import { Anvendelseskode } from '@/types/anvendelseskode'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'
import { Kommunekode } from '@/types/kommunekode'

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
  const [mapRef, setMapRef] = useState<MapRef | null>(null)
  const [anvendelseskoder, setAnvendelseskoder] = useState<Anvendelseskode[]>([])
  const [kommunekoder, setKommunekoder] = useState<Kommunekode[]>([])
  const [selectedShelter, setSelectedShelter] = useState<string | null>(null)
  const [viewState, setViewState] = useState<Partial<ViewState>>({
    latitude: 56.2639,
    longitude: 9.5018,
    zoom: 7
  })

  // Convert shelters to GeoJSON
  const geojsonData = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: shelters
        .filter(shelter => shelter.location)
        .map(shelter => ({
          type: 'Feature',
          properties: {
            id: shelter.id,
            vejnavn: shelter.vejnavn,
            husnummer: shelter.husnummer,
            postnummer: shelter.postnummer,
            kommunekode: shelter.kommunekode,
            total_capacity: shelter.total_capacity,
            shelter_count: shelter.shelter_count,
            anvendelse: shelter.anvendelse,
            anvendelseskoder: shelter.anvendelseskoder
          },
          geometry: {
            type: 'Point',
            coordinates: shelter.location!.coordinates
          }
        }))
    }
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
      // First get all anvendelseskoder that should be included
      const { data: anvendelseskoderData, error: anvendelseskoderError } = await supabase
        .from('anvendelseskoder')
        .select('kode')
        .eq('skal_med', true)

      if (anvendelseskoderError) {
        console.error('Error fetching anvendelseskoder:', anvendelseskoderError)
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
    }

    fetchShelters()
  }, [kommunekode])

  // Update map bounds when shelters change
  useEffect(() => {
    if (mapRef && shelters.length > 0) {
      const coordinates = shelters
        .filter(shelter => shelter.location)
        .map(shelter => shelter.location!.coordinates as [number, number])
      
      if (coordinates.length === 0) return
      
      let minLng = coordinates[0][0]
      let minLat = coordinates[0][1]
      let maxLng = coordinates[0][0]
      let maxLat = coordinates[0][1]
      
      coordinates.forEach(coord => {
        minLng = Math.min(minLng, coord[0])
        minLat = Math.min(minLat, coord[1])
        maxLng = Math.max(maxLng, coord[0])
        maxLat = Math.max(maxLat, coord[1])
      })
      
      const boundsOptions = {
        padding: 50,
        maxZoom: 15,
        duration: 500
      }
      
      mapRef.fitBounds([[minLng, minLat], [maxLng, maxLat]], boundsOptions)
    }
  }, [mapRef, shelters])

  return (
    <div className="h-[500px] w-full rounded-lg overflow-hidden">
      <Map
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        ref={setMapRef}
        interactiveLayerIds={['clusters', 'unclustered-point']}
        onClick={(e) => {
          const features = e.features
          if (!features || features.length === 0) return

          const feature = features[0]
          if (!feature.geometry || !('coordinates' in feature.geometry)) return

          if (feature.properties?.cluster) {
            const clusterId = feature.properties.cluster_id
            const mapboxSource = mapRef?.getSource('shelters') as any
            mapboxSource.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
              if (err) return
              const coordinates = (feature.geometry as GeoJSON.Point).coordinates
              mapRef?.easeTo({
                center: coordinates as [number, number],
                zoom,
                duration: 500
              })
            })
          } else if (feature.properties?.id) {
            setSelectedShelter(feature.properties.id)
          }
        }}
      >
        <Source
          id="shelters"
          type="geojson"
          data={geojsonData}
          cluster={true}
          clusterMaxZoom={14}
          clusterRadius={50}
        >
          <Layer
            id="clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': [
                'step',
                ['get', 'point_count'],
                '#FB923C',
                10,
                '#F97316',
                30,
                '#EA580C'
              ],
              'circle-radius': [
                'step',
                ['get', 'point_count'],
                20,
                10,
                30,
                30,
                40
              ]
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': '{point_count_abbreviated}',
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-size': 12
            }}
            paint={{
              'text-color': '#FFFFFF'
            }}
          />
          <Layer
            id="unclustered-point"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-color': '#EF4444',
              'circle-radius': 8,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FFFFFF'
            }}
          />
        </Source>

        {selectedShelter && (
          <Popup
            longitude={geojsonData.features.find(f => f.properties.id === selectedShelter)?.geometry.coordinates[0] || 0}
            latitude={geojsonData.features.find(f => f.properties.id === selectedShelter)?.geometry.coordinates[1] || 0}
            offset={25}
            closeButton={false}
            anchor="bottom"
            onClose={() => setSelectedShelter(null)}
          >
            {(() => {
              const shelter = geojsonData.features.find(f => f.properties.id === selectedShelter)
              if (!shelter) return null
              return (
                <div className="min-w-[200px]">
                  <div className="font-semibold text-lg mb-2">{shelter.properties.vejnavn} {shelter.properties.husnummer}</div>
                  <div className="text-sm text-gray-600 mb-3">
                    {shelter.properties.postnummer} {getKommunenavn(shelter.properties.kommunekode, kommunekoder)}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <div className="text-sm font-medium">Total kapacitet</div>
                      <div>{shelter.properties.total_capacity} personer</div>
                      {shelter.properties.shelter_count > 1 && (
                        <div className="text-xs text-gray-500">
                          ({shelter.properties.shelter_count} beskyttelsesrum)
                        </div>
                      )}
                    </div>
                    {shelter.properties.anvendelse && (
                      <div>
                        <div className="text-sm font-medium">Type</div>
                        <div>
                          {shelter.properties.anvendelseskoder?.beskrivelse || 
                           getAnvendelseskodeBeskrivelse(shelter.properties.anvendelse, anvendelseskoder)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </Popup>
        )}
      </Map>
    </div>
  )
} 