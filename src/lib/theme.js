/**
 * Appearance: follow the phone by default.
 *
 * Forq used to start in light and only changed when someone found the toggle
 * in Settings, so a phone in dark mode opened a white app. `system` is now the
 * default and follows `prefers-color-scheme` live; `light` and `dark` are
 * explicit choices that ignore it.
 */

export const THEMES = ['system', 'light', 'dark'];
export const DEFAULT_THEME = 'system';

/** Mirror of the chosen theme in localStorage, so the pre-paint script can read it synchronously. */
export const THEME_STORAGE_KEY = 'forq.theme';

/** The status bar matches the page canvas (--bg in le-studio.css). */
export const THEME_COLOR = { light: '#f4f4f6', dark: '#0b0b0d' };

const DARK_QUERY = '(prefers-color-scheme: dark)';

export const normaliseTheme = (theme) => (THEMES.includes(theme) ? theme : DEFAULT_THEME);

export const systemPrefersDark = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;

/** The theme the page actually wears: `light` or `dark`. */
export const resolveTheme = (theme, prefersDark = systemPrefersDark()) => {
  const chosen = normaliseTheme(theme);
  if (chosen === 'system') return prefersDark ? 'dark' : 'light';
  return chosen;
};

/** Put a resolved theme on <html> and the status bar. */
export const applyTheme = (resolved) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', THEME_COLOR[resolved]);
  });
};

/** Subscribe to the OS appearance; returns an unsubscribe. */
export const onSystemThemeChange = (listener) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(DARK_QUERY);
  const handler = (event) => listener(event.matches);
  query.addEventListener?.('change', handler);
  return () => query.removeEventListener?.('change', handler);
};

/**
 * Apply a chosen theme, mirror it for the pre-paint script, and follow the OS
 * while it is "system". Returns an unsubscribe.
 */
export const syncTheme = (theme) => {
  const chosen = normaliseTheme(theme);
  applyTheme(resolveTheme(chosen));
  try { localStorage.setItem(THEME_STORAGE_KEY, chosen); } catch { /* private mode: the OS default still applies */ }
  if (chosen !== 'system') return () => {};
  return onSystemThemeChange((dark) => applyTheme(dark ? 'dark' : 'light'));
};

/**
 * Runs before first paint (inline, with the CSP nonce) so a dark phone never
 * sees a white launch shell. Kept dependency-free and tiny on purpose.
 */
export const THEME_BOOTSTRAP = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s==='dark'||(s!=='light'&&window.matchMedia('${DARK_QUERY}').matches);var t=d?'dark':'light';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;
