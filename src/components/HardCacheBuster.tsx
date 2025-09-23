'use client'

import { useEffect } from 'react'
import { APP_VERSION } from '@/lib/constants'

export default function HardCacheBuster() {
  useEffect(() => {
    // Only run in production
    if (process.env.NODE_ENV !== 'production') return

    const currentVersion = APP_VERSION
    const storedVersion = localStorage.getItem('app-version')
    const lastCacheBust = localStorage.getItem('last-cache-bust')
    const now = Date.now()

    // Force cache bust on version change or if it's been more than 1 hour
    const shouldBust = !storedVersion ||
                      storedVersion !== currentVersion ||
                      !lastCacheBust ||
                      (now - parseInt(lastCacheBust)) > 3600000 // 1 hour

    if (shouldBust) {
      console.log('Hard cache bust triggered', {
        reason: !storedVersion ? 'no version' :
               storedVersion !== currentVersion ? 'version change' : 'time expired',
        oldVersion: storedVersion,
        newVersion: currentVersion
      })

      // Clear everything aggressively
      try {
        // Clear service workers
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(registration => registration.unregister())
          })
        }

        // Clear cache storage
        if ('caches' in window) {
          caches.keys().then(cacheNames => {
            cacheNames.forEach(cacheName => caches.delete(cacheName))
          })
        }

        // Update version tracking
        localStorage.setItem('app-version', currentVersion)
        localStorage.setItem('last-cache-bust', now.toString())

        // Only reload if version changed (not on time-based bust)
        if (storedVersion && storedVersion !== currentVersion) {
          // Add timestamp to URL to force fresh fetch
          const url = new URL(window.location.href)
          url.searchParams.set('_cb', now.toString())
          window.location.href = url.toString()
        }
      } catch (error) {
        console.error('Cache bust failed:', error)
      }
    } else if (!lastCacheBust) {
      // First visit - just set the timestamp
      localStorage.setItem('last-cache-bust', now.toString())
    }
  }, [])

  return null
}