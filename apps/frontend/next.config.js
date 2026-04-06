/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    TZ: 'America/Sao_Paulo',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  },
  images: { unoptimized: true },
  experimental: { esmExternals: 'loose' },
  compiler: { styledComponents: false },
  swcMinify: true,
  reactStrictMode: false,
  generateBuildId: async () => `build-${Date.now()}`,
  skipTrailingSlashRedirect: true,
  skipMiddlewareUrlNormalize: true,
};

module.exports = nextConfig;
