'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

interface NavigationOptions {
  onRouteChange?: (pathname: string) => void
  onReturnToHome?: () => void
  onLeaveHome?: () => void
}

export function useNavigation(options: NavigationOptions = {}) {
  const pathname = usePathname()
  const previousPathname = useRef<string | null>(null)
  const isHomePage = pathname === '/'

  useEffect(() => {
    const currentPath = pathname
    const previousPath = previousPathname.current

    // Detect navigation to home page
    if (currentPath === '/' && previousPath && previousPath !== '/') {
      console.log('User returned to home page from:', previousPath)
      options.onReturnToHome?.()
    }

    // Detect leaving home page
    if (previousPath === '/' && currentPath !== '/') {
      console.log('User left home page for:', currentPath)
      options.onLeaveHome?.()
    }

    // General route change
    if (previousPath !== currentPath) {
      console.log('Route changed from', previousPath, 'to', currentPath)
      options.onRouteChange?.(currentPath)
    }

    previousPathname.current = currentPath
  }, [pathname, options])

  return {
    currentPath: pathname,
    isHomePage,
    previousPath: previousPathname.current
  }
}

// Hook for detecting when user returns to a specific page
export function usePageReturn(pagePath: string, callback: () => void) {
  const { currentPath, previousPath } = useNavigation()

  useEffect(() => {
    if (currentPath === pagePath && previousPath && previousPath !== pagePath) {
      console.log(`User returned to ${pagePath}`)
      callback()
    }
  }, [currentPath, previousPath, pagePath, callback])
}

// Hook for detecting page visibility changes
export function usePageVisibility(callback: (isVisible: boolean) => void) {
  useEffect(() => {
    const handleVisibilityChange = () => {
      callback(document.visibilityState === 'visible')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [callback])
}
