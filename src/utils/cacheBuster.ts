'use client'

interface CacheBusterConfig {
  includeTimestamp?: boolean
  includeVersion?: boolean
  includeRandom?: boolean
  customParams?: Record<string, string>
}

export function createCacheBuster(config: CacheBusterConfig = {}) {
  const {
    includeTimestamp = true,
    includeVersion = true,
    includeRandom = true, // Always include random for aggressive busting
    customParams = {}
  } = config

  const params = new URLSearchParams()

  if (includeTimestamp) {
    // Use high precision timestamp
    params.set('t', Date.now().toString())
    params.set('ts', performance.now().toString())
  }

  if (includeVersion) {
    const version = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 
                   process.env.NEXT_PUBLIC_APP_VERSION || 
                   'dev'
    params.set('v', version)
  }

  if (includeRandom) {
    // Multiple random values for maximum busting
    params.set('r', Math.random().toString(36).substring(2, 15))
    params.set('r2', Math.random().toString(36).substring(2, 15))
    params.set('r3', Math.random().toString(36).substring(2, 15))
  }

  // Add session-based cache buster
  params.set('s', getSessionId())

  // Add custom parameters
  Object.entries(customParams).forEach(([key, value]) => {
    params.set(key, value)
  })

  return params.toString()
}

// Generate a session ID that changes on page load
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  
  let sessionId = sessionStorage.getItem('cache-buster-session')
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
    sessionStorage.setItem('cache-buster-session', sessionId)
  }
  return sessionId
}

export function addCacheBusterToUrl(url: string, config?: CacheBusterConfig): string {
  // Don't add cache buster to data URLs or blob URLs
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }

  const cacheBuster = createCacheBuster(config)
  if (!cacheBuster) return url

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${cacheBuster}`
}

// Specific cache busting strategies for different types of resources
export const cacheBusterStrategies = {
  // For external CDN resources - AGGRESSIVE busting
  external: (url: string) => addCacheBusterToUrl(url, {
    includeTimestamp: true,
    includeVersion: true,
    includeRandom: true
  }),

  // For local static resources - AGGRESSIVE busting
  local: (url: string) => addCacheBusterToUrl(url, {
    includeTimestamp: true,
    includeVersion: true,
    includeRandom: true
  }),

  // For development - MAXIMUM busting
  development: (url: string) => addCacheBusterToUrl(url, {
    includeTimestamp: true,
    includeVersion: true,
    includeRandom: true
  }),

  // For critical resources - NUCLEAR busting
  critical: (url: string) => addCacheBusterToUrl(url, {
    includeTimestamp: true,
    includeVersion: true,
    includeRandom: true,
    customParams: {
      'cb': Date.now().toString(),
      'force': '1',
      'no-cache': '1'
    }
  }),

  // For DAWA scripts - EXTREME busting
  dawa: (url: string) => addCacheBusterToUrl(url, {
    includeTimestamp: true,
    includeVersion: true,
    includeRandom: true,
    customParams: {
      'dawa': '1',
      'force-reload': '1',
      'no-cache': '1',
      'bust': Math.random().toString(36).substring(2, 15)
    }
  })
}

// Auto-detect strategy based on URL
export function smartCacheBuster(url: string): string {
  if (url.includes('dawa') || url.includes('autocomplete')) {
    return cacheBusterStrategies.dawa(url)
  } else if (url.startsWith('http') || url.startsWith('//')) {
    return cacheBusterStrategies.external(url)
  } else if (url.startsWith('/')) {
    return cacheBusterStrategies.local(url)
  } else {
    return url
  }
}

// Nuclear option - force reload everything
export function nuclearCacheBuster(url: string): string {
  return addCacheBusterToUrl(url, {
    includeTimestamp: true,
    includeVersion: true,
    includeRandom: true,
    customParams: {
      'nuclear': '1',
      'force': '1',
      'no-cache': '1',
      'reload': '1',
      'bust': Date.now().toString(),
      'random': Math.random().toString(36).substring(2, 15)
    }
  })
}

// Clear all caches (for development)
export function clearAllCaches(): Promise<void> {
  return new Promise((resolve) => {
    if ('caches' in window) {
      caches.keys().then((cacheNames) => {
        const deletePromises = cacheNames.map((cacheName) => {
          return caches.delete(cacheName)
        })
        Promise.all(deletePromises).then(() => {
          console.log('All caches cleared')
          resolve()
        })
      })
    } else {
      resolve()
    }
  })
}

// Force reload with cache busting
export function forceReloadWithCacheBust(): void {
  const currentUrl = new URL(window.location.href)
  currentUrl.searchParams.set('_cb', Date.now().toString())
  currentUrl.searchParams.set('_nuclear', '1')
  currentUrl.searchParams.set('_force', '1')
  window.location.href = currentUrl.toString()
}

// Nuclear cache clearing - clears everything
export function nuclearCacheClear(): Promise<void> {
  return new Promise((resolve) => {
    // Clear all caches
    if ('caches' in window) {
      caches.keys().then((cacheNames) => {
        const deletePromises = cacheNames.map((cacheName) => {
          return caches.delete(cacheName)
        })
        Promise.all(deletePromises).then(() => {
          console.log('NUCLEAR: All caches cleared')
        })
      })
    }

    // Clear session storage
    if (typeof window !== 'undefined') {
      sessionStorage.clear()
      localStorage.removeItem('cache-buster-session')
    }

    // Clear any script elements
    const scripts = document.querySelectorAll('script[id*="script-"]')
    scripts.forEach(script => script.remove())

    // Clear window objects
    if (typeof window !== 'undefined') {
      delete (window as any).dawaAutocomplete
    }

    console.log('NUCLEAR: All caches and scripts cleared')
    resolve()
  })
}
