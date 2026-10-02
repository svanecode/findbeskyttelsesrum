'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import Form from 'next/form'
import Link from 'next/link'
import { ui } from '@/components/ui-classes'
import { getMunicipalityPagePath, municipalityPageLinks } from '@/lib/municipalities/pagination'
import { getMunicipalitySearchPath, municipalitySearchMaxLength } from '@/lib/municipalities/search'
import type { AppV2MunicipalityShelterGroup } from '@/lib/supabase/app-v2-queries'
import { scrollBehavior } from '@/lib/ui/reduced-motion'
import { getReadableGroupPaths } from '@/lib/shelter-public-url'
import type { Route } from 'next'

const KommuneMap = dynamic(() => import('./kommune-map'), { ssr: false })

const subscribeToHydration = () => () => {}
const hydratedSnapshot = () => true
const serverHydratedSnapshot = () => false

interface Props {
  groups: AppV2MunicipalityShelterGroup[]
  municipalityName: string
  municipalitySlug: string
  pagination: {
    currentPage: number
    totalPages: number
    totalItems: number
    firstItemNumber: number
    lastItemNumber: number
  }
  /** The search the list was filtered by on the server, or "" for the whole municipality. */
  searchQuery: string
  hasAnyRegistrations: boolean
}

function formatPlaces(capacity: number) {
  return `${capacity.toLocaleString('da-DK')} ${capacity === 1 ? 'plads' : 'pladser'}`
}

export default function KommuneExperience({
  groups,
  municipalityName,
  municipalitySlug,
  pagination,
  searchQuery,
  hasAnyRegistrations,
}: Props) {
  const isHydrated = useSyncExternalStore(subscribeToHydration, hydratedSnapshot, serverHydratedSnapshot)
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [mapActivated, setMapActivated] = useState(false)
  const mapSectionRef = useRef<HTMLElement | null>(null)
  const pageHref = (page: number) => searchQuery
    ? getMunicipalitySearchPath(municipalitySlug, searchQuery, page)
    : getMunicipalityPagePath(municipalitySlug, page)
  const countLabel = pagination.totalItems === 0
    ? ''
    : pagination.totalPages > 1
      ? `${pagination.firstItemNumber.toLocaleString('da-DK')}–${pagination.lastItemNumber.toLocaleString('da-DK')} af ${pagination.totalItems.toLocaleString('da-DK')}`
      : `${pagination.totalItems.toLocaleString('da-DK')}`

  useEffect(() => {
    if (mapActivated) return
    const section = mapSectionRef.current
    if (!section || typeof IntersectionObserver === 'undefined') {
      const timer = window.setTimeout(() => setMapActivated(true), 0)
      return () => window.clearTimeout(timer)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setMapActivated(true)
        observer.disconnect()
      },
      { rootMargin: '240px' },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [mapActivated])

  if (!hasAnyRegistrations) {
    return (
      <div className="max-w-2xl" role="status">
        <h2 className="text-xl font-semibold text-white">Ingen viste BBR-registreringer i {municipalityName}</h2>
        <p className="mt-3 text-base leading-7 text-gray-300">
          Der er ingen registreringer fra denne kommune i den offentlige oversigt lige nu. Det dokumenterer ikke, at
          kommunen er uden sikringsrum eller offentlige beskyttelsesrum.
        </p>
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-base">
          <Link href="/kommune" className={ui.textLink}>Se andre kommuner</Link>
          <Link href="/" className={ui.textLink}>Søg på en adresse</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section aria-labelledby="municipality-list-heading">
        <Form action={`/kommune/${encodeURIComponent(municipalitySlug)}`} role="search" aria-label={`Søg i ${municipalityName}`}>
          <label htmlFor="municipality-shelter-search" className="block text-base font-medium text-gray-100">
            Søg i alle adresser i {municipalityName}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="municipality-shelter-search"
              name="q"
              type="search"
              enterKeyHint="search"
              defaultValue={searchQuery}
              key={searchQuery}
              maxLength={municipalitySearchMaxLength}
              placeholder="Vejnavn, postnummer eller by"
              className={`${ui.input} min-w-0 flex-1`}
            />
            <button type="submit" className={`${ui.secondaryAction} shrink-0 px-5`}>Søg</button>
          </div>
        </Form>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="municipality-list-heading" className="text-lg font-semibold text-white">
            {searchQuery ? <>Resultater for &quot;{searchQuery}&quot;</> : <>Adresser i {municipalityName}</>}
            {countLabel ? <span className="ml-2 text-base font-normal text-gray-400">{countLabel}</span> : null}
          </h2>
          {searchQuery ? (
            <Link href={getMunicipalityPagePath(municipalitySlug, 1)} className={`${ui.textLink} text-sm`}>Ryd søgning</Link>
          ) : (
            <a href="#municipality-map" onClick={() => setMapActivated(true)} className={`${ui.textLink} text-sm lg:hidden`}>
              Vis kort
            </a>
          )}
        </div>
        <p className="mt-1 text-sm leading-6 text-gray-400">
          Kun registreringer med mindst 40 pladser vises.{' '}
          <Link href="/om-data#hvilke-registreringer" className={ui.textLink}>Læs hvorfor</Link>
        </p>

        {groups.length === 0 ? (
          <div className="mt-6 border-t border-white/10 pt-5" role="status">
            <p className="text-base font-medium text-white">
              Ingen registreringer i {municipalityName} matcher &apos;{searchQuery}&apos;
            </p>
            <p className="mt-2 text-base leading-7 text-gray-300">
              Søg på adressen fra <Link href="/" className={ui.textLink}>forsiden</Link> for at se de nærmeste registreringer,
              eller <Link href={getMunicipalityPagePath(municipalitySlug, 1)} className={ui.textLink}>se alle adresser i {municipalityName}</Link>.
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {groups.map((group) => {
              const selected = selectedGroupKey === group.groupKey
              const extraRegistrations = group.shelters.filter((shelter) => shelter.slug !== group.primarySlug)
              const paths = getReadableGroupPaths(group, group.shelters)
              const pathOf = (slug: string) => (paths.get(slug) ?? `/beskyttelsesrum/${slug}`) as Route
              return (
                <li
                  id={`kommune-group-${group.primarySlug}`}
                  key={group.groupKey}
                  className={`flex min-w-0 items-start justify-between gap-3 py-3 [content-visibility:auto] [contain-intrinsic-size:0_88px] ${selected ? 'border-l-2 border-l-[var(--accent)] pl-3' : ''}`}
                >
                  <div className="min-w-0">
                    <Link href={pathOf(group.primarySlug)} className="break-safe text-base font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
                      {group.addressLine1}
                    </Link>
                    <p className="mt-0.5 text-sm text-gray-300">
                      {group.postalCode} {group.city}
                      <span className="text-gray-500"> · </span>
                      {formatPlaces(group.totalCapacity)}
                    </p>
                    {group.applicationCodeLabel ? <p className="text-sm text-gray-400">{group.applicationCodeLabel}</p> : null}
                    {extraRegistrations.length > 0 ? (
                      <p className="text-sm text-gray-400">
                        {group.shelterCount} registreringer på adressen:{' '}
                        {group.shelters.map((shelter, index) => (
                          <span key={shelter.id}>
                            {index > 0 ? ', ' : ''}
                            <Link href={pathOf(shelter.slug)} className="underline underline-offset-4 hover:text-white">
                              {formatPlaces(shelter.capacity)}
                            </Link>
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </div>
                  {group.latitude != null && group.longitude != null ? (
                    <button
                      type="button"
                      disabled={!isHydrated}
                      onClick={() => {
                        setMapActivated(true)
                        setSelectedGroupKey(group.groupKey)
                        if (window.matchMedia('(max-width: 1023px)').matches) {
                          document.getElementById('municipality-map')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
                        }
                      }}
                      className={`${ui.quietAction} shrink-0 disabled:cursor-wait disabled:opacity-60`}
                      aria-label={`Vis ${group.addressLine1} på kortet`}
                    >
                      Vis på kort
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        {pagination.totalPages > 1 ? (
          <nav className="mt-6" aria-label={searchQuery ? 'Sider med søgeresultater' : 'Sider med adresser i kommunen'}>
            <p className="mb-3 text-sm text-gray-400">
              Side {pagination.currentPage.toLocaleString('da-DK')} af {pagination.totalPages.toLocaleString('da-DK')}
            </p>
            <div className="flex flex-wrap gap-2">
              {pagination.currentPage > 1 ? (
                <Link href={pageHref(pagination.currentPage - 1)} prefetch={false} className={ui.secondaryAction} rel="prev">
                  Forrige
                </Link>
              ) : null}
              {municipalityPageLinks(pagination.currentPage, pagination.totalPages).map((page, index) => page === 'gap' ? (
                <span key={`gap-${index}`} className="inline-flex min-h-[44px] items-center px-1 text-gray-400" aria-hidden>
                  …
                </span>
              ) : (
                <Link
                  key={page}
                  href={pageHref(page)}
                  prefetch={false}
                  className={page === pagination.currentPage ? `${ui.secondaryAction} border-white/60 bg-white/[0.12]` : ui.secondaryAction}
                  aria-current={page === pagination.currentPage ? 'page' : undefined}
                  aria-label={`Side ${page}`}
                >
                  {page}
                </Link>
              ))}
              {pagination.currentPage < pagination.totalPages ? (
                <Link href={pageHref(pagination.currentPage + 1)} prefetch={false} className={ui.secondaryAction} rel="next">
                  Næste
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </section>

      {groups.length > 0 ? (
        <section
          ref={mapSectionRef}
          id="municipality-map"
          className="scroll-mt-24 lg:sticky lg:top-24"
          aria-labelledby="municipality-map-heading"
        >
          <h2 id="municipality-map-heading" className="mb-2 text-sm text-gray-300">
            Kortet viser {pagination.totalPages > 1 ? `adresse ${countLabel}` : 'adresserne'} fra listen{searchQuery ? ' med søgeresultater' : ''}.
          </h2>
          <div className="h-[60vh] min-h-[420px] lg:h-[calc(100vh-10rem)]">
            {mapActivated ? (
              <KommuneMap
                groups={groups}
                selectedGroupKey={selectedGroupKey}
                onMarkerClick={(key) => {
                  setSelectedGroupKey(key)
                  const group = groups.find((item) => item.groupKey === key)
                  if (group) {
                    requestAnimationFrame(() => document.getElementById(`kommune-group-${group.primarySlug}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }))
                  }
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-white/10 p-6 text-center" role="status">
                <div className="max-w-sm">
                  <p className="text-sm leading-6 text-gray-300">Kortet indlæses først, når det nærmer sig skærmen.</p>
                  <button type="button" disabled={!isHydrated} onClick={() => setMapActivated(true)} className={`${ui.secondaryAction} mt-4 disabled:cursor-wait disabled:opacity-60`}>
                    Indlæs kort
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
