/**
 * Checking prices once a day, without anyone remembering to.
 *
 * A price history is only worth having if it has points in it, and asking
 * someone to tap "check" every morning is a good way to get a history with
 * three points in it. So when the app is opened and a day has passed, it
 * checks again by itself.
 *
 * The deliberate limits, each because the alternative is worse:
 *
 *  - **Opt in.** Fetching from nine shops is not something to start doing on
 *    someone's behalf because they once tapped a button.
 *  - **On open, not on a timer.** This is a local-first app; there is no
 *    server holding your list, so there is nobody to run a cron for you. A
 *    background timer in a closed tab does not exist either. When the app is
 *    open is the only honest moment.
 *  - **Once a day, floored at 20 hours.** Not 24, or a check at 09:05 makes
 *    tomorrow's 09:00 open miss and slide a day later each time.
 *  - **Never when offline, in offline mode, or on a metered retry.** A daily
 *    check that fires into a dead connection just burns the rate limit.
 */

const STORAGE_KEY = 'forq.dailyPriceCheck.v1';
/** Slightly under a day, so a check does not drift later every morning. */
export const DUE_AFTER_MS = 20 * 60 * 60 * 1000;

const read = () => {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const write = (state) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: the check simply reverts to manual, which is the
    // behaviour it had before. Nothing here is worth failing an app boot over.
  }
};

export const dailyCheckSettings = () => {
  const state = read();
  return {
    enabled: state.enabled === true,
    lastRunAt: state.lastRunAt || null,
    lastResult: state.lastResult || null,
  };
};

export const setDailyCheckEnabled = (enabled) => {
  const state = read();
  write({ ...state, enabled: Boolean(enabled) });
  return dailyCheckSettings();
};

export const recordDailyCheck = (result = {}, now = Date.now()) => {
  const state = read();
  write({
    ...state,
    lastRunAt: new Date(now).toISOString(),
    lastResult: {
      priced: result.priced ?? null,
      total: result.total ?? null,
      at: new Date(now).toISOString(),
    },
  });
  return dailyCheckSettings();
};

/**
 * Should a check run right now?
 *
 * Returns a reason either way, so the UI can say "next check tomorrow" rather
 * than leaving someone wondering whether the thing is on.
 */
export const dailyCheckDue = ({
  now = Date.now(), online = true, offlineMode = false, itemCount = 0, settings = null,
} = {}) => {
  const state = settings || dailyCheckSettings();
  if (!state.enabled) return { due: false, reason: 'off', label: 'Daily checking is off.' };
  if (!itemCount) return { due: false, reason: 'empty-list', label: 'Nothing on the list to check.' };
  if (offlineMode) return { due: false, reason: 'offline-mode', label: 'Offline shopping mode is on.' };
  if (!online) return { due: false, reason: 'offline', label: 'No connection — will check when back online.' };
  if (!state.lastRunAt) return { due: true, reason: 'never-run', label: 'First daily check.' };
  const last = new Date(state.lastRunAt).getTime();
  if (!Number.isFinite(last)) return { due: true, reason: 'unknown-last-run', label: 'Last check time unreadable.' };
  const elapsed = now - last;
  if (elapsed >= DUE_AFTER_MS) return { due: true, reason: 'due', label: 'A day since the last check.' };
  const hours = Math.max(1, Math.round((DUE_AFTER_MS - elapsed) / 3600000));
  return { due: false, reason: 'too-soon', label: `Checked already — next in about ${hours}h.` };
};

/** How long ago the last automatic check ran, in words. */
export const lastCheckLabel = (settings = null, now = Date.now()) => {
  const state = settings || dailyCheckSettings();
  if (!state.lastRunAt) return 'Not checked automatically yet.';
  const elapsed = now - new Date(state.lastRunAt).getTime();
  if (!Number.isFinite(elapsed)) return 'Last check time unreadable.';
  const hours = Math.floor(elapsed / 3600000);
  if (hours < 1) return 'Checked within the hour.';
  if (hours < 24) return `Checked ${hours}h ago.`;
  const days = Math.floor(hours / 24);
  return `Checked ${days} day${days === 1 ? '' : 's'} ago.`;
};

export const clearDailyCheckState = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear is the same outcome as a cleared store.
  }
};
