'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

import MapUnavailableNotice from './MapUnavailableNotice'
import type { MapTileStatus } from './ResilientMapTileLayer'
import { shelterMapSectionId } from './shelter-map-section'

const ShelterMap = dynamic(() => import('./ShelterMap'), { ssr: false })

type Props = {
  latitude: number
  longitude: number
  /** "Ryesgade 18, 8000 Aarhus C": shown in the placeholder and as the pin's name. */
  addressLabel: string
}

/**
 * The detail page's map: the same map as the result page, with the
 * registration as the selected (orange) pin. OpenStreetMap is only contacted
 * after the visitor asks for the map, as the privacy page promises; until then
 * a placeholder with the address keeps the same height, so the page does not
 * jump. The page's single "Vis på kort" link (#registrering-kort) opens it.
 */
export default function ShelterDetailMap({ latitude, longitude, addressLabel }: Props) {
  const [isActive, setIsActive] = useState(false)
  const [tileStatus, setTileStatus] = useState<MapTileStatus>('loading')
  const [tileRetryKey, setTileRetryKey] = useState(0)

  useEffect(() => {
    const activateFromHash = () => {
      if (window.location.hash === `#${shelterMapSectionId}`) setIsActive(true)
    }
    // A second click on the link does not change the hash, so listen for it too.
    const activateFromLink = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.(`a[href="#${shelterMapSectionId}"]`)) setIsActive(true)
    }
    activateFromHash()
    window.addEventListener('hashchange', activateFromHash)
    document.addEventListener('click', activateFromLink)
    return () => {
      window.removeEventListener('hashchange', activateFromHash)
      document.removeEventListener('click', activateFromLink)
    }
  }, [])

  const retry = useCallback(() => {
    setTileStatus('loading')
    setTileRetryKey((key) => key + 1)
  }, [])

  return (
    <div className="relative aspect-[4/3] min-h-[17rem] w-full overflow-hidden rounded-lg border border-white/10 bg-[var(--surface-inset)] sm:min-h-[22rem]">
      {isActive ? (
        <>
          <div className="absolute inset-0" aria-hidden={tileStatus === 'error' ? true : undefined} inert={tileStatus === 'error'}>
            <ShelterMap
              center={[latitude, longitude]}
              zoom={16}
              tileRetryKey={tileRetryKey}
              onTileStatusChange={setTileStatus}
              markers={[{ id: 'registrering', position: [latitude, longitude], title: addressLabel, selected: true }]}
            />
          </div>
          {tileStatus === 'error' ? (
            <MapUnavailableNotice onRetry={retry} fallbackLabel="Skjul kortet" onFallback={() => setIsActive(false)} />
          ) : null}
        </>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="break-safe text-base font-medium text-white">{addressLabel}</p>
          <p className="max-w-xs text-sm leading-6 text-gray-300">
            Vælg &quot;Vis på kort&quot; for at hente kortet fra OpenStreetMap.
          </p>
        </div>
      )}
    </div>
  )
}
