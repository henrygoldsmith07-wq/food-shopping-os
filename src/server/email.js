// @ts-check
/**
 * Sending email, through Resend's HTTP API (no SDK: one POST).
 *
 * Optional like every other service here: without RESEND_API_KEY and
 * EMAIL_FROM, nothing is sent and the callers fall back to their
 * email-less behaviour (no verification step, no reset link, no digest).
 */

const RESEND_URL = 'https://api.resend.com/emails';

/** @param {Record<string, string | undefined>} [env] */
export const emailConfigured = (env = process.env) => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

/**
 * The site's own origin for links in emails: APP_URL when set, else the
 * origin the request came in on (the Host header, as the CSRF check uses).
 * @param {{ headers: { get(name: string): string | null }, url: string }} [request]
 * @param {Record<string, string | undefined>} [env]
 */
export const appOrigin = (request, env = process.env) => {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, '');
  const host = request?.headers.get('x-forwarded-host') || request?.headers.get('host');
  if (host) return `${request?.headers.get('x-forwarded-proto') || 'https'}://${host}`;
  return request ? new URL(request.url).origin : '';
};

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} message
 * @param {{ fetchImpl?: typeof fetch, env?: Record<string, string | undefined> }} [options]
 */
export async function sendEmail({ to, subject, text, html }, { fetchImpl = fetch, env = process.env } = {}) {
  if (!emailConfigured(env)) throw new Error('Email is not configured.');
  const response = await fetchImpl(RESEND_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text, ...(html ? { html } : {}) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Email provider refused the message (${response.status}): ${body.slice(0, 200)}`);
  }
  return response.json().catch(() => ({}));
}

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A plain, accessible one-button email in the house style. */
export const actionEmail = ({ heading, body, action, url, footer }) => ({
  text: `${heading}\n\n${body}\n\n${action}: ${url}\n\n${footer}`,
  html: `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#131313;background:#f4f4f4;padding:24px">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:24px">
<p style="font-weight:800;letter-spacing:.12em;font-size:12px;margin:0 0 12px">FORQ</p>
<h1 style="font-size:20px;margin:0 0 12px">${escape(heading)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${escape(body)}</p>
<p style="margin:0 0 20px"><a href="${escape(url)}" style="display:inline-block;background:#131313;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px">${escape(action)}</a></p>
<p style="font-size:12px;color:#666;margin:0">${escape(footer)}</p>
</div></body></html>`,
});
