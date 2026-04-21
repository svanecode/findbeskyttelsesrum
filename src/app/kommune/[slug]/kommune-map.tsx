'use client'

import { useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import type { AppV2MunicipalityShelterGroup } from '@/lib/supabase/app-v2-queries'

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false },
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false },
)
const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false },
)
const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false },
)
const MarkerClusterGroup = dynamic(
  () => import('@/components/MarkerClusterGroup').then((mod) => mod.default),
  { ssr: false },
)

interface Props {
  groups: AppV2MunicipalityShelterGroup[]
  selectedGroupKey: string | null
  onMarkerClick: (groupKey: string) => void
}

function makeIcon(L: typeof import('leaflet'), selected: boolean) {
  const size = selected ? 36 : 28
  const border = selected ? 4 : 3
  const color = selected ? '#fb923c' : '#F97316'
  const shadow = selected
    ? '0 0 0 3px rgba(249,115,22,0.4), 0 4px 12px rgba(0,0,0,0.5)'
    : '0 3px 8px rgba(0,0,0,0.4)'
  return L.divIcon({
    className: 'shelter-marker',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:${border}px solid white;border-radius:50%;box-shadow:${shadow};transition:all .2s;"></div>`,
    iconSize: [size + 8, size + 8],
    iconAnchor: [(size + 8) / 2, (size + 8) / 2],
    popupAnchor: [0, -((size + 8) / 2)],
  })
}

export default function KommuneMap({ groups, selectedGroupKey, onMarkerClick }: Props) {
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const fittedRef = useRef(false)

  // Load Leaflet once
  useEffect(() => {
    import('leaflet').then((leaflet) => {
      const L = leaflet.default
      // Fix default markers
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl: '/leaflet/marker-icon.png',
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        shadowUrl: '/leaflet/marker-shadow.png',
      })
      leafletRef.current = L
    })
  }, [])

  // Fly to selected marker
  useEffect(() => {
    if (!selectedGroupKey || !mapRef.current) return
    const group = groups.find((g) => g.groupKey === selectedGroupKey)
    if (!group || group.latitude == null || group.longitude == null) return
    mapRef.current.flyTo([group.latitude, group.longitude], Math.max(mapRef.current.getZoom(), 14), {
      animate: true,
      duration: 0.6,
    })
  }, [selectedGroupKey, groups])

  // Fit bounds on first render when map + data are ready
  const handleMapReady = useCallback(() => {
    if (fittedRef.current) return
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return

    const withCoords = groups.filter((g) => g.latitude != null && g.longitude != null)
    if (withCoords.length === 0) return

    const bounds = L.latLngBounds(
      withCoords.map((g) => [g.latitude as number, g.longitude as number]),
    )
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
      fittedRef.current = true
    }
  }, [groups])

  const withCoords = groups.filter((g) => g.latitude != null && g.longitude != null)
  const center: [number, number] =
    withCoords.length > 0
      ? [withCoords[0]!.latitude as number, withCoords[0]!.longitude as number]
      : [56.2639, 9.5018]

  return (
    <div className="h-full w-full overflow-hidden rounded-xl">
      <MapContainer
        center={center}
        zoom={10}
        style={{ width: '100%', height: '100%' }}
        className="leaflet-container"
        ref={mapRef}
        whenReady={handleMapReady}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <MarkerClusterGroup
          maxClusterRadius={60}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          zoomToBoundsOnClick
          disableClusteringAtZoom={16}
          iconCreateFunction={(cluster: any) => {
            const L = leafletRef.current
            const count = cluster.getChildCount()
            const cls =
              count < 10 ? 'marker-cluster-small' : count < 50 ? 'marker-cluster-medium' : 'marker-cluster-large'
            if (!L) {
              // Fallback — should never be needed since cluster renders client-side
              return cluster.getAllChildMarkers()?.[0]?.options?.icon
            }
            return L.divIcon({
              html: `<div><span>${count}</span></div>`,
              className: `marker-cluster ${cls}`,
              iconSize: L.point(40, 40),
            })
          }}
        >
          {withCoords.map((group) => {
            const L = leafletRef.current
            const isSelected = group.groupKey === selectedGroupKey
            const icon = L ? makeIcon(L, isSelected) : undefined

            return (
              <Marker
                key={group.groupKey}
                position={[group.latitude as number, group.longitude as number]}
                icon={icon}
                eventHandlers={{
                  click: () => onMarkerClick(group.groupKey),
                }}
              >
                <Popup>
                  <div className="min-w-[240px] p-3">
                    <p className="font-semibold text-gray-900">
                      {group.addressLine1}
                    </p>
                    <p className="text-sm text-gray-600">
                      {group.postalCode} {group.city}
                    </p>
                    {group.applicationCodeLabel && (
                      <p className="mt-1 text-xs text-gray-500">{group.applicationCodeLabel}</p>
                    )}
                    <div className="mt-2 flex gap-3 text-sm">
                      {group.shelterCount > 1 && (
                        <span className="text-gray-700">{group.shelterCount} beskyttelsesrum</span>
                      )}
                      <span className="font-medium text-orange-600">
                        {group.totalCapacity.toLocaleString('da-DK')} pladser
                      </span>
                    </div>
                    <a
                      href={`/beskyttelsesrum/${group.primarySlug}`}
                      className="mt-2 block text-xs text-blue-600 hover:underline"
                    >
                      Se detaljer →
                    </a>
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
