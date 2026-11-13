import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: [
    '@auction-ng/ui',
    '@auction-ng/shared',
    '@auction-ng/api-client',
  ],
  devIndicators: false,
  // Demo lot photos are vendored on the buyer website only (/demo/*.webp).
  // Send the admin's requests there so staff screens show them too.
  async redirects() {
    const buyer = (
      process.env.NEXT_PUBLIC_BUYER_URL ?? 'http://localhost:3300'
    ).replace(/\/$/, '');
    return [
      {
        source: '/demo/:file([a-z0-9-]+\\.webp)',
        destination: `${buyer}/demo/:file`,
        permanent: false,
      },
    ];
  },
};
export default config;
