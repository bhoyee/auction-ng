import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@auction-ng/ui'],
  devIndicators: false,
  experimental: {
    optimisticRouting: false,
    prefetchInlining: false,
    clientRouterFilter: false,
  },
};
export default config;
