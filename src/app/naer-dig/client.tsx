'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import dynamic from 'next/dynamic'
import type { Route } from 'next'
import Link from 'next/link'

import MapUnavailableNotice from '@/components/MapUnavailableNotice'
import OfflineCopyControl from '@/components/OfflineCopyControl'
import type { MapTileStatus } from '@/components/ResilientMapTileLayer'
import { ui } from '@/components/ui-classes'
import { buildLeafletPopupHtml } from '@/lib/leaflet/popup-html'
import { adaptAppV2Grouped, type NearbyResultShelter } from '@/lib/nearby/app-v2-adapter'
import {
  isNearbyTilePayload,
  parseTileKey,
  rankNearbyGroupsFromTiles,
  revisionCounter,
  surroundingTileKeys,
  type NearbyTilePayload,
} from '@/lib/nearby/tiles'
import { trackProductMetric } from '@/lib/analytics/product-metrics'
import { scrollBehavior } from '@/lib/ui/reduced-motion'
import { getReadableGroupPrimaryPath, getReadableShelterPathFromStable } from '@/lib/shelter-public-url'

const loadShelterMap = () => import('@/components/ShelterMap')
const ShelterMap = dynamic(loadShelterMap, { ssr: false })

/** Loads the map and its lazy parts now; a phone otherwise fetches them only on the "Kort" tab. */
export function preloadNearbyMap() {
  return loadShelterMap().then((mod) => mod.preloadShelterMapParts())
}

const nearbyResultLimit = 10
const nearbyRadiusKm = 50
// When nothing lies within the normal radius (a postcode far from any
// registration), search once more this far out rather than show an empty list.
const widenedRadiusKm = 100

function formatDistanceKm(distanceKm: number) {
  if (!Number.isFinite(distanceKm)) return ''
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`
  return `${distanceKm.toFixed(1).replace('.', ',')} km`
}

function formatBuildingUse(shelter: NearbyResultShelter) {
  return shelter.typeLabel?.trim() || null
}

/** Readable detail path for the address: the registration with the most places. */
function getDetailPath(shelter: NearbyResultShelter): Route | null {
  const address = { addressLine1: getAddressLine(shelter), postalCode: shelter.postnummer ?? '', city: shelter.city ?? '' }
  const registrations = shelter.registrations ?? []
  if (registrations.length > 0) return getReadableGroupPrimaryPath(address, registrations) as Route | null
  return shelter.representativeSlug ? getReadableShelterPathFromStable({ slug: shelter.representativeSlug, ...address }) as Route : null
}

function getAddressLine(shelter: NearbyResultShelter) {
  return `${shelter.vejnavn ?? ''} ${shelter.husnummer ?? ''}`.trim()
}

function getPostalLine(shelter: NearbyResultShelter) {
  return `${shelter.postnummer ?? ''} ${shelter.city ?? ''}`.trim()
}

function formatCapacity(capacity: number | undefined) {
  if (typeof capacity !== 'number') return 'Kapacitet ikke oplyst'
  return `${capacity.toLocaleString('da-DK')} ${capacity === 1 ? 'plads' : 'pladser'}`
}

class NearbyRequestError extends Error {
  constructor(readonly status: number, readonly retryAfterSeconds: number | null = null) {
    super(`app_v2 grouped nearby failed with status ${status}`)
  }
}

// The request got no response at all: no connection, or the network is down.
class NearbyConnectionError extends Error {}

const maximumAutomaticRetryWaitSeconds = 10

function parseRetryAfterSeconds(value: string | null) {
  const seconds = Number(value)
  return value !== null && Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

function getNearbyLoadErrorMessage(error: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Du er offline, og der er ingen gemte data for dette område. Opret forbindelse, og prøv igen.'
  }
  // navigator.onLine stays true on many dead networks, so a missing response counts too.
  if (error instanceof NearbyConnectionError) {
    return 'Siden kan ikke få forbindelse, og der er ingen gemte data for dette område. Tjek din internetforbindelse, og prøv igen.'
  }
  if (error instanceof NearbyRequestError && error.status === 429) {
    return 'Vi kunne ikke hente BBR-registreringerne lige nu, fordi der er søgt mange gange fra din netværksforbindelse. Vent et minut, og prøv igen.'
  }
  return 'Vi kunne ikke hente BBR-registreringerne lige nu. Prøv igen om lidt.'
}

// Loads the CDN-cached tiles around the position and ranks them on the
// device. Returns null whenever the result cannot be guaranteed identical to
// the server search (outside the tile grid, a failed tile, revisions that stay
// mixed after a refresh, or too few results inside the loaded block).
// Set by public/offline-sw.js on tiles it serves from its cache.
const offlineCachedAtHeader = 'X-Offline-Cached-At'

type TileSearchResult = {
  shelters: NearbyResultShelter[]
  // When any tile came from the offline cache: the oldest cache time.
  savedAt: string | null
}

async function fetchTile(key: string, path: string, cachedAt: string[]): Promise<NearbyTilePayload> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`nearby tile ${key} failed with status ${response.status}`)
  const savedAt = response.headers.get(offlineCachedAtHeader)
  if (savedAt) cachedAt.push(savedAt)
  const payload: unknown = await response.json()
  if (!isNearbyTilePayload(payload, key)) throw new Error(`nearby tile ${key} returned an invalid payload`)
  return payload
}

async function fetchNearbyFromTiles(lat: number, lng: number): Promise<TileSearchResult | null> {
  const keys = surroundingTileKeys(lat, lng)
  if (keys.some((key) => parseTileKey(key) === null)) return null

  const cachedAt: string[] = []
  let tiles = await Promise.all(keys.map((key) => fetchTile(key, `/api/app-v2/nearby/tiles/${key}`, cachedAt)))

  // Right after a publication some tiles are still cached from the previous
  // revision. Fetch only those again, pinned to the newest revision seen.
  if (new Set(tiles.map((tile) => tile.revision)).size !== 1) {
    const counters = tiles.map((tile) => revisionCounter(tile.revision))
    if (counters.some((counter) => counter === null)) return null
    const newest = tiles[counters.indexOf(Math.max(...(counters as number[])))]!.revision
    const newestCounter = revisionCounter(newest)!
    tiles = await Promise.all(tiles.map((tile, index) => tile.revision === newest
      ? tile
      : fetchTile(keys[index]!, `/api/app-v2/nearby/tiles/${keys[index]}/${newestCounter}`, cachedAt)))
    if (new Set(tiles.map((tile) => tile.revision)).size !== 1) return null
  }

  const groups = rankNearbyGroupsFromTiles(tiles, { latitude: lat, longitude: lng }, {
    limit: nearbyResultLimit,
    radiusMeters: nearbyRadiusKm * 1000,
  })
  if (!groups) return null
  return { shelters: adaptAppV2Grouped(groups), savedAt: cachedAt.sort()[0] ?? null }
}

function formatSavedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(date)
}

async function fetchAppV2GroupedShelters(lat: number, lng: number, radiusKm?: number): Promise<NearbyResultShelter[]> {
  const response = await fetch('/api/app-v2/nearby/grouped', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(radiusKm ? { lat, lng, limit: nearbyResultLimit, radius: radiusKm * 1000 } : { lat, lng, limit: nearbyResultLimit }),
    cache: 'no-store',
  }).catch(() => {
    throw new NearbyConnectionError('app_v2 grouped nearby got no response')
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
  // Set when results were built while offline or from the worker's saved tiles.
  const [savedDataNotice, setSavedDataNotice] = useState<{ savedAt: string | null } | null>(null)
  const [isWidened, setIsWidened] = useState(false)
  const [srMapSelection, setSrMapSelection] = useState('')
  const shelterRefs = useRef<Record<string, HTMLElement | null>>({})
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const listTabRef = useRef<HTMLButtonElement | null>(null)
  const mapTabRef = useRef<HTMLButtonElement | null>(null)
  const listPanelRef = useRef<HTMLElement | null>(null)
  const mapRef = useRef<any>(null)
  const mapPanelRef = useRef<HTMLElement | null>(null)
  const mapContentRef = useRef<HTMLDivElement | null>(null)
  const mapRecoveryReturnRef = useRef<HTMLElement | null>(null)
  const selectionReturnRef = useRef<HTMLElement | null>(null)
  const srMapSelectionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const offlineTileUrls = useMemo(
    () => surroundingTileKeys(lat, lng).map((key) => `/api/app-v2/nearby/tiles/${key}`),
    [lat, lng],
  )

  const selectedShelter = useMemo(
    () => shelters.find((shelter) => shelter.id === selectedShelterId) ?? null,
    [selectedShelterId, shelters],
  )

  // A new search starts at the top with focus on the result heading, so
  // keyboard and screen reader users land where the results begin.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
    headingRef.current?.focus({ preventScroll: true })
  }, [lat, lng])

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
        setSavedDataNotice(null)
        setIsWidened(false)
        const tileData = await fetchNearbyFromTiles(lat, lng).catch(() => null)
        let shelterData = tileData?.shelters ?? await fetchWithOneBusyRetry()
        let widened = false
        if (shelterData.length === 0) {
          const wider = await fetchAppV2GroupedShelters(lat, lng, widenedRadiusKm).catch(() => [])
          if (wider.length > 0) {
            shelterData = wider
            widened = true
          }
        }
        if (isMounted) {
          setShelters(shelterData)
          setIsWidened(widened)
          // The browser's own short HTTP cache can answer offline too, so being
          // offline always earns the notice, with a date when the worker knows it.
          const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false
          setSavedDataNotice(tileData && (tileData.savedAt || isOffline) ? { savedAt: tileData.savedAt } : null)
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
          <h1
            ref={headingRef}
            tabIndex={-1}
            id="nearby-results-heading"
            className="break-safe text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-white [text-wrap:balance] focus:outline-none sm:text-4xl"
          >
            Nærmeste registrerede sikringsrum
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 text-base text-gray-300">
            {originLabel ? <span className="break-safe">Ved {originLabel}</span> : null}
            <Link href="/" className={`${ui.textLink} inline-flex min-h-[44px] items-center`}>Skift adresse</Link>
          </p>
          <p className="text-sm leading-6 text-gray-400">
            Adgang og stand er ikke bekræftet. Op til {nearbyResultLimit} adresser inden for {nearbyRadiusKm} km i luftlinje.{' '}
            <Link href="/om-data" className={ui.textLink}>Om data</Link>
          </p>
        </header>

        {/* Sticks right under the 69px header (68px + its border, which covers the overlap) with the
            page colour around it, so no content shows in a gap above or below it (5.3). */}
        <div className="sticky top-[calc(4.25rem+env(safe-area-inset-top,0px))] z-30 -mx-4 mb-2 bg-[var(--surface-page)] px-4 pb-2 pt-1 sm:-mx-6 sm:px-6 lg:hidden">
          <div className="grid grid-cols-2 rounded-lg border border-white/10 bg-[var(--surface-inset)] p-1" role="tablist" aria-label="Vælg resultatvisning">
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
            <h2 className="sr-only">Resultater sorteret efter afstand</h2>

            {savedDataNotice && !loadError && !isLoading ? (
              <div className="rounded-lg border border-yellow-600/40 bg-yellow-900/20 p-3 text-sm leading-6 text-yellow-100" role="status">
                <p className="font-semibold">Viser gemte data</p>
                <p>
                  Netværket svarer ikke, så resultaterne bygger på data gemt på din enhed
                  {savedDataNotice.savedAt && formatSavedAt(savedDataNotice.savedAt) ? ` ${formatSavedAt(savedDataNotice.savedAt)}` : ''}. De kan være forældede.
                </p>
              </div>
            ) : null}

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
                {[0, 1, 2].map((index) => <div key={index} className="h-14 animate-pulse rounded-md bg-white/[0.06] motion-reduce:animate-none" aria-hidden="true" />)}
              </div>
            ) : shelters.length === 0 ? (
              <div className={`${ui.panel} p-4`} role="status" aria-live="polite">
                <p className="text-lg font-semibold text-white">Ingen registreringer inden for {widenedRadiusKm} km</p>
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
                {isWidened ? (
                  <p className="border-l-2 border-yellow-500 pl-3 text-sm leading-6 text-yellow-100" role="status">
                    Der er ingen registreringer inden for {nearbyRadiusKm} km. Her er de nærmeste inden for {widenedRadiusKm} km.
                  </p>
                ) : null}
                <ol className="divide-y divide-white/10 border-y border-white/10">
                  {shelters.map((shelter, index) => {
                    const detailPath = getDetailPath(shelter)
                    const isSelected = selectedShelterId === shelter.id
                    const registrationCount = shelter.registrations?.length ?? shelter.shelter_count ?? 1

                    return (
                      <li
                        key={shelter.id}
                        ref={(element) => { shelterRefs.current[shelter.id] = element }}
                        className={`flex min-w-0 items-start gap-3 py-3 pr-1 ${isSelected ? '-ml-3 border-l-2 border-l-[var(--accent)] pl-[10px]' : ''}`}
                      >
                        <span className={`nearby-result-number mt-0.5 ${isSelected ? '' : 'nearby-result-number-quiet'}`} aria-hidden="true">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-baseline gap-x-2">
                            <span className="sr-only">Nummer {index + 1} på kortet: </span>
                            {detailPath ? (
                              <Link href={detailPath} className="break-safe text-base font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
                                {getAddressLine(shelter)}
                              </Link>
                            ) : (
                              <span className="break-safe text-base font-semibold text-white">{getAddressLine(shelter)}</span>
                            )}
                            <span className="text-sm font-medium text-gray-200">{formatDistanceKm(shelter.distance)}</span>
                          </p>
                          <p className="text-sm text-gray-400">
                            {getPostalLine(shelter)}
                            <span aria-hidden="true"> · </span>
                            <span className="sr-only">, </span>
                            {formatCapacity(shelter.total_capacity)}
                            {registrationCount > 1 ? ` · ${registrationCount} registreringer` : ''}
                          </p>
                        </div>
                        {shelter.location ? (
                          <button
                            type="button"
                            onClick={(event) => showShelterOnMap(shelter, event.currentTarget)}
                            className="-my-1 inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-2 text-sm text-gray-300 underline underline-offset-4 hover:text-white"
                            aria-label={`Vis ${getAddressLine(shelter)} på kort`}
                          >
                            Vis på kort
                          </button>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
                <p className="pt-1 text-sm text-gray-400">
                  Kun registreringer med mindst 40 pladser vises.{' '}
                  <Link href="/om-data#hvilke-registreringer" className={ui.textLink}>Læs hvorfor</Link>
                </p>
                <OfflineCopyControl
                  className="pt-2"
                  extraUrls={offlineTileUrls}
                  search={{ label: originLabel ?? 'Gemt søgning', latitude: lat, longitude: lng }}
                />
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
              >
                <div className="absolute inset-0 overflow-hidden rounded-lg border border-white/10">
                  {shouldRenderMap ? (
                    <ShelterMap
                      ref={mapRef}
                      center={[lat, lng]}
                      zoom={13}
                      searchPoint={[lat, lng]}
                      fitToMarkers
                      tileRetryKey={tileRetryKey}
                      onTileStatusChange={handleTileStatusChange}
                      markers={shelters.flatMap((shelter, index) => shelter.location ? [{
                        id: shelter.id,
                        position: [shelter.location.coordinates[1], shelter.location.coordinates[0]] as [number, number],
                        label: String(index + 1),
                        title: `${index + 1}. ${getAddressLine(shelter)}`,
                        selected: selectedShelterId === shelter.id,
                        popupHtml: buildLeafletPopupHtml({
                          title: getAddressLine(shelter),
                          usageLine: formatBuildingUse(shelter) ?? '',
                          postalLine: getPostalLine(shelter),
                          capacity: typeof shelter.total_capacity === 'number' ? shelter.total_capacity : 0,
                          href: getDetailPath(shelter),
                          linkLabel: 'Se detaljer',
                        }),
                      }] : [])}
                      onMarkerClick={(id) => {
                        const shelter = shelters.find((item) => item.id === id)
                        if (!shelter) return
                        selectionReturnRef.current = null
                        setSelectedShelterId(shelter.id)
                        setSrMapSelection(`${getAddressLine(shelter)} er valgt på kortet.`)
                        if (window.innerWidth >= 1024) shelterRefs.current[shelter.id]?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[var(--surface-elevated)] p-6 text-center" role="status">
                      <p className="max-w-sm text-sm leading-6 text-gray-300">Kortet indlæses først, når du vælger kortvisningen.</p>
                    </div>
                  )}
                </div>

                {shouldRenderMap ? (
                  <div data-map-legend className="pointer-events-none absolute right-2 top-[calc(0.5rem+var(--map-notice-height,0px))] z-[700] rounded-lg border border-white/15 bg-[#141619]/95 px-3 py-2 text-sm leading-6 text-gray-200 shadow-lg" aria-hidden="true">
                    <p className="flex items-center gap-2"><span className="nearby-legend-search" />Søgepunkt</p>
                    <p className="flex items-center gap-2"><span className="nearby-result-number nearby-result-number-quiet nearby-legend-number">1</span>Nummer i listen</p>
                  </div>
                ) : null}

                {/* The panel sits above the OSM attribution, which must stay visible (4.2). */}
                {selectedShelter ? (
                  <aside className="absolute inset-x-2 bottom-8 z-[700] max-h-[min(55dvh,24rem)] overflow-y-auto rounded-xl border border-white/15 bg-[var(--surface-elevated)] p-4 shadow-xl lg:hidden" aria-label="Valgt registrering">
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
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => selectMobileView('list', true)} className={ui.secondaryAction}>Til listen</button>
                      {getDetailPath(selectedShelter) ? <Link href={getDetailPath(selectedShelter)!} className={ui.primaryAction}>Se detaljer</Link> : null}
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

    </main>
  )
}
