import { getDatabase } from './database.js';

const withoutId = ({ _id, ...document }) => ({ ...document, id: _id });

export function ForqAdapter() {
  return {
    async createUser(user) {
      const result = await (await getDatabase()).collection('users').insertOne(user);
      return { ...user, id: result.insertedId };
    },

    async getUser(id) {
      const user = await (await getDatabase()).collection('users').findOne({ _id: id });
      return user ? withoutId(user) : null;
    },

    async getUserByEmail(email) {
      if (!email) return null;
      const user = await (await getDatabase()).collection('users').findOne({ email });
      return user ? withoutId(user) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const db = await getDatabase();
      const account = await db.collection('accounts').findOne({ provider, providerAccountId });
      if (!account) return null;
      const user = await db.collection('users').findOne({ _id: account.userId });
      return user ? withoutId(user) : null;
    },

    async updateUser({ id, ...changes }) {
      const db = await getDatabase();
      await db.collection('users').updateOne({ _id: id }, { $set: changes });
      const user = await db.collection('users').findOne({ _id: id });
      return withoutId(user);
    },

    async deleteUser(id) {
      const db = await getDatabase();
      await Promise.all([
        db.collection('users').deleteOne({ _id: id }),
        db.collection('accounts').deleteMany({ userId: id }),
        db.collection('sessions').deleteMany({ userId: id }),
      ]);
    },

    async linkAccount(account) {
      await (await getDatabase()).collection('accounts').insertOne(account);
      return account;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await (await getDatabase()).collection('accounts').deleteOne({ provider, providerAccountId });
    },

    async createSession(session) {
      await (await getDatabase()).collection('sessions').insertOne(session);
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const db = await getDatabase();
      const session = await db.collection('sessions').findOne({ sessionToken });
      if (!session) return null;
      const user = await db.collection('users').findOne({ _id: session.userId });
      return user ? { session: withoutId(session), user: withoutId(user) } : null;
    },

    async updateSession({ sessionToken, ...changes }) {
      const db = await getDatabase();
      await db.collection('sessions').updateOne({ sessionToken }, { $set: changes });
      const session = await db.collection('sessions').findOne({ sessionToken });
      return session ? withoutId(session) : null;
    },

    async deleteSession(sessionToken) {
      await (await getDatabase()).collection('sessions').deleteOne({ sessionToken });
    },

    async createVerificationToken(token) {
      await (await getDatabase()).collection('verificationTokens').insertOne(token);
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const collection = (await getDatabase()).collection('verificationTokens');
      const verificationToken = await collection.findOne({ identifier, token });
      if (!verificationToken) return null;
      await collection.deleteOne({ _id: verificationToken._id });
      const { _id, ...result } = verificationToken;
      return result;
    },
  };
}
