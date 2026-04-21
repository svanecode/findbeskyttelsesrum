'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import type { AppV2MunicipalityShelterGroup } from '@/lib/supabase/app-v2-queries'

interface Props {
  groups: AppV2MunicipalityShelterGroup[]
  selectedGroupKey: string | null
  onSelectGroup: (groupKey: string) => void
  municipalityName: string
}

export default function KommuneShelterList({
  groups,
  selectedGroupKey,
  onSelectGroup,
  municipalityName,
}: Props) {
  const selectedRef = useRef<HTMLLIElement | null>(null)

  // Scroll selected item into view when it changes via marker click
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedGroupKey])

  if (groups.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-400">
        Ingen registrerede beskyttelsesrum fundet i {municipalityName}.
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {groups.map((group) => {
        const isSelected = group.groupKey === selectedGroupKey
        return (
          <li
            key={group.groupKey}
            ref={isSelected ? selectedRef : null}
          >
            <button
              type="button"
              onClick={() => onSelectGroup(group.groupKey)}
              className={[
                'w-full rounded-xl border px-4 py-3 text-left transition-all duration-150',
                'bg-white/5 backdrop-blur-sm',
                isSelected
                  ? 'border-orange-500/60 ring-1 ring-orange-500/40 bg-orange-500/10'
                  : 'border-white/10 hover:border-white/20 hover:bg-white/10',
              ].join(' ')}
              aria-pressed={isSelected}
              aria-label={`Vælg ${group.addressLine1}, ${group.postalCode} ${group.city}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{group.addressLine1}</p>
                  <p className="text-sm text-gray-400">
                    {group.postalCode} {group.city}
                  </p>
                  {group.applicationCodeLabel && (
                    <p className="mt-0.5 text-xs text-gray-500">{group.applicationCodeLabel}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular-nums text-orange-400">
                    {group.totalCapacity.toLocaleString('da-DK')} pladser
                  </span>
                  {group.shelterCount > 1 && (
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium text-gray-300">
                      {group.shelterCount} registreringer
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2 flex justify-end">
                <Link
                  href={`/beskyttelsesrum/${group.primarySlug}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                  aria-label={`Se detaljer for ${group.addressLine1}`}
                >
                  Se detaljer →
                </Link>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
