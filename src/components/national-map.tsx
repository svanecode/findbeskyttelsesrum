'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Map, { Marker, Popup, MapRef, Source, Layer } from 'react-map-gl'
import type { ViewState } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Anvendelseskode } from '@/types/anvendelseskode'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'
import { Kommunekode } from '@/types/kommunekode'
import mapboxgl from 'mapbox-gl'

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
  const [mapRef, setMapRef] = useState<MapRef | null>(null)
  const [anvendelseskoder, setAnvendelseskoder] = useState<Anvendelseskode[]>([])
  const [kommunekoder, setKommunekoder] = useState<Kommunekode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [selectedShelter, setSelectedShelter] = useState<string | null>(null)
  const [viewState, setViewState] = useState<Partial<ViewState>>({
    latitude: 56.2639,
    longitude: 9.5018,
    zoom: 6.5
  })

  // Function to fit all markers in view
  const fitBounds = useCallback((map: MapRef) => {
    if (shelters.length === 0) return

    const bounds = new mapboxgl.LngLatBounds()
    
    // Add all shelter locations
    shelters.forEach(shelter => {
      if (shelter.location) {
        bounds.extend([
          shelter.location.coordinates[0],
          shelter.location.coordinates[1]
        ])
      }
    })

    map.fitBounds(bounds, {
      padding: 50,
      maxZoom: 15
    })
  }, [shelters])

  // Fit bounds when shelters change
  useEffect(() => {
    if (mapRef && shelters.length > 0) {
      fitBounds(mapRef)
    }
  }, [mapRef, shelters, fitBounds])

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
                  {lastUpdated && (
                    <div className="text-xs text-gray-400 mt-2">
                      Opdateret: {new Date(lastUpdated).toLocaleDateString('da-DK')}
                    </div>
                  )}
                </div>
              )
            })()}
          </Popup>
        )}
      </Map>
    </div>
  )
} 