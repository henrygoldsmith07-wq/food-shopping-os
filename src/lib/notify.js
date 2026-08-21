/**
 * Talking to the browser's notification system, and being straight about it.
 *
 * What this can do: show a notification while Forq is open, once you've
 * granted permission.
 *
 * What it cannot do: fire one while the app is closed. Synced households have
 * server-side reminder jobs, but Forq does not register this browser for Web
 * Push, and no shipping browser exposes Notification Triggers. Everything
 * touching the platform is kept here so the rest stays pure and tested.
 */

/** What this browser, right now, will actually let us do. */
export const notifySupport = () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { supported: false, permission: 'unsupported', reason: 'This browser has no notification API, so Forq will show reminders in the app instead.' };
  }
  const permission = Notification.permission;
  return {
    supported: true,
    permission,
    reason: permission === 'denied'
      ? 'Notifications are blocked for this site. Your browser’s site settings is the only place that can undo that — Forq can’t ask again.'
      : null,
  };
};

/** Ask once. Resolves to the resulting permission, never throws. */
export const askPermission = async () => {
  const { supported, permission } = notifySupport();
  if (!supported) return 'unsupported';
  if (permission !== 'default') return permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
};

/**
 * Show one notification. Returns false when it couldn't — the caller shows the
 * reminder in the app instead, which is why a blocked permission is a
 * degradation and not a failure.
 */
export const showNotification = (title, { body, tag, silent = false } = {}) => {
  const { supported, permission } = notifySupport();
  if (!supported || permission !== 'granted') return false;
  try {
    const icon = new URL('icon-192.png', document.baseURI).href;
    // eslint-disable-next-line no-new -- the handle is the notification itself
    new Notification(title, { body, tag, silent, badge: icon, icon });
    return true;
  } catch {
    return false;
  }
};

/** Hand a built file to the browser as a download. */
export const downloadFile = (filename, text, type = 'text/calendar') => {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return false;
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
};
