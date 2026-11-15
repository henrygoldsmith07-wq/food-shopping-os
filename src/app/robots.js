import { SITE_URL } from '../lib/site-url.js';

/**
 * Search and AI-answer crawlers are welcome on every public page. Private
 * token pages (/coach/…, /reset-password) are not blocked here on purpose:
 * they carry `noindex`, and a crawler must be allowed to fetch a page to
 * see that tag. Only the JSON API is off-limits.
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: ['Googlebot', 'OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'],
        allow: '/',
        disallow: ['/api/'],
      },
      { userAgent: '*', allow: '/', disallow: ['/api/'] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
