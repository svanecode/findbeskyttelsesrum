'use client'

import { useEffect } from 'react'
import ShelterCounter from '@/components/ShelterCounter'
import GlobalFooter from '@/components/GlobalFooter'
import Link from 'next/link'
import AddressSearchDAWA from '@/components/AddressSearchDAWA'
import { APP_VERSION } from '@/lib/constants'

export default function Home() {
  useEffect(() => {
    // Aggressive cache busting for production deployments
    const currentVersion = APP_VERSION
    const storedVersion = localStorage.getItem('app-version')
    const isReloading = sessionStorage.getItem('version-update-in-progress')

    // Prevent infinite loops - check if we're already in a reload cycle
    if (isReloading) {
      sessionStorage.removeItem('version-update-in-progress')
      return
    }

    // Force immediate cache check
    const versionCheckTimer = setTimeout(() => {
      if (storedVersion !== currentVersion && !isReloading) {
        if (process.env.NODE_ENV === 'development') {
          console.log('New version detected, forcing hard refresh')
        }

        // Mark that we're starting the update process
        sessionStorage.setItem('version-update-in-progress', 'true')

        // Set the new version immediately to prevent loops
        localStorage.setItem('app-version', currentVersion)

        // Aggressive cache clearing and hard reload
        const hardCacheBust = async () => {
          try {
            // Clear service worker cache
            if ('serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations()
              await Promise.all(registrations.map(reg => reg.unregister()))
            }

            // Clear all cache storage
            if ('caches' in window) {
              const cacheNames = await caches.keys()
              await Promise.all(cacheNames.map(name => caches.delete(name)))
            }

            // Clear localStorage and sessionStorage
            localStorage.clear()
            sessionStorage.clear()

            // Force hard reload with cache bypass
            window.location.href = window.location.href + '?v=' + Date.now()
          } catch (error) {
            // Fallback: force hard reload anyway
            if (process.env.NODE_ENV === 'development') {
              console.error('Cache clearing failed, forcing hard reload anyway:', error)
            }
            window.location.href = window.location.href + '?v=' + Date.now()
          }
        }

        hardCacheBust()
      } else if (!storedVersion) {
        // First visit - store the version
        localStorage.setItem('app-version', currentVersion)
      }
    }, 500) // Shorter delay for faster detection

    return () => clearTimeout(versionCheckTimer)
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
            <ShelterCounter targetNumber={3435834} version={APP_VERSION} />
          </div>
        </div>
        
        <div className="glass-effect p-6 sm:p-8 lg:p-10 rounded-2xl shadow-2xl backdrop-blur-md bg-white/10 border border-white/10 relative overflow-visible card-interactive">
          <div className="space-y-8 sm:space-y-6 lg:space-y-8 relative z-20">
            <div suppressHydrationWarning className="relative z-20">
              <AddressSearchDAWA key="dawa-v2" />
            </div>
            
            <div className="text-center mt-12 sm:mt-10">
              <Link
                href="/tell-me-more"
                className="inline-flex items-center px-4 sm:px-6 py-3 rounded-full text-body-sm sm:text-body-md font-medium bg-white/5 hover:bg-white/10 text-white transition-all duration-200 group touch-target focus-visible btn-interactive"
                aria-label="Læs mere om data og kilder til beskyttelsesrum"
              >
                <span>Læs mere om data</span>
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
