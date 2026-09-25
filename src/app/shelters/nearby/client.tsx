'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@/styles/leaflet-overrides.css'

import GlobalFooter from '@/components/GlobalFooter'
import MapUnavailableNotice from '@/components/MapUnavailableNotice'
import RegistrationNotice, { RegistrationNoticeLine } from '@/components/RegistrationNotice'
import type { MapTileStatus } from '@/components/ResilientMapTileLayer'
import { ui } from '@/components/ui-classes'
import { ensureLeafletPopupStyles } from '@/lib/leaflet/ensure-popup-styles'
import { buildLeafletPopupHtml } from '@/lib/leaflet/popup-html'
import { setupLeafletDefaults } from '@/lib/leaflet/setup-defaults'
import { adaptAppV2Grouped, type NearbyResultShelter } from '@/lib/nearby/app-v2-adapter'
import { trackProductMetric } from '@/lib/analytics/product-metrics'
import { NearbyFitBounds } from './nearby-fit-bounds'

setupLeafletDefaults(L)

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false })
const ResilientMapTileLayer = dynamic(() => import('@/components/ResilientMapTileLayer'), { ssr: false })

const nearbyResultLimit = 10
const nearbyRadiusKm = 50

const createDivIcon = (className: string, html: string, size = 40) =>
  L.divIcon({
    className,
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })

const userLocationIcon = createDivIcon(
  'user-location-marker',
  '<div class="nearby-map-pin-user" aria-hidden="true"></div>',
  44,
)

const shelterIcon = createDivIcon(
  'shelter-marker',
  '<div class="nearby-map-pin-shelter" aria-hidden="true"></div>',
  44,
)

const selectedShelterIcon = createDivIcon(
  'shelter-marker-selected',
  '<div class="nearby-map-pin-shelter-hover" aria-hidden="true"></div>',
  44,
)

function formatDistanceKm(distanceKm: number) {
  if (!Number.isFinite(distanceKm)) return ''
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`
  return `${distanceKm.toFixed(1).replace('.', ',')} km`
}

function formatBuildingUse(shelter: NearbyResultShelter) {
  return shelter.typeLabel?.trim() || null
}

function getBuildingUseLabels(shelter: NearbyResultShelter) {
  return Array.from(new Set((shelter.typeLabels ?? []).map((label) => label.trim()).filter(Boolean)))
}

function getDetailSlug(shelter: NearbyResultShelter) {
  return shelter.representativeSlug ?? shelter.registrations?.[0]?.slug ?? null
}

function getAddressLine(shelter: NearbyResultShelter) {
  return `${shelter.vejnavn ?? ''} ${shelter.husnummer ?? ''}`.trim()
}

function getPostalLine(shelter: NearbyResultShelter) {
  return `${shelter.postnummer ?? ''} ${shelter.city ?? ''}`.trim()
}

function formatCapacity(capacity: number | undefined) {
  if (typeof capacity !== 'number') return 'Kapacitet ikke oplyst'
  return `${capacity.toLocaleString('da-DK')} ${capacity === 1 ? 'BBR-registreret plads' : 'BBR-registrerede pladser'}`
}

class NearbyRequestError extends Error {
  constructor(readonly status: number, readonly retryAfterSeconds: number | null = null) {
    super(`app_v2 grouped nearby failed with status ${status}`)
  }
}

const maximumAutomaticRetryWaitSeconds = 10

function parseRetryAfterSeconds(value: string | null) {
  const seconds = Number(value)
  return value !== null && Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

function getNearbyLoadErrorMessage(error: unknown) {
  if (error instanceof NearbyRequestError && error.status === 429) {
    return 'Vi kunne ikke hente BBR-registreringerne lige nu, fordi der er søgt mange gange fra din netværksforbindelse. Vent et minut, og prøv igen.'
  }
  return 'Vi kunne ikke hente BBR-registreringerne lige nu. Prøv igen om lidt.'
}

async function fetchAppV2GroupedShelters(lat: number, lng: number): Promise<NearbyResultShelter[]> {
  const response = await fetch('/api/app-v2/nearby/grouped', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, limit: nearbyResultLimit }),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new NearbyRequestError(response.status, parseRetryAfterSeconds(response.headers.get('Retry-After')))
  }

  const json = await response.json()
  return adaptAppV2Grouped(json.results ?? [])
}

interface Props {
  lat: number
  lng: number
  originLabel?: string
}

type MobileView = 'list' | 'map'

export default function ShelterMapClient({ lat, lng, originLabel }: Props) {
  const [shelters, setShelters] = useState<NearbyResultShelter[]>([])
  const [selectedShelterId, setSelectedShelterId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>('list')
  const [isDesktopMap, setIsDesktopMap] = useState(false)
  const [tileStatus, setTileStatus] = useState<MapTileStatus>('loading')
  const [tileRetryKey, setTileRetryKey] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isRetryingBusy, setIsRetryingBusy] = useState(false)
  const [srMapSelection, setSrMapSelection] = useState('')
  const shelterRefs = useRef<Record<string, HTMLElement | null>>({})
  const listTabRef = useRef<HTMLButtonElement | null>(null)
  const mapTabRef = useRef<HTMLButtonElement | null>(null)
  const listPanelRef = useRef<HTMLElement | null>(null)
  const mapRef = useRef<any>(null)
  const mapPanelRef = useRef<HTMLElement | null>(null)
  const mapContentRef = useRef<HTMLDivElement | null>(null)
  const mapRecoveryReturnRef = useRef<HTMLElement | null>(null)
  const selectionReturnRef = useRef<HTMLElement | null>(null)
  const srMapSelectionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedShelter = useMemo(
    () => shelters.find((shelter) => shelter.id === selectedShelterId) ?? null,
    [selectedShelterId, shelters],
  )

  useEffect(() => {
    ensureLeafletPopupStyles()
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktopMap(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!srMapSelection) return
    if (srMapSelectionClearRef.current) clearTimeout(srMapSelectionClearRef.current)
    srMapSelectionClearRef.current = setTimeout(() => {
      setSrMapSelection('')
      srMapSelectionClearRef.current = null
    }, 4000)
    return () => {
      if (srMapSelectionClearRef.current) clearTimeout(srMapSelectionClearRef.current)
    }
  }, [srMapSelection])

  useEffect(() => {
    let isMounted = true

    // A busy period can briefly trip the rate limit; retry once before
    // showing an error so the visitor does not have to act. Only when the
    // advertised wait is short: retrying before Retry-After expires is
    // guaranteed to fail and only adds load.
    async function fetchWithOneBusyRetry() {
      try {
        return await fetchAppV2GroupedShelters(lat, lng)
      } catch (error) {
        if (!(error instanceof NearbyRequestError) || error.status !== 429) throw error
        const waitSeconds = Math.max(error.retryAfterSeconds ?? 2, 1)
        if (waitSeconds > maximumAutomaticRetryWaitSeconds) throw error
        setIsRetryingBusy(true)
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
        if (!isMounted) throw error
        return await fetchAppV2GroupedShelters(lat, lng)
      }
    }

    async function loadData() {
      const startedAt = performance.now()
      try {
        setIsLoading(true)
        setLoadError(null)
        setIsRetryingBusy(false)
        const shelterData = await fetchWithOneBusyRetry()
        if (isMounted) {
          setShelters(shelterData)
          trackProductMetric(
            shelterData.length > 0 ? 'nearby_results_loaded' : 'nearby_no_results',
            performance.now() - startedAt,
          )
        }
      } catch (error) {
        if (isMounted) {
          setShelters([])
          setLoadError(getNearbyLoadErrorMessage(error))
          trackProductMetric('nearby_error', performance.now() - startedAt)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
          setIsRetryingBusy(false)
        }
      }
    }

    loadData()
    return () => {
      isMounted = false
    }
  }, [lat, lng])

  useEffect(() => {
    if (mobileView !== 'map') return
    const frame = requestAnimationFrame(() => mapRef.current?.invalidateSize({ animate: false }))
    return () => cancelAnimationFrame(frame)
  }, [mobileView])

  // On phones the map panel sits below the header; bring it fully into view.
  const revealMobileMap = useCallback(() => {
    requestAnimationFrame(() => mapPanelRef.current?.scrollIntoView({ block: 'start' }))
  }, [])

  const selectMobileView = useCallback((view: MobileView, moveFocus = false) => {
    setMobileView(view)
    if (view === 'map') {
      trackProductMetric('map_opened')
      revealMobileMap()
    }
    if (!moveFocus) return
    requestAnimationFrame(() => {
      if (view === 'list') listTabRef.current?.focus()
      else mapTabRef.current?.focus({ preventScroll: true })
    })
  }, [revealMobileMap])

  const showShelterOnMap = useCallback((shelter: NearbyResultShelter, trigger: HTMLButtonElement) => {
    selectionReturnRef.current = isDesktopMap ? trigger : mapTabRef.current
    setSelectedShelterId(shelter.id)
    setMobileView('map')
    trackProductMetric('map_opened')
    setSrMapSelection(`${getAddressLine(shelter)} er valgt og vist på kortet.`)
    if (!isDesktopMap) revealMobileMap()
    requestAnimationFrame(() => {
      if (!isDesktopMap) mapTabRef.current?.focus({ preventScroll: true })
      mapRef.current?.invalidateSize({ animate: false })
      if (shelter.location) {
        mapRef.current?.setView(
          [shelter.location.coordinates[1], shelter.location.coordinates[0]],
          16,
          { animate: false },
        )
      }
    })
  }, [isDesktopMap, revealMobileMap])

  const closeSelectedShelter = useCallback(() => {
    const selectedMarker = mapPanelRef.current?.querySelector<HTMLElement>('.shelter-marker-selected') ?? null
    const returnTarget = selectionReturnRef.current ?? selectedMarker ?? mapTabRef.current
    setSelectedShelterId(null)
    selectionReturnRef.current = null
    requestAnimationFrame(() => returnTarget?.focus())
  }, [])

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    selectMobileView(event.currentTarget.id === 'nearby-list-tab' ? 'map' : 'list', true)
  }

  const handleTileStatusChange = useCallback((status: MapTileStatus) => {
    if (status === 'error') {
      const activeElement = document.activeElement
      mapRecoveryReturnRef.current = activeElement instanceof HTMLElement
        && mapContentRef.current?.contains(activeElement)
        ? activeElement
        : mapTabRef.current
    }
    setTileStatus(status)
  }, [])

  const retryTiles = useCallback(() => {
    const returnTarget = mapRecoveryReturnRef.current
    setTileStatus('loading')
    setTileRetryKey((key) => key + 1)
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected && returnTarget.getClientRects().length > 0) {
        returnTarget.focus({ preventScroll: true })
      }
    })
  }, [])

  const useResultListFallback = useCallback(() => {
    const returnTarget = isDesktopMap ? listPanelRef.current : listTabRef.current
    mapRecoveryReturnRef.current = returnTarget
    setMobileView('list')
    window.requestAnimationFrame(() => returnTarget?.focus({ preventScroll: false }))
  }, [isDesktopMap])

  const shouldRenderMap = mobileView === 'map' || isDesktopMap

  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/" className="-ml-2 inline-flex touch-target items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/[0.05] hover:text-white" aria-label="Tilbage til forsiden">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="break-safe font-space-grotesk text-xl font-semibold tracking-tight sm:text-2xl">Registrerede sikringsrumspladser i nærheden</h1>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
            {originLabel ? <span className="break-safe text-gray-300">Søgeområde: {originLabel}</span> : null}
            <Link href="/" className="-ml-1 inline-flex min-h-[44px] items-center rounded-lg px-2 text-white underline underline-offset-4 hover:bg-white/5">Skift adresse</Link>
          </div>
          <p className="max-w-2xl text-xs leading-5 text-gray-400 sm:text-sm">
            Op til {nearbyResultLimit} adresser inden for {nearbyRadiusKm} km, sorteret efter afstand i luftlinje.
          </p>
        </header>

        <RegistrationNoticeLine className="mb-3 sm:mb-4" />

        <div className="sticky top-[calc(4.5rem+env(safe-area-inset-top,0px))] z-30 mb-4 grid grid-cols-2 rounded-lg border border-white/10 bg-[var(--surface-inset)] p-1 lg:hidden" role="tablist" aria-label="Vælg resultatvisning">
          <button
            ref={listTabRef}
            id="nearby-list-tab"
            type="button"
            role="tab"
            aria-selected={mobileView === 'list'}
            aria-controls="nearby-list-panel"
            tabIndex={mobileView === 'list' ? 0 : -1}
            onClick={() => selectMobileView('list')}
            onKeyDown={handleTabKeyDown}
            className={`min-h-[44px] rounded-md px-4 text-sm font-semibold ${mobileView === 'list' ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/5'}`}
          >
            Liste
          </button>
          <button
            ref={mapTabRef}
            id="nearby-map-tab"
            type="button"
            role="tab"
            aria-selected={mobileView === 'map'}
            aria-controls="nearby-map-panel"
            tabIndex={mobileView === 'map' ? 0 : -1}
            onClick={() => selectMobileView('map')}
            onKeyDown={handleTabKeyDown}
            className={`min-h-[44px] rounded-md px-4 text-sm font-semibold ${mobileView === 'map' ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/5'}`}
          >
            Kort
          </button>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
          <section
            ref={listPanelRef}
            id="nearby-list-panel"
            role={isDesktopMap ? undefined : 'tabpanel'}
            aria-labelledby={isDesktopMap ? undefined : 'nearby-list-tab'}
            tabIndex={-1}
            className={`${mobileView === 'list' ? 'block' : 'hidden'} order-1 space-y-3 lg:block`}
          >
            <h2 id="nearby-results-heading" className="sr-only">Resultater sorteret efter afstand</h2>

            {loadError ? (
              <div className={`${ui.panel} p-4 sm:p-5`} role="alert">
                <p className="text-gray-200">{loadError}</p>
                <p className="mt-2 text-sm text-gray-400">Du kan prøve igen eller gå til forsiden.</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button type="button" onClick={() => window.location.reload()} className={ui.primaryAction}>Genindlæs siden</button>
                  <Link href="/" className={ui.secondaryAction}>Til forsiden</Link>
                  <Link href="/kommune" className={ui.quietAction}>Kommuneoversigt</Link>
                </div>
              </div>
            ) : isLoading ? (
              <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
                <p className="text-sm text-gray-400">
                  {isRetryingBusy ? 'Mange søger lige nu – prøver igen om et øjeblik …' : 'Henter BBR-registreringer …'}
                </p>
                {[0, 1, 2].map((index) => <div key={index} className="h-40 animate-pulse rounded-lg border border-white/5 bg-white/[0.06] motion-reduce:animate-none" aria-hidden="true" />)}
              </div>
            ) : shelters.length === 0 ? (
              <div className={`${ui.panel} p-4`} role="status" aria-live="polite">
                <p className="text-lg font-semibold text-white">Ingen registreringer i resultatet</p>
                <p className="mt-2 text-gray-300">Prøv en anden adresse. Du kan også gennemse pr. kommune. Følg altid myndighedernes anvisninger.</p>
                <p className="mt-2 text-sm text-gray-400">
                  Oversigten viser kun registreringer med mindst 40 pladser.{' '}
                  <Link href="/om-data#hvilke-registreringer" className={ui.textLink}>Læs hvorfor</Link>
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Link href="/" className={ui.primaryAction}>Søg igen</Link>
                  <Link href="/kommune" className={ui.secondaryAction}>Kommuneoversigt</Link>
                </div>
              </div>
            ) : (
              <>
                <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{srMapSelection}</div>
                {shelters.map((shelter) => {
                  const detailSlug = getDetailSlug(shelter)
                  const buildingUse = formatBuildingUse(shelter)
                  const buildingUseLabels = getBuildingUseLabels(shelter)
                  const registrations = shelter.registrations ?? []
                  const hasExtraDetails = Boolean(buildingUse) || registrations.length > 1

                  return (
                    <article
                      key={shelter.id}
                      ref={(element) => { shelterRefs.current[shelter.id] = element }}
                      className={`min-w-0 rounded-xl border bg-[var(--surface-row)] p-4 sm:p-5 ${selectedShelterId === shelter.id ? 'border-orange-500/60' : 'border-white/10'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-orange-300">{formatDistanceKm(shelter.distance)} i luftlinje</span>
                        {typeof shelter.shelter_count === 'number' && shelter.shelter_count > 1 ? <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-gray-300">{shelter.shelter_count} registreringer</span> : null}
                      </div>
                      <h3 className="break-safe mt-2 text-lg font-semibold text-white">{getAddressLine(shelter)}</h3>
                      <p className="mt-1 text-sm text-gray-300">{getPostalLine(shelter)}</p>
                      <p className="mt-3 text-lg font-semibold text-white">
                        {formatCapacity(shelter.total_capacity)}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-gray-400">Adgang ikke bekræftet · Stand ikke verificeret</p>

                      {hasExtraDetails ? (
                        <details className="mt-3 border-t border-white/10 pt-3 text-sm">
                          <summary className="min-h-[44px] cursor-pointer py-2 font-medium text-gray-200">Flere registrerede oplysninger</summary>
                          <div className="pb-1 text-gray-300">
                            {buildingUseLabels.length > 1 ? (
                              <div>
                                <p>Flere registrerede bygningsanvendelser:</p>
                                <ul className="mt-1 list-disc space-y-1 pl-5">
                                  {buildingUseLabels.map((label) => <li key={label}>{label}</li>)}
                                </ul>
                              </div>
                            ) : buildingUse ? <p>Bygningens anvendelse: {buildingUse}</p> : null}
                            {registrations.length > 1 ? (
                              <ul className="mt-2 space-y-1">
                                {registrations.map((registration, index) => (
                                  <li key={registration.id}>
                                    <Link href={`/beskyttelsesrum/${registration.slug}`} className="inline-flex min-h-[44px] items-center underline underline-offset-4 hover:text-white">
                                      Registrering {index + 1}: {registration.capacity.toLocaleString('da-DK')} {registration.capacity === 1 ? 'plads' : 'pladser'}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        </details>
                      ) : null}

                      <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row">
                        {detailSlug ? (
                          <Link href={`/beskyttelsesrum/${detailSlug}`} className={`${ui.primaryAction} flex-1`}>Se detaljer</Link>
                        ) : (
                          <span className="inline-flex min-h-[44px] flex-1 items-center text-sm text-gray-400">Detaljeside er ikke tilgængelig</span>
                        )}
                        {shelter.location ? <button type="button" onClick={(event) => showShelterOnMap(shelter, event.currentTarget)} className={`${ui.secondaryAction} flex-1`}>Vis på kort</button> : null}
                      </div>
                    </article>
                  )
                })}
                <p className="pt-1 text-sm text-gray-400">
                  Kun registreringer med mindst 40 pladser vises.{' '}
                  <Link href="/om-data#hvilke-registreringer" className={ui.textLink}>Læs hvorfor</Link>
                </p>
                <RegistrationNotice className="mt-3" />
              </>
            )}
          </section>

          <section
            ref={mapPanelRef}
            id="nearby-map-panel"
            role={isDesktopMap ? undefined : 'tabpanel'}
            aria-labelledby={isDesktopMap ? undefined : 'nearby-map-tab'}
            className={`${mobileView === 'map' ? 'block' : 'hidden'} order-2 scroll-mt-[calc(8.5rem+env(safe-area-inset-top,0px))] lg:block lg:scroll-mt-0`}
            aria-label="Kort med din placering og BBR-registreringer i nærheden"
          >
            <p id="nearby-map-keyboard-hint" className="sr-only">Brug resultatlisten til at vælge et sted eller åbne en detaljeside med tastatur.</p>
            <div className="relative h-[calc(100dvh-13rem)] min-h-[30rem] lg:sticky lg:top-24 lg:h-[min(600px,calc(100vh-8rem))] lg:min-h-[min(600px,calc(100vh-8rem))]" aria-describedby="nearby-map-keyboard-hint">
              <div
                ref={mapContentRef}
                data-map-content
                className="absolute inset-0"
                aria-hidden={tileStatus === 'error' ? true : undefined}
                inert={tileStatus === 'error'}
              >
                <div className="absolute inset-0 overflow-hidden rounded-lg border border-white/10">
                  {shouldRenderMap ? (
                    <MapContainer className="nearby-map" center={[lat, lng]} zoom={13} style={{ width: '100%', height: '100%' }} ref={mapRef} zoomControl scrollWheelZoom={false}>
                      <ResilientMapTileLayer key={tileRetryKey} onStatusChange={handleTileStatusChange} />
                      <Marker position={[lat, lng]} icon={userLocationIcon} title="Din placering" alt="Din placering på kortet" />
                      {shelters.map((shelter) => shelter.location ? (
                        <Marker
                          key={shelter.id}
                          position={[shelter.location.coordinates[1], shelter.location.coordinates[0]]}
                          icon={selectedShelterId === shelter.id ? selectedShelterIcon : shelterIcon}
                          title={getAddressLine(shelter)}
                          alt={`BBR-registrering ved ${getAddressLine(shelter)}`}
                          eventHandlers={{
                            click: () => {
                              selectionReturnRef.current = null
                              setSelectedShelterId(shelter.id)
                              setSrMapSelection(`${getAddressLine(shelter)} er valgt på kortet.`)
                              if (window.innerWidth >= 1024) shelterRefs.current[shelter.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            },
                          }}
                        >
                          <Popup className="fb-popup">
                            <div dangerouslySetInnerHTML={{ __html: buildLeafletPopupHtml({
                              title: getAddressLine(shelter),
                              usageLine: formatBuildingUse(shelter) ?? '',
                              postalLine: getPostalLine(shelter),
                              capacity: typeof shelter.total_capacity === 'number' ? shelter.total_capacity : 0,
                              href: getDetailSlug(shelter) ? `/beskyttelsesrum/${getDetailSlug(shelter)}` : null,
                              linkLabel: 'Se detaljer',
                            }) }} />
                          </Popup>
                        </Marker>
                      ) : null)}
                      <NearbyFitBounds userLocation={[lat, lng]} shelters={shelters} />
                    </MapContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[var(--surface-elevated)] p-6 text-center" role="status">
                      <p className="max-w-sm text-sm leading-6 text-gray-300">Kortet indlæses først, når du vælger kortvisningen.</p>
                    </div>
                  )}
                </div>

                {selectedShelter ? (
                  <aside className="absolute inset-x-2 bottom-2 z-[700] max-h-[min(55dvh,24rem)] overflow-y-auto rounded-xl border border-white/15 bg-[var(--surface-elevated)] p-4 shadow-xl lg:hidden" aria-label="Valgt registrering">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="break-safe text-base font-semibold text-white">{getAddressLine(selectedShelter)}</h2>
                      <button type="button" onClick={closeSelectedShelter} className="-mr-2 -mt-2 inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-2 text-sm font-medium text-gray-200 hover:bg-white/5 hover:text-white">
                        Luk oplysninger
                      </button>
                    </div>
                    <p className="mt-1 text-sm text-gray-300">{getPostalLine(selectedShelter)}</p>
                    <p className="mt-2 font-semibold text-white">
                      {formatCapacity(selectedShelter.total_capacity)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-400">Adgang ikke bekræftet · Stand ikke verificeret</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => selectMobileView('list', true)} className={ui.secondaryAction}>Til listen</button>
                      {getDetailSlug(selectedShelter) ? <Link href={`/beskyttelsesrum/${getDetailSlug(selectedShelter)}`} className={ui.primaryAction}>Se detaljer</Link> : null}
                    </div>
                  </aside>
                ) : null}
              </div>

              {shouldRenderMap && tileStatus === 'error' ? (
                <MapUnavailableNotice
                  onRetry={retryTiles}
                  fallbackLabel="Til resultatlisten"
                  onFallback={useResultListFallback}
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <GlobalFooter />
    </main>
  )
}
