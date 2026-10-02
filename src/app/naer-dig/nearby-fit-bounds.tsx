'use client'

import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

import type { NearbyResultShelter } from '@/lib/nearby/app-v2-adapter'

type NearbyFitBoundsProps = {
  userLocation: [number, number]
  shelters: NearbyResultShelter[]
}

export function NearbyFitBounds({ userLocation, shelters }: NearbyFitBoundsProps) {
  const map = useMap()
  const [latitude, longitude] = userLocation

  useEffect(() => {
    if (!map || shelters.length === 0) {
      return
    }

    const origin: [number, number] = [latitude, longitude]
    const group = L.featureGroup([
      L.marker(origin),
      ...shelters
        .filter((s) => s.location)
        .map((s) => L.marker([s.location!.coordinates[1], s.location!.coordinates[0]])),
    ])

    const bounds = group.getBounds()

    if (!bounds.isValid()) {
      group.clearLayers()
      return
    }

    if (shelters.filter((s) => s.location).length === 0) {
      map.setView(origin, 13, { animate: false })
    } else {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
      map.fitBounds(bounds, {
        padding: isMobile ? [30, 30] : [50, 50],
        maxZoom: 16,
        animate: false,
      })
    }

    group.clearLayers()
  }, [map, latitude, longitude, shelters])

  return null
}
