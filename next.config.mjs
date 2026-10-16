// CSP itself lives in src/proxy.js (per-request nonce). These are the static
// defence-in-depth headers that apply to every response, including the static
// assets and image-optimization routes the proxy matcher skips.
const securityHeaders = [
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Matches the CSP frame-ancestors 'none' in src/proxy.js; kept as a header
  // for user agents that enforce one layer but not the other.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
  // HSTS: only honoured over HTTPS; harmless on http://localhost.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

export default {
  poweredByHeader: false,
  // The ecosystem shell serves Forq at /forq. Unset keeps the standalone
  // deployment at the root for a safe, reversible rollout.
  basePath: process.env.APP_BASE_PATH || '',
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
