import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Performance: Enable React strict mode for better development practices
  reactStrictMode: true,

  // Edge-first: Optimize images via Vercel's edge network
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'flagcdn.com' },
      { protocol: 'https', hostname: '*.gnews.io' },
    ],
  },

  // Headers for security and caching
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Static assets: aggressive caching
        source: '/(.*)\\.(ico|svg|png|jpg|jpeg|gif|webp|woff|woff2)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  // Rewrites for backward compatibility
  async rewrites() {
    return [
      // Support old hash-based routes
      { source: '/feed', destination: '/intelligence' },
      { source: '/government', destination: '/regulation' },
      { source: '/companies', destination: '/intelligence' },
    ];
  },
};

export default nextConfig;
