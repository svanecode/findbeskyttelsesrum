/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typedRoutes: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  // Generate a unique build ID using git commit hash and timestamp
  generateBuildId: async () => {
    try {
      const commitHash = require('child_process')
        .execSync('git rev-parse --short HEAD')
        .toString()
        .trim();
      const timestamp = Date.now();
      return `${commitHash}-${timestamp}`;
    } catch (error) {
      // Fallback to timestamp if git is not available
      return `build-${Date.now()}`;
    }
  },
  // Remove assetPrefix to serve assets from the same domain
  // assetPrefix: process.env.NODE_ENV === 'production' ? `https://${process.env.VERCEL_URL}` : '',
  // Add headers for static assets
  async headers() {
    return [
      // Moderate caching for hashed static assets (Next.js handles versioning)
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, s-maxage=86400',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: 'https://findbeskyttelsesrum.dk',
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
            value: 'public, max-age=86400',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
      {
        source: '/site.webmanifest',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
      {
        source: '/robots.txt',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
      // Cache images with reasonable duration
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
      {
        source: '/favicons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
      {
        source: '/leaflet/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
          },
        ],
      },
      {
        source: '/dawa-autocomplete2/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
      {
        source: '/dawa-autocomplete2.min.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate, max-age=0',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      // SVG files
      {
        source: '/(.*).svg',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400',
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
            value: `
              default-src 'self';
              font-src 'self' https://fonts.gstatic.com data:;
              style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://*.leafletjs.com;
              script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.leafletjs.com https://dawa.aws.dk https://*.aws.dk;
              img-src 'self' data: https:;
              connect-src 'self' https://*.leafletjs.com https://dawa.aws.dk https://api.dataforsyningen.dk https://*.aws.dk https://*.dataforsyningen.dk https:;
              frame-ancestors 'none';
              base-uri 'self';
              form-action 'self';
            `.replace(/\s+/g, ' ').trim(),
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
  // Configure webpack to handle build ID changes
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;