// @ts-check
/** The two account emails: confirm your address, and reset your password. */

import { actionEmail, sendEmail } from './email.js';
import { issueAccountToken } from './account-tokens.js';

const link = (origin, path, email, token) =>
  `${origin}${path}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

export async function sendVerificationEmail(email, origin) {
  const token = await issueAccountToken('verify', email);
  await sendEmail({
    to: email,
    subject: 'Confirm your email for Forq',
    ...actionEmail({
      heading: 'Confirm your email',
      body: 'Tap the button to confirm this address and finish setting up your Forq account.',
      action: 'Confirm my email',
      url: link(origin, '/api/account/verify', email, token),
      footer: 'The link works once and expires in 48 hours. If you did not sign up for Forq, ignore this email.',
    }),
  });
}

export async function sendPasswordResetEmail(email, origin) {
  const token = await issueAccountToken('reset', email);
  await sendEmail({
    to: email,
    subject: 'Reset your Forq password',
    ...actionEmail({
      heading: 'Reset your password',
      body: 'Someone (hopefully you) asked to reset the password for this Forq account.',
      action: 'Choose a new password',
      url: link(origin, '/reset-password', email, token),
      footer: 'The link works once and expires in an hour. If you did not ask for this, ignore this email — your password has not changed.',
    }),
  });
}
