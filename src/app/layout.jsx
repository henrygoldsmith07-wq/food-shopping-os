import './globals.css';

import { PRODUCT } from '../data/product.js';

export const metadata = {
  metadataBase: new URL(process.env.APP_PUBLIC_URL || 'https://food-shopping-os.vercel.app'),
  applicationName: PRODUCT.name,
  title: PRODUCT.title,
  description: PRODUCT.metaDescription,
  manifest: '/manifest.webmanifest',
  icons: { icon: '/logo.svg', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: PRODUCT.shortName },
  openGraph: {
    type: 'website',
    title: PRODUCT.title,
    description: PRODUCT.metaDescription,
    images: [{ url: '/icon-512.png', width: 512, height: 512, alt: PRODUCT.name }],
  },
  twitter: {
    card: 'summary',
    title: PRODUCT.title,
    description: PRODUCT.metaDescription,
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
