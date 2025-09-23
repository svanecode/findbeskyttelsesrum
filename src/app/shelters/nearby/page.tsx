'use client'

import { Suspense } from 'react'
import NearbyWrapper from './nearby-wrapper'
import { MapErrorBoundary } from '@/components/MapErrorBoundary'

export default function Page() {
  return (
    <MapErrorBoundary>
      <Suspense fallback={
        <main className="min-h-screen bg-[#1a1a1a] text-white">
          <div className="max-w-7xl mx-auto p-4">
            <div className="flex items-center justify-center h-[200px]">
              <div className="animate-pulse flex flex-col items-center space-y-4">
                <div className="w-12 h-12 bg-orange-500/20 rounded-full"></div>
                <div className="w-48 h-4 bg-orange-500/20 rounded"></div>
                <div className="text-gray-400 text-sm">Indlæser side...</div>
              </div>
            </div>
          </div>
        </main>
      }>
        <NearbyWrapper />
      </Suspense>
    </MapErrorBoundary>
  )
} 