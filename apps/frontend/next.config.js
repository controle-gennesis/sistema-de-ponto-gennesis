/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['recharts'],
  env: {
    TZ: 'America/Sao_Paulo',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  },
  // Configuração para build dinâmico
  images: {
    unoptimized: true,
  },
  // Desabilitar todas as otimizações de SSR
  experimental: {
    esmExternals: 'loose',
  },
  // Desabilitar styled-jsx para evitar problemas de Context
  compiler: {
    styledComponents: false,
  },
  // Configuração para evitar problemas de SSR
  swcMinify: true,
  // Desabilitar prerendering das páginas de erro
  // output: 'export', // Comentado para Railway usar servidor Next.js
  // trailingSlash: true, // Comentado para Railway
  // Configuração para evitar problemas de Context
  reactStrictMode: false,
  // Desabilitar todas as otimizações de SSR
  // distDir: 'dist', // Comentado para Railway
  // Desabilitar prerendering de páginas específicas
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
  // Configuração para evitar problemas de Context
  skipTrailingSlashRedirect: true,
  skipMiddlewareUrlNormalize: true,
  webpack: (config) => {
    // Recharts importa victory-vendor/d3-*; o Webpack nem sempre resolve subpaths do pacote no monorepo.
    // Redireciona para os pacotes d3 oficiais (mesma API que o victory-vendor reexporta).
    config.resolve.alias = {
      ...config.resolve.alias,
      'victory-vendor/d3-scale': require.resolve('d3-scale'),
      'victory-vendor/d3-shape': require.resolve('d3-shape'),
    };
    return config;
  },
};

module.exports = nextConfig;
