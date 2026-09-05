/**
 * Abort must mean "return now", not "whenever the transport feels like it".
 *
 * Real fetch honours the signal it is given, but a mocked or non-abort-aware
 * transport ignores it — and an awaiter then sits on the request for its full
 * duration, which is the exact hang a caller's time budget exists to prevent.
 * Racing the work against the signal cuts every transport loose the moment
 * abort fires, and composing in `AbortSignal.timeout` gives any single request
 * a deadline of its own.
 */

/** An AbortError-shaped rejection, so `error.name === 'AbortError'` reads true. */
export const abortError = (message = 'Request aborted') =>
  Object.assign(new Error(message), { name: 'AbortError', code: 'aborted' });

/**
 * Run `work`, but reject with an AbortError as soon as any of the given
 * signals fires. With no signals this is just the work, untouched.
 */
export const raceAbort = (work, ...signals) => {
  const live = signals.filter(Boolean);
  if (!live.length) return Promise.resolve(work());
  const fired = live.find((signal) => signal.aborted);
  if (fired) return Promise.reject(fired.reason ?? abortError());
  const removeListeners = [];
  const aborted = new Promise((_, reject) => {
    for (const signal of live) {
      // Reject with the signal's own reason: a caller abort reads as
      // AbortError, an AbortSignal.timeout deadline as TimeoutError — the
      // distinction callers use to decide between retrying and giving up.
      const onAbort = () => reject(signal.reason ?? abortError());
      signal.addEventListener('abort', onAbort, { once: true });
      removeListeners.push(() => signal.removeEventListener('abort', onAbort));
    }
  });
  return Promise.race([Promise.resolve(work()), aborted]).finally(() => {
    removeListeners.forEach((remove) => remove());
  });
};

/**
 * One fetch with a deadline: raced against the caller's signal (when given)
 * and its own `timeoutMs` either way, so a stalled transport can hold neither
 * a budget nor a per-request timeout hostage.
 */
export const racedFetch = (fetchImpl, url, init = {}, { signal, timeoutMs } = {}) => {
  const timeoutSignal = timeoutMs ? AbortSignal.timeout(timeoutMs) : null;
  const effective = signal && timeoutSignal
    ? AbortSignal.any([signal, timeoutSignal])
    : signal || timeoutSignal;
  return raceAbort(
    () => fetchImpl(url, { ...init, signal: effective }),
    ...(signal ? [signal] : []),
    timeoutSignal,
  );
};
