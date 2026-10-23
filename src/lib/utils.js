const gbpWhole = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const gbpExact = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const gbp = (n, opts = {}) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (Number.isInteger(v) && !opts.always) return gbpWhole.format(v);
  return gbpExact.format(v);
};

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
export const timeAgo = (stamp) => {
  const seconds = Math.max(0, Math.floor((Date.now() - Number(stamp)) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

export const prettyDate = (stamp) =>
  (stamp ? new Date(`${stamp}T12:00:00`) : new Date())
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** A compact date for rows and checklists: "Fri 16 Oct". */
export const shortDate = (stamp) =>
  (stamp ? new Date(`${stamp}T12:00:00`) : new Date())
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

/** Compact cook-time badge: 45 → "45 min", 75 → "1 h 15 min", 120 → "2 h".
 *  Rounds the total first so 119.6 never prints "1 h 60"; sentence prose
 *  in lib/ intentionally keeps the full word "minutes". */
export const formatCookTime = (mins) => {
  const n = Number(mins);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const total = Math.round(n);
  if (total <= 0) return '—';
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

/** Days until expiry → status chip config */
export const expiryStatus = (days) => {
  const d = Number(days);
  if (!Number.isFinite(d)) return { label: '—', tone: 'faint' };
  if (d <= 0) return { label: 'Expired', tone: 'danger' };
  if (d === 1) return { label: '1 day left', tone: 'danger' };
  if (d <= 3) return { label: `${d} days left`, tone: 'warn' };
  if (d <= 7) return { label: `${d} days`, tone: 'muted' };
  return { label: `${d} days`, tone: 'faint' };
};

/** Deterministic pick of n items from arr, seeded so re-generates feel fresh */
export const seededPick = (arr, n, seed = 1) => {
  if (!Array.isArray(arr) || n <= 0) return [];
  const pool = [...arr];
  const out = [];
  let s = Number.isFinite(Number(seed)) ? Number(seed) : 1;
  while (out.length < n && pool.length) {
    s = (s * 9301 + 49297) % 233280;
    out.push(pool.splice(Math.floor((s / 233280) * pool.length), 1)[0]);
  }
  return out;
};
