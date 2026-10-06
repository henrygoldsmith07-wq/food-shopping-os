/**
 * Forq service worker — explicit allow-list caching for an app that holds
 * household and personal data.
 *
 * The previous worker cached every successful same-origin GET, which meant
 * API responses, account/sync traffic and personalised payloads all landed in
 * a long-lived cache, and any offline API failure fell back to the app's HTML.
 * This worker inverts the default: nothing is cached unless this file says so.
 *
 * Strategy by class:
 *   - Navigations (the installed PWA shell): network-first, falling back to
 *     the precached '/' shell so the app opens offline. Only the '/' document
 *     is ever stored; a cached page is never served for anything else.
 *   - Static assets (hashed /_next/static bundles, fonts, icons, images with
 *     a static extension): cache-first from a versioned, size-capped cache.
 *   - Everything else — /api/*, auth, account, sync, household, image
 *     optimization, any request carrying credentials or answered with
 *     Set-Cookie — is network-only. No cache write, and on failure the request
 *     fails honestly. An offline API call never falls back to HTML.
 *
 * Caches are versioned per worker version; activation deletes every cache
 * name outside the current set, so an upgrade can never serve yesterday's
 * shell or leak stale personal data into the new version.
 */

const VERSION = 'v6';
const SHELL_CACHE = `forq-shell-${VERSION}`;
const ASSET_CACHE = `forq-assets-${VERSION}`;
const ACTIVE_CACHES = [SHELL_CACHE, ASSET_CACHE];

/** Precached on install: enough for the installed PWA to open offline. */
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/logo.svg',
];

/** Runtime asset caching is allow-list only. */
const ASSET_MAX_ENTRIES = 80;
const ASSET_EXT = /\.(?:js|mjs|css|woff2?|ttf|otf|png|svg|webp|jpg|jpeg|avif|gif|ico)$/i;

const urlOf = (request) => new URL(request.url);

/** True when the request must never be cached or answered from a cache. */
const isPrivateRequest = (request) => {
  const url = urlOf(request);
  const path = url.pathname;
  // API, auth, account/sync/household surfaces all live under /api/* in this
  // app; the other prefixes are named explicitly so a future route outside
  // /api cannot quietly become cacheable.
  if (path.startsWith('/api/')) return true;
  if (path.startsWith('/auth')) return true;
  if (path === '/api') return true;
  // Next.js image optimization serves transformed, potentially user-selected
  // remote images; the response is not a stable static asset.
  if (path.startsWith('/_next/image')) return true;
  // Anything carrying credentials is personal by construction.
  if (request.headers.get('authorization')) return true;
  return false;
};

/** True when a response is safe to keep at all (never with a session cookie). */
const isCacheableResponse = (response) =>
  Boolean(response) && response.ok && !response.headers.get('set-cookie');

/** Static asset worth an offline copy: hashed bundles, fonts, icons, images. */
const isCacheableAsset = (request) => {
  if (isPrivateRequest(request)) return false;
  const { pathname } = urlOf(request);
  if (pathname.startsWith('/_next/static/')) return true;
  return ASSET_EXT.test(pathname);
};

/** Trim a cache to its entry cap, oldest first (insertion order). */
const trimCache = async (cacheName, maxEntries) => {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i += 1) {
    await cache.delete(keys[i]);
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => !ACTIVE_CACHES.includes(key)).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = urlOf(request);
  if (url.origin !== self.location.origin) return;

  // Private traffic is network-only. The fetch is handed back untouched: when
  // it fails offline it fails as a failed API call, never as cached HTML.
  if (isPrivateRequest(request)) return;

  const isNavigation = request.mode === 'navigate' || request.destination === 'document';

  if (isNavigation) {
    // Network-first shell: freshness online, the precached app offline.
    // Only '/' is ever stored, so no page can be served for another route.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheableResponse(response) && url.pathname === '/') {
            const copy = response.clone();
            event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy)));
          }
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }))),
    );
    return;
  }

  if (!isCacheableAsset(request)) {
    // Same-origin but not a known-safe asset class: network only, no
    // fallback. Failing loudly beats inventing an answer from another page.
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!isCacheableResponse(response)) return response;
        const copy = response.clone();
        event.waitUntil(
          caches.open(ASSET_CACHE)
            .then((cache) => cache.put(request, copy))
            .then(() => trimCache(ASSET_CACHE, ASSET_MAX_ENTRIES)),
        );
        return response;
      }).catch(() => Response.error());
    }),
  );
});
