import { NextResponse } from 'next/server';
import { getSession } from '../../../../server/auth.js';
import { databaseConfigured } from '../../../../server/database.js';
import { envStatus } from '../../../../server/env.js';
import { openDataStatus } from '../../../../server/retailer-providers.js';
import { passwordLoginEnabled } from '../../../../server/passwords.js';
import { emailConfigured } from '../../../../server/email.js';

const integrationStatus = () => {
  const { auth, ai, uploads, realtime } = envStatus();
  const redis = Boolean(databaseConfigured);
  const openData = openDataStatus();
  const serverAvailable = Boolean(databaseConfigured && auth.secret);
  const coachShares = serverAvailable && process.env.FORQ_COACH_SHARES_ENABLED === 'true';
  return {
    google: auth.google,
    apple: auth.apple,
    microsoft: auth.microsoft,
    openai: ai,
    uploads,
    realtime: {
      label: 'Household live updates',
      ready: realtime.ably || redis,
      detail: realtime.ably ? 'Ably' : (redis ? 'Redis fallback' : 'Add Ably or database credentials'),
    },
    productData: {
      label: 'Barcode product data (Open Food Facts)',
      ready: openData.openFoodFacts && serverAvailable,
      detail: !serverAvailable
        ? 'Requires backend sign-in'
        : openData.openFoodFacts ? 'Available on demand; nutrition and ingredients' : 'Disabled by configuration',
    },
    observedPrices: {
      label: 'Observed prices (Open Prices)',
      ready: openData.openPrices && serverAvailable,
      detail: !serverAvailable
        ? 'Requires backend sign-in'
        : openData.openPrices ? 'Community observations; not live retailer quotes' : 'Disabled by configuration',
    },
    coachShares: {
      label: 'Coach-share links',
      ready: coachShares,
      detail: !serverAvailable
        ? 'Requires backend sign-in'
        : coachShares ? 'Read-only, expiring, revocable' : 'Disabled by configuration (FORQ_COACH_SHARES_ENABLED)',
    },
  };
};

export async function GET() {
  const integrations = integrationStatus();
  const { auth, ai, uploads, realtime } = envStatus();
  const enabled = Boolean(databaseConfigured && auth.secret);
  if (!enabled) {
    return NextResponse.json({
      enabled: false,
      authenticated: false,
      user: null,
      providers: {},
      capabilities: {},
      integrations,
    });
  }
  const session = await getSession();
  return NextResponse.json({
    enabled,
    authenticated: Boolean(session?.user),
    user: session?.user ? { name: session.user.name, email: session.user.email } : null,
    providers: {
      google: auth.google.ready,
      apple: auth.apple.ready,
      microsoft: auth.microsoft.ready,
      dev: process.env.AUTH_DEV_LOGIN === 'true',
      password: passwordLoginEnabled(),
      emailVerification: emailConfigured(),
    },
    capabilities: {
      ai: ai.ready,
      uploads: uploads.ready,
      realtime: realtime.ready,
      calendar: Boolean(auth.google.ready || auth.microsoft.ready),
    },
    integrations,
  });
}
