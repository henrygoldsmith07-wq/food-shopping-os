const securityHeaders = [
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
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
