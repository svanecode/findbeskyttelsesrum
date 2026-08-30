'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ui } from '@/components/ui-classes'
import { getMunicipalityPagePath } from '@/lib/municipalities/pagination'
import type { AppV2MunicipalityShelterGroup } from '@/lib/supabase/app-v2-queries'

const KommuneMap = dynamic(() => import('./kommune-map'), { ssr: false })

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
}

export default function KommuneExperience({
  groups,
  municipalityName,
  municipalitySlug,
  pagination,
}: Props) {
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [mapActivated, setMapActivated] = useState(false)
  const mapSectionRef = useRef<HTMLElement | null>(null)
  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('da-DK')
    if (!normalizedQuery) return groups
    return groups.filter((group) =>
      [group.addressLine1, group.postalCode, group.city, ...group.applicationCodeLabels]
        .join(' ')
        .toLocaleLowerCase('da-DK')
        .includes(normalizedQuery),
    )
  }, [groups, query])

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

  if (groups.length === 0) {
    return (
      <div className={`${ui.panel} p-6 sm:p-8`} role="status">
        <h2 className="text-xl font-semibold text-white">Ingen viste BBR-registreringer i {municipalityName}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-300">
          Der er ingen registreringer fra denne kommune i den offentlige oversigt lige nu. Det dokumenterer ikke, at
          kommunen er uden sikringsrum eller offentlige beskyttelsesrum.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/kommune" className={ui.primaryAction}>
            Se andre kommuner
          </Link>
          <Link href="/" className={ui.quietAction}>
            Søg efter en adresse
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section aria-labelledby="municipality-list-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="municipality-list-heading" className="text-xl font-semibold text-white">Adresser i {municipalityName}</h2>
          <a href="#municipality-map" onClick={() => setMapActivated(true)} className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-white underline-offset-4 hover:bg-white/10 hover:underline lg:hidden">
            Vis kort
          </a>
        </div>
        <label htmlFor="municipality-shelter-search" className="mt-4 block text-sm font-medium text-gray-200">
          Søg på denne side
        </label>
        <input
          id="municipality-shelter-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Adresse, postnummer eller by"
          className={`mt-2 ${ui.input}`}
        />
        <p className="mt-2 text-sm text-gray-400" role="status" aria-live="polite">
          {query.trim()
            ? `${filteredGroups.length.toLocaleString('da-DK')} ${filteredGroups.length === 1 ? 'adresse' : 'adresser'} på denne side`
            : pagination.totalItems === 0
              ? 'Ingen adresser'
              : `Viser adresse ${pagination.firstItemNumber.toLocaleString('da-DK')}–${pagination.lastItemNumber.toLocaleString('da-DK')} af ${pagination.totalItems.toLocaleString('da-DK')}`}
        </p>
        {pagination.totalPages > 1 ? (
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Søgningen og kortet omfatter adresserne på denne side. Brug sidelinkene for at se resten af kommunen.
          </p>
        ) : null}

        {filteredGroups.length === 0 ? (
          <div className={`mt-4 ${ui.panelInset} p-5`}>
            <p className="font-medium text-white">Ingen adresser matcher din søgning</p>
            <button type="button" onClick={() => setQuery('')} className="mt-3 inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-white underline underline-offset-4 hover:bg-white/10">
              Ryd søgningen
            </button>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {filteredGroups.map((group) => (
              <li
                id={`kommune-group-${group.primarySlug}`}
                key={group.groupKey}
                className={`rounded-xl border p-4 [content-visibility:auto] [contain-intrinsic-size:0_220px] ${selectedGroupKey === group.groupKey ? 'border-orange-400/60 bg-orange-500/10' : 'border-white/10 bg-[var(--surface-elevated)]'}`}
              >
                <div className="flex min-w-0 flex-col items-start gap-2 md:flex-row md:justify-between md:gap-3">
                  <div className="min-w-0">
                    <h3 className="break-safe font-semibold text-white">{group.addressLine1}</h3>
                    <p className="mt-1 text-sm text-gray-300">{group.postalCode} {group.city}</p>
                  </div>
                  {group.latitude != null && group.longitude != null ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMapActivated(true)
                        setSelectedGroupKey(group.groupKey)
                        if (window.matchMedia('(max-width: 1023px)').matches) {
                          document.getElementById('municipality-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      }}
                      className={`${ui.quietAction} shrink-0`}
                      aria-label={`Vis ${group.addressLine1} på kortet`}
                    >
                      Vis på kort
                    </button>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-gray-300">
                  {group.shelterCount === 1 ? '1 BBR-registrering' : `${group.shelterCount} BBR-registreringer`}
                  <span className="text-gray-400"> · </span>
                  {group.totalCapacity.toLocaleString('da-DK')} {group.totalCapacity === 1 ? 'registreret plads' : 'registrerede pladser'}
                </p>
                {group.applicationCodeLabels.length > 1 ? (
                  <details className="mt-2 text-sm text-gray-400">
                    <summary className="min-h-[44px] cursor-pointer py-2 font-medium text-gray-300">Flere registrerede bygningsanvendelser</summary>
                    <ul className="list-disc space-y-1 pl-5">
                      {group.applicationCodeLabels.map((label) => <li key={label}>{label}</li>)}
                    </ul>
                  </details>
                ) : group.applicationCodeLabel ? <p className="mt-1 text-sm text-gray-400">{group.applicationCodeLabel}</p> : null}
                <ul className="mt-3 space-y-2">
                  {group.shelters.map((shelter, index) => (
                    <li key={shelter.id}>
                      <Link
                        href={`/beskyttelsesrum/${shelter.slug}`}
                        className="flex min-h-[44px] min-w-0 items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-white transition-colors hover:bg-white/[0.08]"
                      >
                        <span>{group.shelters.length === 1 ? 'Se detaljer' : `Registrering ${index + 1}`}</span>
                        <span className="shrink-0 text-gray-300">{shelter.capacity.toLocaleString('da-DK')} {shelter.capacity === 1 ? 'plads' : 'pladser'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {pagination.totalPages > 1 ? (
          <nav className="mt-6 border-t border-white/10 pt-5" aria-label="Sider med adresser i kommunen">
            <p className="mb-3 text-sm text-gray-400">
              Side {pagination.currentPage.toLocaleString('da-DK')} af {pagination.totalPages.toLocaleString('da-DK')}
            </p>
            <div className="flex flex-wrap gap-2">
              {pagination.currentPage > 1 ? (
                <Link
                  href={getMunicipalityPagePath(municipalitySlug, pagination.currentPage - 1)}
                  prefetch={false}
                  className={ui.secondaryAction}
                  rel="prev"
                >
                  Forrige
                </Link>
              ) : null}
              {Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((page) => (
                <Link
                  key={page}
                  href={getMunicipalityPagePath(municipalitySlug, page)}
                  prefetch={false}
                  className={page === pagination.currentPage ? ui.primaryAction : ui.secondaryAction}
                  aria-current={page === pagination.currentPage ? 'page' : undefined}
                  aria-label={`Side ${page}`}
                >
                  {page}
                </Link>
              ))}
              {pagination.currentPage < pagination.totalPages ? (
                <Link
                  href={getMunicipalityPagePath(municipalitySlug, pagination.currentPage + 1)}
                  prefetch={false}
                  className={ui.secondaryAction}
                  rel="next"
                >
                  Næste
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </section>

      <section ref={mapSectionRef} id="municipality-map" className="h-[60vh] min-h-[420px] scroll-mt-24 lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]" aria-label={`Kort over BBR-registreringer af sikringsrumspladser i ${municipalityName}`}>
        {mapActivated ? (
          <KommuneMap
            groups={groups}
            selectedGroupKey={selectedGroupKey}
            onMarkerClick={(key) => {
              setSelectedGroupKey(key)
              const group = groups.find((item) => item.groupKey === key)
              if (group) {
                setQuery('')
                requestAnimationFrame(() => document.getElementById(`kommune-group-${group.primarySlug}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
              }
            }}
          />
        ) : (
          <div className={`flex h-full items-center justify-center p-6 text-center ${ui.panel}`} role="status">
            <div className="max-w-sm">
              <p className="text-sm leading-6 text-gray-300">Kortet indlæses først, når det nærmer sig skærmen.</p>
              <button type="button" onClick={() => setMapActivated(true)} className={`${ui.secondaryAction} mt-4`}>
                Indlæs kort
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
