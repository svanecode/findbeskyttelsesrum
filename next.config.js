/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true, // <-- Add this line
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    typedRoutes: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;