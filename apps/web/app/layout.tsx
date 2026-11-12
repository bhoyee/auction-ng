import type { Metadata } from 'next';
import { connection } from 'next/server';
import localFont from 'next/font/local';
import './globals.css';
import { BuyerSession } from '../lib/session';
import { AuctionPauseAlert } from '../components/auction-pause-alert';
import { BuyerRealtimeProvider } from '../lib/buyer-realtime';
import { BuyerShell } from '../components/buyer-shell';
import { publicMarketplace } from '../lib/catalogue';
import { MarketplaceFooter } from '@auction-ng/ui/web/marketplace-sections';
import {
  whatsappContact,
  publicSupportEmail,
  publicSocialLinks,
} from '../lib/support';
import { CookieNotice } from '../components/cookie-notice';
import { readWebVersion } from '../lib/web-version';
import { HomeVersionSync } from '../components/home-version-sync';
import { SignedInMessageAlerts } from '../components/signed-in-message-alerts';
import { SESSION_HINT_SCRIPT } from '../lib/session-hint';

export const metadata: Metadata = {
  icons: {
    icon: [{ url: '/img/icon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/img/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  title: 'LotVanta',
  description: 'Daily liquidation auctions in Nigeria.',
};
const schibsted = localFont({
  src: '../../../packages/ui/fonts/schibsted-grotesk-common.woff2',
  weight: '400 900',
  display: 'swap',
  preload: true,
  variable: '--font-schibsted',
  fallback: ['LotVanta Schibsted', 'Arial'],
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Render the selected environment at request time; public reads retain their
  // 30-second cache instead of freezing an empty build-time catalogue.
  await connection();
  const version = await readWebVersion();
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
    // The session hint script sets data-buyer-session on <html> before React
    // hydrates, so hydration must tolerate that attribute.
    <html lang="en-NG" className={schibsted.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SESSION_HINT_SCRIPT }} />
      </head>
      {/* Browser extensions (converters, Grammarly, password managers) add
          attributes to <body> before React hydrates; tolerate those. This
          covers only <body>'s own attributes, not its children. */}
      <body className={schibsted.className} suppressHydrationWarning>
        <BuyerSession>
          <HomeVersionSync version={version} />
          <BuyerRealtimeProvider>
            <SignedInMessageAlerts />
            <AuctionPauseAlert />
            <BuyerShell
              categories={categories}
              whatsappHref={whatsappContact(
                process.env.SUPPORT_WHATSAPP_NUMBER,
              )}
              footer={
                <MarketplaceFooter
                  demo={demo}
                  supportEmail={publicSupportEmail()}
                  socialLinks={publicSocialLinks()}
                  whatsappHref={whatsappContact(
                    process.env.SUPPORT_WHATSAPP_NUMBER,
                  )}
                />
              }
            >
              {children}
            </BuyerShell>
            <CookieNotice />
          </BuyerRealtimeProvider>
        </BuyerSession>
      </body>
    </html>
  );
}
