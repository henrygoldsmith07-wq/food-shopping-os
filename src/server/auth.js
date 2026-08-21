import AppleProviderPackage from 'next-auth/providers/apple';
import GoogleProviderPackage from 'next-auth/providers/google';
import AzureADProviderPackage from 'next-auth/providers/azure-ad';
import NextAuthPackage from 'next-auth';
import { ForqAdapter } from './auth-adapter.js';
import { databaseConfigured } from './database.js';

const AppleProvider = AppleProviderPackage.default || AppleProviderPackage;
const GoogleProvider = GoogleProviderPackage.default || GoogleProviderPackage;
const AzureADProvider = AzureADProviderPackage.default || AzureADProviderPackage;
const { getServerSession } = NextAuthPackage;
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

export const authOptions = {
  adapter: databaseConfigured ? ForqAdapter() : undefined,
  providers,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
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

export const getSession = () => getServerSession(authOptions);
