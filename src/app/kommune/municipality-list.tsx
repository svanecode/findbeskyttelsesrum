'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import type { AppV2MunicipalitySummary } from '@/lib/supabase/app-v2-queries'
import { ui } from '@/components/ui-classes'

export default function MunicipalityList({ municipalities }: { municipalities: AppV2MunicipalitySummary[] }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('da-DK')
    if (!normalized) return municipalities
    return municipalities.filter((municipality) => municipality.name.toLocaleLowerCase('da-DK').includes(normalized))
  }, [municipalities, query])

  return (
    <section aria-labelledby="municipality-overview-heading">
      <h2 id="municipality-overview-heading" className="sr-only">Kommuner</h2>
      <label htmlFor="municipality-search" className="block text-base font-medium text-gray-100">Søg efter kommune</label>
      <input
        id="municipality-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className={`mt-2 max-w-md ${ui.input}`}
        placeholder="Fx København"
      />
      <p className="mt-2 text-sm text-gray-400" role="status" aria-live="polite">
        {filtered.length.toLocaleString('da-DK')} {filtered.length === 1 ? 'kommune' : 'kommuner'}
      </p>

      {filtered.length === 0 ? (
        <div className="mt-4">
          <p className="text-gray-300">Ingen kommuner matcher din søgning.</p>
          <button type="button" onClick={() => setQuery('')} className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-white underline underline-offset-4">Ryd søgningen</button>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
          {filtered.map((municipality) => (
            <li key={municipality.id} className="[content-visibility:auto] [contain-intrinsic-size:0_56px]">
              <Link
                href={`/kommune/${municipality.slug}`}
                prefetch={false}
                className="flex min-h-[56px] min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 hover:bg-white/[0.04]"
              >
                <span className="break-safe font-medium text-white underline decoration-white/30 underline-offset-4">{municipality.name}</span>
                <span className="text-sm text-gray-400">
                  {municipality.activeShelterCount.toLocaleString('da-DK')} {municipality.activeShelterCount === 1 ? 'registrering' : 'registreringer'} · {municipality.activeShelterTotalCapacity.toLocaleString('da-DK')} pladser
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
