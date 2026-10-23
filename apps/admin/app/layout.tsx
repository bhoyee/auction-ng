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
  title: 'Auction NG staff',
  description: 'Auction NG staff workspace.',
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
