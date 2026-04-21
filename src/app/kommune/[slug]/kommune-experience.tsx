'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import KommuneShelterList from './kommune-shelter-list'
import type { AppV2MunicipalityShelterGroup } from '@/lib/supabase/app-v2-queries'

const KommuneMap = dynamic(() => import('./kommune-map'), { ssr: false })

interface Props {
  groups: AppV2MunicipalityShelterGroup[]
  municipalityName: string
}

export default function KommuneExperience({ groups, municipalityName }: Props) {
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')

  return (
    <div>
      {/* Mobile view-toggle — hidden on lg+ */}
      <div className="mb-4 flex gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setViewMode('list')}
          className={[
            'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
            viewMode === 'list'
              ? 'bg-white text-black'
              : 'bg-white/10 text-white hover:bg-white/15',
          ].join(' ')}
        >
          Liste
        </button>
        <button
          type="button"
          onClick={() => setViewMode('map')}
          className={[
            'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
            viewMode === 'map'
              ? 'bg-white text-black'
              : 'bg-white/10 text-white hover:bg-white/15',
          ].join(' ')}
        >
          Kort
        </button>
      </div>

      {/* Split layout */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* List column */}
        <div className={viewMode === 'map' ? 'hidden lg:block' : ''}>
          <div className="max-h-[70vh] overflow-y-auto pr-1 lg:max-h-[calc(100vh-14rem)]">
            <KommuneShelterList
              groups={groups}
              selectedGroupKey={selectedGroupKey}
              onSelectGroup={(key) => {
                setSelectedGroupKey(key)
                // On mobile, switch to map when selecting from list
                // (only if already in list mode, don't force switch)
              }}
              municipalityName={municipalityName}
            />
          </div>
        </div>

        {/* Map column */}
        <div className={viewMode === 'list' ? 'hidden lg:block' : ''}>
          <div className="h-[70vh] lg:sticky lg:top-6 lg:h-[calc(100vh-8rem)]">
            <KommuneMap
              groups={groups}
              selectedGroupKey={selectedGroupKey}
              onMarkerClick={(key) => {
                setSelectedGroupKey(key)
                // On mobile, switch to list when marker clicked so user sees it highlighted
                setViewMode('list')
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
