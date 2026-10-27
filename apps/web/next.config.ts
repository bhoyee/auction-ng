import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@auction-ng/ui'],
  devIndicators: false,
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
