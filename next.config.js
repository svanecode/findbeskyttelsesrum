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
  // Add cache-busting for static assets
  generateBuildId: async () => {
    // You can use the current timestamp as the build ID
    return Date.now().toString()
  },
  // Configure asset prefix for cache-busting
  assetPrefix: process.env.NODE_ENV === 'production' ? `https://${process.env.VERCEL_URL}` : '',
};

export default nextConfig;