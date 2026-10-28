import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: [
    '@auction-ng/ui',
    '@auction-ng/shared',
    '@auction-ng/api-client',
  ],
  devIndicators: false,
};
export default config;
