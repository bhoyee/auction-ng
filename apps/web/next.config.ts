import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@auction-ng/ui'],
  devIndicators: false,
  // AVIF first: the home hero is the largest early image on 4G (LCP budget).
  images: { formats: ['image/avif', 'image/webp'] },
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
