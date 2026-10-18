import AppleProviderPackage from 'next-auth/providers/apple';
import GoogleProviderPackage from 'next-auth/providers/google';
import AzureADProviderPackage from 'next-auth/providers/azure-ad';
import CredentialsProviderPackage from 'next-auth/providers/credentials';
// The named export, from its own entry: next-auth's default export is only
// the NextAuth handler once bundled, so destructuring getServerSession off it
// yields undefined in production ("nF is not a function" on every session read).
import { getServerSession } from 'next-auth/next';
import { ForqAdapter } from './auth-adapter.js';
import { databaseConfigured, getDatabase } from './database.js';
import { normaliseEmail, passwordLoginEnabled, verifyPassword } from './passwords.js';

const AppleProvider = AppleProviderPackage.default || AppleProviderPackage;
const GoogleProvider = GoogleProviderPackage.default || GoogleProviderPackage;
const AzureADProvider = AzureADProviderPackage.default || AzureADProviderPackage;
const CredentialsProvider = CredentialsProviderPackage.default || CredentialsProviderPackage;
const providers = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(GoogleProvider({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
    authorization: {
      params: {
        scope: 'openid email profile https://www.googleapis.com/auth/calendar.events',
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  }));
}

if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
  providers.push(AppleProvider({
    clientId: process.env.AUTH_APPLE_ID,
    clientSecret: process.env.AUTH_APPLE_SECRET,
  }));
}

if (process.env.AUTH_MICROSOFT_ID && process.env.AUTH_MICROSOFT_SECRET) {
  providers.push(AzureADProvider({
    clientId: process.env.AUTH_MICROSOFT_ID,
    clientSecret: process.env.AUTH_MICROSOFT_SECRET,
    tenantId: process.env.AUTH_MICROSOFT_TENANT_ID || 'common',
    authorization: { params: { scope: 'openid email profile offline_access Calendars.ReadWrite' } },
  }));
}

// Email and password, for accounts made through /api/account/register. A
// wrong password and an unknown email fail the same way, and both count
// against the address's attempt limit so a password cannot be guessed at speed.
if (databaseConfigured && passwordLoginEnabled()) {
  providers.push(CredentialsProvider({
    id: 'password',
    name: 'Email',
    credentials: { email: { label: 'Email' }, password: { label: 'Password', type: 'password' } },
    async authorize(credentials) {
      const email = normaliseEmail(credentials?.email);
      const password = String(credentials?.password || '');
      if (!email || !password) return null;
      const db = await getDatabase();
      const window = Math.floor(Date.now() / 900000);
      if (await db.incrementWindow(`signin:${email}:${window}`, 1800000) > 10) return null;
      const users = db.collection('users');
      // A parked account (see releaseUnverifiedEmail) still signs in with its password.
      const user = await users.findOne({ email }) || await users.findOne({ email: parkedEmail(email) });
      if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) return null;
      return { id: user._id, name: user.name || email, email };
    },
  }));
}

/** Where an unverified password account's address goes once its real owner proves it. */
const parkedEmail = (email) => `parked:${email}`;

/**
 * Google has proved this address belongs to the person signing in. An email
 * and password account on the same address never proved anything — anyone
 * can type any address at sign-up — so it gives the address up: it keeps its
 * password and its data under a parked address, and the Google sign-in gets
 * an account of its own. The address's owner can never be locked out by
 * someone who registered it first, and that person never gains access to the
 * owner's Google account (nothing is linked).
 */
const releaseUnverifiedEmail = async (email) => {
  const address = normaliseEmail(email);
  if (!address || !databaseConfigured) return;
  const users = (await getDatabase()).collection('users');
  const holder = await users.findOne({ email: address });
  if (!holder?.passwordHash || holder.emailVerified) return;
  await users.updateOne({ _id: holder._id }, { $set: { email: parkedEmail(address), parkedAt: new Date() } });
};

// A preview-only sign-in for deployments without OAuth credentials. It is
// opt-in per environment (AUTH_DEV_LOGIN) and must never be set in production:
// it accepts any name and issues a session with no external check.
if (process.env.AUTH_DEV_LOGIN === 'true') {
  providers.push(CredentialsProvider({
    id: 'dev',
    name: 'Preview sign-in',
    credentials: { name: { label: 'Name' } },
    authorize(credentials) {
      const name = String(credentials?.name || '').trim().slice(0, 80);
      if (!name) return null;
      return { id: `dev-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@preview.local` };
    },
  }));
}

export const authOptions = {
  adapter: databaseConfigured ? ForqAdapter() : undefined,
  providers,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'google' && profile?.email_verified && profile.email) {
        await releaseUnverifiedEmail(profile.email);
      }
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.userId || token.sub;
      return session;
    },
  },
  pages: { signIn: '/' },
  secret: process.env.AUTH_SECRET,
};

/**
 * The signed-in session. The jwt callback adds the user's id, which next-auth's
 * own Session type does not know about.
 * @returns {Promise<{ user?: { id?: string, name?: string | null, email?: string | null, image?: string | null } } | null>}
 */
export const getSession = () => getServerSession(authOptions);
