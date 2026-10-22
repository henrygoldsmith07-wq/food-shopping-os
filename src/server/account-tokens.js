// @ts-check
/**
 * One-time tokens for account email links (verify an address, reset a
 * password). Only a SHA-256 of the token is stored, against the purpose and
 * address it was issued for, with an expiry. A reset token is deleted when
 * used. A verify token is only marked used: mail scanners (Outlook Safe
 * Links, Gmail's prefetch) open links before people do, and the person's own
 * click should still say the address is confirmed, not that the link expired.
 * Re-confirming an address grants nothing new.
 */

import { createHash, randomBytes } from 'node:crypto';
import { getDatabase } from './database.js';

const hash = (token) => createHash('sha256').update(String(token)).digest('hex');
const LIFETIME = { verify: 48 * 3600000, reset: 3600000 };

/**
 * @param {'verify' | 'reset'} purpose
 * @param {string} email normalised address
 */
export async function issueAccountToken(purpose, email) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + LIFETIME[purpose]);
  await (await getDatabase()).collection('verificationTokens').insertOne({
    identifier: `${purpose}:${email}`, token: hash(token), expires, expiresAt: expires,
  });
  return token;
}

/**
 * True for a token issued for this purpose and address and not yet expired:
 * once for a reset, any number of times for a verify (see above).
 * @param {'verify' | 'reset'} purpose
 */
export async function consumeAccountToken(purpose, email, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return false;
  const tokens = (await getDatabase()).collection('verificationTokens');
  const record = await tokens.findOne({ identifier: `${purpose}:${email}`, token: hash(token) });
  if (!record) return false;
  if (purpose !== 'verify') await tokens.deleteOne({ _id: record._id });
  else if (!record.usedAt) await tokens.updateOne({ _id: record._id }, { $set: { usedAt: new Date() } });
  return new Date(record.expires).getTime() > Date.now();
}
