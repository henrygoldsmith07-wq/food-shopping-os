import NextAuthPackage from 'next-auth';
import { authOptions } from '../../../../server/auth.js';

const NextAuth = NextAuthPackage.default || NextAuthPackage;
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
