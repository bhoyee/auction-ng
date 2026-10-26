import type { Metadata } from 'next';
import { connection } from 'next/server';
import localFont from 'next/font/local';
import './globals.css';
import { BuyerSession } from '../lib/session';
import { BuyerRealtimeProvider } from '../lib/buyer-realtime';
import { BuyerShell } from '../components/buyer-shell';
import { publicMarketplace } from '../lib/catalogue';
import {
  Announcement,
  MarketplaceFooter,
} from '@auction-ng/ui/web/marketplace-sections';

export const metadata: Metadata = {
  title: 'Auction NG',
  description: 'Daily liquidation auctions in Nigeria.',
};
const schibsted = localFont({
  src: '../../../packages/ui/fonts/schibsted-grotesk-common.woff2',
  weight: '400 900',
  display: 'swap',
  preload: true,
  fallback: ['Auction NG Schibsted', 'Arial'],
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Render the selected environment at request time; public reads retain their
  // 30-second cache instead of freezing an empty build-time catalogue.
  await connection();
  const catalogue = await publicMarketplace().catch(() => null);
  const categories =
    catalogue?.categories.map((category) => ({
      id: category.id,
      name: category.name,
      count: category.activeLotCount,
      image: catalogue.items.find((lot) => lot.categoryId === category.id)
        ?.thumbnail?.thumbnailUrl,
    })) ?? [];
  const demo =
    catalogue?.items.some((lot) => lot.lotNumber.startsWith('DEMO-')) ?? false;
  return (
    <html lang="en-NG">
      <body className={schibsted.className}>
        <BuyerSession>
          <BuyerRealtimeProvider>
            <BuyerShell
              categories={categories}
              demo={demo}
              announcement={
                <Announcement>
                  {demo
                    ? 'Demo auctions closing throughout the day · Sample pickup in Lagos and Abuja'
                    : 'Discover today’s auctions · Check the pickup location on every lot'}
                </Announcement>
              }
              footer={<MarketplaceFooter demo={demo} />}
            >
              {children}
            </BuyerShell>
          </BuyerRealtimeProvider>
        </BuyerSession>
      </body>
    </html>
  );
}
