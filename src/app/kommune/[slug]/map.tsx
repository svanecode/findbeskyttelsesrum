'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Map, { Marker, Popup, MapRef, Source, Layer } from 'react-map-gl'
import type { ViewState } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from '@/lib/supabase'
import { Shelter } from '@/types/shelter'
import { Anvendelseskode } from '@/types/anvendelseskode'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'
import { Kommunekode } from '@/types/kommunekode'
import mapboxgl from 'mapbox-gl'

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
            anvendelseskoder: shelter.anvendelseskoder,
            last_checked: shelter.last_checked,
            created_at: shelter.created_at
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

  return (
    <div className="h-screen w-full">
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
          if (!features || features.length === 0) {
            // Clicked on empty space, close popup
            setSelectedShelter(null)
            return
          }

          // Clear any existing popup first
          setSelectedShelter(null)

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
            // Set the selected shelter with a small delay to ensure state is cleared
            setTimeout(() => {
              if (feature.properties?.id) {
                setSelectedShelter(feature.properties.id)
              }
            }, 50)
          }
        }}
      >
        <Source
          id="shelters"
          type="geojson"
          data={geojsonData}
          cluster={true}
          clusterMaxZoom={12}
          clusterRadius={40}
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
            offset={[0, -10]}
            closeButton={true}
            anchor="bottom"
            onClose={() => setSelectedShelter(null)}
            maxWidth="400px"
          >
            {(() => {
              const shelter = geojsonData.features.find(f => f.properties.id === selectedShelter)
              if (!shelter) return null
              return (
                <div className="min-w-[380px] p-4">
                  <div className="font-semibold text-lg mb-2 text-gray-900">
                    {shelter.properties.vejnavn} {shelter.properties.husnummer}
                    {shelter.properties.shelter_count > 1 && (
                      <span className="inline-flex items-center ml-2 text-sm bg-orange-500/20 text-orange-600 px-2 py-0.5 rounded-md font-medium border border-orange-500/10">
                        {shelter.properties.shelter_count} beskyttelsesrum
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    {shelter.properties.postnummer} {getKommunenavn(shelter.properties.kommunekode, kommunekoder)}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Total kapacitet</div>
                      <div className="text-gray-900 font-medium text-base">{shelter.properties.total_capacity} personer</div>
                    </div>
                    {shelter.properties.anvendelse && (
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <div className="text-sm text-gray-600 mb-1">Type</div>
                        <div className="text-gray-900 font-medium text-sm line-clamp-2">
                          {shelter.properties.anvendelseskoder?.beskrivelse || 
                           getAnvendelseskodeBeskrivelse(shelter.properties.anvendelse, anvendelseskoder)}
                        </div>
                      </div>
                    )}
                  </div>



                  {shelter.properties.anvendelseskoder && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-sm text-gray-600 mb-1">Detaljer</div>
                      <div className="text-xs text-gray-700">
                        {shelter.properties.anvendelseskoder.beskrivelse}
                      </div>
                    </div>
                  )}



                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => {
                        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                        const lat = shelter.geometry.coordinates[1];
                        const lng = shelter.geometry.coordinates[0];
                        
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
              )
            })()}
          </Popup>
        )}
      </Map>
    </div>
  )
} 