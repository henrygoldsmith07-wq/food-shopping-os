/**
 * Words for an account request that threw. A network failure surfaces as the
 * browser's own "Failed to fetch" (or "Load failed" on Safari), which tells a
 * person nothing; server messages are ours and pass through unchanged.
 */
export const accountErrorMessage = (caught, fallback = 'Something went wrong. Please try again.') => {
  if (caught instanceof TypeError) return 'Forq could not be reached. Check your connection and try again.';
  const message = typeof caught?.message === 'string' ? caught.message.trim() : '';
  return message || fallback;
};
