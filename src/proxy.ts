import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { rateLimit } from './lib/rate-limit'

export function proxy(request: NextRequest) {
  // Get the pathname
  const pathname = request.nextUrl.pathname

  // Apply rate limiting to all routes
  if (!rateLimit(request)) {
    return new NextResponse('Too Many Requests', { status: 429 })
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

  // Set cache headers based on route
  if (pathname.startsWith('/_next/static/')) {
    // Long-term caching for hashed static assets only
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  } else if (pathname === '/sw.js') {
    // Service worker must never be cached
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  } else {
    // Aggressive no-cache for ALL pages to force fresh content
    // Critical for society-critical website - users MUST get latest version
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    response.headers.set('Surrogate-Control', 'no-store')
    response.headers.set('CDN-Cache-Control', 'no-store')
    response.headers.set('Vercel-CDN-Cache-Control', 'no-store')
  }

  // Add CSP header for map tiles and Cookiebot
  response.headers.set(
    'Content-Security-Policy',
    `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval' https://consent.cookiebot.com https://consentcdn.cookiebot.com https://*.vercel-scripts.com https://*.vercel-insights.com https://unpkg.com https://*.leafletjs.com https://*.vercel.app https://cdnjs.cloudflare.com;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://*.leafletjs.com https://*.vercel.app https://cdnjs.cloudflare.com;
      img-src 'self' data: https://*.tile.openstreetmap.org https://raw.githubusercontent.com blob: https://*.openstreetmap.org https://*.tile.osm.org https://*.basemaps.cartocdn.com https://cdnjs.cloudflare.com https://unpkg.com https://*.leafletjs.com https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org https://*.cookiebot.com https://imgsct.cookiebot.com https://tiles.stadiamaps.com https://tiles.maptiler.com https://*.vercel.app;
      font-src 'self' https://fonts.gstatic.com data: https://*.vercel.app;
      connect-src 'self' https://irafzkpgqxdhsahoddxr.supabase.co https://*.tile.openstreetmap.org https://*.vercel-scripts.com https://*.vercel-insights.com https://*.vercel.com https://va.vercel-scripts.com https://consent.cookiebot.com https://consentcdn.cookiebot.com https://*.leafletjs.com https://unpkg.com https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org https://tiles.stadiamaps.com https://tiles.maptiler.com https://api.dataforsyningen.dk https://dawa.aws.dk https://nominatim.openstreetmap.org ws: wss: https://*.vercel.app;
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

  // Add CORS headers for static assets
  if (request.nextUrl.pathname.startsWith('/_next/static/')) {
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  }

  return response
}

// Configure the paths that should be matched by proxy
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
} 