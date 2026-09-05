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
});

function Probe({ render }) {
  const app = useApp();
  return <div>{render(app)}</div>;
}