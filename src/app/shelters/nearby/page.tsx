import ShelterMapClient from './client'

export default function Page({
  searchParams,
}: {
  searchParams: { lat: string; lng: string }
}) {
  return <ShelterMapClient lat={searchParams.lat} lng={searchParams.lng} />
} 