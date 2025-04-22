/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // <-- change to false when test
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    typedRoutes: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
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
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              font-src 'self' https://fonts.gstatic.com data:;
              style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://*.leafletjs.com;
              script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.leafletjs.com;
              img-src 'self' data: https:;
              connect-src 'self' https://*.leafletjs.com;
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
};

export default nextConfig;