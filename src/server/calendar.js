import { ApiError } from './api.js';
import { getDatabase } from './database.js';

const refreshGoogle = async (account) => {
  if (!account.refresh_token) throw new ApiError(409, 'Reconnect Google Calendar.');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID,
      client_secret: process.env.AUTH_GOOGLE_SECRET,
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
    }),
  });
  if (!response.ok) throw new ApiError(502, 'Google Calendar authorisation could not be refreshed.');
  return response.json();
};

const refreshMicrosoft = async (account) => {
  if (!account.refresh_token) throw new ApiError(409, 'Reconnect Microsoft Calendar.');
  const tenant = process.env.AUTH_MICROSOFT_TENANT_ID || 'common';
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_MICROSOFT_ID,
      client_secret: process.env.AUTH_MICROSOFT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
      scope: 'openid email profile offline_access Calendars.ReadWrite',
    }),
  });
  if (!response.ok) throw new ApiError(502, 'Microsoft Calendar authorisation could not be refreshed.');
  return response.json();
};

export async function calendarAccount(user, provider) {
  const db = await getDatabase();
  const account = await db.collection('accounts').findOne({
    userId: user.id,
    provider,
  });
  if (!account) throw new ApiError(409, 'Connect this calendar provider first.');
  let accessToken = account.access_token;
  if (!accessToken || Number(account.expires_at || 0) * 1000 < Date.now() + 60000) {
    const refreshed = provider === 'google'
      ? await refreshGoogle(account)
      : await refreshMicrosoft(account);
    accessToken = refreshed.access_token;
    await db.collection('accounts').updateOne(
      { _id: account._id },
      {
        $set: {
          access_token: accessToken,
          expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
          ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
        },
      },
    );
  }
  return accessToken;
}

