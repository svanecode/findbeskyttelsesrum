'use client'

import dynamic from 'next/dynamic'

const ShelterMapClient = dynamic(
  () => import('./client'),
  { ssr: false }
)

interface MapWrapperProps {
  lat: string
  lng: string
}

export default function MapWrapper({ lat, lng }: MapWrapperProps) {
  return <ShelterMapClient lat={lat} lng={lng} />
} 