'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

interface NavigationOptions {
  onRouteChange?: (pathname: string) => void
  onReturnToHome?: () => void
  onLeaveHome?: () => void
}

export function useNavigation(options: NavigationOptions = {}) {
  const pathname = usePathname()
  const [prevPath, setPrevPath] = useState<string | null>(null)
  const [currPath, setCurrPath] = useState<string>(pathname)
  const isHomePage = pathname === '/'

  if (pathname !== currPath) {
    setPrevPath(currPath)
    setCurrPath(pathname)
  }

  useEffect(() => {
    // Detect navigation to home page
    if (currPath === '/' && prevPath && prevPath !== '/') {
      console.log('User returned to home page from:', prevPath)
      options.onReturnToHome?.()
    }

    // Detect leaving home page
    if (prevPath === '/' && currPath !== '/') {
      console.log('User left home page for:', currPath)
      options.onLeaveHome?.()
    }

    // General route change
    if (prevPath !== currPath) {
      console.log('Route changed from', prevPath, 'to', currPath)
      options.onRouteChange?.(currPath)
    }
  }, [currPath, prevPath, options])

  return {
    currentPath: currPath,
    isHomePage,
    previousPath: prevPath
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
