import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@auction-ng/ui'],
  devIndicators: false,
  // AVIF first: the home hero is the largest early image on 4G (LCP budget).
  images: { formats: ['image/avif', 'image/webp'] },
  // Development photos (no R2) are served by the API.
  async redirects() {
    const api = (
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    ).replace(/\/$/, '');
    return [
      {
        source: '/dev-images/public/:path*',
        destination: `${api}/dev-images/public/:path*`,
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/banners/optimized/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  experimental: {
    optimisticRouting: false,
    prefetchInlining: false,
    clientRouterFilter: false,
  },
};
export default config;
