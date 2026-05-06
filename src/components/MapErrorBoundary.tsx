'use client'

import Link from 'next/link'
import ErrorBoundary from '@/components/ErrorBoundary'

interface Props {
  children: React.ReactNode
}

export function MapErrorBoundary({ children }: Props) {
  return (
    <ErrorBoundary
      fallback={
        <main id="main-content" tabIndex={-1} className="min-h-screen bg-[var(--surface-page)] text-white">
          <div className="mx-auto max-w-7xl p-4">
            <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-6">
              <h1 className="mb-4 text-2xl font-bold text-red-400">Kortet kunne ikke indlæses</h1>
              <p className="mb-4 text-gray-300">
                Der opstod en fejl under indlæsning af kortet. Prøv at genindlæse siden eller gå tilbage til forsiden.
              </p>
              <div className="space-x-4">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
                >
                  Genindlæs siden
                </button>
                <Link
                  href="/"
                  className="inline-flex items-center rounded-lg bg-orange-500 px-4 py-2 text-white transition-colors hover:bg-orange-600"
                >
                  ← Tilbage til forsiden
                </Link>
              </div>
            </div>
          </div>
        </main>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
