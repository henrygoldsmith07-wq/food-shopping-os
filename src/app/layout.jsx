import './globals.css';

import { PRODUCT } from '../data/product.js';
import { SITE_URL } from '../lib/site-url.js';

export const metadata = {
  metadataBase: new URL(SITE_URL),
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
    // The page canvas (--bg); lib/theme.js re-points these to the in-app theme.
    { media: '(prefers-color-scheme: light)', color: '#f4f4f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
  ],
};

export default function RootLayout({ children }) {
  return (
    // THEME_BOOTSTRAP (src/lib/theme.js) sets data-theme and color-scheme on
    // <html> before React hydrates to avoid a flash of the wrong theme. Those
    // pre-paint attributes are intentionally absent from the server HTML.
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
