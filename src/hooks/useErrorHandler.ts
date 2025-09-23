'use client'

import { useCallback, useState } from 'react'
import { errorTracker } from '@/lib/errorTracking'

interface ErrorState {
  hasError: boolean
  error: Error | null
  errorInfo: string | null
}

export function useErrorHandler() {
  const [errorState, setErrorState] = useState<ErrorState>({
    hasError: false,
    error: null,
    errorInfo: null
  })

  const handleError = useCallback((error: Error, errorInfo?: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by useErrorHandler:', error, errorInfo)
    }

    setErrorState({
      hasError: true,
      error,
      errorInfo: errorInfo || null
    })

    // Send to error tracking service
    errorTracker.captureError(error, { errorInfo, component: 'useErrorHandler' })
  }, [])

  const clearError = useCallback(() => {
    setErrorState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }, [])

  const resetError = useCallback(() => {
    clearError()
    window.location.reload()
  }, [clearError])

  return {
    ...errorState,
    handleError,
    clearError,
    resetError
  }
}

// Hook for async operations with error handling
export function useAsyncOperation<T>() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const { handleError } = useErrorHandler()

  const execute = useCallback(async (operation: () => Promise<T>): Promise<T | null> => {
    setLoading(true)
    setError(null)

    try {
      const result = await operation()
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error occurred')
      setError(error)
      errorTracker.captureError(error, { component: 'useAsyncOperation' })
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    loading,
    error,
    execute,
    clearError
  }
}
