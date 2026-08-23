import { describe, it, expect } from 'vitest';
import {
  categoryFor, dayFootprint, equivalents, footprintOf, periodFootprint, recipeFootprint,
  swapIdeas,
} from '../src/lib/footprint.js';
import { optimiseMicros, shortfalls } from '../src/lib/micro-optimise.js';
import {
  currentFast, eatingWindow, fastHistory, fastingSummary, overnightFast,
} from '../src/lib/fasting.js';
import { dateFrom, parseReceipt, storeFrom, totalFrom } from '../src/lib/receipt.js';
import {
  dayResponses, daySummary, importSpan, mealResponse, parseCgmCsv, parseStamp, toMmol,
} from '../src/lib/cgm.js';
import { CAPABILITIES, capabilityBy, STATUS_LABELS } from '../src/data/capabilities.js';
import { bloodCategory, BLOOD_MARKERS } from '../src/data/health.js';
import { DEFAULT_TARGETS } from '../src/data/nutrients.js';
import { addDays } from '../src/lib/kitchen.js';

const TODAY = '2026-07-28';
const entry = (name, grams, time = '12:00', meal = 'lunch') => ({
  id: `${name}${time}`, name, grams, time, meal, per100: { kcal: 100, iron: 2, calcium: 50 },
});

describe('the food footprint', () => {
  it('places a food in a published category, or admits it cannot', () => {
    expect(categoryFor('Beef mince 500g').id).toBe('beef');
    expect(categoryFor('Wholemeal bread').id).toBe('bread');
    expect(categoryFor('Red lentils').id).toBe('pulses');
    expect(categoryFor('Sherbet fountain')).toBe(null);
  });

  it('is grams times the published factor, and nothing cleverer', () => {
    // 99.5 kg CO₂e per kg of beef × 0.2 kg
    expect(footprintOf('Beef steak', 200).co2).toBe(19.9);
    expect(footprintOf('Red lentils', 200).co2).toBe(0.16);
    expect(footprintOf('Beef steak', 0).co2).toBe(0);
  });

  it('reports what it could not place rather than counting it as zero', () => {
    const log = { [TODAY]: [entry('Beef mince', 200), entry('Sherbet fountain', 50)] };
    const report = dayFootprint(log, TODAY);
    expect(report.items).toBe(2);
    expect(report.matched).toBe(1);
    expect(report.unmatched).toBe(1);
    expect(report.coverage).toBe(50);
  });

  it('averages the days that had food in them, not the calendar', () => {
    const log = {
      [TODAY]: [entry('Beef mince', 200)],
      [addDays(TODAY, -1)]: [entry('Chicken breast', 200)],
    };
    const report = periodFootprint(log, { days: 7, today: TODAY });
    expect(report.loggedDays).toBe(2);
    expect(report.perDay).toBe(10.94); // (19.9 for the beef + 1.98 for the chicken) / 2
    expect(report.band).toBe('Very heavy');
    expect(report.vsAverage).toBeGreaterThan(100);
  });

  it('is silent, not zero, over a window with nothing logged', () => {
    const report = periodFootprint({}, { days: 7, today: TODAY });
    expect(report).toMatchObject({ loggedDays: 0, perDay: 0, band: null, vsAverage: null });
  });

  it('ranks the categories driving it', () => {
    const log = { [TODAY]: [entry('Beef mince', 200), entry('Rice', 300), entry('Broccoli', 200)] };
    const report = dayFootprint(log, TODAY);
    expect(report.byCategory[0].label).toBe('Beef');
    expect(report.byCategory.map((c) => c.id)).toEqual(['beef', 'rice', 'brassicas']);
  });

  it('offers only swaps that would actually move the number', () => {
    const log = { [TODAY]: [entry('Beef mince', 500)] };
    const swaps = swapIdeas(periodFootprint(log, { today: TODAY }));
    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps[0].from).toBe('beef');
    expect(swaps[0].saved).toBeGreaterThan(0);
    // Nothing to swap when nothing heavy is in there.
    expect(swapIdeas(periodFootprint({ [TODAY]: [entry('Broccoli', 200)] }, { today: TODAY }))).toEqual([]);
  });

  it('marks a recipe footprint as the estimate it is', () => {
    const report = recipeFootprint({ ingredients: [{ name: 'beef' }, { name: 'onions' }] });
    expect(report.estimate).toBe(true);
    expect(report.matched).toBe(2);
  });

  it('puts a kilogram of CO₂ into something imaginable', () => {
    const list = equivalents(2);
    expect(list.find((e) => e.id === 'drive').amount).toBe(11);
    expect(equivalents(0)).toEqual([]);
  });
});

describe('closing nutrient gaps', () => {
  const targets = { ...DEFAULT_TARGETS, iron: 14, calcium: 800, vitC: 80 };
  const food = (id, name, per100) => ({ id, name, per100, servings: [{ label: 'a portion', grams: 100 }] });
  const catalogue = [
    food('spinach', 'Spinach', { kcal: 23, iron: 2.7, calcium: 99, vitC: 28 }),
    food('sardines', 'Sardines', { kcal: 208, iron: 2.9, calcium: 382, vitC: 0 }),
    food('pepper', 'Red pepper', { kcal: 31, iron: 0.4, calcium: 7, vitC: 128 }),
    food('water', 'Water', { kcal: 0 }),
  ];

  it('names what is short, worst first, and ignores limits', () => {
    // Everything not supplied counts as zero, so give the others enough that
    // iron is genuinely the worst rather than the only one measured.
    const full = Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, v]));
    const gaps = shortfalls({ ...full, iron: 4, calcium: 700, sodium: 100 }, targets);
    expect(gaps[0].key).toBe('iron');
    expect(gaps[0].pct).toBe(29);
    expect(gaps.map((g) => g.key)).toContain('calcium');
    expect(gaps.map((g) => g.key)).not.toContain('sodium'); // a limit, not a goal
    expect(gaps.map((g) => g.key)).not.toContain('kcal'); // macros have their own screens
  });

  it('refuses to compute off too few days', () => {
    const result = optimiseMicros({}, targets, catalogue, { minDays: 5, loggedDays: 2 });
    expect(result.ready).toBe(false);
    expect(result.reason).toMatch(/you have 2/);
  });

  it('says so when nothing is short rather than recommending food anyway', () => {
    const result = optimiseMicros({ ...targets }, targets, catalogue, {});
    expect(result.ready).toBe(true);
    expect(result.picks).toEqual([]);
    expect(result.reason).toMatch(/Nothing is running short/);
  });

  it('picks the foods that close the most, and says what each is for', () => {
    const result = optimiseMicros({ iron: 2, calcium: 100, vitC: 5 }, targets, catalogue, {});
    expect(result.picks.length).toBeGreaterThan(1);
    expect(result.picks.map((p) => p.id)).toContain('sardines'); // the calcium
    expect(result.picks.map((p) => p.id)).toContain('pepper'); // the vitamin C
    expect(result.picks[0].closes[0]).toHaveProperty('pctOfGap');
    // A food with nothing you need never appears.
    expect(result.picks.map((p) => p.id)).not.toContain('water');
  });

  it('never proposes something your allergies rule out', () => {
    const result = optimiseMicros({ iron: 2, calcium: 100, vitC: 5 }, targets, catalogue, {
      prefs: { allergies: ['fish'] },
    });
    expect(result.picks.map((p) => p.id)).not.toContain('sardines');
  });

  it('admits what is still short after everything it could suggest', () => {
    const result = optimiseMicros({ iron: 0, calcium: 0, vitC: 0 }, targets, [catalogue[2]], {});
    expect(result.stillShort.map((s) => s.key)).toContain('iron');
    expect(result.caveat).toMatch(/conversation with a clinician/);
  });
});

describe('fasting, read off the diary', () => {
  const log = {
    [addDays(TODAY, -1)]: [entry('Porridge', 200, '08:00'), entry('Dinner', 400, '19:30')],
    [TODAY]: [entry('Porridge', 200, '07:30'), entry('Lunch', 300, '13:00')],
  };

  it('measures the day’s eating window from your own times', () => {
    const window = eatingWindow(log, TODAY);
    expect(window).toMatchObject({ logged: true, first: '07:30', last: '13:00', hours: 5.5 });
    expect(eatingWindow({}, TODAY)).toMatchObject({ logged: false });
  });

  it('measures the overnight gap between the two days', () => {
    const fast = overnightFast(log, TODAY);
    expect(fast).toMatchObject({ known: true, from: '19:30', to: '07:30', hours: 12 });
  });

  it('will not bound a fast it has only one side of', () => {
    const fast = overnightFast({ [TODAY]: [entry('Porridge', 200, '07:30')] }, TODAY);
    expect(fast.known).toBe(false);
    expect(fast.reason).toMatch(/both sides of the night/);
  });

  it('needs a few bounded nights before calling it a pattern', () => {
    const summary = fastingSummary(log, { today: TODAY });
    expect(summary.ready).toBe(false);
    expect(summary.nights).toBe(1);
    expect(summary.reason).toMatch(/it has 1/);
  });

  it('summarises once it has them, against a plan you named', () => {
    const many = {};
    for (let i = 0; i < 5; i += 1) {
      many[addDays(TODAY, -i)] = [entry('Breakfast', 200, '08:00'), entry('Dinner', 400, '19:00')];
    }
    const summary = fastingSummary(many, { today: TODAY, plan: '16-8' });
    expect(summary.ready).toBe(true);
    expect(summary.nights).toBe(4);
    expect(summary.avgHours).toBe(13);
    expect(summary.target).toBe(16);
    expect(summary.met).toBe(0);
    expect(summary.caveat).toMatch(/not logged makes this longer/);
    expect(fastHistory(many, { today: TODAY })).toHaveLength(4);
  });

  it('runs a fast only when you started one', () => {
    expect(currentFast(null)).toEqual({ running: false });
    const started = new Date('2026-07-28T20:00:00').getTime();
    const now = new Date('2026-07-29T06:30:00').getTime();
    const fast = currentFast({ startedAt: started, plan: '16-8' }, now);
    expect(fast).toMatchObject({ running: true, elapsedHours: 10.5, label: '10h 30m', target: 16, done: false });
    expect(fast.pct).toBe(66);
    expect(currentFast({ startedAt: started, plan: '16-8' }, started + 17 * 3600000).done).toBe(true);
  });
});

describe('reading a receipt', () => {
  const RECEIPT = [
    'TESCO EXTRA', '28/07/2026  14:02', '',
    'BANANAS LOOSE          £0.83',
    'SEMI SKIMMED MILK 2L   £2.50',
    '2 x @ £1.25',
    'CHICKEN BREAST 650G    £5.49',
    '0.482 kg @ £4.99/kg',
    'BROCCOLI               £2.41',
    'WHOLEMEAL BREAD        £1.15',
    'CLUBCARD SAVING       -£0.50',
    'TOTAL                 £12.38',
    'VISA CONTACTLESS      £12.38',
  ].join('\n');

  it('asks for text rather than pretending to read a photo', () => {
    expect(parseReceipt('').error).toMatch(/Paste the receipt text/);
    expect(parseReceipt('SHOP NAME\nnothing priced here').error).toMatch(/No priced lines/);
  });

  it('pulls the items, prices and quantities out', () => {
    const result = parseReceipt(RECEIPT);
    expect(result.items).toHaveLength(5);
    expect(result.items[0]).toMatchObject({ name: 'BANANAS LOOSE', price: 0.83, qty: 1 });
    expect(result.items.find((i) => i.name.includes('MILK')).price).toBe(2.5);
    expect(result.items.find((i) => i.name.includes('MILK')).qty).toBe(2);
    expect(result.items.find((i) => i.name.includes('CHICKEN')).qty).toBe(0.482);
  });

  it('knows the shop and the date', () => {
    const result = parseReceipt(RECEIPT);
    expect(result.store).toBe('Tesco');
    expect(result.date).toBe('2026-07-28');
    expect(storeFrom('SAINSBURYS LOCAL')).toBe("Sainsbury's");
    expect(dateFrom('2026-07-28')).toBe('2026-07-28');
  });

  it('skips the furniture — totals, loyalty, payment lines', () => {
    const result = parseReceipt(RECEIPT);
    const names = result.items.map((i) => i.name);
    expect(names.some((n) => /TOTAL|VISA|CLUBCARD/i.test(n))).toBe(false);
    expect(totalFrom(RECEIPT.split('\n'))).toBe(12.38);
  });

  it('checks its own arithmetic against the printed total', () => {
    const result = parseReceipt(RECEIPT);
    expect(result.itemTotal).toBe(12.38);
    expect(result.balanced).toBe(true);
    // A misread line shows up as a total that doesn't agree.
    const wrong = parseReceipt(RECEIPT.replace('£0.83', '£8.30'));
    expect(wrong.balanced).toBe(false);
  });

  it('lists what it could not read instead of dropping it', () => {
    const result = parseReceipt(`${RECEIPT}\nSOMETHING ODD WITH NO PRICE`);
    expect(result.unread).toContain('SOMETHING ODD WITH NO PRICE');
  });
});

describe('glucose from an export', () => {
  const CSV = [
    'Device Timestamp,Historic Glucose mmol/L',
    '28/07/2026 08:00,5.2',
    '28/07/2026 08:15,5.4',
    '28/07/2026 12:30,5.1',
    '28/07/2026 13:00,7.8',
    '28/07/2026 13:30,6.4',
    'broken row,,',
  ].join('\n');

  it('reads the timestamp formats these devices actually write', () => {
    expect(parseStamp('2026-07-28T08:00:00')).toEqual({ date: '2026-07-28', time: '08:00' });
    expect(parseStamp('28/07/2026 08:05')).toEqual({ date: '2026-07-28', time: '08:05' });
    expect(parseStamp('not a date')).toBe(null);
  });

  it('takes mmol/L as read and converts mg/dL', () => {
    expect(toMmol('5.4')).toBe(5.4);
    expect(toMmol('99')).toBe(5.5); // mg/dL
    expect(toMmol('0')).toBe(null);
  });

  it('parses the export and counts the rows it could not', () => {
    const { readings, skipped, error } = parseCgmCsv(CSV);
    expect(error).toBe(null);
    expect(readings).toHaveLength(5);
    expect(skipped).toBe(1);
    expect(readings[0]).toEqual({ date: '2026-07-28', time: '08:00', value: 5.2 });
  });

  it('says what it needs rather than failing quietly', () => {
    expect(parseCgmCsv('').error).toMatch(/doesn’t look like an export/);
    expect(parseCgmCsv('name,notes\na,b').error).toMatch(/timestamp column and a glucose column/);
  });

  it('summarises a day, including how much of it the sensor saw', () => {
    const { readings } = parseCgmCsv(CSV);
    const day = daySummary(readings, '2026-07-28');
    expect(day).toMatchObject({ readings: 5, avg: 6, min: 5.1, max: 7.8 });
    expect(day.coverage).toBeLessThan(10); // five readings is not a day
    expect(daySummary(readings, '2026-07-01')).toMatchObject({ readings: 0 });
  });

  it('reports what happened around a meal without grading it', () => {
    const { readings } = parseCgmCsv(CSV);
    const response = mealResponse(readings, { name: 'Pasta', time: '12:30' }, { date: '2026-07-28' });
    expect(response).toMatchObject({ known: true, baseline: 5.1, peak: 7.8, rise: 2.7, peakAfterMinutes: 30 });
    // No verdict, no score, no "this food spiked you".
    expect(Object.keys(response)).not.toContain('verdict');
  });

  it('refuses to describe a meal it has no trace around', () => {
    const { readings } = parseCgmCsv(CSV);
    const response = mealResponse(readings, { name: 'Supper', time: '22:00' }, { date: '2026-07-28' });
    expect(response.known).toBe(false);
  });

  it('lines the day’s meals up with the trace', () => {
    const { readings } = parseCgmCsv(CSV);
    const log = { '2026-07-28': [{ name: 'Pasta', time: '12:30' }, { name: 'Toast', time: '22:00' }] };
    const responses = dayResponses(readings, log, '2026-07-28');
    expect(responses).toHaveLength(1);
    expect(responses[0].name).toBe('Pasta');
    expect(importSpan(readings)).toMatchObject({ days: 1, from: '2026-07-28', readings: 5 });
    expect(importSpan([])).toEqual({ days: 0 });
  });
});

describe('blood results', () => {
  it('places a value in its reference range without diagnosing anything', () => {
    expect(bloodCategory('ferritin', 15).label).toBe('Below range');
    expect(bloodCategory('ferritin', 120).label).toBe('In range');
    expect(bloodCategory('hba1c', 50).label).toBe('Above range');
    expect(bloodCategory('ferritin', 'nonsense')).toBe(null);
    expect(bloodCategory('unknown', 5)).toBe(null);
  });

  it('carries its own range so your report’s can be compared', () => {
    expect(bloodCategory('vitD', 30).range).toBe('50–125 nmol/L');
    for (const m of BLOOD_MARKERS) expect(m.high).toBeGreaterThan(m.low);
  });
});

describe('the capability register', () => {
  it('keeps the three kinds of no apart', () => {
    const statuses = new Set(CAPABILITIES.map((c) => c.status));
    expect(statuses).toEqual(new Set(['built', 'partial', 'impossible', 'refused']));
    for (const status of statuses) expect(STATUS_LABELS[status]).toBeTruthy();
  });

  it('gives every no a reason and a nearest real thing where one exists', () => {
    for (const c of CAPABILITIES) {
      expect(c.detail.length).toBeGreaterThan(40);
      if (c.status === 'impossible') expect(c.instead).toBeTruthy();
    }
  });

  it('refuses DNA-based advice, and says why rather than saying "coming soon"', () => {
    const dna = capabilityBy.dna;
    expect(dna.status).toBe('refused');
    expect(dna.detail).toMatch(/evidence that does not support them/);
    expect(dna.instead).toMatch(/Preferences/);
  });

  it('names the things a browser genuinely cannot do', () => {
    const impossible = CAPABILITIES.filter((c) => c.status === 'impossible').map((c) => c.id);
    expect(impossible).toEqual(['smartKitchen']);
    expect(capabilityBy.api.status).toBe('built');
    expect(capabilityBy.coach.status).toBe('built');
    expect(capabilityBy.provider.status).toBe('refused');
    expect(capabilityBy.corporate.status).toBe('refused');
  });
});
