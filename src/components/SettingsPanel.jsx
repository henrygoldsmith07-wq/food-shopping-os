import { useRef, useState } from 'react';
import { Download, Lock, RotateCcw, Upload } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { DemoHouseholdEntry } from './DemoWalkthrough.jsx';
import BackendPanel from './BackendPanel.jsx';
import PrivacyPanel from './PrivacyPanel.jsx';
import { Card, Section, Sheet, Toggle } from './ui.jsx';
import { ACCENT_UNLOCKS } from '../data/quests.js';
import StorageHealth from './StorageHealth.jsx';

const UNLOCK_COLOURS = { sage: '#6b7f6a', clay: '#8c5a44', ink: '#2f3640' };
const ACCENTS = [
  ['mono', 'var(--ink)'],
  ['forest', '#3d5c4b'],
  ['ocean', '#3b5b73'],
  ['wine', '#6e4550'],
  ['honey', '#8a6a3b'],
];

/**
 * The settings that were buried inside the "You" dashboard scroll.
 *
 * Appearance, sync, data and privacy are decisions, not day-to-day activity —
 * they change rarely and should never compete with today's numbers for
 * attention. Moving them behind one Settings card keeps "You" about you while
 * giving every configurable thing a single, findable home. Privacy & data is
 * its own section because it carries the highest stakes: nothing about
 * storage, deletion or what leaves the device hides next to an accent picker.
 */
export default function SettingsPanel() {
  const app = useApp();
  const importRef = useRef(null);
  const [dataStatus, setDataStatus] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // Kitchen flashcards as a preference: the same clear-out the Learn queue
  // offers, reachable from Settings without hunting through the deck first.
  const autoCards = (Array.isArray(app.cards) ? app.cards : []).filter((c) => c.origin === 'auto').length;
  const seedCount = app.kitchenSeedCount();
  const [confirmKitchenOff, setConfirmKitchenOff] = useState(false);
  const toggleKitchenCards = () => {
    if (app.kitchenCardsForgotten) {
      app.set({ kitchenCardsForgotten: false });
      return;
    }
    // Turning off with cards to remove needs the same confirm the Learn tab shows.
    if (autoCards > 0) setConfirmKitchenOff(true);
    else app.set({ kitchenCardsForgotten: true });
  };
  // The one-tap way back in for someone who turned cards off: seeding lifts
  // the opt-out and builds the deck from current activity in the same write.
  const rebuildKitchenCards = () => {
    app.seedCardsFromActivity();
    setConfirmKitchenOff(false);
  };
  // Questions the user kept as-is in a refresh preview: durable until they
  // are restored here — this row is the single place the offer comes back.
  const keptFronts = Array.isArray(app.kitchenKeptFronts) ? app.kitchenKeptFronts : [];

  /** Your data, as the JSON it is stored as — yours to keep or move. */
  const exportData = () => {
    const blob = new Blob([app.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forq-${app.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importData = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = app.restoreData(await file.text());
    setDataStatus(result.ok ? 'Backup restored.' : result.error);
  };

  return (
    <div className="space-y-5">
      <Section title="Appearance" className="rise rise-1">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-[0.875rem]">Dark mode</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>Follows your accent everywhere</p>
            </div>
            <Toggle label="Dark mode" on={app.theme === 'dark'} onChange={app.toggleTheme} />
          </div>
          <div>
            <p className="font-bold text-[0.875rem] mb-2">Accent colour</p>
            <div className="flex flex-wrap gap-3">
              {ACCENTS.map(([id, hex]) => (
                <button
                  key={id}
                  onClick={() => app.setAccent(id)}
                  aria-label={`${id} accent`}
                  aria-pressed={app.accent === id}
                  className="tap press h-9 w-9 rounded-full border-4"
                  style={{ background: hex, borderColor: app.accent === id ? 'var(--ink)' : 'transparent' }}
                />
              ))}
              {ACCENT_UNLOCKS.map(({ id, level }) => {
                const open = app.game.accents.includes(id);
                return (
                  <button
                    key={id}
                    onClick={() => open && app.setAccent(id)}
                    aria-label={open ? id : `${id} — unlocks at level ${level}`}
                    disabled={!open}
                    className="tap press relative h-9 w-9 rounded-full border-4 flex items-center justify-center"
                    style={{
                      background: UNLOCK_COLOURS[id],
                      borderColor: app.accent === id ? 'var(--ink)' : 'transparent',
                      opacity: open ? 1 : 0.35,
                    }}
                  >
                    {!open && <Lock size={12} color="#fff" />}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              Three more arrive at levels 4, 8 and 12. The five you started with never go away.
            </p>
          </div>
        </Card>
      </Section>

      <Section title="Kitchen cards" className="rise rise-2">
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold text-[0.875rem]">Kitchen flashcards</p>
              <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Cards the app builds from what you buy, cook and log. Turning them off clears those cards — your own stay.
              </p>
            </div>
            <Toggle label="Kitchen flashcards" on={!app.kitchenCardsForgotten} onChange={toggleKitchenCards} />
          </div>
          {confirmKitchenOff && (
            <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 6%, transparent)' }}>
              <p className="text-[0.8125rem] font-extrabold">
                Remove {autoCards} kitchen card{autoCards === 1 ? '' : 's'}? Your own cards stay.
              </p>
              <p className="mt-0.5 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                You can turn them back on here any time.
              </p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Confirm removing kitchen cards"
                  onClick={() => { app.forgetKitchenCards(); setConfirmKitchenOff(false); }}
                  className="press rounded-xl border px-3 py-2 text-[0.78125rem] font-extrabold"
                  style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                >
                  Remove
                </button>
                <button
                  type="button"
                  aria-label="Keep kitchen cards"
                  onClick={() => setConfirmKitchenOff(false)}
                  className="press text-[0.78125rem] font-bold"
                  style={{ color: 'var(--faint)' }}
                >
                  Keep
                </button>
              </div>
            </div>
          )}
          {app.kitchenCardsForgotten && (
            <div
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 6%, transparent)' }}
            >
              <p className="text-[0.78125rem] font-extrabold">Cards are turned off.</p>
              <p className="mt-0.5 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                Build a fresh deck from what you buy, cook and log — your own cards are untouched.
              </p>
              <button
                type="button"
                aria-label="Build kitchen cards from your activity"
                onClick={rebuildKitchenCards}
                className="press mt-2 rounded-xl px-3 py-2 text-[0.78125rem] font-extrabold"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {seedCount > 0
                  ? `Build ${seedCount} question${seedCount === 1 ? '' : 's'} from your kitchen`
                  : 'Rebuild from your kitchen'}
              </button>
            </div>
          )}
          {keptFronts.length > 0 && (
            <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
              <p className="text-[0.78125rem] font-extrabold">Refresh kept as-is</p>
              <p className="mt-0.5 text-[0.71875rem] font-semibold" style={{ color: 'var(--muted)' }}>
                You kept these questions in a refresh preview, so the app leaves their answers alone. Restoring one offers its refresh again.
              </p>
              <ul className="mt-2 space-y-1">
                {keptFronts.map((front) => (
                  <li key={front} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[0.71875rem] font-semibold" style={{ color: 'var(--ink)' }}>{front}</span>
                    <button
                      type="button"
                      aria-label={`Restore refresh offer for ${front}`}
                      onClick={() => app.set({ kitchenKeptFronts: keptFronts.filter((f) => f !== front) })}
                      className="press shrink-0 text-[0.6875rem] font-extrabold"
                      style={{ color: 'var(--accent)' }}
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </Section>

      <BackendPanel />

      <Section title="Privacy & data" className="rise rise-2">
        <Card className="space-y-3">
          <DemoHouseholdEntry />
          <StorageHealth />
          <p className="text-[0.75rem] font-semibold leading-relaxed" style={{ color: 'var(--muted)' }}>
            Browser storage is not encrypted. Anyone with access to this browser profile can
            access it. Export a backup before clearing site data or changing devices.
          </p>
          <p className="text-[0.78125rem] font-semibold" style={{ color: 'var(--muted)' }}>
            Your local copy contains {Object.keys(app.log).length} logged day{Object.keys(app.log).length === 1 ? '' : 's'},
            {' '}{app.pantry.length} pantry item{app.pantry.length === 1 ? '' : 's'}, {app.shops.length} recorded shop{app.shops.length === 1 ? '' : 's'}, {' '}{app.cooked.length} meal{app.cooked.length === 1 ? '' : 's'} cooked.
          </p>
          <button
            type="button" onClick={() => setPrivacyOpen(true)}
            className="press w-full rounded-2xl border px-4 py-3 text-left text-[0.84375rem] font-extrabold"
            style={{ borderColor: 'var(--line)' }}
          >
            Privacy, storage &amp; deletion
          </button>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={exportData}
              className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
              style={{ borderColor: 'var(--line)' }}
            >
              <span className="inline-flex items-center gap-1.5"><Download size={15} /> Export</span>
            </button>
            <button
              onClick={() => importRef.current?.click()}
              className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
              style={{ borderColor: 'var(--line)' }}
            >
              <span className="inline-flex items-center gap-1.5"><Upload size={15} /> Restore</span>
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              onChange={importData}
              className="hidden"
              aria-label="Restore Forq backup"
            />
            <button
              onClick={() => (confirmReset ? app.reset() : setConfirmReset(true))}
              className="press rounded-2xl border py-3 text-[0.84375rem] font-extrabold"
              style={{ borderColor: confirmReset ? 'var(--danger)' : 'var(--line)', color: confirmReset ? 'var(--danger)' : 'var(--ink)' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <RotateCcw size={15} /> {confirmReset ? 'Tap to confirm' : 'Reset app'}
              </span>
            </button>
          </div>
          {dataStatus && (
            <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--muted)' }}>
              {dataStatus}
            </p>
          )}
        </Card>
      </Section>

      <Sheet open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy & data">
        <PrivacyPanel />
      </Sheet>
    </div>
  );
}