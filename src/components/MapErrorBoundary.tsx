'use client'

import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class MapErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Map Error Boundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[#1a1a1a] text-white">
          <div className="max-w-7xl mx-auto p-4">
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6">
              <h1 className="text-2xl font-bold text-red-400 mb-4">Kortet kunne ikke indlæses</h1>
              <p className="text-gray-300 mb-4">
                Der opstod en fejl under indlæsning af kortet. Prøv at genindlæse siden eller gå tilbage til forsiden.
              </p>
              <div className="space-x-4">
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Genindlæs siden
                </button>
                <a
                  href="/"
                  className="inline-flex items-center px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                >
                  ← Tilbage til forsiden
                </a>
              </div>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4 text-sm">
                  <summary className="text-red-400 cursor-pointer">Teknisk fejlbeskrivelse</summary>
                  <pre className="mt-2 text-gray-400 whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}