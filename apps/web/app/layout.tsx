import type { Metadata } from 'next';
import './globals.css';
import { BuyerSession } from '../lib/session';
import { BuyerShell } from '../components/buyer-shell';

export const metadata: Metadata = {
  title: 'Auction NG',
  description: 'Daily liquidation auctions in Nigeria.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-NG">
      <body>
        <BuyerSession>
          <BuyerShell>{children}</BuyerShell>
        </BuyerSession>
      </body>
    </html>
  );
}
