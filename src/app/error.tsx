'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

import { ui } from '@/components/ui-classes'
import { errorTracker } from '@/lib/errorTracking'

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    errorTracker.captureError(error, {
      component: 'AppError',
      digest: error.digest,
    })
    headingRef.current?.focus()
  }, [error])

  return (
    <main id="main-content" tabIndex={-1} className={`${ui.page} flex items-center justify-center px-4 py-16`}>
      <section className={`${ui.panel} w-full max-w-lg p-6 text-center sm:p-8`} aria-labelledby="app-error-title">
        <p className={ui.eyebrow}>Midlertidig fejl</p>
        <h1
          id="app-error-title"
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 font-space-grotesk text-3xl font-semibold outline-none"
        >
          Siden kunne ikke vises
        </h1>
        <p className="mt-4 text-gray-300">
          Prøv igen. Hvis fejlen fortsætter, kan du gå tilbage til forsiden og starte en ny søgning.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={retry} className={ui.primaryAction}>
            Prøv igen
          </button>
          <Link href="/" className={ui.secondaryAction}>
            Gå til forsiden
          </Link>
        </div>
        {error.digest ? <p className="mt-5 text-xs text-gray-500">Fejlkode: {error.digest}</p> : null}
      </section>
    </main>
  )
}
