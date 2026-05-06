'use client'

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import '@/styles/leaflet-overrides.css'
import L from 'leaflet'
import { ensureLeafletPopupStyles } from '@/lib/leaflet/ensure-popup-styles'
import { buildLeafletPopupHtml } from '@/lib/leaflet/popup-html'

// Fix Leaflet default markers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

// Create custom icons using div icons for better reliability
const createDivIcon = (className: string, html: string, size: number = 40) => {
  return L.divIcon({
    className: className,
    html: html,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2]
  })
}

const userLocationIcon = createDivIcon(
  'user-location-marker',
  '<div class="nearby-map-pin-user" aria-hidden="true"></div>',
  32
)

const shelterIcon = createDivIcon(
  'shelter-marker',
  '<div class="nearby-map-pin-shelter" aria-hidden="true"></div>',
  32
)

const hoveredShelterIcon = createDivIcon(
  'shelter-marker-hovered',
  '<div class="nearby-map-pin-shelter-hover" aria-hidden="true"></div>',
  36
)
import { adaptAppV2Grouped, type NearbyResultShelter } from '@/lib/nearby/app-v2-adapter'
import { getAnvendelseskoder, getAnvendelseskodeBeskrivelse } from '@/lib/anvendelseskoder'
import { getKommunekoder, getKommunenavn } from '@/lib/kommunekoder'
import Link from 'next/link'
import GlobalFooter from '@/components/GlobalFooter'
import { Kommunekode } from '@/types/kommunekode'
import { Anvendelseskode } from '@/types/anvendelseskode'
import { NearbyFitBounds } from './nearby-fit-bounds'

// Dynamic import to avoid SSR issues with Leaflet
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false })

type AppV2NearbyEligibilityParam = 'source-application-code' | 'legacy-capacity' | 'none'

function normalizeEligibilityParam(value: string): AppV2NearbyEligibilityParam {
  if (value === 'legacy-capacity' || value === 'none' || value === 'source-application-code') {
    return value
  }

  return 'source-application-code'
}

function formatDistanceKm(distanceKm: number) {
  if (!Number.isFinite(distanceKm)) return ''
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`
  }
  return `${distanceKm.toFixed(1).replace('.', ',')} km`
}

function formatBygningensAnvendelse(shelter: NearbyResultShelter, anvendelseskoder: Anvendelseskode[]) {
  const fromAppV2 = shelter.typeLabel?.trim()
  if (fromAppV2) {
    return fromAppV2
  }
  if (shelter.anvendelse) {
    return getAnvendelseskodeBeskrivelse(shelter.anvendelse, anvendelseskoder).trim() || null
  }
  return null
}

function getGoogleMapsRouteHref(location: NearbyResultShelter['location']) {
  if (!location) return null
  const lat = location.coordinates[1]
  const lng = location.coordinates[0]
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}

async function fetchAppV2GroupedShelters(
  lat: number,
  lng: number,
  eligibility: AppV2NearbyEligibilityParam,
): Promise<NearbyResultShelter[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    limit: '10',
    eligibility,
  })
  const response = await fetch(`/api/app-v2/nearby/grouped?${params.toString()}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`app_v2 grouped nearby failed with status ${response.status}`)
  }

  const json = await response.json()
  return adaptAppV2Grouped(json.results ?? [])
}

interface Props {
  lat: string
  lng: string
  appV2NearbyEligibility?: string
}

export default function ShelterMapClient({
  lat: latString,
  lng: lngString,
  appV2NearbyEligibility = 'source-application-code',
}: Props) {
  const [shelters, setShelters] = useState<NearbyResultShelter[]>([])
  const [anvendelseskoder, setAnvendelseskoder] = useState<Anvendelseskode[]>([])
  const [kommunekoder, setKommunekoder] = useState<Kommunekode[]>([])
  const [selectedShelter, setSelectedShelter] = useState<string | null>(null)
  const [hoveredShelter, setHoveredShelter] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [srMapSelection, setSrMapSelection] = useState('')
  const shelterRefs = useRef<{ [key: string]: HTMLElement | null }>({})
  const mapRef = useRef<any>(null)
  const srMapSelectionClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lat = parseFloat(latString)
  const lng = parseFloat(lngString)
  const eligibility = normalizeEligibilityParam(appV2NearbyEligibility)

  useEffect(() => {
    ensureLeafletPopupStyles()
    setIsClient(true)
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

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const focusShelterOnMap = useCallback(
    (shelter: NearbyResultShelter) => {
      setSelectedShelter(shelter.id)
      if (shelter.location && mapRef.current) {
        mapRef.current.setView([shelter.location.coordinates[1], shelter.location.coordinates[0]], 16)
      }
    },
    [],
  )

  const handleShelterCardKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, shelter: NearbyResultShelter) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      focusShelterOnMap(shelter)
    },
    [focusShelterOnMap],
  )

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      try {
        setIsLoading(true)
        setLoadError(null)

        const [rawSheltersData, anvendelseskoderData, kommunekoderData] = await Promise.all([
          fetchAppV2GroupedShelters(lat, lng, eligibility),
          getAnvendelseskoder(),
          getKommunekoder()
        ])
        const sheltersData: NearbyResultShelter[] = rawSheltersData

        if (isMounted) {
          setShelters(sheltersData)
          setAnvendelseskoder(anvendelseskoderData)
          setKommunekoder(kommunekoderData)
        }
      } catch (error) {
        if (isMounted) {
          setShelters([])
          setAnvendelseskoder([])
          setKommunekoder([])
          setLoadError('Vi kunne ikke hente beskyttelsesrum lige nu. Prøv igen om lidt.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [lat, lng, eligibility])

  if (isNaN(lat) || isNaN(lng)) {
    return (
      <main id="main-content" tabIndex={-1} className="min-h-screen bg-[var(--surface-page)] text-white">
        <div className="mx-auto max-w-7xl p-4">
          <h1 className="mb-3 text-2xl font-bold sm:text-3xl">Ugyldig position</h1>
          <p className="mb-6 max-w-xl text-gray-400">
            Koordinaterne kunne ikke læses. Gå tilbage til forsiden og søg igen, eller brug din placering.
          </p>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            Til forsiden
          </Link>
        </div>
      </main>
    )
  }

  // Legacy nearby compare path removed (Sprint 4d).

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[var(--surface-page)] text-white">
      <div className="max-w-7xl mx-auto p-4">
        <div className="mb-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="-ml-2 touch-target rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
              aria-label="Tilbage til forsiden"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold sm:text-2xl">Nærmeste beskyttelsesrum</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400 sm:text-base">
            Listen starter med det nærmeste. Vælg et beskyttelsesrum for detaljer eller navigation.
          </p>
        </div>

        {/* Back to top button */}
        <button
          type="button"
          onClick={handleBackToTop}
          className="fixed z-50 rounded-full bg-orange-500/90 p-3 text-white shadow-lg transition-all duration-300 hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 motion-safe:hover:scale-110 md:hidden"
          style={{
            bottom: 'max(5.5rem, calc(env(safe-area-inset-bottom, 0px) + 4.5rem))',
            right: 'max(1rem, env(safe-area-inset-right, 0px))',
          }}
          aria-label="Tilbage til toppen"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
          <section className="order-1 space-y-4 lg:order-1" aria-labelledby="nearby-results-heading">
            <h2 id="nearby-results-heading" className="sr-only">
              Resultater sorteret efter afstand
            </h2>
            {loadError ? (
              <div className="rounded-lg bg-[var(--surface-row-hover)] p-4 sm:p-5" role="alert">
                <p className="text-gray-200">{loadError}</p>
                <p className="mt-2 text-sm text-gray-400">Du kan prøve igen eller gå til forsiden.</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
                  >
                    Genindlæs siden
                  </button>
                  <Link
                    href="/"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15"
                  >
                    Til forsiden
                  </Link>
                  <Link
                    href="/kommune"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    Kommuneoversigt
                  </Link>
                </div>
              </div>
            ) : isLoading ? (
              <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
                <p className="text-sm text-gray-400">Henter beskyttelsesrum …</p>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-36 animate-pulse rounded-lg border border-white/5 bg-white/[0.06] motion-reduce:animate-none sm:h-40"
                    aria-hidden
                  />
                ))}
              </div>
            ) : shelters.length === 0 ? (
              <div className="bg-[var(--surface-row-hover)] rounded-lg p-4" role="status" aria-live="polite">
                <p className="text-lg font-semibold text-white">Ingen beskyttelsesrum i resultatet</p>
                <p className="mt-2 text-gray-300">
                  Prøv en anden adresse eller din placering igen. Du kan også gennemse pr. kommune. Følg altid myndighedernes
                  anvisninger.
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Link
                    href="/"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
                  >
                    Søg igen
                  </Link>
                  <Link
                    href="/kommune"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    Kommuneoversigt
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <p id="nearby-results-tab-hint" className="sr-only">
                  Hvert resultat kan fokuseres med Tab for at vise stedet på kortet. Inde i hvert resultat findes links til
                  detaljeside og navigation.
                </p>
                <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                  {srMapSelection}
                </div>
                {shelters.map((shelter) => (
                <article
                  aria-describedby="nearby-results-tab-hint"
                  key={shelter.id}
                  ref={(el) => {
                    shelterRefs.current[shelter.id] = el
                  }}
                  tabIndex={0}
                  className={`group cursor-pointer rounded-lg border border-transparent bg-[var(--surface-row)] p-4 transition-colors duration-200 hover:bg-[var(--surface-row-active)] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] sm:p-5 ${
                    selectedShelter === shelter.id ? 'border-orange-500/40 bg-[var(--surface-row-active)] ring-1 ring-orange-500/40' : ''
                  } ${hoveredShelter === shelter.id ? 'ring-1 ring-orange-400/25' : ''}`}
                  onMouseEnter={() => setHoveredShelter(shelter.id)}
                  onMouseLeave={() => setHoveredShelter(null)}
                  onClick={() => focusShelterOnMap(shelter)}
                  onKeyDown={(e) => handleShelterCardKeyDown(e, shelter)}
                  aria-current={selectedShelter === shelter.id ? true : undefined}
                  aria-label={`${shelter.vejnavn} ${shelter.husnummer}, ${formatDistanceKm(shelter.distance)}. Tryk Enter for at vise på kortet.`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center bg-[var(--surface-row-hover)] text-orange-400/90 px-2 py-0.5 rounded-md text-sm font-medium border border-orange-500/10">
                          {formatDistanceKm(shelter.distance)}
                        </span>
                        {typeof shelter.shelter_count === 'number' ? (
                          <span className="text-xs sm:text-sm bg-white/5 text-gray-200 px-2 py-0.5 rounded border border-white/10">
                            {shelter.shelter_count === 1
                              ? '1 beskyttelsesrum på adressen'
                              : `${shelter.shelter_count} beskyttelsesrum på samme adresse`}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-2 truncate text-lg font-semibold text-white transition-colors group-hover:text-orange-400/90 sm:text-xl">
                        {shelter.vejnavn} {shelter.husnummer}
                      </h3>

                      <p className="mt-1 text-sm text-gray-300">
                        {shelter.postnummer} {shelter.city ?? getKommunenavn(shelter.kommunekode, kommunekoder)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="bg-[var(--surface-row-active)] p-3 sm:p-3.5 rounded-lg group-hover:bg-[var(--surface-row-hover)] transition-colors border border-white/5">
                      <div className="mb-1 text-sm text-gray-400">Registreret kapacitet</div>
                      <div className="text-white font-medium text-base sm:text-lg">
                        {typeof shelter.total_capacity === 'number'
                          ? shelter.total_capacity === 1
                            ? '1 registreret plads'
                            : `${shelter.total_capacity.toLocaleString('da-DK')} registrerede pladser`
                          : '—'}
                      </div>
                    </div>
                    <div className="bg-[var(--surface-row-active)] p-3 sm:p-3.5 rounded-lg group-hover:bg-[var(--surface-row-hover)] transition-colors border border-white/5">
                      <div className="mb-1 text-xs leading-snug text-gray-400 sm:text-sm">Bygningens anvendelse</div>
                      <div className="line-clamp-3 text-sm font-medium text-white sm:text-base">
                        {formatBygningensAnvendelse(shelter, anvendelseskoder) ?? '—'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-white/5 pt-4 sm:pt-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      {shelter.representativeSlug ? (
                        <Link
                          href={`/beskyttelsesrum/${shelter.representativeSlug}`}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[color:var(--accent)]/25 bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-row)]"
                        >
                          Se detaljer
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-400">Detaljeside er ikke tilgængelig</span>
                      )}

                      {getGoogleMapsRouteHref(shelter.location) ? (
                        <a
                          href={getGoogleMapsRouteHref(shelter.location)!}
                          target="_blank"
                          rel="noopener"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-white/5 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
                          aria-label="Åbn navigation"
                        >
                          Naviger
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
                ))}
              </>
            )}
          </section>

          <section
            className="order-2 lg:order-2"
            aria-label="Kort med din placering og nærmeste beskyttelsesrum. Markører er bedst med mus eller touch; brug resultatlisten med tastatur."
          >
            <p id="nearby-map-keyboard-hint" className="sr-only">
              Kortmarkører er ikke fuldt understøttet med tastatur. Brug resultatlisten til at vælge sted, åbne detaljer
              eller navigation.
            </p>
            <p className="mb-2 text-center text-xs leading-snug text-gray-500 lg:hidden">
              Kortet følger med, når du vælger et sted på listen. Knappen nederst til højre ruller tilbage til toppen.
            </p>
            <div
              className="relative h-[400px] min-h-[400px] lg:sticky lg:top-24 lg:z-10 lg:h-[min(600px,calc(100vh-8rem))] lg:min-h-[min(600px,calc(100vh-8rem))]"
              aria-describedby="nearby-map-keyboard-hint"
            >
            <div className="absolute inset-0 overflow-hidden rounded-lg border border-white/5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
              {isClient && (
                <MapContainer
                  center={[lat, lng]}
                  zoom={13}
                  style={{ width: '100%', height: '100%' }}
                  ref={mapRef}
                  zoomControl={true}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />

                  {/* User location marker */}
                  <Marker
                    position={[lat, lng]}
                    icon={userLocationIcon}
                  />

                  {/* Shelter markers */}
                  {shelters.map((shelter) => (
                    shelter.location && (
                      <Marker
                        key={shelter.id}
                        position={[shelter.location.coordinates[1], shelter.location.coordinates[0]]}
                        icon={hoveredShelter === shelter.id || selectedShelter === shelter.id ? hoveredShelterIcon : shelterIcon}
                        eventHandlers={{
                          click: () => {
                            setSelectedShelter(shelter.id)
                            setSrMapSelection(
                              `${shelter.vejnavn} ${shelter.husnummer} vist på kortet. Listen er scrollet til det valgte sted.`,
                            )
                            if (shelterRefs.current[shelter.id]) {
                              shelterRefs.current[shelter.id]?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'center'
                              })
                            }
                          }
                        }}
                      >
                        <Popup className="fb-popup">
                          <div
                            dangerouslySetInnerHTML={{
                              __html: buildLeafletPopupHtml({
                                title: `${shelter.vejnavn} ${shelter.husnummer}`.trim(),
                                usageLine: formatBygningensAnvendelse(shelter, anvendelseskoder) ?? '',
                                postalLine: `${shelter.postnummer} ${shelter.city ?? getKommunenavn(shelter.kommunekode, kommunekoder)}`.trim(),
                                capacity: typeof shelter.total_capacity === 'number' ? shelter.total_capacity : 0,
                                href: shelter.representativeSlug ? `/beskyttelsesrum/${shelter.representativeSlug}` : '#',
                              }),
                            }}
                          />
                        </Popup>
                      </Marker>
                    )
                  ))}

                  {/* Auto-fit bounds to all markers */}
                  <NearbyFitBounds userLocation={[lat, lng]} shelters={shelters} />
                </MapContainer>
              )}
            </div>
            </div>
          </section>
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-3xl px-4 text-center text-xs text-gray-500 sm:text-sm">
        Bygger på offentlige registerdata. Følg altid myndighedernes anvisninger.
      </p>

      <GlobalFooter />
    </main>
  )
}
