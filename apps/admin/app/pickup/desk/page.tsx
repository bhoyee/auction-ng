import type { Metadata, Viewport } from 'next';
import { StaffWorkspace } from '../../staff-workspace';

export const metadata: Metadata = {
  title: 'GiddyDeal Pickup',
  description: 'Scan arrival passes and hand over pickup items.',
  manifest: '/pickup/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'GiddyDeal Pickup',
    statusBarStyle: 'default',
  },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function PickupPage() {
  return <StaffWorkspace pickupOnly />;
}
