import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { getSupabasePublicEnv } from '@/lib/supabase/env'

/**
 * Next.js 16+ request proxy for security headers.
 * CSP is set only in next.config.js (single policy) to avoid duplicate Content-Security-Policy headers.
 * Expensive and write-oriented API routes apply their own shared database-backed limits.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  let response = NextResponse.next({ request })

  if (pathname.startsWith('/admin') || pathname.startsWith('/auth')) {
    const { url, publishableKey } = getSupabasePublicEnv()
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, authHeaders) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          Object.entries(authHeaders).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    })

    // Validates and refreshes the JWT before authenticated Server Components
    // or Route Handlers use it. Authorization remains in the server DAL and DB.
    await supabase.auth.getClaims()
    response.headers.set('Cache-Control', 'private, no-store')
  }

  response.headers.set('X-DNS-Prefetch-Control', 'on')
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
