import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { APP_VERSION } from './src/lib/constants';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const path = request.nextUrl.pathname;
  if (path.startsWith('/_next/static/')) {
    // Hashed assets
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    // HTML / dynamic responses: allow conditional revalidation but never reuse stale
    response.headers.set('Cache-Control', 'max-age=0, must-revalidate');
    response.headers.delete('Pragma');
    response.headers.delete('Expires');
  }

  // Add version headers
  response.headers.set('X-App-Version', APP_VERSION);
  response.headers.set('X-Build-Time', Date.now().toString());

  // Security headers only in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  } else {
    response.headers.delete('Strict-Transport-Security');
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}; 