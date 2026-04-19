'use client'

import { useEffect, useState } from 'react'
import ShelterCounter from '@/components/ShelterCounter'
import GlobalFooter from '@/components/GlobalFooter'
import Link from 'next/link'
import AddressSearchDAWA from '@/components/AddressSearchDAWA'
import { APP_VERSION } from '@/lib/constants'

export default function Home() {
  const [shelterCount, setShelterCount] = useState<number | null>(null)

  useEffect(() => {
    // Fetch actual shelter count from database
    async function fetchShelterCount() {
      try {
        const response = await fetch('/api/shelter-count')
        if (response.ok) {
          const data = await response.json()
          // Only use the count if it's a valid positive number
          const count = typeof data.count === 'number' ? data.count : null
          if (count !== null && count > 0) {
            setShelterCount(count)
          } else {
            console.warn('Invalid shelter count from API:', data.count)
            setShelterCount(null)
          }
        } else {
          console.error('Failed to fetch shelter count')
          setShelterCount(null)
        }
      } catch (error) {
        console.error('Error fetching shelter count:', error)
        setShelterCount(null)
      }
    }

    fetchShelterCount()
  }, [])

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 lg:p-8 flex flex-col justify-center items-center relative">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>
      
      <div className="max-w-2xl mx-auto flex-1 w-full px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col justify-center">
        <div className="text-center mb-8 sm:mb-12 lg:mb-16">
          <h1 className="text-heading-lg sm:text-heading-xl mb-4 sm:mb-6 lg:mb-8 text-white">
            Find Beskyttelsesrum
          </h1>
          <p className="text-body-lg sm:text-xl text-[#E5E7EB] mb-8 sm:mb-10 lg:mb-12 max-w-lg mx-auto">
            Find det nærmeste beskyttelsesrum i dit område
          </p>
          <div className="text-center mt-6 sm:mt-8 lg:mt-10">
            <ShelterCounter 
              targetNumber={shelterCount} 
              version={APP_VERSION} 
            />
          </div>
        </div>
        
        <div className="glass-effect p-6 sm:p-8 lg:p-10 rounded-2xl shadow-2xl backdrop-blur-md bg-white/10 border border-white/10 relative overflow-visible card-interactive">
          <div className="space-y-8 sm:space-y-6 lg:space-y-8 relative z-20">
            <div suppressHydrationWarning className="relative z-20">
              <AddressSearchDAWA key="dawa-v2" />
            </div>
            
            <div className="text-center mt-12 sm:mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/land"
                className="inline-flex items-center rounded-lg px-4 py-3 text-body-sm font-medium bg-white text-black hover:bg-gray-200 transition-all duration-200 group touch-target focus-visible btn-interactive sm:px-6 sm:text-body-md"
                aria-label="Se samlet indgang til beskyttelsesrum i Danmark"
              >
                <span>Hele landet</span>
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5 ml-2 transform group-hover:translate-x-1 transition-transform duration-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/kommune"
                className="inline-flex items-center rounded-lg px-4 py-3 text-body-sm font-medium bg-white/5 hover:bg-white/10 text-white transition-all duration-200 group touch-target focus-visible btn-interactive sm:px-6 sm:text-body-md"
                aria-label="Se oversigt over kommuner med registrerede beskyttelsesrum"
              >
                <span>Se kommuner</span>
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5 ml-2 transform group-hover:translate-x-1 transition-transform duration-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/om-data"
                className="inline-flex items-center rounded-lg px-4 py-3 text-body-sm font-medium bg-white/5 hover:bg-white/10 text-white transition-all duration-200 group touch-target focus-visible btn-interactive sm:px-6 sm:text-body-md"
                aria-label="Læs mere om data og kilder til beskyttelsesrum"
              >
                <span>Om data</span>
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5 ml-2 transform group-hover:translate-x-1 transition-transform duration-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <GlobalFooter />
    </main>
  )
}
