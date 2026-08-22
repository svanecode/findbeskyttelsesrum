'use client'

interface ErrorReport {
  message: string
  stack?: string
  url: string
  timestamp: string
  context?: Record<string, unknown>
}

function getPagePath() {
  return `${window.location.origin}${window.location.pathname}`
}

class ErrorTracker {
  private endpoint = '/api/errors'
  private isProduction = process.env.NODE_ENV === 'production'

  public captureError(error: Error, context?: Record<string, unknown>) {
    if (!this.isProduction) {
      console.error('Error captured:', error, context)
      return
    }

    const errorReport: ErrorReport = {
      message: error.message,
      stack: error.stack,
      url: getPagePath(),
      timestamp: new Date().toISOString(),
      context
    }

    // Send to error tracking service
    void this.sendErrorReport(errorReport)
  }

  public captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, unknown>) {
    if (!this.isProduction && level === 'error') {
      console.error('Message captured:', message, context)
      return
    }

    const errorReport: ErrorReport = {
      message: `[${level.toUpperCase()}] ${message}`,
      url: getPagePath(),
      timestamp: new Date().toISOString(),
      context
    }

    void this.sendErrorReport(errorReport)
  }

  private async sendErrorReport(report: ErrorReport) {
    try {
      // Simple fetch to your own API endpoint
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report)
      })
    } catch (error) {
      // Fail silently in production to avoid infinite loops
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to send error report:', error)
      }
    }
  }

}

// Create global instance
export const errorTracker = new ErrorTracker()

// Global error handler
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    errorTracker.captureError(new Error(event.message), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    errorTracker.captureError(
      new Error(`Unhandled promise rejection: ${event.reason}`),
      { type: 'unhandledrejection' }
    )
  })
}
