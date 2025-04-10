/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true, // <-- change to false when test
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