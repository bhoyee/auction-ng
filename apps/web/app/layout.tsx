import type { Metadata } from 'next';
import { connection } from 'next/server';
import localFont from 'next/font/local';
import './globals.css';
import { BuyerSession } from '../lib/session';
import { BuyerRealtimeProvider } from '../lib/buyer-realtime';
import { BuyerShell } from '../components/buyer-shell';
import { publicMarketplace } from '../lib/catalogue';
import { MarketplaceFooter } from '@auction-ng/ui/web/marketplace-sections';
import { whatsappContact } from '../lib/support';

export const metadata: Metadata = {
  title: 'Auction NG',
  description: 'Daily liquidation auctions in Nigeria.',
};
const schibsted = localFont({
  src: '../../../packages/ui/fonts/schibsted-grotesk-common.woff2',
  weight: '400 900',
  display: 'swap',
  preload: true,
  variable: '--font-schibsted',
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
    <html lang="en-NG" className={schibsted.variable}>
      <body className={schibsted.className}>
        <BuyerSession>
          <BuyerRealtimeProvider>
            <BuyerShell
              categories={categories}
              demo={demo}
              whatsappHref={whatsappContact(
                process.env.SUPPORT_WHATSAPP_NUMBER,
              )}
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
