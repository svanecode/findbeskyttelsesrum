import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { rateLimit } from './lib/rate-limit'

export function middleware(request: NextRequest) {
  // Get the pathname
  const pathname = request.nextUrl.pathname

  // Apply rate limiting to all routes
  if (!rateLimit(request)) {
    return new NextResponse('Too Many Requests', { status: 429 })
  }

  // Only run on /shelters/nearby
  if (pathname === '/shelters/nearby') {
    const searchParams = request.nextUrl.searchParams
    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')

    // Validate coordinates
    if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // Validate coordinate ranges
    const latNum = Number(lat)
    const lngNum = Number(lng)
    if (latNum < 54.5 || latNum > 57.8 || lngNum < 8.0 || lngNum > 15.2) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // Clone the response
  const response = NextResponse.next()

  // Add security headers
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

  // Add CSP header for map tiles and Cookiebot
  response.headers.set(
    'Content-Security-Policy',
    `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval' https://consent.cookiebot.com https://consentcdn.cookiebot.com https://maps.googleapis.com https://maps.gstatic.com https://*.vercel-scripts.com https://*.vercel-insights.com https://unpkg.com https://*.leafletjs.com;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://*.leafletjs.com;
      img-src 'self' data: https://*.tile.openstreetmap.org https://raw.githubusercontent.com https://maps.gstatic.com https://maps.googleapis.com blob: https://*.openstreetmap.org https://*.tile.osm.org https://*.basemaps.cartocdn.com https://cdnjs.cloudflare.com https://*.google.com https://*.googleapis.com https://unpkg.com https://*.leafletjs.com https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org https://*.cookiebot.com https://imgsct.cookiebot.com;
      font-src 'self' https://fonts.gstatic.com data:;
      connect-src 'self' https://irafzkpgqxdhsahoddxr.supabase.co https://maps.googleapis.com https://*.maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://*.tile.openstreetmap.org https://*.vercel-scripts.com https://*.vercel-insights.com https://*.vercel.com https://va.vercel-scripts.com https://consent.cookiebot.com https://consentcdn.cookiebot.com https://*.google.com https://*.leafletjs.com https://unpkg.com https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org ws: wss:;
      frame-src 'self' https://consent.cookiebot.com https://consentcdn.cookiebot.com;
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
      block-all-mixed-content;
      upgrade-insecure-requests;
      manifest-src 'self';
      worker-src 'self' blob:;
    `.replace(/\s+/g, ' ').trim()
  )

  return response
}

// Configure the paths that should be matched by middleware
export const config = {
  matcher: [
    '/shelters/nearby',
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
} 