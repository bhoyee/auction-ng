import type { MetadataRoute } from 'next';
import { tokens } from '@auction-ng/ui';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/pickup/desk',
    name: 'GiddyDeal Pickup',
    short_name: 'Pickup',
    description: 'Staff check-in and item collection.',
    start_url: '/pickup/desk',
    scope: '/pickup/',
    display: 'standalone',
    theme_color: tokens.colors['indigo-900'],
    background_color: tokens.colors.canvas,
    icons: [
      {
        src: '/img/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/img/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
