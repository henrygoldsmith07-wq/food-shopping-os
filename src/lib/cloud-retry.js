/**
 * The cloud retry loop.
 *
 * Extracted from store.jsx: after a failed sync it backs off (30s doubling to
 * 5min) so a dead network isn't hammered forever; a fresh `online` event gets
 * an immediate honest try. Runs only in the browser outside tests — the
 * caller decides that, this module just owns the clock.
 */

const BASE_DELAY = 30000;
const MAX_DELAY = 5 * 60 * 1000;

/**
 * Start the retry loop. `refs` are React refs owned by the provider:
 * cloudInitialising (bool), cloudMeta ({version,...}|null), cloudReady (bool),
 * liveConnection (bool). Returns the cleanup function.
 */
export function startCloudRetryLoop({
  cloudInitialising, cloudMeta, cloudReady, retryQueuedCloud, setCloudStatus, liveConnection,
}) {
  let retrying = false;
  let timer = null;
  let backoff = BASE_DELAY;
  const settle = (result) => {
    // A confirmed sync resets the clock; a failed attempt backs off so a
    // dead network isn't hammered every thirty seconds forever.
    if (result?.status?.kind === 'ready') backoff = BASE_DELAY;
    else if (result) backoff = Math.min(backoff * 2, MAX_DELAY);
  };
  const retry = async () => {
    if (retrying || cloudInitialising.current) return;
    retrying = true;
    try {
      if (!cloudMeta.current) {
        window.dispatchEvent(new Event('forq-cloud-refresh'));
        return;
      }
      const result = await retryQueuedCloud();
      if (result) {
        cloudMeta.current = result.meta || cloudMeta.current;
        cloudReady.current = result.status.kind === 'ready';
        setCloudStatus((current) => {
          if (result.status.kind !== 'ready') return result.status;
          if (liveConnection.current) return { kind: 'live', message: 'Live household sync connected.' };
          return current.kind === 'reconnecting' ? current : result.status;
        });
      }
      settle(result);
    } finally {
      retrying = false;
      schedule();
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(retry, backoff);
  };
  const onOnline = () => {
    backoff = BASE_DELAY; // a fresh connection deserves an immediate honest try
    retry();
  };
  window.addEventListener('online', onOnline);
  schedule();
  return () => {
    window.removeEventListener('online', onOnline);
    clearTimeout(timer);
  };
}
