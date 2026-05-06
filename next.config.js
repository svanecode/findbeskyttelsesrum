function supabaseOriginForCsp() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw || typeof raw !== 'string') return ''
  try {
    return new URL(raw.trim()).origin
  } catch {
    return ''
  }
}

function contentSecurityPolicyValue() {
  const supabase = supabaseOriginForCsp()
  const connectSrc = [
    "'self'",
    supabase,
    'https://*.tile.openstreetmap.org',
    'https://*.vercel-scripts.com',
    'https://*.vercel-insights.com',
    'https://*.vercel.com',
    'https://va.vercel-scripts.com',
    'https://a.tile.openstreetmap.org',
    'https://b.tile.openstreetmap.org',
    'https://c.tile.openstreetmap.org',
    'https://tiles.stadiamaps.com',
    'https://tiles.maptiler.com',
    'https://api.dataforsyningen.dk',
    'https://*.dataforsyningen.dk',
    'https://dawa.aws.dk',
    'https://nominatim.openstreetmap.org',
    'https://*.vercel.app',
    'ws:',
    'wss:',
  ].filter(Boolean)

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-scripts.com https://*.vercel-insights.com https://*.vercel.app",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.vercel.app",
    "img-src 'self' data: https://*.tile.openstreetmap.org https://raw.githubusercontent.com blob: https://*.openstreetmap.org https://*.tile.osm.org https://*.basemaps.cartocdn.com https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org https://tiles.stadiamaps.com https://tiles.maptiler.com https://*.vercel.app",
    "font-src 'self' https://fonts.gstatic.com data: https://*.vercel.app",
    `connect-src ${connectSrc.join(' ')}`,
    "frame-src 'self' https://www.openstreetmap.org",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'block-all-mixed-content',
    'upgrade-insecure-requests',
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ]
    .join('; ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  async redirects() {
    return [
      { source: "/land", destination: "/kommune", permanent: true },
      { source: "/tell-me-more", destination: "/om-data", permanent: true },
    ];
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  },
  generateBuildId: async () => {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
    return sha ? `${sha}-${Date.now()}` : `build-${Date.now()}`;
  },
  // Add headers for static assets
  async headers() {
    return [
      // Moderate caching for hashed static assets (Next.js handles versioning)
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            // 1 year immutable for hashed build assets
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Accept',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
        ],
      },
      // Cache static files with shorter duration
      {
        source: '/favicon.ico',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/site.webmanifest',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
      {
        source: '/robots.txt',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
      // Cache images with reasonable duration
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800',
          },
        ],
      },
      {
        source: '/favicons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/leaflet/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000',
          },
        ],
      },
      // SVG files
      {
        source: '/(.*).svg',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Service worker - short cache to allow updates
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      // Default headers for all other routes
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicyValue(),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
