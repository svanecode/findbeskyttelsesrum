'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import '@/styles/leaflet-overrides.css'
import MapUnavailableNotice from '@/components/MapUnavailableNotice'
import type { MapTileStatus } from '@/components/ResilientMapTileLayer'
import type { AppV2MunicipalityShelterGroup } from '@/lib/supabase/app-v2-queries'
import { ensureLeafletPopupStyles } from '@/lib/leaflet/ensure-popup-styles'
import { buildLeafletPopupHtml } from '@/lib/leaflet/popup-html'

const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
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
const ResilientMapTileLayer = dynamic(() => import('@/components/ResilientMapTileLayer'), { ssr: false })

interface Props {
  groups: AppV2MunicipalityShelterGroup[]
  selectedGroupKey: string | null
  onMarkerClick: (groupKey: string) => void
}

function makeIcon(L: typeof import('leaflet'), selected: boolean) {
  const size = selected ? 36 : 28
  const border = selected ? 4 : 3
  const color = 'var(--accent)'
  const shadow = selected
    ? '0 0 0 3px rgb(var(--accent-rgb) / 0.4), 0 4px 12px rgba(0,0,0,0.5)'
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
  const [leaflet, setLeaflet] = useState<typeof import('leaflet') | null>(null)
  const [tileStatus, setTileStatus] = useState<MapTileStatus>('loading')
  const [tileRetryKey, setTileRetryKey] = useState(0)

  // Load Leaflet once
  useEffect(() => {
    ensureLeafletPopupStyles()
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
      setLeaflet(L)
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

  const handleTileStatusChange = useCallback((status: MapTileStatus) => {
    setTileStatus(status)
  }, [])

  const retryTiles = useCallback(() => {
    setTileStatus('loading')
    setTileRetryKey((key) => key + 1)
  }, [])

  const withCoords = groups.filter((g) => g.latitude != null && g.longitude != null)
  const center: [number, number] =
    withCoords.length > 0
      ? [withCoords[0]!.latitude as number, withCoords[0]!.longitude as number]
      : [56.2639, 9.5018]

  if (!leaflet) {
    return (
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-gray-300">Indlæser kort...</p>
      </div>
    )
  }

  if (withCoords.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 p-6" role="status">
        <div className="max-w-sm text-center">
          <p className="font-semibold text-white">Kortet kan ikke vises</p>
          <p className="mt-2 text-sm leading-6 text-gray-300">Ingen af kommunens viste registreringer har brugbare koordinater. Brug adresselisten i stedet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <MapContainer
        center={center}
        zoom={10}
        maxZoom={18}
        style={{ width: '100%', height: '100%' }}
        className="leaflet-container"
        ref={mapRef}
        whenReady={handleMapReady}
      >
        <ResilientMapTileLayer key={tileRetryKey} onStatusChange={handleTileStatusChange} />

        <MarkerClusterGroup
          maxClusterRadius={60}
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          zoomToBoundsOnClick
          disableClusteringAtZoom={16}
          iconCreateFunction={(cluster: any) => {
            const count = cluster.getChildCount()
            const cls =
              count < 10 ? 'marker-cluster-small' : count < 50 ? 'marker-cluster-medium' : 'marker-cluster-large'
            return leaflet.divIcon({
              html: `<div><span class="sr-only">Åbn gruppe med </span><span>${count}</span><span class="sr-only"> adresser</span></div>`,
              className: `marker-cluster ${cls}`,
              iconSize: leaflet.point(40, 40),
            })
          }}
        >
          {withCoords.map((group) => {
            const isSelected = group.groupKey === selectedGroupKey
            const icon = makeIcon(leaflet, isSelected)

            return (
              <Marker
                key={group.groupKey}
                position={[group.latitude as number, group.longitude as number]}
                icon={icon}
                title={`${group.addressLine1}, ${group.postalCode} ${group.city}`}
                alt={`BBR-registrering ved ${group.addressLine1}`}
                eventHandlers={{
                  click: () => onMarkerClick(group.groupKey),
                }}
              >
                <Popup className="fb-popup">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: buildLeafletPopupHtml({
                        title: group.addressLine1,
                        usageLine: group.applicationCodeLabel || '',
                        postalLine: `${group.postalCode} ${group.city}`.trim(),
                        capacity: group.totalCapacity,
                        href: group.shelterCount === 1 ? `/beskyttelsesrum/${group.primarySlug}` : null,
                      }),
                    }}
                  />
                </Popup>
              </Marker>
            )
          })}
        </MarkerClusterGroup>
      </MapContainer>
      {tileStatus === 'error' ? (
        <MapUnavailableNotice
          onRetry={retryTiles}
          fallbackLabel="Brug adresselisten"
          fallbackHref="#municipality-list-heading"
        />
      ) : null}
    </div>
  )
}
