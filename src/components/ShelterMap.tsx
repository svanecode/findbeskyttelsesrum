'use client'

import { forwardRef, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import L from 'leaflet'
import { useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import '@/styles/leaflet-overrides.css'

import type { MapTileStatus } from '@/components/ResilientMapTileLayer'
import { ensureLeafletPopupStyles } from '@/lib/leaflet/ensure-popup-styles'
import { groupOverlappingPoints } from '@/lib/maps/group-overlapping'
import { setupLeafletDefaults } from '@/lib/leaflet/setup-defaults'

/**
 * The site's map for one or a few registrations: the result page's map and
 * the detail page's map. OpenStreetMap tiles drawn dark by a CSS filter on
 * the tile pane only (src/app/globals.css), so pins and attribution keep
 * their colours. Orange marks the selected registration.
 */

setupLeafletDefaults(L)

const loadReactLeaflet = () => import('react-leaflet')
const loadTileLayer = () => import('@/components/ResilientMapTileLayer')

const MapContainer = dynamic(() => loadReactLeaflet().then((mod) => mod.MapContainer), { ssr: false })
const Marker = dynamic(() => loadReactLeaflet().then((mod) => mod.Marker), { ssr: false })
const Popup = dynamic(() => loadReactLeaflet().then((mod) => mod.Popup), { ssr: false })
const ResilientMapTileLayer = dynamic(loadTileLayer, { ssr: false })

/** Loads the map's lazy parts now, so an offline copy can keep them (OfflineCopyControl). */
export function preloadShelterMapParts() {
  return Promise.all([loadReactLeaflet(), loadTileLayer()])
}

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
    // "1, 2" for pins at the same place: a wider pill instead of a circle.
    const grouped = label.includes(',')
    const width = grouped ? Math.max(44, 20 + label.length * 8) : 44
    icon = L.divIcon({
      className: selected ? 'shelter-marker-selected' : 'shelter-marker',
      html: `<div class="${selected ? 'nearby-map-pin-shelter-hover' : 'nearby-map-pin-shelter'}${grouped ? ' nearby-map-pin-group' : ''}" aria-hidden="true">${escapeLabel(label)}</div>`,
      iconSize: [width, 44],
      iconAnchor: [width / 2, 22],
      popupAnchor: [0, -22],
    })
    pinIcons.set(key, icon)
  }
  return icon
}

/** Pins closer than this on screen would cover each other's number. */
const overlapDistancePx = 30

/**
 * Pins that would cover each other at the current zoom become one pin labelled
 * "1, 2" (4.1). The grouping follows the zoom, so zooming in separates them.
 */
function ShelterMarkers({ markers, onMarkerClick }: { markers: ShelterMapMarker[]; onMarkerClick?: (id: string) => void }) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })

  const byId = new Map(markers.map((marker) => [marker.id, marker]))
  const groups = groupOverlappingPoints(
    markers.map((marker) => {
      const point = map.project(marker.position, zoom)
      return { id: marker.id, x: point.x, y: point.y }
    }),
    overlapDistancePx,
  ).map((ids) => ids.map((id) => byId.get(id)!))

  return groups.map((group) => {
    const first = group[0]!
    const selected = group.some((marker) => marker.selected)
    const label = group.map((marker) => marker.label ?? '').filter(Boolean).join(', ')
    const popupHtml = group.map((marker) => marker.popupHtml).filter(Boolean).join('')
    // A click picks the next pin in the group, so each can be selected in turn.
    const selectedIndex = group.findIndex((marker) => marker.selected)
    const next = group[(selectedIndex + 1) % group.length]!
    return (
      <Marker
        key={group.map((marker) => marker.id).join('+')}
        position={first.position}
        icon={getShelterPinIcon(label, selected)}
        // Leaflet ignores alt on div icons; title is the marker's accessible name.
        title={group.map((marker) => marker.title).join(', ')}
        eventHandlers={onMarkerClick ? { click: () => onMarkerClick(next.id) } : undefined}
        // Above the search point when they share a position, and the selected pin above all.
        zIndexOffset={selected ? 1000 : 500}
      >
        {popupHtml ? (
          <Popup className="fb-popup">
            <div dangerouslySetInnerHTML={{ __html: popupHtml }} />
          </Popup>
        ) : null}
      </Marker>
    )
  })
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
      <ShelterMarkers markers={markers} onMarkerClick={onMarkerClick} />
      {fitPoints.length > 0 ? <FitToMarkers points={fitPoints} /> : null}
    </MapContainer>
  )
})

export default ShelterMap
