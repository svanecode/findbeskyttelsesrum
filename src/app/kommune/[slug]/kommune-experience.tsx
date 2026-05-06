'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { AppV2MunicipalityShelterGroup } from '@/lib/supabase/app-v2-queries'

const KommuneMap = dynamic(() => import('./kommune-map'), { ssr: false })

interface Props {
  groups: AppV2MunicipalityShelterGroup[]
  municipalityName: string
}

export default function KommuneExperience({ groups, municipalityName }: Props) {
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)

  return (
    <div>
      <div className="h-[70vh] lg:sticky lg:top-6 lg:h-[calc(100vh-8rem)]">
        <KommuneMap
          groups={groups}
          selectedGroupKey={selectedGroupKey}
          onMarkerClick={(key) => {
            setSelectedGroupKey(key)
          }}
        />
      </div>
    </div>
  )
}
