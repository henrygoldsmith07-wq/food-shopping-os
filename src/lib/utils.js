export const gbp = (n, opts = {}) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: n % 1 === 0 && !opts.always ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);

export const cx = (...parts) => parts.filter(Boolean).join(' ');

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** Move one identified row directly before another without losing either. */
export const moveBefore = (list = [], id, beforeId, key = (item) => item.id) => {
  const from = list.findIndex((item) => key(item) === id);
  const to = list.findIndex((item) => key(item) === beforeId);
  if (from < 0 || to < 0 || from === to) return list;
  const moved = [...list];
  const [item] = moved.splice(from, 1);
  moved.splice(from < to ? to - 1 : to, 0, item);
  return moved;
};

export const todayName = () =>
  new Date().toLocaleDateString('en-GB', { weekday: 'long' });

/** "Monday 27 July" — today by default, or any 'YYYY-MM-DD' stamp. */
export const prettyDate = (stamp) =>
  (stamp ? new Date(`${stamp}T12:00:00`) : new Date())
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

/** Days until expiry → status chip config */
export const expiryStatus = (days) => {
  if (days <= 0) return { label: 'Expired', tone: 'danger' };
  if (days === 1) return { label: '1 day left', tone: 'danger' };
  if (days <= 3) return { label: `${days} days left`, tone: 'warn' };
  if (days <= 7) return { label: `${days} days`, tone: 'muted' };
  return { label: `${days} days`, tone: 'faint' };
};

/** Deterministic pick of n items from arr, seeded so re-generates feel fresh */
export const seededPick = (arr, n, seed) => {
  const pool = [...arr];
  const out = [];
  let s = seed;
  while (out.length < n && pool.length) {
    s = (s * 9301 + 49297) % 233280;
    out.push(pool.splice(Math.floor((s / 233280) * pool.length), 1)[0]);
  }
  return out;
};
