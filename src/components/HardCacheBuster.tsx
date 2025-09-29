'use client'

import { useEffect } from 'react'
import { APP_VERSION } from '@/lib/constants'

export default function HardCacheBuster() {
  useEffect(() => {
    // Only run in production
    if (process.env.NODE_ENV !== 'production') return

    const currentVersion = APP_VERSION
    const storedVersion = localStorage.getItem('app-version')
    // Only bust when the deployed app version changes.
    const shouldBust = !storedVersion || storedVersion !== currentVersion

    if (shouldBust) {
      console.log('Hard cache bust triggered', {
        reason: !storedVersion ? 'no version' : 'version change',
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

        // Always reload after cache clearing to ensure fresh content
        // Use a small delay to ensure cache clearing completes
        setTimeout(() => {
          window.location.reload()
        }, 100)
      } catch (error) {
        console.error('Cache bust failed:', error)
      }
    }
  }, [])

  return null
}