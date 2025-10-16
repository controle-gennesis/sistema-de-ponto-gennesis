/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

module.exports = nextConfig;
