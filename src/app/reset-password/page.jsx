import { headers } from 'next/headers';
import ResetPasswordForm from './ResetPasswordForm.jsx';

/** One-time reset links must never be indexed or followed by crawlers. */
export const metadata = {
  title: 'Reset your password · Forq',
  robots: { index: false, follow: false },
};

/**
 * A server page so the route renders per request: the proxy's CSP nonce only
 * reaches Next's scripts then. As a static client page, the strict CSP
 * blocked every script and the reset form never loaded.
 */
export default async function ResetPasswordPage() {
  await headers();
  return <ResetPasswordForm />;
}
