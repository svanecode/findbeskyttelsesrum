import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { rateLimit } from './lib/rate-limit'

/**
 * Next.js 16+ request proxy: security headers + best-effort rate limiting.
 * CSP is set only in next.config.js (single policy) to avoid duplicate Content-Security-Policy headers.
 * In-memory rate limits reset per isolate and do not coordinate across serverless instances.
 */
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (!rateLimit(request)) {
    return new NextResponse('Too Many Requests', { status: 429 })
  }

  const response = NextResponse.next()

  response.headers.set('X-DNS-Prefetch-Control', 'on')
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-Frame-Options', 'SAMEORIGIN')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), interest-cohort=()'
  )

  if (pathname.startsWith('/_next/static/')) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  }

  return response
}

/** API routes excluded so server handlers are not gated by this edge rate limiter. */
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
