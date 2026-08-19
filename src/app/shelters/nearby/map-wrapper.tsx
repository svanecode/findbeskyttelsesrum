'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import GlobalFooter from '@/components/GlobalFooter'
import { parseNearbySearchParams } from '@/lib/nearby/parse-nearby-search-params'
import {
  loadNearbySearchContext,
  saveNearbySearchContext,
  type NearbySearchContext,
} from '@/lib/nearby/search-context'

const ShelterMapClient = dynamic(
  () => import('./client'),
  {
    ssr: false,
    loading: () => <SearchLoading />,
  },
)

type SearchState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'ready'; context: NearbySearchContext }

function SearchLoading() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[var(--surface-page)] text-white">
      <div className="mx-auto max-w-7xl p-4" role="status" aria-live="polite">
        <div className="mb-6 h-9 w-64 max-w-[75%] animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-[420px] animate-pulse rounded-lg bg-white/5 motion-reduce:animate-none" />
          <div className="h-[420px] animate-pulse rounded-lg bg-white/5 motion-reduce:animate-none" />
        </div>
        <span className="sr-only">Henter din seneste søgning …</span>
      </div>
    </main>
  )
}

function SearchUnavailable({ invalid = false }: { invalid?: boolean }) {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[var(--surface-page)] text-white">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold sm:text-3xl">
          {invalid ? 'Søgningen kunne ikke åbnes' : 'Start en ny søgning'}
        </h1>
        <p className="mt-3 max-w-xl text-gray-300">
          {invalid
            ? 'Linket indeholder en ugyldig position. Start en ny søgning fra forsiden.'
            : 'Af hensyn til dit privatliv gemmes adresse og position ikke i linket. Start en ny søgning fra forsiden.'}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#0a0a0a] transition hover:bg-[var(--accent-hover)]"
        >
          Søg igen
        </Link>
      </div>
      <GlobalFooter />
    </main>
  )
}

function readInitialSearch(): SearchState {
  const url = new URL(window.location.href)
  const hasLegacyPosition = url.searchParams.has('lat') || url.searchParams.has('lng')

  if (url.search) {
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.hash}`)
  }

  if (hasLegacyPosition) {
    const parsed = parseNearbySearchParams({
      lat: url.searchParams.get('lat') ?? undefined,
      lng: url.searchParams.get('lng') ?? undefined,
    })

    if (parsed.kind !== 'ok') return { kind: 'invalid' }

    const label = url.searchParams.get('q')?.trim().slice(0, 120)
    const context: NearbySearchContext = {
      version: 1,
      latitude: Number(parsed.lat),
      longitude: Number(parsed.lng),
      ...(label ? { label } : {}),
      createdAt: Date.now(),
    }
    saveNearbySearchContext(context)
    return { kind: 'ready', context }
  }

  const context = loadNearbySearchContext()
  return context ? { kind: 'ready', context } : { kind: 'missing' }
}

export default function MapWrapper() {
  const [state, setState] = useState<SearchState>({ kind: 'loading' })

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setState(readInitialSearch()), 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  if (state.kind === 'loading') return <SearchLoading />
  if (state.kind === 'missing') return <SearchUnavailable />
  if (state.kind === 'invalid') return <SearchUnavailable invalid />

  return (
    <ShelterMapClient
      lat={state.context.latitude}
      lng={state.context.longitude}
      originLabel={state.context.label}
    />
  )
}
