import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppProvider } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';
import { weekDates } from '../src/lib/kitchen.js';
import PlanGenerator from '../src/components/PlanGenerator.jsx';

/**
 * The headroom the generator ranks against must be visible before Generate:
 * a week or month of meals is judged against its window's budget minus what
 * the window's shops already took, and the line above the button says so in
 * the same numbers. Everything is dated to the real clock — the store clamps
 * a stored day to today, so a shop dated today always sits inside both the
 * current week and the current month.
 */
const now = new Date();
const DAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const monthPrefix = DAY.slice(0, 7);
const monthKeys = Array.from({ length: 28 }, (_, i) => `${monthPrefix}-${String(i + 1).padStart(2, '0')}`);

const seed = (total) => ({
  onboarded: true,
  name: 'Sam',
  day: DAY,
  weeklyBudget: 60,
  shops: [{ id: 's1', date: DAY, store: 'Co-op', total, items: [] }],
});

const renderGenerator = () => render(
  <AppProvider>
    <PlanGenerator weekDates={weekDates(DAY)} monthDates={monthKeys} />
  </AppProvider>,
);

describe('the spent/left headroom above Generate', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('shows what the week has left before any plan is generated', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed(26)));
    renderGenerator();
    expect(document.body.textContent).toMatch(/£26\.00 spent of £60\.00 this week — £34\.00 left to rank against\./);
  });

  it('says plainly when the week is already over budget', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed(70)));
    renderGenerator();
    expect(document.body.textContent).toMatch(/This week is over budget by £10\.00\./);
  });

  it('scales the line to the month window and its spend', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed(26)));
    renderGenerator();
    fireEvent.click(screen.getByText('A month'));
    // £60 × a 28-day window (4 weeks) = £240 for the month.
    expect(document.body.textContent).toMatch(/£26\.00 spent of £240\.00 this month — £214\.00 left to rank against\./);
  });

  it('stays off the screen for scopes with no budget window', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed(26)));
    renderGenerator();
    fireEvent.click(screen.getByText('1 meal'));
    expect(document.body.textContent).not.toMatch(/left to rank against|over budget by/);
  });

  it('sits beside the scope toggle, ahead of the plan options, in both scopes', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed(26)));
    renderGenerator();
    // DOM order: Generate header → scope chips → headroom line → plan options.
    const headroomBeforeOptions = () => {
      const body = document.body.textContent;
      const spentAt = body.indexOf('spent of');
      const optionsAt = body.indexOf('Budget per serving');
      expect(spentAt).toBeGreaterThan(body.indexOf('Generate'));
      expect(optionsAt).toBeGreaterThan(spentAt);
    };
    headroomBeforeOptions();
    fireEvent.click(screen.getByText('A month'));
    expect(document.body.textContent).toMatch(/£26\.00 spent of £240\.00 this month — £214\.00 left to rank against\./);
    headroomBeforeOptions();
  });
});

describe('the generator is honest when no dish can use the focus', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('says nothing in the book cooks the item, and claims no pin', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed(26)));
    render(
      <AppProvider>
        <PlanGenerator weekDates={weekDates(DAY)} monthDates={monthKeys} focusItems={['Kohlrabi']} />
      </AppProvider>,
    );
    // No dish in the catalogue uses kohlrabi — the generator says so plainly
    // instead of quietly printing a favour-them promise it cannot keep.
    expect(screen.getByText(/Kohlrabi — use soon, but nothing in your recipe book cooks with it, so no dish can be pinned to use it\./)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));
    expect(screen.queryByText('Pinned', { exact: true })).toBeNull();
    expect(screen.queryByText(/is pinned in — it uses Kohlrabi/)).toBeNull();
  });
});
