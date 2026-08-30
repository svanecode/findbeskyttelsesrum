'use client'

import { useEffect, useRef } from 'react'

import { errorTracker } from '@/lib/errorTracking'

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    errorTracker.captureError(error, {
      component: 'GlobalError',
      digest: error.digest,
    })
    headingRef.current?.focus()
  }, [error])

  return (
    <html lang="da">
      <body style={{ margin: 0, background: '#0b0c0e', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <title>Teknisk fejl | Find Beskyttelsesrum</title>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <section style={{ maxWidth: 520, textAlign: 'center' }} aria-labelledby="global-error-title">
            <h1 id="global-error-title" ref={headingRef} tabIndex={-1} style={{ fontSize: 34, outline: 'none' }}>
              Tjenesten kunne ikke indlæses
            </h1>
            <p style={{ color: '#d1d5db', lineHeight: 1.6 }}>
              Prøv at indlæse igen. Der vises aldrig bekræftet adgang eller fysisk stand uden dataforbindelse.
            </p>
            <button
              type="button"
              onClick={retry}
              style={{ minHeight: 48, marginTop: 16, border: 0, borderRadius: 8, padding: '12px 20px', background: '#f97316', color: '#0b0c0e', fontWeight: 700, cursor: 'pointer' }}
            >
              Prøv igen
            </button>
            {error.digest ? <p style={{ marginTop: 20, color: '#6b7280', fontSize: 12 }}>Fejlkode: {error.digest}</p> : null}
          </section>
        </main>
      </body>
    </html>
  )
}
