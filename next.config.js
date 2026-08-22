import path from "node:path";
import { fileURLToPath } from "node:url";
import { osmTileOrigin } from "./src/lib/maps/provider.js";

const siteBuildTimestamp = process.env.SITE_BUILD_TIMESTAMP || new Date().toISOString();

function supabaseOriginForCsp() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw || typeof raw !== 'string') return ''
  try {
    return new URL(raw.trim()).origin
  } catch {
    return ''
  }
}

export function contentSecurityPolicyValue({
  environment = process.env.NODE_ENV,
  supabaseOrigin = supabaseOriginForCsp(),
  upgradeInsecureRequests = process.env.PLAYWRIGHT_HTTP_ORIGIN !== '1',
} = {}) {
  const developmentConnections = environment === 'development' ? ['ws:', 'wss:'] : []
  const connectSrc = [
    "'self'",
    supabaseOrigin,
    'https://*.vercel-scripts.com',
    'https://*.vercel-insights.com',
    'https://api.dataforsyningen.dk',
    ...developmentConnections,
  ].filter(Boolean)

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    ...(environment === 'development' ? ["'unsafe-eval'"] : []),
    'https://*.vercel-scripts.com',
    'https://*.vercel-insights.com',
  ].join(' ')

  const mixedContentDirectives = upgradeInsecureRequests
    ? ['block-all-mixed-content', 'upgrade-insecure-requests']
    : []

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${osmTileOrigin}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "frame-src https://www.openstreetmap.org",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...mixedContentDirectives,
    "manifest-src 'self'",
    "worker-src 'self'",
  ]
    .join('; ')
    .replace(/\s+/g, ' ')
    .trim()
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  turbopack: {
    root: path.join(__dirname),
  },
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
    SITE_BUILD_TIMESTAMP: siteBuildTimestamp,
  },
  generateBuildId: async () => {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
    return sha ? `${sha}-${Date.now()}` : `build-${Date.now()}`;
  },
  // Add headers for static assets
  async headers() {
    return [
      // Next.js owns immutable caching for /_next/static assets.
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
