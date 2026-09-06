import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../src/App.jsx';
import SettingsPanel from '../src/components/SettingsPanel.jsx';
import { AppProvider, useApp } from '../src/lib/store.jsx';
import { STORAGE_KEY } from '../src/lib/state.js';

/**
 * Information architecture: settings are decisions, not day-to-day activity.
 * "You" should be about the person; Appearance, sync, data and privacy belong
 * in one findable hub where privacy & data keeps its own section.
 */
const seeded = {
  onboarded: true,
  name: 'Sam',
  day: '2026-07-28',
};

// The store clamps any stored day to the real clock, so activity fixtures
// date their shops to today — always inside the window the seeding reads.
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const openSettings = () => {
  fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  return screen.getByRole('dialog', { name: 'Settings' });
};

describe('settings are separated from the dashboard scroll', () => {
  beforeEach(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('opens one settings hub with appearance, sync, and privacy as its own group', () => {
    render(<App />);
    const sheet = openSettings();

    expect(within(sheet).getByText('Appearance')).toBeDefined();
    expect(within(sheet).getByText('Dark mode')).toBeDefined();
    expect(within(sheet).getByText('Privacy & data')).toBeDefined();
    expect(within(sheet).getByRole('button', { name: 'Privacy, storage & deletion' })).toBeDefined();
    expect(within(sheet).getByRole('button', { name: /Export/ })).toBeDefined();
  });

  it('keeps the settings card out of the day-to-day flow: no Appearance section on You', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));
    // The dashboard scroll shows goals and guidance, not config.
    expect(screen.getByText('Goals & targets')).toBeDefined();
    expect(screen.queryByText('Accent colour')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Privacy, storage & deletion' })).toBeNull();
    // One Settings card is the single door in.
    expect(screen.getByRole('button', { name: 'Settings' })).toBeDefined();
  });

  it('the kitchen-cards toggle lives in the settings hub, not on You', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));
    // You is about the person; a config row has no business in its scroll.
    expect(screen.getByText('Goals & targets')).toBeDefined();
    expect(screen.queryByText('Kitchen flashcards')).toBeNull();
    // One Settings card is the door in — and the row lives inside the hub.
    const sheet = openSettings();
    expect(within(sheet).getByText('Kitchen cards')).toBeDefined();
    const toggle = within(sheet).getByRole('switch', { name: 'Kitchen flashcards' });
    expect(toggle.getAttribute('aria-checked')).toBe('true'); // on by default
  });

  it('toggles dark mode from the settings hub', () => {
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return <SettingsPanel />;
        }} />
      </AppProvider>,
    );
    const toggle = screen.getByRole('switch', { name: 'Dark mode' });
    fireEvent.click(toggle);
    expect(snap.theme).toBe('dark');
  });

  it('kitchen cards off mirrors the Learn forget action behind a confirm', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...seeded,
      cards: [
        {
          id: 'c-mine', userId: 'local', subjectId: 'user', topicId: 'notes',
          front: 'My note', back: 'My own words',
          origin: 'manual', reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: seeded.day,
          createdAt: '2026-07-28T00:00:00Z', lastReviewedAt: null,
        },
        {
          id: 'c-auto', userId: 'local', subjectId: 'kitchen', topicId: 'shopping',
          front: 'Which food did you buy most of this week?', back: 'Bread',
          origin: 'auto', reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: seeded.day,
          createdAt: '2026-07-28T00:00:00Z', lastReviewedAt: null,
        },
      ],
    }));
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return <SettingsPanel />;
        }} />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Kitchen flashcards' }));
    expect(screen.getByText(/Remove 1 kitchen card/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removing kitchen cards' }));
    expect(snap.cards.map((c) => c.id)).toEqual(['c-mine']); // auto card gone, own card stays
    expect(snap.kitchenCardsForgotten).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).kitchenCardsForgotten).toBe(true);
  });

  it('toggling off with no kitchen cards needs no confirm, and on lifts the opt-out', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...seeded, kitchenCardsForgotten: true }));
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return <SettingsPanel />;
        }} />
      </AppProvider>,
    );
    const toggle = screen.getByRole('switch', { name: 'Kitchen flashcards' });
    // Currently off: switching on is a plain preference, no cards get created.
    fireEvent.click(toggle);
    expect(snap.kitchenCardsForgotten).toBe(false);
    // Off again with nothing to remove — the flag stands, quietly.
    fireEvent.click(screen.getByRole('switch', { name: 'Kitchen flashcards' }));
    expect(screen.queryByText(/Remove .* kitchen card/)).toBeNull();
    expect(snap.kitchenCardsForgotten).toBe(true);
  });

  it('rebuilds the deck from the settings hub when cards were turned off', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      onboarded: true,
      name: 'Sam',
      day: todayKey(),
      kitchenCardsForgotten: true,
      cards: [{
        id: 'c-mine', userId: 'local', subjectId: 'user', topicId: 'notes',
        front: 'My note', back: 'My own words',
        origin: 'manual', reps: 0, lapses: 0, ease: 2.5, intervalDays: 0, due: todayKey(),
        createdAt: '2026-07-28T00:00:00Z', lastReviewedAt: null,
      }],
      shops: [{ id: 's1', date: todayKey(), store: 'Co-op', total: 12.4, items: [{ name: 'Milk' }] }],
    }));
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return <SettingsPanel />;
        }} />
      </AppProvider>,
    );
    const toggle = screen.getByRole('switch', { name: 'Kitchen flashcards' });
    expect(toggle.getAttribute('aria-checked')).toBe('false'); // off, but the way back is here
    // The row is honest about what a rebuild will add — two questions.
    expect(screen.getByText('Build 2 questions from your kitchen')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Build kitchen cards from your activity' }));
    expect(snap.kitchenCardsForgotten).toBe(false);
    const autos = snap.cards.filter((c) => c.origin === 'auto');
    expect(autos.map((c) => c.front)).toEqual(expect.arrayContaining([
      'Which food did you buy most of this week?',
      'What did your most recent shop cost?',
    ]));
    expect(snap.cards.some((c) => c.id === 'c-mine')).toBe(true); // own card untouched
    expect(screen.getByRole('switch', { name: 'Kitchen flashcards' }).getAttribute('aria-checked')).toBe('true');
  });

  it('rebuild with no activity just turns the deck back on', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      onboarded: true,
      name: 'Sam',
      day: todayKey(),
      kitchenCardsForgotten: true,
      cards: [],
    }));
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return <SettingsPanel />;
        }} />
      </AppProvider>,
    );
    // No kitchen activity yet, so the row says so plainly instead of promising cards.
    expect(screen.getByText('Rebuild from your kitchen')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Build kitchen cards from your activity' }));
    expect(snap.kitchenCardsForgotten).toBe(false);
    expect(snap.cards).toHaveLength(0); // nothing invented
  });

  it('restores a kept refresh offer from the settings hub', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      onboarded: true,
      name: 'Sam',
      day: todayKey(),
      kitchenKeptFronts: ['Which food did you buy most of this week?'],
      cards: [],
    }));
    let snap;
    render(
      <AppProvider>
        <Probe render={(app) => {
          snap = app;
          return <SettingsPanel />;
        }} />
      </AppProvider>,
    );
    // The kept question is named here, with its own way back in.
    expect(screen.getByText('Refresh kept as-is')).toBeDefined();
    expect(screen.getByText('Which food did you buy most of this week?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Restore refresh offer for Which food did you buy most of this week?' }));
    expect(snap.kitchenKeptFronts).toEqual([]);
    expect(screen.queryByText('Refresh kept as-is')).toBeNull(); // nothing left to restore
  });
});

function Probe({ render }) {
  const app = useApp();
  return <div>{render(app)}</div>;
}