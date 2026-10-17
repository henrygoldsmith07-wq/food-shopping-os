// @ts-check
/**
 * Email-and-password accounts, for people who would rather not use Google.
 *
 * Passwords are stored only as scrypt hashes (salted, memory-hard, from Node's
 * own crypto), compared in constant time. Emails are normalised before they
 * are stored or looked up, so "Sam@Example.com " and "sam@example.com" are one
 * account.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = /** @type {(password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>} */ (
  promisify(scryptCallback)
);

const KEY_LENGTH = 64;
const COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;

/** @param {unknown} email */
export const normaliseEmail = (email) => String(email || '').trim().toLowerCase();

/** A plausible address: something@something.tld, no spaces, a sane length. */
export const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

/** @param {unknown} password */
export const validPassword = (password) =>
  typeof password === 'string' && password.length >= MIN_PASSWORD && password.length <= MAX_PASSWORD;

/** "scrypt$<salt hex>$<hash hex>" */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH, COST);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * @param {string} password
 * @param {string | undefined} stored
 */
export async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex || typeof password !== 'string') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, COST);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Password sign-in is on wherever the backend is, unless switched off. */
export const passwordLoginEnabled = () => process.env.AUTH_PASSWORD_LOGIN !== 'false';
