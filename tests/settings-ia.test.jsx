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

  it('the legacy kitchen-cards section is gone from the settings hub', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^You — profile/ }));
    // You is about the person; a config row has no business in its scroll.
    expect(screen.getByText('Goals & targets')).toBeDefined();
    const sheet = openSettings();
    // The SRS flashcards were removed with the legacy Revise/Debate code —
    // nothing of the deck remains reachable or half-configurable.
    expect(within(sheet).queryByText('Kitchen cards')).toBeNull();
    expect(within(sheet).queryByRole('switch', { name: 'Kitchen flashcards' })).toBeNull();
    expect(within(sheet).queryByText('Refresh kept as-is')).toBeNull();
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
});

function Probe({ render }) {
  const app = useApp();
  return <div>{render(app)}</div>;
}