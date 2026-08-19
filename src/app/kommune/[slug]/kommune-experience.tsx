'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { AppV2MunicipalityShelterGroup } from '@/lib/supabase/app-v2-queries'

const KommuneMap = dynamic(() => import('./kommune-map'), { ssr: false })

interface Props {
  groups: AppV2MunicipalityShelterGroup[]
  municipalityName: string
}

export default function KommuneExperience({ groups, municipalityName }: Props) {
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(30)
  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('da-DK')
    if (!normalizedQuery) return groups
    return groups.filter((group) =>
      [group.addressLine1, group.postalCode, group.city, group.applicationCodeLabel ?? '']
        .join(' ')
        .toLocaleLowerCase('da-DK')
        .includes(normalizedQuery),
    )
  }, [groups, query])
  const visibleGroups = filteredGroups.slice(0, visibleCount)

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 sm:p-8" role="status">
        <h2 className="text-xl font-semibold text-white">Ingen viste BBR-registreringer i {municipalityName}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-300">
          Der er ingen registreringer fra denne kommune i den offentlige oversigt lige nu. Det dokumenterer ikke, at
          kommunen er uden sikringsrum eller offentlige beskyttelsesrum.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/kommune" className="inline-flex min-h-[44px] items-center rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-gray-200">
            Se andre kommuner
          </Link>
          <Link href="/" className="inline-flex min-h-[44px] items-center rounded-lg px-4 py-3 text-sm font-semibold text-white hover:bg-white/10">
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
          <a href="#municipality-map" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-white underline-offset-4 hover:bg-white/10 hover:underline lg:hidden">
            Vis kort
          </a>
        </div>
        <label htmlFor="municipality-shelter-search" className="mt-4 block text-sm font-medium text-gray-200">
          Søg i kommunen
        </label>
        <input
          id="municipality-shelter-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setVisibleCount(30)
          }}
          placeholder="Adresse, postnummer eller by"
          className="mt-2 min-h-[48px] w-full rounded-lg border border-white/15 bg-white/5 px-4 text-base text-white placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/30"
        />
        <p className="mt-2 text-sm text-gray-400" role="status" aria-live="polite">
          {filteredGroups.length.toLocaleString('da-DK')} {filteredGroups.length === 1 ? 'adresse' : 'adresser'}
        </p>

        {filteredGroups.length === 0 ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-5">
            <p className="font-medium text-white">Ingen adresser matcher din søgning</p>
            <button type="button" onClick={() => setQuery('')} className="mt-3 inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-white underline underline-offset-4 hover:bg-white/10">
              Ryd søgningen
            </button>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {visibleGroups.map((group) => (
              <li
                id={`kommune-group-${group.primarySlug}`}
                key={group.groupKey}
                className={`rounded-lg border p-4 [content-visibility:auto] [contain-intrinsic-size:0_220px] ${selectedGroupKey === group.groupKey ? 'border-orange-400/60 bg-orange-500/10' : 'border-white/10 bg-white/5'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{group.addressLine1}</h3>
                    <p className="mt-1 text-sm text-gray-300">{group.postalCode} {group.city}</p>
                  </div>
                  {group.latitude != null && group.longitude != null ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroupKey(group.groupKey)
                        if (window.matchMedia('(max-width: 1023px)').matches) {
                          document.getElementById('municipality-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      }}
                      className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg px-3 text-sm font-medium text-white hover:bg-white/10"
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
                {group.applicationCodeLabel ? <p className="mt-1 text-sm text-gray-400">{group.applicationCodeLabel}</p> : null}
                <ul className="mt-3 space-y-2">
                  {group.shelters.map((shelter, index) => (
                    <li key={shelter.id}>
                      <Link
                        href={`/beskyttelsesrum/${shelter.slug}`}
                        className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
                      >
                        <span>{group.shelters.length === 1 ? 'Se detaljer' : `Registrering ${index + 1}`}</span>
                        <span className="text-gray-300">{shelter.capacity.toLocaleString('da-DK')} {shelter.capacity === 1 ? 'plads' : 'pladser'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {visibleGroups.length < filteredGroups.length ? (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + 30)}
            className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
          >
            Vis flere adresser
          </button>
        ) : null}
      </section>

      <section id="municipality-map" className="h-[60vh] min-h-[420px] scroll-mt-24 lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]" aria-label={`Kort over BBR-registreringer af sikringsrumspladser i ${municipalityName}`}>
        <KommuneMap
          groups={groups}
          selectedGroupKey={selectedGroupKey}
          onMarkerClick={(key) => {
            setSelectedGroupKey(key)
            const group = groups.find((item) => item.groupKey === key)
            if (group) {
              const groupIndex = groups.findIndex((item) => item.groupKey === key)
              setQuery('')
              setVisibleCount(Math.max(30, groupIndex + 1))
              requestAnimationFrame(() => document.getElementById(`kommune-group-${group.primarySlug}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
            }
          }}
        />
      </section>
    </div>
  )
}
