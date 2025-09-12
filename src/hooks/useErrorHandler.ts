'use client'

import { useCallback, useState } from 'react'

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
    console.error('Error caught by useErrorHandler:', error, errorInfo)
    
    setErrorState({
      hasError: true,
      error,
      errorInfo: errorInfo || null
    })

    // In production, you might want to send this to a logging service
    if (process.env.NODE_ENV === 'production') {
      // Example: send to Sentry, LogRocket, etc.
      console.error('Production error:', { error, errorInfo })
    }
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
      handleError(error, 'Async operation failed')
      return null
    } finally {
      setLoading(false)
    }
  }, [handleError])

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
