import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const schibsted = localFont({
  src: '../../../packages/ui/fonts/schibsted-grotesk.ttf',
  variable: '--font-schibsted',
  display: 'swap',
  weight: '400 900',
});

export const metadata: Metadata = {
  title: 'Auction NG',
  description: 'Daily liquidation auctions in Nigeria.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-NG" className={schibsted.variable}>
      <body>{children}</body>
    </html>
  );
}
