'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import type { AppV2MunicipalitySummary } from '@/lib/supabase/app-v2-queries'
import { ui } from '@/components/ui-classes'

const pageSize = 25

export default function MunicipalityList({ municipalities }: { municipalities: AppV2MunicipalitySummary[] }) {
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('da-DK')
    if (!normalized) return municipalities
    return municipalities.filter((municipality) => municipality.name.toLocaleLowerCase('da-DK').includes(normalized))
  }, [municipalities, query])
  const visible = filtered.slice(0, visibleCount)

  return (
    <section className={`${ui.panel} overflow-hidden`} aria-labelledby="municipality-overview-heading">
      <div className="border-b border-white/10 px-5 py-4 sm:px-6">
        <h2 id="municipality-overview-heading" className="text-lg font-semibold text-white">Find kommune</h2>
        <label htmlFor="municipality-search" className="mt-4 block text-sm font-medium text-gray-200">Søg efter kommune</label>
        <input
          id="municipality-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setVisibleCount(pageSize)
          }}
          className={`mt-2 ${ui.input}`}
          placeholder="Eksempelvis København"
        />
        <p className="mt-2 text-sm text-gray-400" role="status" aria-live="polite">
          {filtered.length.toLocaleString('da-DK')} {filtered.length === 1 ? 'kommune' : 'kommuner'}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-6 sm:px-6">
          <p className="text-gray-300">Ingen kommuner matcher din søgning.</p>
          <button type="button" onClick={() => setQuery('')} className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-white underline underline-offset-4">Ryd søgningen</button>
        </div>
      ) : (
        <ul className="divide-y divide-white/10">
          {visible.map((municipality) => (
            <li key={municipality.id} className="[content-visibility:auto] [contain-intrinsic-size:0_80px]">
              <Link
                href={`/kommune/${municipality.slug}`}
                prefetch={false}
                className="flex min-h-[64px] min-w-0 flex-col gap-2 px-5 py-4 transition-colors hover:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between sm:px-6"
                aria-label={`${municipality.name}, ${municipality.activeShelterCount.toLocaleString('da-DK')} BBR-registreringer, ${municipality.activeShelterTotalCapacity.toLocaleString('da-DK')} BBR-registrerede pladser`}
              >
                <span className="break-safe font-medium text-white">{municipality.name}</span>
                <span className="flex min-w-0 flex-col gap-1 text-sm tabular-nums text-gray-300 sm:items-end">
                  <span>{municipality.activeShelterCount.toLocaleString('da-DK')} BBR-registreringer · {municipality.activeShelterTotalCapacity.toLocaleString('da-DK')} pladser</span>
                  <span className="font-medium text-white">Se kommune</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {visible.length < filtered.length ? (
        <div className="border-t border-white/10 p-4 sm:px-6">
          <button type="button" onClick={() => setVisibleCount((count) => count + pageSize)} className={`${ui.secondaryAction} min-h-[48px] w-full`}>
            Vis flere kommuner
          </button>
        </div>
      ) : null}
    </section>
  )
}
