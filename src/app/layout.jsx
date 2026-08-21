import './globals.css';

import { PRODUCT } from '../data/product.js';

export const metadata = {
  title: PRODUCT.title,
  description: PRODUCT.metaDescription,
  manifest: '/manifest.webmanifest',
  icons: { icon: '/logo.svg', apple: '/apple-touch-icon.png' },
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
