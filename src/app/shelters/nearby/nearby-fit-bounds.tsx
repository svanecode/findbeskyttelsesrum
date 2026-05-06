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

  useEffect(() => {
    if (!map || shelters.length === 0) {
      return
    }

    const group = L.featureGroup([
      L.marker(userLocation),
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
      map.setView(userLocation, 13, { animate: true })
    } else {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
      map.fitBounds(bounds, {
        padding: isMobile ? [30, 30] : [50, 50],
        maxZoom: 16,
        animate: true,
      })
    }

    group.clearLayers()
  }, [map, userLocation, shelters])

  return null
}
