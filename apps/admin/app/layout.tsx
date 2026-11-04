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
  icons: {
    icon: [{ url: '/img/icon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/img/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  title: 'LotVanta staff',
  description: 'LotVanta staff workspace.',
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
