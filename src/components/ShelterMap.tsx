'use client'

import { forwardRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import '@/styles/leaflet-overrides.css'

import type { MapTileStatus } from '@/components/ResilientMapTileLayer'
import { ensureLeafletPopupStyles } from '@/lib/leaflet/ensure-popup-styles'
import { setupLeafletDefaults } from '@/lib/leaflet/setup-defaults'

/**
 * The site's map for one or a few registrations: the result page's map and
 * the detail page's map. OpenStreetMap tiles drawn dark by a CSS filter on
 * the tile pane only (src/app/globals.css), so pins and attribution keep
 * their colours. Orange marks the selected registration.
 */

setupLeafletDefaults(L)

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false })
const ResilientMapTileLayer = dynamic(() => import('@/components/ResilientMapTileLayer'), { ssr: false })

export type ShelterMapMarker = {
  id: string
  position: [number, number]
  /** Shown in the pin; matches the number in the result list. */
  label?: string
  /** The marker's accessible name. */
  title: string
  selected: boolean
  popupHtml?: string
}

type Props = {
  center: [number, number]
  zoom: number
  markers: ShelterMapMarker[]
  /** The search position, shown as a blue dot. */
  searchPoint?: [number, number]
  /** Fit the view to the markers and the search point once they are known. */
  fitToMarkers?: boolean
  tileRetryKey?: number
  onTileStatusChange: (status: MapTileStatus) => void
  onMarkerClick?: (id: string) => void
}

const createDivIcon = (className: string, html: string, size = 40) =>
  L.divIcon({
    className,
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })

const searchPointIcon = createDivIcon(
  'user-location-marker',
  '<div class="nearby-map-pin-user" aria-hidden="true"></div>',
  44,
)

// Leaflet compares icons by identity, so each label/selection pair is cached.
const pinIcons = new Map<string, L.DivIcon>()

function escapeLabel(label: string) {
  return label.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)
}

export function getShelterPinIcon(label: string, selected: boolean) {
  const key = `${label}:${selected ? 'selected' : 'default'}`
  let icon = pinIcons.get(key)
  if (!icon) {
    icon = createDivIcon(
      selected ? 'shelter-marker-selected' : 'shelter-marker',
      `<div class="${selected ? 'nearby-map-pin-shelter-hover' : 'nearby-map-pin-shelter'}" aria-hidden="true">${escapeLabel(label)}</div>`,
      44,
    )
    pinIcons.set(key, icon)
  }
  return icon
}

function FitToMarkers({ points }: { points: Array<[number, number]> }) {
  const map = useMap()
  const key = points.map((point) => point.join(',')).join(';')

  useEffect(() => {
    if (!map || points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0]!, 16, { animate: false })
      return
    }
    const bounds = L.latLngBounds(points)
    if (!bounds.isValid()) return
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    map.fitBounds(bounds, { padding: isMobile ? [30, 30] : [50, 50], maxZoom: 16, animate: false })
    // The key lists the points; refit only when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])

  return null
}

const ShelterMap = forwardRef<L.Map, Props>(function ShelterMap(
  { center, zoom, markers, searchPoint, fitToMarkers = false, tileRetryKey = 0, onTileStatusChange, onMarkerClick },
  ref,
) {
  useEffect(() => {
    ensureLeafletPopupStyles()
  }, [])

  const fitPoints = fitToMarkers && markers.length > 0
    ? [...(searchPoint ? [searchPoint] : []), ...markers.map((marker) => marker.position)]
    : []

  return (
    <MapContainer className="nearby-map" center={center} zoom={zoom} style={{ width: '100%', height: '100%' }} ref={ref} zoomControl scrollWheelZoom={false}>
      <ResilientMapTileLayer key={tileRetryKey} onStatusChange={onTileStatusChange} />
      {searchPoint ? <Marker position={searchPoint} icon={searchPointIcon} title="Søgepunkt" /> : null}
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          position={marker.position}
          icon={getShelterPinIcon(marker.label ?? '', marker.selected)}
          // Leaflet ignores alt on div icons; title is the marker's accessible name.
          title={marker.title}
          eventHandlers={onMarkerClick ? { click: () => onMarkerClick(marker.id) } : undefined}
        >
          {marker.popupHtml ? (
            <Popup className="fb-popup">
              <div dangerouslySetInnerHTML={{ __html: marker.popupHtml }} />
            </Popup>
          ) : null}
        </Marker>
      ))}
      {fitPoints.length > 0 ? <FitToMarkers points={fitPoints} /> : null}
    </MapContainer>
  )
})

export default ShelterMap
