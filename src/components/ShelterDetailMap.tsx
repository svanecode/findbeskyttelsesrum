'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
 * after the visitor asks for the map, as the privacy page promises. Until
 * then the placeholder itself is the button ("Vis kort", at most 160px high,
 * 5.2). Old links to #registrering-kort still open the map.
 */
export default function ShelterDetailMap({ latitude, longitude, addressLabel }: Props) {
  const [isActive, setIsActive] = useState(false)
  const [tileStatus, setTileStatus] = useState<MapTileStatus>('loading')
  const [tileRetryKey, setTileRetryKey] = useState(0)

  const mapFrameRef = useRef<HTMLDivElement>(null)
  const focusMapRef = useRef(false)

  useEffect(() => {
    const activateFromHash = () => {
      if (window.location.hash === `#${shelterMapSectionId}`) setIsActive(true)
    }
    activateFromHash()
    window.addEventListener('hashchange', activateFromHash)
    return () => window.removeEventListener('hashchange', activateFromHash)
  }, [])

  // The button disappears when the map opens; focus moves to the map instead of the page top.
  useEffect(() => {
    if (isActive && focusMapRef.current) {
      focusMapRef.current = false
      mapFrameRef.current?.focus({ preventScroll: true })
    }
  }, [isActive])

  const retry = useCallback(() => {
    setTileStatus('loading')
    setTileRetryKey((key) => key + 1)
  }, [])

  if (!isActive) {
    return (
      <button
        type="button"
        onClick={() => {
          focusMapRef.current = true
          setIsActive(true)
        }}
        className="flex h-40 w-full flex-col items-start justify-center gap-1 rounded-lg border border-white/15 bg-[var(--surface-inset)] px-4 text-left transition-colors hover:border-white/30 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span className="flex items-center gap-2 text-base font-semibold text-white">
          <svg className="h-5 w-5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg>
          Vis kort
        </span>
        <span className="break-safe text-sm leading-6 text-gray-300">{addressLabel}</span>
        <span className="text-sm leading-6 text-gray-400">Kortet hentes fra OpenStreetMap, når du vælger det.</span>
      </button>
    )
  }

  return (
    <div
      ref={mapFrameRef}
      tabIndex={-1}
      aria-label={`Kort over ${addressLabel}`}
      className="relative aspect-[4/3] min-h-[17rem] w-full overflow-hidden rounded-lg border border-white/10 bg-[var(--surface-inset)] focus:outline-none sm:min-h-[22rem]"
    >
      <div className="absolute inset-0">
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
    </div>
  )
}
