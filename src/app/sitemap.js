import { SITE_URL } from '../lib/site-url.js';

/** Every public, indexable page. Token and account pages are deliberately absent. */
export default function sitemap() {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/demo`, changeFrequency: 'monthly', priority: 0.8 },
  ];
}
