/**
 * Getting a report out of the app.
 *
 * **CSV** is written here, properly quoted, and is the format that survives:
 * every spreadsheet reads it and nothing is lost.
 *
 * **PDF** is not generated here, and no library is shipped to do it. Every
 * browser already has a very good PDF writer behind Print → Save as PDF, and
 * bundling three hundred kilobytes to do a worse job of it would be a strange
 * thing to make you download. So the app builds a clean printable page and
 * opens the print dialogue: the PDF you get is a real one, written by software
 * that has had twenty years of work put into it.
 */

import { dayTotals } from './nutrition.js';
import { HEADLINE_KEYS, nutrientBy } from '../data/nutrients.js';
import { addDays } from './kitchen.js';

/* ---------- CSV ---------- */

/** RFC 4180: quote anything containing a comma, quote or newline. */
export const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (rows = []) => rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

/** One row per logged day, one column per headline nutrient. */
export const dailyCsv = (state, { days = 90, today = state.day } = {}) => {
  const header = ['Date', 'Entries', ...HEADLINE_KEYS.map((k) => `${nutrientBy[k].label} (${nutrientBy[k].unit})`),
    ...HEADLINE_KEYS.map((k) => `${nutrientBy[k].label} target`)];
  const rows = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    const entries = state.log?.[date] || [];
    if (!entries.length) continue; // a blank row is not a zero-calorie day
    const totals = dayTotals(entries);
    rows.push([
      date,
      entries.length,
      ...HEADLINE_KEYS.map((k) => Math.round((totals[k] || 0) * 10) / 10),
      ...HEADLINE_KEYS.map((k) => state.targets?.[k] ?? ''),
    ]);
  }
  return { text: toCsv([header, ...rows]), rows: rows.length };
};

/** One row per food, for anyone who wants to do their own arithmetic. */
export const entriesCsv = (state, { days = 90, today = state.day } = {}) => {
  const header = ['Date', 'Time', 'Meal', 'Food', 'Grams', ...HEADLINE_KEYS.map((k) => nutrientBy[k].label)];
  const rows = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    for (const entry of state.log?.[date] || []) {
      const grams = Number(entry.grams) || 0;
      rows.push([
        date, entry.time || '', entry.meal || '', entry.name || '', grams,
        ...HEADLINE_KEYS.map((k) => Math.round(((entry.per100?.[k] || 0) * grams) / 100 * 10) / 10),
      ]);
    }
  }
  return { text: toCsv([header, ...rows]), rows: rows.length };
};

/** Your weight readings, so they can go anywhere else you keep them. */
export const measurementsCsv = (state) => {
  const header = ['Date', 'Measurement', 'Value'];
  const rows = (state.measurements || [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => [m.date, m.key, m.value]);
  return { text: toCsv([header, ...rows]), rows: rows.length };
};

/* ---------- Printable report ---------- */

const esc = (text) => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const table = (headers, rows) => `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`
  + `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/**
 * A plain, printable page. Deliberately unstyled beyond legibility — this is
 * going through a print engine, not a browser, and a page that fights the
 * printer produces a worse PDF than one that doesn't.
 */
export const printableReport = (report, { name = '', generated = new Date() } = {}) => {
  const macros = table(
    ['Nutrient', 'Average per logged day', 'Target'],
    report.macros.map((m) => [m.label, m.avg, m.target || '—']),
  );
  const days = table(
    ['Date', 'Calories'],
    report.series.filter((d) => d.kcal !== null).map((d) => [d.date, d.kcal.toLocaleString()]),
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Forq — ${esc(report.label)}</title>
<style>
  body { font: 13px/1.5 system-ui, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 1.25rem; margin: 0 0 2px; }
  h2 { font-size: 0.875rem; margin: 24px 0 6px; }
  p.meta { color: #666; margin: 0 0 4px; }
  table { border-collapse: collapse; width: 100%; margin-top: 6px; }
  th, td { border-bottom: 1px solid #ddd; padding: 5px 8px; text-align: left; }
  th { font-weight: 700; }
  td + td, th + th { text-align: right; }
  .note { color: #666; margin-top: 20px; font-size: 0.75rem; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>${esc(report.label)}${name ? ` — ${esc(name)}` : ''}</h1>
<p class="meta">${esc(report.from)} to ${esc(report.to)} · generated ${esc(generated.toISOString().slice(0, 10))}</p>
<p class="meta"><strong>${report.loggedDays} of ${report.days} days logged (${report.coverage}%).</strong>
Every average below is over the ${report.loggedDays} logged day${report.loggedDays === 1 ? '' : 's'} only —
a day with nothing recorded is a day unrecorded, not a day without food.</p>
<h2>Daily averages</h2>${macros}
<h2>Against your calorie target</h2>
<p>${report.onTargetDays} of ${report.loggedDays} logged day${report.loggedDays === 1 ? '' : 's'} landed within 10%
of ${esc((report.macros.find((m) => m.key === 'kcal')?.target || 0).toLocaleString())} kcal — ${report.adherence}%.</p>
<h2>Day by day</h2>${days}
<p class="note">From Forq. Figures are computed from the foods you logged, which is not necessarily everything you ate.</p>
</body></html>`;
};

/**
 * Hand the printable page to the browser's own print engine. Returns false
 * where a popup was blocked, so the caller can say so rather than leave you
 * wondering what happened.
 */
export const printReport = (html) => {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false;
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
};
