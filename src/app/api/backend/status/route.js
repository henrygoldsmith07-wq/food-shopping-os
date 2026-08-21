import { NextResponse } from 'next/server';
import { getSession } from '../../../../server/auth.js';
import { databaseConfigured } from '../../../../server/database.js';
import { openDataStatus } from '../../../../server/retailer-providers.js';

const integrationStatus = () => {
  const google = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const apple = Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET);
  const microsoft = Boolean(process.env.AUTH_MICROSOFT_ID && process.env.AUTH_MICROSOFT_SECRET);
  const ably = Boolean(process.env.ABLY_API_KEY);
  const redis = Boolean(databaseConfigured);
  const openData = openDataStatus();
  const serverAvailable = Boolean(databaseConfigured && process.env.AUTH_SECRET);
  return {
    google: { label: 'Google sign-in & Calendar', ready: google, detail: google ? 'Connected' : 'Add OAuth credentials' },
    apple: { label: 'Apple sign-in', ready: apple, detail: apple ? 'Connected' : 'Add OAuth credentials' },
    microsoft: { label: 'Microsoft sign-in & Calendar', ready: microsoft, detail: microsoft ? 'Connected' : 'Add OAuth credentials' },
    openai: {
      label: 'AI relay (OpenAI)',
      ready: Boolean(process.env.OPENAI_API_KEY),
      detail: process.env.OPENAI_API_KEY ? 'Connected' : 'Add OPENAI_API_KEY',
    },
    uploads: {
      label: 'Private receipt uploads',
      ready: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      detail: process.env.BLOB_READ_WRITE_TOKEN ? 'Connected' : 'Add BLOB_READ_WRITE_TOKEN',
    },
    realtime: {
      label: 'Household live updates',
      ready: ably || redis,
      detail: ably ? 'Ably' : (redis ? 'Redis fallback' : 'Add Ably or database credentials'),
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
  };
};

export async function GET() {
  const integrations = integrationStatus();
  const enabled = Boolean(databaseConfigured && process.env.AUTH_SECRET);
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
      google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
      apple: Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET),
      microsoft: Boolean(process.env.AUTH_MICROSOFT_ID && process.env.AUTH_MICROSOFT_SECRET),
    },
    capabilities: {
      ai: Boolean(process.env.OPENAI_API_KEY),
      uploads: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      realtime: Boolean(process.env.ABLY_API_KEY || databaseConfigured),
      calendar: Boolean(process.env.AUTH_GOOGLE_ID || process.env.AUTH_MICROSOFT_ID),
    },
    integrations,
  });
}
